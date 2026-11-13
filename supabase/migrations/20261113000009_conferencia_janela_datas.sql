-- Item 61 -- Conferencia de recebimentos: tirar de "Precisa conferir" o que e
-- so diferenca de data (baixa ou registro no mes vizinho).
--
-- Mesma funcao da 20261111000004 (corpo de producao conferido igual em
-- 2026-11-13): os CTEs do mes e as linhas devolvidas NAO mudam. Duas colunas
-- a mais por linha, calculadas a parte e juntadas no fim:
--   base_janela / app_janela = baixado na base e registrado no app de 45 dias
--   antes do inicio ate 45 dias depois do fim do mes (a mesma janela do bloco
--   "Fora deste mes" do detalhe na tela).
--   Visao "Todos": por cliente (todos os cobradores), como a base da linha.
--   Visao "So carteira": por cobrador x cliente, como a linha.
-- A tela classifica "so data" quando o mes diverge mas a janela bate
-- (filters/conferenciaRecebimentos.ts).
-- O retorno muda (colunas novas), por isso DROP + CREATE.
-- Somente leitura e SECURITY INVOKER: a RLS decide o que cada um ve.
DROP FUNCTION IF EXISTS public.conferencia_recebimentos(date, date, boolean);

CREATE FUNCTION public.conferencia_recebimentos(
  p_inicio date,
  p_fim date,
  p_so_carteira boolean DEFAULT false
)
 RETURNS TABLE(
   cobrador_id uuid,
   carteira_id uuid,
   documento text,
   cliente text,
   base_valor numeric,
   base_parcelas integer,
   app_valor numeric,
   app_lancamentos integer,
   app_cedrus numeric,
   na_carteira boolean,
   base_janela numeric,
   app_janela numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH baixas AS (
    SELECT b.user_id,
           regexp_replace(b.documento, '\D', '', 'g') AS doc,
           b.documento, b.cliente, b.valor_recebido, b.data_de_recebimento
    FROM public."BANCO_DADOS" b
    WHERE b.data_de_recebimento BETWEEN p_inicio AND p_fim
      AND COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
  ), app_bruto AS (
    SELECT s.collector_id AS cobrador_id,
           regexp_replace(s.client_document, '\D', '', 'g') AS doc,
           max(s.client_document) AS documento,
           max(s.client_name) AS cliente,
           sum(s.payment_amount) AS valor,
           count(*)::integer AS lancamentos,
           COALESCE(sum(s.payment_amount) FILTER (WHERE s.payment_method = 'Cedrus'), 0) AS cedrus
    FROM public.sale_payments s
    WHERE s.payment_date BETWEEN p_inicio AND p_fim
      AND COALESCE(s.payment_method, '') !~* '^ajuste'
    GROUP BY 1, 2
    UNION ALL
    SELECT ap.collector_id,
           regexp_replace(a.client_document, '\D', '', 'g'),
           max(a.client_document),
           max(a.client_name),
           sum(ap.valor_pago),
           count(*)::integer,
           0
    FROM public.acordo_pagamentos ap
    JOIN public.acordo_parcelas p ON p.id = ap.acordo_parcela_id
    JOIN public.acordos a ON a.id = p.acordo_id
    WHERE ap.data_pagamento BETWEEN p_inicio AND p_fim
    GROUP BY 1, 2
  ), app AS (
    SELECT cobrador_id, doc, max(documento) AS documento, max(cliente) AS cliente,
           sum(valor) AS valor, sum(lancamentos)::integer AS lancamentos,
           sum(cedrus) AS cedrus
    FROM app_bruto
    GROUP BY 1, 2
  ),
  -- Visao "Todos os recebimentos": base por cliente.
  base_cliente AS (
    SELECT doc,
           (array_agg(user_id ORDER BY user_id IS NULL, data_de_recebimento DESC))[1] AS carteira_id,
           max(documento) AS documento, max(cliente) AS cliente,
           sum(valor_recebido) AS valor, count(*)::integer AS parcelas
    FROM baixas
    GROUP BY 1
  ),
  -- Visao "So carteira": base por cliente x dono da parcela.
  base_carteira AS (
    SELECT user_id AS cobrador_id, doc,
           max(documento) AS documento, max(cliente) AS cliente,
           sum(valor_recebido) AS valor, count(*)::integer AS parcelas
    FROM baixas
    WHERE user_id IS NOT NULL
    GROUP BY 1, 2
  ), carteira AS (
    SELECT DISTINCT b.user_id AS cobrador_id,
           regexp_replace(b.documento, '\D', '', 'g') AS doc
    FROM public."BANCO_DADOS" b
    WHERE p_so_carteira AND b.user_id IS NOT NULL AND b.documento IS NOT NULL
  ),
  -- Janela (mes +- 45 dias), mesmos criterios do mes.
  base_jan AS (
    SELECT b.user_id AS cobrador_id,
           regexp_replace(b.documento, '\D', '', 'g') AS doc,
           sum(b.valor_recebido) AS valor
    FROM public."BANCO_DADOS" b
    WHERE b.data_de_recebimento BETWEEN p_inicio - 45 AND p_fim + 45
      AND COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
    GROUP BY 1, 2
  ), app_jan AS (
    SELECT s.collector_id AS cobrador_id,
           regexp_replace(s.client_document, '\D', '', 'g') AS doc,
           s.payment_amount AS valor
    FROM public.sale_payments s
    WHERE s.payment_date BETWEEN p_inicio - 45 AND p_fim + 45
      AND COALESCE(s.payment_method, '') !~* '^ajuste'
    UNION ALL
    SELECT ap.collector_id,
           regexp_replace(a.client_document, '\D', '', 'g'),
           ap.valor_pago
    FROM public.acordo_pagamentos ap
    JOIN public.acordo_parcelas p ON p.id = ap.acordo_parcela_id
    JOIN public.acordos a ON a.id = p.acordo_id
    WHERE ap.data_pagamento BETWEEN p_inicio - 45 AND p_fim + 45
  ), jan_doc AS (
    SELECT doc, sum(base) AS base, sum(app) AS app FROM (
      SELECT doc, valor AS base, 0 AS app FROM base_jan
      UNION ALL
      SELECT doc, 0, valor FROM app_jan
    ) x GROUP BY 1
  ), jan_cart AS (
    SELECT cobrador_id, doc, sum(base) AS base, sum(app) AS app FROM (
      SELECT cobrador_id, doc, valor AS base, 0 AS app FROM base_jan
      UNION ALL
      SELECT cobrador_id, doc, 0, valor FROM app_jan
    ) x GROUP BY 1, 2
  ), linhas AS (
    SELECT COALESCE(a.cobrador_id, b.carteira_id) AS cobrador_id,
           b.carteira_id,
           COALESCE(b.documento, a.documento) AS documento,
           COALESCE(b.cliente, a.cliente) AS cliente,
           COALESCE(b.valor, 0) AS base_valor,
           COALESCE(b.parcelas, 0) AS base_parcelas,
           COALESCE(a.valor, 0) AS app_valor,
           COALESCE(a.lancamentos, 0) AS app_lancamentos,
           COALESCE(a.cedrus, 0) AS app_cedrus,
           true AS na_carteira,
           COALESCE(b.doc, a.doc) AS doc
    FROM base_cliente b
    FULL JOIN app a ON a.doc = b.doc
    WHERE NOT p_so_carteira

    UNION ALL

    SELECT COALESCE(b.cobrador_id, a.cobrador_id),
           b.cobrador_id,
           COALESCE(b.documento, a.documento),
           COALESCE(b.cliente, a.cliente),
           COALESCE(b.valor, 0),
           COALESCE(b.parcelas, 0),
           COALESCE(a.valor, 0),
           COALESCE(a.lancamentos, 0),
           COALESCE(a.cedrus, 0),
           b.cobrador_id IS NOT NULL OR EXISTS (
             SELECT 1 FROM carteira c
             WHERE c.cobrador_id = a.cobrador_id AND c.doc = a.doc
           ),
           COALESCE(b.doc, a.doc)
    FROM base_carteira b
    FULL JOIN app a ON a.doc = b.doc AND a.cobrador_id = b.cobrador_id
    WHERE p_so_carteira
  )
  SELECT l.cobrador_id, l.carteira_id, l.documento, l.cliente,
         l.base_valor, l.base_parcelas, l.app_valor, l.app_lancamentos,
         l.app_cedrus, l.na_carteira,
         COALESCE(CASE WHEN p_so_carteira THEN jc.base ELSE jd.base END, 0),
         COALESCE(CASE WHEN p_so_carteira THEN jc.app ELSE jd.app END, 0)
  FROM linhas l
  LEFT JOIN jan_doc jd ON NOT p_so_carteira AND jd.doc = l.doc
  LEFT JOIN jan_cart jc ON p_so_carteira AND jc.doc = l.doc
                       AND jc.cobrador_id IS NOT DISTINCT FROM l.cobrador_id;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_recebimentos(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_recebimentos(date, date, boolean) TO authenticated, service_role;
