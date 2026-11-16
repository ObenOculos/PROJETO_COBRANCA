-- Item 66 -- Atribuir pagamento ao cobrador.
--
-- Caso: o cobrador tratou o cliente, mas o cliente pagou depois na loja/banco
-- (a baixa vem do ERP, sem lancamento no app). Antes o gestor "retirava" o
-- pagamento e o cobrador lancava de novo so para ficar no nome dele -- o
-- titulo reabria, o caixa do cobrador mostrava dinheiro que nao passou por
-- ele e a data podia cair errada.
--
-- Agora o cobrador abre um pedido pela Ficha; o gestor aprova ou recusa. O
-- credito NAO e pagamento (nao vai para sale_payments): nao mexe no titulo,
-- nao entra no repasse do caixa, nao segura a carteira, nao finaliza item da
-- fila e nao trava o cancelamento automatico da SSOtica. As telas de valores
-- leem esta tabela a parte (etapa 3).
--
-- Regras (decididas com o usuario em 2026-11-16):
--   - so parcela paga pelo ERP (valor_recebido > 0, com data), fora de acordo,
--     nao cancelada/agrupada/renegociada e sem lancamento do app nela;
--   - o cobrador precisa ter registrado CONTATO EFETIVO com o cliente nos 30
--     dias ate a data do pagamento (o proprio dia vale: a baixa nao tem hora).
--     Efetivo = a lista de src/config/collectionAttempts.ts
--     (EFFECTIVE_ATTEMPT_RESULTS) SEM "claims_paid" e "sale_cancel_reported":
--     nesses o cliente esta informando que ja pagou/cancelou, nao foi cobrado.
--     Simulacao de nov/2026: com qualquer contato, 164 casos vinham de "nao
--     atendeu" e 81 de "diz que ja pagou";
--   - o pedido so pode ser aberto ate 30 dias depois do pagamento (nao mexe
--     em meta de mes antigo);
--   - uma parcela so pode estar em um pedido em aberto ou aprovado.
--   - o contato vale pelo created_at (hora real da gravacao), nao pelo campo
--     "date" digitado -- nao da para registrar contato retroativo.
--
-- Historico: o pedido e fato do cobrador (so INSERT pela RPC); a decisao do
-- gestor e gravada uma vez pela RPC decidir_atribuicao_pagamento.

CREATE TABLE public.atribuicoes_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Parcelas pagas juntas (mesmo pedido) dividem o lote; a decisao e por lote.
  lote uuid NOT NULL,
  id_parcela bigint NOT NULL,
  documento text NOT NULL,
  cliente text,
  venda bigint,
  parcela bigint,
  -- Copia da baixa do ERP no momento do pedido.
  valor numeric(14, 2) NOT NULL CHECK (valor > 0),
  data_pagamento date NOT NULL,
  observacao text NOT NULL CHECK (length(trim(observacao)) > 0),
  ultimo_contato_em timestamptz NOT NULL,
  solicitado_por_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decisao text CHECK (decisao IN ('aprovado', 'recusado')),
  -- Valor da baixa conferido na aprovacao (o ERP e a verdade).
  valor_aprovado numeric(14, 2),
  resposta text,
  decidido_por_id uuid REFERENCES public.users(id),
  decidido_em timestamptz,
  CHECK ((decisao IS NULL) = (decidido_em IS NULL)),
  CHECK ((decisao = 'aprovado') = (valor_aprovado IS NOT NULL)),
  CHECK (decisao IS DISTINCT FROM 'recusado'
         OR length(trim(coalesce(resposta, ''))) > 0)
);

COMMENT ON TABLE public.atribuicoes_pagamento IS
  'Pedido do cobrador para creditar a ele uma baixa do ERP (cliente pagou na loja/banco depois da tratativa); o gestor aprova ou recusa uma vez. Credito de desempenho, nao e dinheiro do caixa.';

-- Sem credito em dobro: parcela em um pedido aberto ou aprovado, no maximo.
CREATE UNIQUE INDEX atribuicoes_pagamento_parcela_uidx
  ON public.atribuicoes_pagamento (id_parcela)
  WHERE decisao IS NULL OR decisao = 'aprovado';
CREATE INDEX atribuicoes_pagamento_lote_idx
  ON public.atribuicoes_pagamento (lote);
CREATE INDEX atribuicoes_pagamento_documento_idx
  ON public.atribuicoes_pagamento (documento, created_at);
CREATE INDEX atribuicoes_pagamento_cobrador_idx
  ON public.atribuicoes_pagamento (solicitado_por_id, data_pagamento);

ALTER TABLE public.atribuicoes_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_gestor_ou_solicitante ON public.atribuicoes_pagamento
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR solicitado_por_id = (SELECT app_current_user_id())
  );

