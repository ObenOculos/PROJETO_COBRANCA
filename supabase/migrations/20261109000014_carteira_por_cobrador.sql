-- Distribuicao da carteira: quantos clientes em aberto cada cobrador tem hoje
-- (mostrado no cabecalho de cada cobrador na tela). Mesmo criterio de "em
-- aberto" de lojas_carteira(). Somente leitura e SECURITY INVOKER: a RLS de
-- BANCO_DADOS decide o que cada um ve (gestor ve todos).
CREATE OR REPLACE FUNCTION public.carteira_por_cobrador()
 RETURNS TABLE(collector_id uuid, clientes_em_aberto integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT b.user_id, count(DISTINCT b.documento)::integer
  FROM public."BANCO_DADOS" b
  WHERE b.documento IS NOT NULL
    AND b.user_id IS NOT NULL
    AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
    AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
  GROUP BY b.user_id;
$function$;

REVOKE ALL ON FUNCTION public.carteira_por_cobrador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_por_cobrador() TO authenticated, service_role;
