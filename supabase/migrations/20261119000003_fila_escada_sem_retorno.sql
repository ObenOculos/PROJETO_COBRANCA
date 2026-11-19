-- Fila de Cobranca: escada de espera para cliente sem retorno + limbo do
-- gestor (2026-11-19).
--
-- Queixa dos cobradores internos: a fila "trava" -- volta sempre o mesmo
-- cliente que nao atende. Causa: "Sem retorno" so tirava o cliente da fila
-- no mesmo dia, e a ordem e maior atraso primeiro (os que menos atendem).
-- Nos ultimos 14 dias, 49% dos itens dos lotes eram clientes que nao
-- atenderam na ultima vez, e 75% das voltas aconteciam em ate 3 dias.
--
-- Decisoes do usuario (2026-11-19):
--   * Escada (tentativas sem retorno desde o ultimo retorno real):
--       1a e 2a -> volta a fila 15 dias depois da ultima tentativa
--       3a e 4a -> 30 dias
--       5a      -> LIMBO: sai da fila e espera o gestor decidir (SPC ou
--                  volta para o cobrador cobrar).
--   * "Mensagem enviada" e acionamento padrao: entra na mesma escada (ja
--     era assim na contagem do item 83). Continua contando como
--     atendimento nas metricas (item 81).
--   * Quem ja esta com 5+ hoje vai todo para o gestor (backfill abaixo).
--
-- O que muda no banco:
--   1. _tentativas_sem_retorno_info: contagem sem checagem de acesso, para
--      gatilho e fila. "Ultimo retorno real" passa a incluir a decisao
--      'mantido' do gestor nas tentativas sem retorno: o gestor devolveu o
--      cliente, a escada recomeca do zero (sem isso o cliente voltaria ao
--      limbo na hora).
--   2. tentativas_sem_retorno (aviso do Atender) usa a mesma contagem.
--      Corpo de producao (pg_get_functiondef 2026-11-19) + a decisao.
--   3. Gatilho em collection_attempts: na 5a tentativa sem retorno, abre o
--      caso do gestor sozinho (antes dependia do cobrador clicar em
--      "reportar"). Erro no gatilho nunca impede o registro do contato.
--   4. fila_espera_cobrador(): para a fila do cobrador, quando cada cliente
--      volta e quem esta no limbo.
--   5. Backfill: casos pendentes para quem ja tem 5+ hoje.
--
-- Numeros repetidos em src/config/reincidencia.ts (ESCADA_SEM_RETORNO_DIAS).
-- Mudou aqui, mude la.

-- ---------------------------------------------------------------------------
-- 1) Contagem interna
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tentativas_sem_retorno_info(p_documento text)
RETURNS TABLE (tentativas integer, ultima timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH tent AS (
    SELECT a.created_at, a.result
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
      -- 2026-11-19: gestor devolveu o cliente ao cobrador = recomeca.
      (SELECT max(cg.decidido_em) FROM public.casos_gestor cg
       WHERE cg.documento = p_documento
         AND cg.motivo = 'tentativas_sem_retorno'
         AND cg.status = 'mantido')
    ) AS em
  )
  SELECT count(DISTINCT t.created_at)::integer, max(t.created_at)
  FROM tent t, ultimo_retorno u
  WHERE t.result IN ('no_answer', 'busy', 'not_found', 'message_sent')
    AND (u.em IS NULL OR t.created_at > u.em);
$$;

COMMENT ON FUNCTION public._tentativas_sem_retorno_info(text) IS
  'Tentativas sem retorno desde o ultimo retorno real (conversa, pagamento, acordo ou gestor devolveu) e a data da ultima. Sem checagem de acesso: so para gatilho/funcoes. Migration 20261119000003.';

