-- Item 38 (reuniao 16/11): o painel "Pagos na loja depois da cobranca"
-- (Correcoes) levava ~9 s. O planejador empurrava
-- atribuicao_bloqueio_parcela() para dentro da varredura de BANCO_DADOS e a
-- chamava em ~120 mil titulos pagos antes de aplicar o filtro de 30 dias
-- (sobram ~1,4 mil). Com a CTE parc MATERIALIZED o filtro de data vem
-- primeiro: 0,36 s, mesmo resultado (381 linhas em 16/11).
-- Corpo copiado de producao (pg_get_functiondef); unica mudanca: MATERIALIZED.

CREATE OR REPLACE FUNCTION public.atribuicoes_painel_gestor()
 RETURNS TABLE(id_parcela bigint, documento text, cliente text, venda bigint, parcela bigint, valor numeric, data_pagamento date, loja text, cobrador_id uuid, contatos integer, ultimo_contato_em timestamp with time zone, ultimo_resultado text, pedido_lote uuid, pedido_decisao text, pedido_cobrador_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta aÃ§Ã£o.';
  END IF;

  RETURN QUERY
  WITH parc AS MATERIALIZED (
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
