-- Item 50: a conferencia de recebimentos ganha duas visoes, escolhidas pelo
-- gestor na tela (p_so_carteira):
--
-- false (padrao) -- "Todos os recebimentos" (comportamento da 20261111000002):
--   por cliente, todas as baixas do periodo; a linha fica com quem registrou
--   no app e, se ninguem registrou, com o dono da carteira (cobrador_id NULL =
--   "Sem cobrador"). carteira_id = dono da carteira das parcelas baixadas.
--
-- true -- "So carteira" (comportamento da 20261111000003): base = baixas das
--   parcelas da carteira do cobrador; app = o que ele registrou; na_carteira
--   = false para lancamento de cliente fora da carteira (a tela mostra a
--   parte, sem conferir).
--
-- app_* nas duas: sale_payments sem "Ajuste Administrativo" (estornos
-- incluidos) + acordo_pagamentos; app_cedrus = importado do Cedrus.
-- Assinatura muda (parametro novo), por isso DROP + CREATE.
-- Somente leitura e SECURITY INVOKER: a RLS decide o que cada um ve.
DROP FUNCTION IF EXISTS public.conferencia_recebimentos(date, date);

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
   na_carteira boolean
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
  )
  SELECT COALESCE(a.cobrador_id, b.carteira_id),
         b.carteira_id,
         COALESCE(b.documento, a.documento),
         COALESCE(b.cliente, a.cliente),
         COALESCE(b.valor, 0),
         COALESCE(b.parcelas, 0),
         COALESCE(a.valor, 0),
         COALESCE(a.lancamentos, 0),
         COALESCE(a.cedrus, 0),
         true
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
         )
  FROM base_carteira b
  FULL JOIN app a ON a.doc = b.doc AND a.cobrador_id = b.cobrador_id
  WHERE p_so_carteira;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_recebimentos(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_recebimentos(date, date, boolean) TO authenticated, service_role;
