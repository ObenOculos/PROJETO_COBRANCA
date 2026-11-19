-- Escada da Fila, revisao (2026-11-19, decisoes do usuario):
--
-- 1. Troca de cobrador: "a responsabilidade passa para o novo cobrador".
--    A escada conta so as tentativas sem retorno do cobrador ATUAL do
--    cliente (retorno real -- conversa, pagamento, acordo, decisao do gestor
--    -- continua valendo de qualquer um). Nao zera pela data de entrada na
--    carteira: na distribuicao de novembro quase todo cliente "entrou" na
--    carteira de quem ja o cobrava (inclusive as tentativas importadas do
--    Cedrus), e isso apagaria tentativas do proprio cobrador. O caso
--    pendente do cobrador antigo e encerrado sozinho na troca.
--    Casos de hoje recalculados: 93 continuam (5+ do cobrador atual), 100
--    sao encerrados (as tentativas eram de outro cobrador).
-- 2. Acordo quebrado: tratativa mais urgente -- escada 3 -> 3 -> 7 -> 7 dias
--    (os demais seguem 15 -> 15 -> 30 -> 30); na 5a tentativa vai para o
--    gestor como os outros.
--
-- Corpos de _tentativas_sem_retorno_info e fila_espera_cobrador copiados de
-- producao (pg_get_functiondef, 2026-11-19). CREATE OR REPLACE mantem os
-- grants (_info so service_role; fila_espera authenticated).
-- Numeros repetidos em src/config/reincidencia.ts. Mudou aqui, mude la.

CREATE OR REPLACE FUNCTION public._tentativas_sem_retorno_info(p_documento text)
 RETURNS TABLE(tentativas integer, ultima timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH dono AS (
    -- 2026-11-19: "ao trocar, a responsabilidade passa para o novo
    -- cobrador". Cobrador atual = dono de um titulo aberto (mesma escolha do
    -- plano da distribuicao: o menor id).
    SELECT min(b.user_id::text)::uuid AS id
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND b.user_id IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
           - COALESCE(b.desconto, 0)) > 0.01
  ), tent AS (
    SELECT a.created_at, a.result, a.collector_id
    FROM public.collection_attempts a
    JOIN public."BANCO_DADOS" b ON b.id_parcela::text = a.collection_id
    WHERE b.documento = p_documento
  ), ultimo_retorno AS (
    SELECT GREATEST(
      (SELECT max(t.created_at) FROM tent t
       WHERE t.result IN ('promise', 'refusal', 'partial_payment',
                          'full_payment', 'contact_made', 'agreement',
                          'disputed', 'claims_paid', 'sale_cancel_reported')),
      (SELECT max(p.created_at) FROM public.sale_payments p
       WHERE p.client_document = p_documento),
      (SELECT max(ac.created_at) FROM public.acordos ac
       WHERE ac.client_document = p_documento),
      -- 2026-11-19: decisao do gestor (devolveu ou mandou para o SPC) = recomeca.
      (SELECT max(cg.decidido_em) FROM public.casos_gestor cg
       WHERE cg.documento = p_documento
         AND (
           -- devolveu ao cobrador depois das tentativas sem retorno
           (cg.motivo = 'tentativas_sem_retorno' AND cg.status = 'mantido')
           -- SPC por qualquer caso (tentativas ou limite de remarcacao): o
           -- cliente vai para o juridico, que comeca a cobrar do zero.
           OR cg.status = 'spc'
         ))
    ) AS em
  )
  SELECT count(DISTINCT t.created_at)::integer, max(t.created_at)
  FROM tent t, ultimo_retorno u, dono d
  WHERE t.result IN ('no_answer', 'busy', 'not_found', 'message_sent')
    AND (u.em IS NULL OR t.created_at > u.em)
    -- So tentativas do cobrador atual; cliente sem cobrador conta todas.
    AND (d.id IS NULL OR t.collector_id = d.id);
$function$;

