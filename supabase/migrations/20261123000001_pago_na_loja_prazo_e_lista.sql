-- Pago na loja: prazo do pedido do cobrador = mes do pagamento + ate o dia
-- 5 do mes seguinte, e lista do que ele ainda pode pedir (filtro "Pagou na
-- loja" da Carteira completa).
--
-- PEDIDO (2026-11-23): o cobrador quase nao pede (3 pedidos x ~246 clientes
-- elegiveis em 30 dias) porque so pedia abrindo a Ficha de cada cliente.
-- Decisoes do usuario:
--   * Lista inclui cliente que ja saiu da carteira, desde que o cobrador
--     tenha conversa efetiva com ele (mesma regra do pedido).
--   * Prazo dentro do mes, para a lista nao crescer: pagamento de novembro
--     pode ser pedido ate 05/12. Vale para tudo do cobrador (pedido pela
--     Ficha, lista nova, aviso "ainda pode pedir" da Conferencia).
--   * Excecao do gestor (parcelas_para_excecao) segue 30 dias: nao muda.
--   * A aprovacao (decidir_atribuicao_pagamento) nao confere prazo: pedido
--     feito no dia 5 ainda pode ser aprovado depois.
--
-- Corpos copiados de producao (pg_get_functiondef em 2026-11-23); so as
-- linhas do prazo mudam.

-- Ultimo dia para o cobrador pedir um pagamento: dia 5 do mes seguinte.
CREATE OR REPLACE FUNCTION public.atribuicao_prazo_pedido(p_data_pagamento date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT (date_trunc('month', p_data_pagamento) + interval '1 month')::date + 4;
$function$;

REVOKE ALL ON FUNCTION public.atribuicao_prazo_pedido(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.parcelas_para_atribuicao(p_documento text)
 RETURNS TABLE(id_parcela bigint, venda bigint, parcela bigint, data_vencimento date, valor numeric, data_pagamento date, loja text, ultimo_contato_em timestamp with time zone, pedido_decisao text, pedido_meu boolean, bloqueio text, descricao text)
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
  ), tentativas AS (
    -- Todos os contatos do cobrador com o cliente (inclusive os que nao
    -- contam), so para explicar o motivo quando nao ha conversa efetiva.
    SELECT DISTINCT a.result,
           (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM public.collection_attempts a
    JOIN public."BANCO_DADOS" b2 ON a.collection_id = b2.id_parcela::text
    WHERE b2.documento = p_documento
      AND a.collector_id = (SELECT id FROM eu)
  ), parcelas AS (
    SELECT b.id_parcela,
           COALESCE(b.numero_titulo, b.venda_n) AS venda,
           b.parcela,
           b.data_vencimento,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS data_pagamento,
           b.nome_da_loja AS loja,
           b.descricao
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND COALESCE(b.valor_recebido, 0) > 0
      -- Prazo do pedido (2026-11-23): mes do pagamento + ate o dia 5 do
      -- mes seguinte (atribuicao_prazo_pedido). Antes: 30 dias corridos.
      AND (now() AT TIME ZONE 'America/Sao_Paulo')::date
          <= public.atribuicao_prazo_pedido(b.data_de_recebimento)
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
               'Sem conversa efetiva sua com o cliente nos 30 dias antes do pagamento'
               || COALESCE(' (seus contatos nesse período: ' || t.resultados || ').', '.')
             END)
         END,
         p.descricao
  FROM parcelas p
  LEFT JOIN LATERAL (
    SELECT max(ct.created_at) AS ultimo
    FROM contatos ct
    WHERE ct.dia BETWEEN p.data_pagamento - 30 AND p.data_pagamento
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT CASE tt.result
             WHEN 'no_answer' THEN 'não atendeu'
             WHEN 'busy' THEN 'ocupado'
             WHEN 'not_found' THEN 'não encontrado'
             WHEN 'message_sent' THEN 'mensagem enviada'
             WHEN 'claims_paid' THEN 'cliente diz que já pagou'
             WHEN 'sale_cancel_reported' THEN 'informou venda cancelada'
             WHEN 'contact_no_result' THEN 'contato sem resultado'
             ELSE tt.result END, ', ') AS resultados
    FROM tentativas tt
    WHERE tt.dia BETWEEN p.data_pagamento - 30 AND p.data_pagamento
      AND NOT public.atribuicao_contato_conta(tt.result)
  ) t ON true
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
     -- 17/11: cliente da carteira dele aparece mesmo sem conversa efetiva,
     -- com o motivo (antes a lista sumia e parecia defeito).
     OR EXISTS (
       SELECT 1 FROM public."BANCO_DADOS" bc
       WHERE bc.documento = p_documento AND bc.user_id = (SELECT id FROM eu)
     )
     OR EXISTS (SELECT 1 FROM tentativas)
  ORDER BY p.data_pagamento DESC, p.venda, p.parcela, p.id_parcela;
$function$;

REVOKE ALL ON FUNCTION public.parcelas_para_atribuicao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcelas_para_atribuicao(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conferencia_conversas(p_inicio date, p_fim date)
 RETURNS TABLE(id_parcela bigint, documento text, valor numeric, data_pagamento date, cobrador_id uuid, contatos integer, ultimo_contato_em timestamp with time zone, ultimo_resultado text, pode_pedir boolean, pedido_lote uuid, pedido_decisao text, pedido_cobrador_id uuid, valor_aprovado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  RETURN QUERY
  WITH parc AS MATERIALIZED (
    SELECT b.id_parcela, b.documento,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS d
    FROM public."BANCO_DADOS" b
    WHERE b.data_de_recebimento BETWEEN p_inicio AND p_fim
      AND COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
  ), cont AS (
    SELECT p.id_parcela, a.collector_id,
           count(DISTINCT a.created_at)::integer AS n,
           max(a.created_at) AS ultimo,
           (array_agg(a.result ORDER BY a.created_at DESC))[1] AS ultimo_res
    FROM parc p
    JOIN public."BANCO_DADOS" b2 ON b2.documento = p.documento
    JOIN public.collection_attempts a ON a.collection_id = b2.id_parcela::text
    WHERE a.collector_id IS NOT NULL
      AND public.atribuicao_contato_conta(a.result)
      AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN p.d - 30 AND p.d
    GROUP BY p.id_parcela, a.collector_id
  ), ped AS (
    SELECT DISTINCT ON (ap.id_parcela)
           ap.id_parcela, ap.lote, ap.decisao, ap.solicitado_por_id,
           ap.valor_aprovado, ap.valor
    FROM public.atribuicoes_pagamento ap
    JOIN parc p ON p.id_parcela = ap.id_parcela
    ORDER BY ap.id_parcela,
             (ap.decisao IS NULL) DESC,
             (ap.decisao = 'aprovado') DESC,
             ap.created_at DESC
  )
  SELECT p.id_parcela, p.documento, p.valor, p.d,
         c.collector_id, COALESCE(c.n, 0), c.ultimo, c.ultimo_res,
         COALESCE(ped.lote IS NULL OR ped.decisao = 'recusado', false)
           AND v_hoje <= public.atribuicao_prazo_pedido(p.d)
           AND public.atribuicao_bloqueio_parcela(p.id_parcela) IS NULL,
         ped.lote,
         CASE WHEN ped.lote IS NULL THEN NULL
              WHEN ped.decisao IS NULL THEN 'aberto' ELSE ped.decisao END,
         ped.solicitado_por_id,
         CASE WHEN ped.decisao = 'aprovado'
              THEN COALESCE(ped.valor_aprovado, ped.valor) END
  FROM parc p
  LEFT JOIN cont c ON c.id_parcela = p.id_parcela
  LEFT JOIN ped ON ped.id_parcela = p.id_parcela
  WHERE c.id_parcela IS NOT NULL OR ped.lote IS NOT NULL
  ORDER BY p.id_parcela, c.collector_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_conversas(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_conversas(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pedir_atribuicao_pagamento(p_documento text, p_parcelas bigint[], p_observacao text)
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
    RAISE EXCEPTION 'Parcela não encontrada, não paga pelo ERP ou fora do prazo (pedido vale até o dia 5 do mês seguinte ao pagamento). Atualize a ficha.';
  END IF;

  RETURN v_lote;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe pedido em análise ou atribuição para esta parcela.';
END;
$function$;

REVOKE ALL ON FUNCTION public.pedir_atribuicao_pagamento(text, bigint[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_atribuicao_pagamento(text, bigint[], text) TO authenticated, service_role;

-- Lista do cobrador logado: parcelas pagas pelo ERP que ele ainda pode pedir
-- (ou que ja pediu e estao em analise). Parte dos CONTATOS dele, nao da
-- carteira: quase metade dos casos ja saiu da carteira (quitou ao pagar).
-- Mesmas regras de parcelas_para_atribuicao: conversa efetiva dele nos 30
-- dias ate o pagamento, sem bloqueio, dentro do prazo, sem pedido aprovado
-- nem pedido em analise de outro cobrador.
CREATE OR REPLACE FUNCTION public.pagos_na_loja_pediveis()
 RETURNS TABLE(documento text, cliente text, loja text, id_parcela bigint, venda bigint, parcela bigint, valor numeric, data_pagamento date, prazo date, ultimo_contato_em timestamp with time zone, ultimo_resultado text, na_carteira boolean, em_analise boolean, descricao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eu AS (
    SELECT (SELECT app_current_user_id()) AS id,
           (SELECT app_current_user_type()) AS tipo,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ), pagas AS MATERIALIZED (
    SELECT b.id_parcela, b.documento, b.cliente, b.nome_da_loja AS loja,
           COALESCE(b.numero_titulo, b.venda_n) AS venda, b.parcela,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS d, b.descricao
    FROM public."BANCO_DADOS" b, eu
    WHERE eu.id IS NOT NULL
      AND eu.tipo IS DISTINCT FROM 'manager'
      AND COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND b.data_de_recebimento
          >= (date_trunc('month', eu.hoje) - interval '1 month')::date
      AND b.data_de_recebimento <= eu.hoje
      AND eu.hoje <= public.atribuicao_prazo_pedido(b.data_de_recebimento)
  ), conv AS (
    SELECT p.id_parcela,
           max(a.created_at) AS ultimo,
           (array_agg(a.result ORDER BY a.created_at DESC))[1] AS res
    FROM pagas p
    JOIN public."BANCO_DADOS" b2 ON b2.documento = p.documento
    JOIN public.collection_attempts a ON a.collection_id = b2.id_parcela::text
    WHERE a.collector_id = (SELECT id FROM eu)
      AND public.atribuicao_contato_conta(a.result)
      AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN p.d - 30 AND p.d
    GROUP BY p.id_parcela
  )
  SELECT p.documento, p.cliente, p.loja, p.id_parcela, p.venda, p.parcela,
         p.valor, p.d, public.atribuicao_prazo_pedido(p.d),
         c.ultimo, c.res,
         EXISTS (
           SELECT 1 FROM public."BANCO_DADOS" bc
           WHERE bc.documento = p.documento AND bc.user_id = (SELECT id FROM eu)
         ),
         ped.solicitado_por_id IS NOT NULL,
         p.descricao
  FROM pagas p
  JOIN conv c ON c.id_parcela = p.id_parcela
  LEFT JOIN LATERAL (
    SELECT ap.decisao, ap.solicitado_por_id
    FROM public.atribuicoes_pagamento ap
    WHERE ap.id_parcela = p.id_parcela
      AND (ap.decisao IS NULL OR ap.decisao = 'aprovado')
    LIMIT 1
  ) ped ON true
  WHERE public.atribuicao_bloqueio_parcela(p.id_parcela) IS NULL
    AND ped.decisao IS NULL
    AND (ped.solicitado_por_id IS NULL
         OR ped.solicitado_por_id = (SELECT id FROM eu))
  ORDER BY 9, 8, p.documento, p.id_parcela;
$function$;

REVOKE ALL ON FUNCTION public.pagos_na_loja_pediveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pagos_na_loja_pediveis() TO authenticated, service_role;