-- So funcoes internas usam (default privileges ja tiram de PUBLIC).
REVOKE ALL ON FUNCTION public._tentativas_sem_retorno_info(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Aviso do Atender: mesma contagem
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tentativas_sem_retorno(p_documento text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH acesso AS (
    SELECT (SELECT app_current_user_type()) = 'manager'
        OR EXISTS (
          SELECT 1 FROM public."BANCO_DADOS" b
          WHERE b.documento = p_documento
            AND b.user_id = (SELECT app_current_user_id())
        ) AS ok
  )
  SELECT CASE WHEN (SELECT ok FROM acesso) IS TRUE THEN (
    SELECT i.tentativas FROM public._tentativas_sem_retorno_info(p_documento) i
  ) ELSE 0 END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Gatilho: 5a tentativa sem retorno abre o caso do gestor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_tentativas_sem_retorno_caso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d record;
  v_qtd integer;
BEGIN
  FOR d IN
    SELECT DISTINCT b.documento
    FROM novas n
    JOIN public."BANCO_DADOS" b ON b.id_parcela::text = n.collection_id
    WHERE n.result IN ('no_answer', 'busy', 'not_found', 'message_sent')
      AND b.documento IS NOT NULL
  LOOP
    BEGIN
      SELECT i.tentativas INTO v_qtd
      FROM public._tentativas_sem_retorno_info(d.documento) i;
      IF COALESCE(v_qtd, 0) < 5 THEN
        CONTINUE;
      END IF;
      -- Dono atual (cobrador, nao gestor) com saldo em aberto.
      INSERT INTO public.casos_gestor AS c (
        documento, cliente_nome, collector_id, motivo, quantidade, observacao
      )
      SELECT d.documento, b.cliente, b.user_id, 'tentativas_sem_retorno', v_qtd,
             'Automático: 5 tentativas sem retorno (saiu da Fila de Cobrança).'
      FROM public."BANCO_DADOS" b
      JOIN public.users u ON u.id = b.user_id
      WHERE b.documento = d.documento
        -- So cobrador de carteira: a Fila e deles (gestor isento, externo
        -- trabalha por visita).
        AND u.type IN ('internal_collector', 'third_party_collector', 'legal_collector')
        AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
        AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
             - COALESCE(b.desconto, 0)) > 0.01
      ORDER BY b.id_parcela
      LIMIT 1
      ON CONFLICT (documento, motivo) WHERE status = 'pendente'
      DO UPDATE SET quantidade = EXCLUDED.quantidade, atualizado_em = now();
    EXCEPTION WHEN OTHERS THEN
      -- Nunca derruba o registro do contato por causa do caso do gestor.
      RAISE WARNING 'casos_gestor automatico falhou para %: %', d.documento, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tentativas_sem_retorno_caso ON public.collection_attempts;
CREATE TRIGGER tentativas_sem_retorno_caso
  AFTER INSERT ON public.collection_attempts
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_tentativas_sem_retorno_caso();

-- ---------------------------------------------------------------------------
-- 4) Fila do cobrador: quando cada cliente volta e quem esta no limbo
-- ---------------------------------------------------------------------------
-- Clientes da carteira do usuario logado (ou de p_collector, so gestor) com
-- pelo menos 1 tentativa sem retorno desde o ultimo retorno real.
--   volta_em = dia da ultima tentativa + 15 (1a/2a) ou + 30 (3a/4a);
--   em_limbo = caso pendente do gestor ou 5+ tentativas.
CREATE OR REPLACE FUNCTION public.fila_espera_cobrador(p_collector uuid DEFAULT NULL)
RETURNS TABLE (
  documento text,
  tentativas integer,
  ultima_tentativa date,
  volta_em date,
  em_limbo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
    SELECT c.documento, i.tentativas, i.ultima
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

COMMENT ON FUNCTION public.fila_espera_cobrador(uuid) IS
  'Escada da Fila de Cobranca: quando cada cliente sem retorno volta a fila e quem esta no limbo do gestor. Migration 20261119000003.';

GRANT EXECUTE ON FUNCTION public.fila_espera_cobrador(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Backfill: quem ja tem 5+ hoje vai para o gestor (decisao do usuario)
-- ---------------------------------------------------------------------------
WITH dono AS (
  -- Um titulo aberto por cliente, de cobrador de carteira.
  SELECT DISTINCT ON (b.documento) b.documento, b.cliente, b.user_id
  FROM public."BANCO_DADOS" b
  JOIN public.users u ON u.id = b.user_id
  WHERE b.documento IS NOT NULL
    AND u.type IN ('internal_collector', 'third_party_collector', 'legal_collector')
    AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
    AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
         - COALESCE(b.desconto, 0)) > 0.01
  ORDER BY b.documento, b.id_parcela
)
INSERT INTO public.casos_gestor AS c (
  documento, cliente_nome, collector_id, motivo, quantidade, observacao
)
SELECT d.documento, d.cliente, d.user_id, 'tentativas_sem_retorno', i.tentativas,
       'Automático (implantação 19/11): 5+ tentativas sem retorno.'
FROM dono d
CROSS JOIN LATERAL public._tentativas_sem_retorno_info(d.documento) i
WHERE i.tentativas >= 5
ON CONFLICT (documento, motivo) WHERE status = 'pendente'
DO UPDATE SET quantidade = EXCLUDED.quantidade, atualizado_em = now();
