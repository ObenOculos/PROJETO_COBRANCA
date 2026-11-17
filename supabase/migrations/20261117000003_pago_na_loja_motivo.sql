-- Pago na loja: mostrar as parcelas mesmo sem conversa efetiva (2026-11-17).
--
-- Caso: cliente da carteira da cobradora pagou 2 parcelas na loja; os contatos
-- dela no periodo foram "nao atendeu", "nao encontrado" e "cliente diz que ja
-- pagou" -- nenhum conta como conversa (regra de 16/11). A lista vinha vazia
-- e parecia defeito. A regra NAO muda (vai para a reuniao); so a explicacao:
--   - o cobrador ve as parcelas pagas do cliente se o cliente e da carteira
--     dele ou se ele tem qualquer contato com o cliente;
--   - o motivo cita os contatos dele no periodo que nao contam.
--
-- Corpo copiado de producao (pg_get_functiondef em 2026-11-17); mudancas: CTE
-- tentativas, lateral t, texto do motivo e o WHERE final.

CREATE OR REPLACE FUNCTION public.parcelas_para_atribuicao(p_documento text)
 RETURNS TABLE(id_parcela bigint, venda bigint, parcela bigint, data_vencimento date, valor numeric, data_pagamento date, loja text, ultimo_contato_em timestamp with time zone, pedido_decisao text, pedido_meu boolean, bloqueio text)
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
               'Sem conversa efetiva sua com o cliente nos 30 dias antes do pagamento'
               || COALESCE(' (seus contatos nesse período: ' || t.resultados || ').', '.')
             END)
         END
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
