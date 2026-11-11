-- Item 50: a conferencia de recebimentos e so sobre o que o cobrador controla
-- (pedido do usuario): a carteira dele.
--   base_*  : baixas no periodo das parcelas que estao na carteira do cobrador
--             (BANCO_DADOS.user_id). Parcela sem dono nao entra.
--   app_*   : o que o cobrador registrou no periodo para o cliente
--             (sale_payments sem "Ajuste Administrativo", estornos incluidos,
--             + acordo_pagamentos); app_cedrus = parte importada do Cedrus.
--   na_carteira : o cliente tem alguma parcela na carteira do cobrador. A tela
--             conta so estes; lancamento para cliente fora da carteira aparece
--             a parte, como informacao.
-- Substitui a versao de 20261111000002 (o retorno muda: sai carteira_id,
-- entra na_carteira), por isso DROP + CREATE.
--
-- Somente leitura e SECURITY INVOKER: a RLS decide o que cada um ve.
DROP FUNCTION IF EXISTS public.conferencia_recebimentos(date, date);

CREATE FUNCTION public.conferencia_recebimentos(p_inicio date, p_fim date)
 RETURNS TABLE(
   cobrador_id uuid,
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
  WITH carteira AS (
    SELECT DISTINCT b.user_id AS cobrador_id,
           regexp_replace(b.documento, '\D', '', 'g') AS doc
    FROM public."BANCO_DADOS" b
    WHERE b.user_id IS NOT NULL AND b.documento IS NOT NULL
  ), base AS (
    SELECT b.user_id AS cobrador_id,
           regexp_replace(b.documento, '\D', '', 'g') AS doc,
           max(b.documento) AS documento,
           max(b.cliente) AS cliente,
           sum(b.valor_recebido) AS valor,
           count(*)::integer AS parcelas
    FROM public."BANCO_DADOS" b
    WHERE b.data_de_recebimento BETWEEN p_inicio AND p_fim
      AND COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND b.user_id IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
    GROUP BY 1, 2
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
  SELECT COALESCE(b.cobrador_id, a.cobrador_id),
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
  FROM base b
  FULL JOIN app a ON a.doc = b.doc AND a.cobrador_id = b.cobrador_id;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_recebimentos(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_recebimentos(date, date) TO authenticated, service_role;
