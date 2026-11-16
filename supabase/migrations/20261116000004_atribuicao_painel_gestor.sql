-- Item 66, etapa 2 -- painel do gestor para "Atribuir pagamento ao cobrador".
--
-- Decisao do usuario (2026-11-16): o credito so existe quando o cobrador
-- pede (nada automatico), mas o gestor ve tambem os "elegiveis" -- baixas do
-- ERP com conversa de algum cobrador antes, ainda sem pedido.
--
-- Para a regra nao divergir entre a tela do cobrador e a do gestor, as duas
-- partes da regra viram funcoes unicas:
--   atribuicao_contato_conta(result)     -> o contato vale como cobranca?
--   atribuicao_bloqueio_parcela(parcela) -> a parcela pode ser creditada?
-- parcelas_para_atribuicao (cobrador) passa a usa-las -- corpo copiado de
-- producao (pg_get_functiondef, 2026-11-16), mesmo resultado.
-- O prazo (pedido ate 30 dias depois do pagamento) fica em quem lista: o
-- painel do gestor mostra tambem pedido em aberto mais antigo que isso.

-- Indice do teste "a parcela tem lancamento do app" (antes: varredura).
CREATE INDEX IF NOT EXISTS idx_receb_hist_parcela_app
  ON public.recebimentos_historico (id_parcela)
  WHERE origem IN ('app', 'acordo', 'estorno');