-- Escrita so pelas RPCs (SECURITY DEFINER).
GRANT SELECT ON public.atribuicoes_pagamento TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.atribuicoes_pagamento FROM authenticated;
REVOKE ALL ON public.atribuicoes_pagamento FROM anon;

-- ---------------------------------------------------------------------------
-- Parcelas do cliente pagas pelo ERP, com o que impede o pedido do usuario
-- atual (bloqueio NULL = pode pedir). So devolve algo para o gestor ou para
-- quem ja registrou contato com o cliente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parcelas_para_atribuicao(p_documento text)
 RETURNS TABLE(
   id_parcela bigint,
   venda bigint,
   parcela bigint,
   data_vencimento date,
   valor numeric,
   data_pagamento date,
   loja text,
   ultimo_contato_em timestamptz,
   pedido_decisao text,
   pedido_meu boolean,
   bloqueio text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eu AS (
    SELECT (SELECT app_current_user_id()) AS id,
           (SELECT app_current_user_type()) AS tipo
  ), contatos AS (
    SELECT a.created_at,
           (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM public.collection_attempts a
    JOIN public."BANCO_DADOS" b2 ON a.collection_id = b2.id_parcela::text
    WHERE b2.documento = p_documento
      AND a.collector_id = (SELECT id FROM eu)
      -- Contato efetivo de cobranca (ver cabecalho).
      AND a.result IN ('promise', 'refusal', 'partial_payment', 'full_payment',
                       'contact_made', 'agreement', 'disputed')
  ), parcelas AS (
    SELECT b.id_parcela,
           COALESCE(b.numero_titulo, b.venda_n) AS venda,
           b.parcela,
           b.data_vencimento,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS data_pagamento,
           b.nome_da_loja AS loja,
           b.situacao,
           lower(trim(COALESCE(b.status, ''))) AS st
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND COALESCE(b.valor_recebido, 0) > 0
      -- Prazo do pedido: ate 30 dias depois do pagamento. Fora dele a
      -- parcela nem aparece (a lista do cobrador fica so com o recente).
      AND b.data_de_recebimento
          >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 30
  )
  SELECT p.id_parcela, p.venda, p.parcela, p.data_vencimento, p.valor,
         p.data_pagamento, p.loja,
         c.ultimo,
         ped.decisao_txt,
         ped.meu,
         CASE
           WHEN (SELECT id FROM eu) IS NULL THEN 'Entre de novo no app.'
           WHEN (SELECT tipo FROM eu) = 'manager' THEN 'Gestor não pede atribuição.'
           WHEN ped.decisao_txt = 'aberto' THEN 'Já tem pedido em análise.'
           WHEN ped.decisao_txt = 'aprovado' THEN
             CASE WHEN ped.meu THEN 'Já atribuído a você.'
                  ELSE 'Já atribuído a outro cobrador.' END
           WHEN p.st IN ('cancelado', 'agrupado', 'renegociado') THEN
             'Parcela cancelada ou renegociada.'
           WHEN p.situacao = 'Em acordo' THEN 'Parcela em acordo.'
           WHEN EXISTS (
             SELECT 1 FROM public.recebimentos_historico h
             WHERE h.id_parcela = p.id_parcela
               AND h.origem IN ('app', 'acordo', 'estorno')
           ) THEN 'Tem pagamento lançado no app.'
           WHEN c.ultimo IS NULL THEN
             'Sem conversa sua com o cliente nos 30 dias antes do pagamento.'
           ELSE NULL
         END
  FROM parcelas p
  LEFT JOIN LATERAL (
    SELECT max(ct.created_at) AS ultimo
    FROM contatos ct
    WHERE ct.dia BETWEEN p.data_pagamento - 30 AND p.data_pagamento
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN ap.decisao IS NULL THEN 'aberto' ELSE ap.decisao END AS decisao_txt,
           ap.solicitado_por_id = (SELECT id FROM eu) AS meu
    FROM public.atribuicoes_pagamento ap
    WHERE ap.id_parcela = p.id_parcela
      AND (ap.decisao IS NULL OR ap.decisao = 'aprovado')
    LIMIT 1
  ) ped ON true
  WHERE (SELECT tipo FROM eu) = 'manager'
     OR EXISTS (SELECT 1 FROM contatos)
  ORDER BY p.data_pagamento DESC, p.venda, p.parcela, p.id_parcela;
$function$;

REVOKE ALL ON FUNCTION public.parcelas_para_atribuicao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcelas_para_atribuicao(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pedido do cobrador: uma ou mais parcelas do mesmo cliente, observacao
-- obrigatoria. Devolve o lote.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedir_atribuicao_pagamento(
  p_documento text,
  p_parcelas bigint[],
  p_observacao text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu    uuid := (SELECT app_current_user_id());
  v_lote  uuid := gen_random_uuid();
  v_qtd   integer;
  r       record;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Usuário não identificado. Entre de novo no app.';
  END IF;
  IF (SELECT app_current_user_type()) IS NOT DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Gestor não pede atribuição de pagamento.';
  END IF;
  IF NULLIF(trim(p_observacao), '') IS NULL THEN
    RAISE EXCEPTION 'Conte como foi a tratativa com o cliente.';
  END IF;
  IF p_parcelas IS NULL OR cardinality(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos uma parcela.';
  END IF;

  v_qtd := 0;
  FOR r IN
    SELECT f.*, b.cliente
    FROM public.parcelas_para_atribuicao(p_documento) f
    JOIN public."BANCO_DADOS" b ON b.id_parcela = f.id_parcela
    WHERE f.id_parcela = ANY (p_parcelas)
  LOOP
    IF r.bloqueio IS NOT NULL THEN
      RAISE EXCEPTION 'Parcela % da venda %: %', r.parcela, r.venda, r.bloqueio;
    END IF;
    INSERT INTO public.atribuicoes_pagamento (
      lote, id_parcela, documento, cliente, venda, parcela, valor,
      data_pagamento, observacao, ultimo_contato_em, solicitado_por_id
    ) VALUES (
      v_lote, r.id_parcela, p_documento, r.cliente, r.venda, r.parcela,
      r.valor, r.data_pagamento, trim(p_observacao), r.ultimo_contato_em, v_eu
    );
    v_qtd := v_qtd + 1;
  END LOOP;

  IF v_qtd <> (SELECT count(DISTINCT x) FROM unnest(p_parcelas) x) THEN
    RAISE EXCEPTION 'Parcela não encontrada, não paga pelo ERP ou com mais de 30 dias de pago. Atualize a ficha.';
  END IF;

  RETURN v_lote;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe pedido em análise ou atribuição para esta parcela.';
END;
$function$;

REVOKE ALL ON FUNCTION public.pedir_atribuicao_pagamento(text, bigint[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_atribuicao_pagamento(text, bigint[], text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decisao do gestor, por lote. Aprovar confere de novo a baixa no ERP e grava
-- o valor atual dela; recusar exige resposta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decidir_atribuicao_pagamento(
  p_lote uuid,
  p_aprovar boolean,
  p_resposta text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      uuid := (SELECT app_current_user_id());
  v_qtd     integer;
  v_total   numeric := 0;
  r         record;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  PERFORM 1 FROM public.atribuicoes_pagamento
  WHERE lote = p_lote
  FOR UPDATE;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  IF v_qtd = 0 THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.atribuicoes_pagamento
             WHERE lote = p_lote AND decisao IS NOT NULL) THEN
    RAISE EXCEPTION 'Este pedido já foi decidido.';
  END IF;

  IF NOT p_aprovar THEN
    IF NULLIF(trim(p_resposta), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o motivo da recusa.';
    END IF;
    UPDATE public.atribuicoes_pagamento
    SET decisao = 'recusado', resposta = trim(p_resposta),
        decidido_por_id = v_eu, decidido_em = now()
    WHERE lote = p_lote;
    RETURN jsonb_build_object('decisao', 'recusado', 'parcelas', v_qtd);
  END IF;

  FOR r IN
    SELECT ap.id, ap.parcela, ap.venda,
           round(COALESCE(b.valor_recebido, 0), 2) AS atual,
           b.data_de_recebimento,
           lower(trim(COALESCE(b.status, ''))) AS st
    FROM public.atribuicoes_pagamento ap
    LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = ap.id_parcela
    WHERE ap.lote = p_lote
  LOOP
    IF r.atual <= 0 OR r.data_de_recebimento IS NULL
       OR r.st IN ('cancelado', 'agrupado', 'renegociado') THEN
      RAISE EXCEPTION 'Parcela % da venda % não está mais paga no ERP. Recuse o pedido.',
        r.parcela, r.venda;
    END IF;
    UPDATE public.atribuicoes_pagamento
    SET decisao = 'aprovado', valor_aprovado = r.atual,
        resposta = NULLIF(trim(p_resposta), ''),
        decidido_por_id = v_eu, decidido_em = now()
    WHERE id = r.id;
    v_total := v_total + r.atual;
  END LOOP;

  RETURN jsonb_build_object('decisao', 'aprovado', 'parcelas', v_qtd,
                            'valor', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.decidir_atribuicao_pagamento(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_atribuicao_pagamento(uuid, boolean, text) TO authenticated, service_role;
