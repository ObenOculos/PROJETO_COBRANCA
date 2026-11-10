-- Item 40 -- Fila de Cobranca em lotes (substitui a Agenda do cobrador de
-- carteira). Decisoes de 2026-11-10 (ver docs/PROGRESSO.md):
--  - o cobrador recebe um lote fixo (tamanho = soma das quantidades que o
--    gestor configurou na Distribuicao, ex.: 5+2+2+1 = 10);
--  - so depois de finalizar TODOS os clientes do lote recebe o proximo;
--  - finalizar = qualquer registro depois que o lote abriu: contato pelo
--    "Atender" (inclusive "nao atendeu"), "Deixar para depois", pagamento
--    registrado; ou o cliente saiu da carteira dele / quitou;
--  - lote nao terminado continua no dia seguinte.
--
-- A ORDEM do lote (faixas intercaladas, urgencias primeiro dentro da faixa)
-- continua com uma regra so, em src/filters/filaCobranca.ts: o app monta a
-- lista e abrir_lote_fila grava. O banco garante o que importa: um lote
-- aberto por cobrador, so cliente da carteira dele, e lote novo so com o
-- anterior todo finalizado.
--
-- Fato historico: lote e itens nao se editam nem se apagam (so concluido_em
-- e preenchido, pela funcao). Serve para a supervisao (previstos x
-- trabalhados por faixa).

CREATE TABLE public.fila_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES public.users(id),
  -- Turno da configuracao usada para montar o lote; NULL = fila do gestor
  -- desligada (lote pela ordem padrao, maior atraso primeiro).
  turno text CHECK (turno IN ('manha', 'tarde')),
  tamanho_previsto integer NOT NULL CHECK (tamanho_previsto BETWEEN 1 AND 100),
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  CHECK (concluido_em IS NULL OR concluido_em >= criado_em)
);

COMMENT ON TABLE public.fila_lotes IS
  'Fila de Cobranca: lote de clientes entregue ao cobrador; o proximo so abre com este todo finalizado.';

-- Um lote aberto por cobrador.
CREATE UNIQUE INDEX fila_lotes_um_aberto_idx
  ON public.fila_lotes (collector_id) WHERE concluido_em IS NULL;
CREATE INDEX fila_lotes_collector_criado_idx
  ON public.fila_lotes (collector_id, criado_em);

CREATE TABLE public.fila_lote_itens (
  lote_id uuid NOT NULL REFERENCES public.fila_lotes(id),
  documento text NOT NULL,
  posicao integer NOT NULL CHECK (posicao >= 1),
  -- Regra (versao) da Distribuicao pela qual o cliente entrou; NULL = sem
  -- fila configurada ou cliente sem faixa.
  regra_id uuid REFERENCES public.collector_overdue_ranges(id),
  -- Alerta que pos o cliente na frente da faixa dele.
  urgencia text CHECK (urgencia IN ('quebrado', 'urgente')),
  PRIMARY KEY (lote_id, documento),
  UNIQUE (lote_id, posicao)
);

COMMENT ON TABLE public.fila_lote_itens IS
  'Clientes de cada lote da Fila de Cobranca, na ordem entregue ao cobrador.';

ALTER TABLE public.fila_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fila_lote_itens ENABLE ROW LEVEL SECURITY;

-- Leitura: o proprio cobrador ou gestor. Escrita so pelas funcoes abaixo.
CREATE POLICY select_dono_ou_gestor ON public.fila_lotes
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR collector_id = (SELECT app_current_user_id())
  );

CREATE POLICY select_dono_ou_gestor ON public.fila_lote_itens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fila_lotes l
      WHERE l.id = fila_lote_itens.lote_id
        AND (
          (SELECT app_current_user_type()) = 'manager'
          OR l.collector_id = (SELECT app_current_user_id())
        )
    )
  );

REVOKE ALL ON public.fila_lotes, public.fila_lote_itens FROM anon, authenticated;
GRANT SELECT ON public.fila_lotes, public.fila_lote_itens TO authenticated;

-- O cliente do lote esta finalizado? (qualquer registro do cobrador desde
-- p_desde, ou o cliente nao e mais trabalho dele). Regra unica, usada pelas
-- duas funcoes abaixo.
CREATE OR REPLACE FUNCTION public.fila_item_finalizado(
  p_collector uuid,
  p_documento text,
  p_desde timestamptz
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    -- contato registrado (Atender), inclusive tentativa sem sucesso
    EXISTS (
      SELECT 1
      FROM public."BANCO_DADOS" b
      JOIN public.collection_attempts a ON a.collection_id = b.id_parcela::text
      WHERE b.documento = p_documento
        AND a.collector_id = p_collector
        AND a.created_at >= p_desde
    )
    -- "Deixar para depois"
    OR EXISTS (
      SELECT 1 FROM public.fila_adiamentos f
      WHERE f.documento = p_documento
        AND f.collector_id = p_collector
        AND f.created_at >= p_desde
    )
    -- pagamento registrado pelo cobrador
    OR EXISTS (
      SELECT 1 FROM public.sale_payments p
      WHERE p.client_document = p_documento
        AND p.collector_id = p_collector
        AND p.created_at >= p_desde
    )
    -- saiu da carteira dele
    OR NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = p_documento AND b.user_id = p_collector
    )
    -- quitou
    OR NOT public.cliente_tem_saldo_aberto(p_documento);
$function$;