-- ---------------------------------------------------------------------------
-- Contato efetivo de cobranca: a lista de EFFECTIVE_ATTEMPT_RESULTS
-- (src/config/collectionAttempts.ts) SEM "claims_paid" e
-- "sale_cancel_reported" -- nesses o cliente esta avisando, nao foi cobrado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuicao_contato_conta(p_result text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_result IN ('promise', 'refusal', 'partial_payment', 'full_payment',
                      'contact_made', 'agreement', 'disputed');
$function$;

-- ---------------------------------------------------------------------------
-- Regras da parcela (sem prazo e sem contato). NULL = pode ser creditada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuicao_bloqueio_parcela(p_id_parcela bigint)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN b.id_parcela IS NULL OR COALESCE(b.valor_recebido, 0) <= 0
         OR b.data_de_recebimento IS NULL THEN
      'Parcela não está paga no ERP.'
    WHEN lower(trim(COALESCE(b.status, ''))) IN ('cancelado', 'agrupado', 'renegociado') THEN
      'Parcela cancelada ou renegociada.'
    WHEN b.situacao = 'Em acordo' THEN 'Parcela em acordo.'
    WHEN EXISTS (
      SELECT 1 FROM public.recebimentos_historico h
      WHERE h.id_parcela = p_id_parcela
        AND h.origem IN ('app', 'acordo', 'estorno')
    ) THEN 'Tem pagamento lançado no app.'
    ELSE NULL
  END
  FROM (SELECT 1) x
  LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = p_id_parcela;
$function$;

-- As duas sao internas (chamadas pelas RPCs SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.atribuicao_contato_conta(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atribuicao_bloqueio_parcela(bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cobrador: mesma assinatura e mesmo resultado, agora pelas funcoes unicas.
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
      AND public.atribuicao_contato_conta(a.result)
  ), parcelas AS (
    SELECT b.id_parcela,
           COALESCE(b.numero_titulo, b.venda_n) AS venda,
           b.parcela,
           b.data_vencimento,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS data_pagamento,
           b.nome_da_loja AS loja
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND COALESCE(b.valor_recebido, 0) > 0
      -- Prazo do pedido: ate 30 dias depois do pagamento.
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
           ELSE COALESCE(
             public.atribuicao_bloqueio_parcela(p.id_parcela),
             CASE WHEN c.ultimo IS NULL THEN
               'Sem conversa sua com o cliente nos 30 dias antes do pagamento.'
             END)
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

-- ---------------------------------------------------------------------------
-- Gestor: uma linha por parcela x cobrador que conversou com o cliente nos
-- 30 dias ate o pagamento. Entram as baixas dos ultimos 30 dias e as de
-- pedido ainda em aberto (mesmo mais antigas). Mostra o pedido da parcela,
-- se houver -- assim o gestor ve elegiveis sem pedido e, num pedido, quem
-- mais falou com o cliente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuicoes_painel_gestor()
 RETURNS TABLE(
   id_parcela bigint,
   documento text,
   cliente text,
   venda bigint,
   parcela bigint,
   valor numeric,
   data_pagamento date,
   loja text,
   cobrador_id uuid,
   contatos integer,
   ultimo_contato_em timestamptz,
   ultimo_resultado text,
   pedido_lote uuid,
   pedido_decisao text,
   pedido_cobrador_id uuid
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  RETURN QUERY
  WITH parc AS (
    SELECT b.id_parcela, b.documento, b.cliente,
           COALESCE(b.numero_titulo, b.venda_n) AS venda, b.parcela,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS d, b.nome_da_loja AS loja
    FROM public."BANCO_DADOS" b
    WHERE COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND (b.data_de_recebimento
             >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 30
           OR EXISTS (SELECT 1 FROM public.atribuicoes_pagamento ap
                      WHERE ap.id_parcela = b.id_parcela AND ap.decisao IS NULL))
  ), validas AS (
    SELECT p.* FROM parc p
    WHERE public.atribuicao_bloqueio_parcela(p.id_parcela) IS NULL
  ), cont AS (
    SELECT v.id_parcela, a.collector_id,
           count(DISTINCT a.created_at)::integer AS n,
           max(a.created_at) AS ultimo,
           (array_agg(a.result ORDER BY a.created_at DESC))[1] AS ultimo_res
    FROM validas v
    JOIN public."BANCO_DADOS" b2 ON b2.documento = v.documento
    JOIN public.collection_attempts a ON a.collection_id = b2.id_parcela::text
    WHERE a.collector_id IS NOT NULL
      AND public.atribuicao_contato_conta(a.result)
      AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN v.d - 30 AND v.d
    GROUP BY v.id_parcela, a.collector_id
  )
  SELECT v.id_parcela, v.documento, v.cliente, v.venda, v.parcela, v.valor,
         v.d, v.loja, c.collector_id, c.n, c.ultimo, c.ultimo_res,
         ped.lote,
         CASE WHEN ped.lote IS NULL THEN NULL
              WHEN ped.decisao IS NULL THEN 'aberto' ELSE ped.decisao END,
         ped.solicitado_por_id
  FROM validas v
  JOIN cont c ON c.id_parcela = v.id_parcela
  LEFT JOIN LATERAL (
    SELECT ap.lote, ap.decisao, ap.solicitado_por_id
    FROM public.atribuicoes_pagamento ap
    WHERE ap.id_parcela = v.id_parcela
      AND (ap.decisao IS NULL OR ap.decisao = 'aprovado')
    LIMIT 1
  ) ped ON true
  ORDER BY v.d DESC, v.documento, v.id_parcela, c.collector_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.atribuicoes_painel_gestor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atribuicoes_painel_gestor() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decisao do gestor: a conferencia da parcela na aprovacao passa a ser a
-- regra unica (atribuicao_bloqueio_parcela). Corpo copiado de producao
-- (pg_get_functiondef, 2026-11-16); so muda o laco de aprovacao.
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
           public.atribuicao_bloqueio_parcela(ap.id_parcela) AS bloqueio
    FROM public.atribuicoes_pagamento ap
    LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = ap.id_parcela
    WHERE ap.lote = p_lote
  LOOP
    -- Mesma regra da parcela do pedido: inclui pagamento lancado no app
    -- DEPOIS do pedido (sem isto, o credito sairia em dobro).
    IF r.bloqueio IS NOT NULL THEN
      RAISE EXCEPTION 'Parcela % da venda %: %. Recuse o pedido.',
        r.parcela, r.venda, rtrim(r.bloqueio, '.');
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