CREATE OR REPLACE FUNCTION public.fila_espera_cobrador(p_collector uuid DEFAULT NULL::uuid)
 RETURNS TABLE(documento text, tentativas integer, ultima_tentativa date, volta_em date, em_limbo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT app_current_user_id());
  v_alvo uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;
  IF p_collector IS NOT NULL AND p_collector IS DISTINCT FROM v_uid
     AND (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão para ver a fila de outro cobrador.';
  END IF;
  v_alvo := COALESCE(p_collector, v_uid);

  RETURN QUERY
  WITH cli AS (
    SELECT DISTINCT b.documento
    FROM public."BANCO_DADOS" b
    WHERE b.user_id = v_alvo
      AND b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
           - COALESCE(b.desconto, 0)) > 0.01
  ), info AS (
    SELECT c.documento, i.tentativas, i.ultima,
      EXISTS (
        SELECT 1 FROM public.acordos a
        WHERE a.client_document = c.documento AND a.status = 'quebrado'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.acordos a
        WHERE a.client_document = c.documento AND a.status = 'ativo'
      ) AS quebrado
    FROM cli c
    CROSS JOIN LATERAL public._tentativas_sem_retorno_info(c.documento) i
    WHERE i.tentativas > 0
  )
  SELECT
    i.documento,
    i.tentativas,
    (i.ultima AT TIME ZONE 'America/Sao_Paulo')::date,
    CASE
      WHEN i.tentativas >= 5 THEN NULL
      -- 2026-11-19: acordo quebrado (sem acordo ativo) e mais urgente:
      -- 3 -> 3 -> 7 -> 7 dias. Mesma definicao de getAcordoQuebradoDoCliente.
      WHEN i.quebrado AND i.tentativas >= 3
        THEN (i.ultima AT TIME ZONE 'America/Sao_Paulo')::date + 7
      WHEN i.quebrado
        THEN (i.ultima AT TIME ZONE 'America/Sao_Paulo')::date + 3
      WHEN i.tentativas >= 3 THEN (i.ultima AT TIME ZONE 'America/Sao_Paulo')::date + 30
      ELSE (i.ultima AT TIME ZONE 'America/Sao_Paulo')::date + 15
    END,
    i.tentativas >= 5 OR EXISTS (
      SELECT 1 FROM public.casos_gestor cg
      WHERE cg.documento = i.documento
        AND cg.motivo = 'tentativas_sem_retorno'
        AND cg.status = 'pendente'
    )
  FROM info i;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Status 'encerrado': caso fechado pelo sistema (troca de cobrador, ou abaixo
-- de 5 tentativas do cobrador atual). Nao conta como decisao do gestor.
-- ---------------------------------------------------------------------------
ALTER TABLE public.casos_gestor DROP CONSTRAINT IF EXISTS casos_gestor_status_check;
ALTER TABLE public.casos_gestor ADD CONSTRAINT casos_gestor_status_check
  CHECK (status IN ('pendente', 'mantido', 'spc', 'encerrado'));

-- ---------------------------------------------------------------------------
-- 3) Cliente passou para outro cobrador: encerra o caso pendente do antigo
-- ---------------------------------------------------------------------------
-- O caso fica 'encerrado' (status novo: fechado pelo sistema, sem decisao do
-- gestor). Diferente de 'mantido', NAO zera a escada -- a contagem ja e so do
-- cobrador atual, entao as tentativas dele continuam valendo.
CREATE OR REPLACE FUNCTION public.trg_caso_gestor_troca_cobrador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cobrador_novo_id IS NULL
     OR NEW.cobrador_anterior_id IS NOT DISTINCT FROM NEW.cobrador_novo_id THEN
    RETURN NULL;
  END IF;
  UPDATE public.casos_gestor
  SET status = 'encerrado',
      decidido_em = now(),
      observacao_gestor = 'Encerrado automaticamente: cliente passou para outro cobrador.',
      atualizado_em = now()
  WHERE documento = NEW.documento
    AND motivo = 'tentativas_sem_retorno'
    AND status = 'pendente'
    AND collector_id::text IS DISTINCT FROM NEW.cobrador_novo_id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Nunca derruba a mudanca de carteira por causa do caso do gestor.
  RAISE WARNING 'casos_gestor (troca de cobrador) falhou para %: %', NEW.documento, SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS caso_gestor_troca_cobrador ON public.atribuicoes_historico;
CREATE TRIGGER caso_gestor_troca_cobrador
  AFTER INSERT ON public.atribuicoes_historico
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_caso_gestor_troca_cobrador();

-- Casos pendentes de hoje cujo cobrador ja nao tem o cliente (0 em
-- 19/11; fica para nao sobrar nenhum se algo mudou ate o db push).
UPDATE public.casos_gestor c
SET status = 'encerrado',
    decidido_em = now(),
    observacao_gestor = 'Encerrado automaticamente: cliente passou para outro cobrador.',
    atualizado_em = now()
WHERE c.status = 'pendente'
  AND c.motivo = 'tentativas_sem_retorno'
  AND NOT EXISTS (
    SELECT 1 FROM public."BANCO_DADOS" b
    WHERE b.documento = c.documento AND b.user_id = c.collector_id
  );

-- Casos pendentes que, contando so o cobrador atual, ficam abaixo de 5
-- (100 em 19/11): o cobrador de hoje ainda nao esgotou as tentativas.
UPDATE public.casos_gestor c
SET status = 'encerrado',
    decidido_em = now(),
    observacao_gestor = 'Encerrado automaticamente: menos de 5 tentativas sem retorno do cobrador atual (as anteriores eram de outro cobrador).',
    atualizado_em = now()
WHERE c.status = 'pendente'
  AND c.motivo = 'tentativas_sem_retorno'
  AND (SELECT i.tentativas FROM public._tentativas_sem_retorno_info(c.documento) i) < 5;