REVOKE ALL ON FUNCTION public.fila_item_finalizado(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fila_item_finalizado(uuid, text, timestamptz) TO authenticated, service_role;

-- Lote aberto do cobrador logado, com a situacao de cada cliente. Vazio se
-- nao ha lote aberto. SECURITY INVOKER: a RLS decide o que ele ve.
CREATE OR REPLACE FUNCTION public.fila_lote_atual()
 RETURNS TABLE(
   lote_id uuid,
   criado_em timestamptz,
   turno text,
   tamanho_previsto integer,
   documento text,
   posicao integer,
   regra_id uuid,
   urgencia text,
   finalizado boolean
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT l.id, l.criado_em, l.turno, l.tamanho_previsto,
         i.documento, i.posicao, i.regra_id, i.urgencia,
         public.fila_item_finalizado(l.collector_id, i.documento, l.criado_em)
  FROM public.fila_lotes l
  JOIN public.fila_lote_itens i ON i.lote_id = l.id
  WHERE l.collector_id = public.app_current_user_id()
    AND l.concluido_em IS NULL
  ORDER BY i.posicao;
$function$;

REVOKE ALL ON FUNCTION public.fila_lote_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fila_lote_atual() TO authenticated, service_role;

-- Abre o proximo lote do cobrador logado com os clientes na ordem que o app
-- montou. Se ja existe lote aberto com cliente pendente, NAO cria outro:
-- devolve o id do aberto (chamada repetida/duas abas e segura). Lote aberto
-- todo finalizado e concluido aqui antes de abrir o novo.
--
-- p_itens: [{"documento": "...", "regra_id": "uuid"|null,
--            "urgencia": "quebrado"|"urgente"|null}, ...] na ordem.
CREATE OR REPLACE FUNCTION public.abrir_lote_fila(
  p_itens jsonb,
  p_turno text,
  p_tamanho_previsto integer
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public.app_current_user_id();
  v_tipo text := public.app_current_user_type();
  v_aberto public.fila_lotes%ROWTYPE;
  v_lote uuid;
  v_qtd integer;
BEGIN
  IF v_uid IS NULL OR v_tipo IS NULL
     OR v_tipo NOT IN ('collector', 'internal_collector', 'third_party_collector', 'legal_collector') THEN
    RAISE EXCEPTION 'Apenas cobradores têm fila de cobrança.'
      USING ERRCODE = '42501';
  END IF;

  -- Serializa por cobrador (duas abas abrindo ao mesmo tempo).
  PERFORM pg_advisory_xact_lock(hashtext('fila_lote:' || v_uid::text));

  SELECT * INTO v_aberto
  FROM public.fila_lotes
  WHERE collector_id = v_uid AND concluido_em IS NULL;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.fila_lote_itens i
      WHERE i.lote_id = v_aberto.id
        AND NOT public.fila_item_finalizado(v_uid, i.documento, v_aberto.criado_em)
    ) THEN
      RETURN v_aberto.id;
    END IF;
    UPDATE public.fila_lotes SET concluido_em = now() WHERE id = v_aberto.id;
  END IF;

  IF p_turno IS NOT NULL AND p_turno NOT IN ('manha', 'tarde') THEN
    RAISE EXCEPTION 'Turno inválido.';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Lista de clientes inválida.';
  END IF;
  v_qtd := jsonb_array_length(p_itens);
  IF v_qtd = 0 THEN
    RETURN NULL; -- nada para trabalhar: sem lote
  END IF;
  IF v_qtd > 100 OR p_tamanho_previsto IS NULL
     OR p_tamanho_previsto NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Tamanho de lote inválido.';
  END IF;

  -- Validacoes por cliente: documento presente e sem repeticao, da carteira
  -- dele, com saldo; regra (se houver) e dele.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    WHERE coalesce(trim(e->>'documento'), '') = ''
       OR coalesce(e->>'urgencia', 'quebrado') NOT IN ('quebrado', 'urgente')
  ) THEN
    RAISE EXCEPTION 'Cliente sem documento ou urgência inválida no lote.';
  END IF;
  IF (SELECT count(DISTINCT e->>'documento') FROM jsonb_array_elements(p_itens) e) <> v_qtd THEN
    RAISE EXCEPTION 'Cliente repetido no lote.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    WHERE NOT EXISTS (
            SELECT 1 FROM public."BANCO_DADOS" b
            WHERE b.documento = e->>'documento' AND b.user_id = v_uid
          )
       OR NOT public.cliente_tem_saldo_aberto(e->>'documento')
  ) THEN
    RAISE EXCEPTION 'Há cliente no lote que não está na sua carteira ou já quitou. Atualize a tela.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    WHERE e->>'regra_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.id = (e->>'regra_id')::uuid AND r.collector_id = v_uid
      )
  ) THEN
    RAISE EXCEPTION 'Regra da distribuição inválida no lote.';
  END IF;

  INSERT INTO public.fila_lotes (collector_id, turno, tamanho_previsto)
  VALUES (v_uid, p_turno, p_tamanho_previsto)
  RETURNING id INTO v_lote;

  INSERT INTO public.fila_lote_itens (lote_id, documento, posicao, regra_id, urgencia)
  SELECT v_lote, e->>'documento', o::integer,
         (e->>'regra_id')::uuid, e->>'urgencia'
  FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(e, o);

  RETURN v_lote;
END;
$function$;

REVOKE ALL ON FUNCTION public.abrir_lote_fila(jsonb, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_lote_fila(jsonb, text, integer) TO authenticated, service_role;
