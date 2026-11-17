-- Conferência de recebimentos × pagos na loja (2026-11-17).
--
-- A lista "Elegíveis sem pedido" (Correções > Pagos na loja) repetia a
-- Conferência: as mesmas baixas do ERP sem registro no app, so que com a
-- conversa do cobrador antes do pagamento. A lista sai; a informacao vai para
-- a Conferência, que e mensal. Esta funcao devolve, para cada parcela baixada
-- no mes (data_de_recebimento entre p_inicio e p_fim):
--   - quem conversou com o cliente nos 30 dias ate o pagamento (mesma regra
--     do painel: atribuicao_contato_conta, uma linha por cobrador);
--   - o pedido "pago na loja" da parcela (aberto > aprovado > recusado);
--   - se ainda da para pedir (sem bloqueio, sem pedido aberto/aprovado e
--     dentro dos 30 dias do pagamento).
-- So linhas com conversa ou com pedido. A tela soma o aprovado ao "app" do
-- cliente: pago na loja aprovado conta como registrado (decisao do usuario,
-- 17/11: a aprovacao vale como conferido).
--
-- Mesma forma de atribuicoes_painel_gestor (SECURITY DEFINER: le
-- collection_attempts de todos os cobradores), so gestor.

CREATE OR REPLACE FUNCTION public.conferencia_conversas(p_inicio date, p_fim date)
 RETURNS TABLE(
   id_parcela bigint,
   documento text,
   valor numeric,
   data_pagamento date,
   cobrador_id uuid,
   contatos integer,
   ultimo_contato_em timestamp with time zone,
   ultimo_resultado text,
   pode_pedir boolean,
   pedido_lote uuid,
   pedido_decisao text,
   pedido_cobrador_id uuid,
   valor_aprovado numeric
 )
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
           AND p.d >= v_hoje - 30
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
