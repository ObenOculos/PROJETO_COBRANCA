-- Item 50: conferencia mensal do gestor -- o que a base (Ciclone, BANCO_DADOS)
-- baixou como recebido x o que os cobradores registraram no app.
--
-- Uma linha por cliente (documento so com digitos) no periodo:
--   base_*   : parcelas com data_de_recebimento no periodo (valor_recebido e
--              o PRINCIPAL; o Ciclone nao preenche juros_pago).
--   app_*    : sale_payments do periodo (pagamentos, estornos; sem
--              "Ajuste Administrativo") + acordo_pagamentos do periodo.
--              app_cedrus = parte importada do Cedrus (payment_method 'Cedrus').
--   cobrador_id : quem registrou no app; se ninguem registrou, o dono da
--              carteira (BANCO_DADOS.user_id) -- carteira_id.
-- Se mais de um cobrador registrou o mesmo cliente no periodo, sai uma linha
-- por cobrador e a base repete em cada uma (raro; a tela avisa).
--
-- Somente leitura e SECURITY INVOKER: a RLS de BANCO_DADOS/sale_payments/
-- acordos decide o que cada um ve (gestor ve todos).
CREATE OR REPLACE FUNCTION public.conferencia_recebimentos(p_inicio date, p_fim date)
 RETURNS TABLE(
   cobrador_id uuid,
   carteira_id uuid,
   documento text,
   cliente text,
   base_valor numeric,
   base_parcelas integer,
   app_valor numeric,
   app_lancamentos integer,
   app_cedrus numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT regexp_replace(b.documento, '\D', '', 'g') AS doc,
           (array_agg(b.user_id ORDER BY b.user_id IS NULL, b.data_de_recebimento DESC))[1] AS carteira_id,
           max(b.documento) AS documento,
           max(b.cliente) AS cliente,
           sum(b.valor_recebido) AS valor,
           count(*)::integer AS parcelas
    FROM public."BANCO_DADOS" b
    WHERE b.data_de_recebimento BETWEEN p_inicio AND p_fim
      AND COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
    GROUP BY 1
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
  )
  SELECT COALESCE(a.cobrador_id, b.carteira_id),
         b.carteira_id,
         COALESCE(b.documento, a.documento),
         COALESCE(b.cliente, a.cliente),
         COALESCE(b.valor, 0),
         COALESCE(b.parcelas, 0),
         COALESCE(a.valor, 0),
         COALESCE(a.lancamentos, 0),
         COALESCE(a.cedrus, 0)
  FROM base b
  FULL JOIN app a ON a.doc = b.doc;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_recebimentos(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_recebimentos(date, date) TO authenticated, service_role;
