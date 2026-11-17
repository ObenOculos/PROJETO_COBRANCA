-- "Pago na loja": identificar parcela sem venda (2026-11-17).
--
-- Caso real: parcela de renegociação da SSÓtica (venda_n e numero_titulo
-- nulos) aparecia como "venda #—" nas listas de atribuição/exceção, sem dar
-- nenhuma pista pro gestor/cobrador do que é aquela parcela. BANCO_DADOS.descricao
-- já guarda isso (ex.: "Renegociação de Parcelas", "Venda Crediário") -- só
-- faltava as RPCs devolverem.
--
-- Corpo copiado de produção (pg_get_functiondef); única mudança: acrescenta
-- `descricao` ao RETURNS TABLE e ao SELECT (b.descricao / p.descricao).

-- RETURNS TABLE muda (coluna nova): precisa DROP antes do CREATE.
DROP FUNCTION IF EXISTS public.parcelas_para_atribuicao(text);

CREATE FUNCTION public.parcelas_para_atribuicao(p_documento text)
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

-- RETURNS TABLE muda (coluna nova): precisa DROP antes do CREATE.
DROP FUNCTION IF EXISTS public.parcelas_para_excecao(text, uuid);

CREATE FUNCTION public.parcelas_para_excecao(
  p_documento text,
  p_cobrador_id uuid
)
 RETURNS TABLE(id_parcela bigint, venda bigint, parcela bigint, data_vencimento date, valor numeric, data_pagamento date, loja text, ultimo_contato_em timestamp with time zone, pedido_decisao text, pedido_meu boolean, bloqueio text, descricao text)
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
  WITH contatos AS (
    SELECT a.created_at,
           (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM public.collection_attempts a
    JOIN public."BANCO_DADOS" b2 ON a.collection_id = b2.id_parcela::text
    WHERE b2.documento = p_documento
      AND a.collector_id = p_cobrador_id
      AND public.atribuicao_contato_conta(a.result)
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
      -- Mesmo prazo do pedido: até 30 dias depois do pagamento.
      AND b.data_de_recebimento
          >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 30
  )
  SELECT p.id_parcela, p.venda, p.parcela, p.data_vencimento, p.valor,
         p.data_pagamento, p.loja,
         c.ultimo,
         ped.decisao_txt,
         ped.meu,
         CASE
           WHEN ped.decisao_txt = 'aberto' THEN
             'Já tem pedido do cobrador em análise (decida em Correções).'
           WHEN ped.decisao_txt = 'aprovado' THEN
             CASE WHEN ped.meu THEN 'Já atribuído a este cobrador.'
                  ELSE 'Já atribuído a outro cobrador.' END
           ELSE public.atribuicao_bloqueio_parcela(p.id_parcela)
         END,
         p.descricao
  FROM parcelas p
  LEFT JOIN LATERAL (
    SELECT max(ct.created_at) AS ultimo
    FROM contatos ct
    WHERE ct.dia BETWEEN p.data_pagamento - 30 AND p.data_pagamento
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN ap.decisao IS NULL THEN 'aberto' ELSE ap.decisao END AS decisao_txt,
           ap.solicitado_por_id = p_cobrador_id AS meu
    FROM public.atribuicoes_pagamento ap
    WHERE ap.id_parcela = p.id_parcela
      AND (ap.decisao IS NULL OR ap.decisao = 'aprovado')
    LIMIT 1
  ) ped ON true
  ORDER BY p.data_pagamento DESC, p.venda, p.parcela, p.id_parcela;
END;
$function$;

REVOKE ALL ON FUNCTION public.parcelas_para_excecao(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcelas_para_excecao(text, uuid) TO authenticated, service_role;
