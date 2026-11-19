-- Escada da Fila: a decisao "SPC" do gestor tambem zera a contagem
-- (2026-11-19, revisao da 20261119000003).
--
-- O SPC manda o cliente para 'Aguardando Jurídico'. Sem isto, quando ele fosse
-- atribuido a um cobrador juridico chegaria com as 5+ tentativas antigas: a
-- fila do juridico o marcava na hora como "Aguardando o gestor" e a primeira
-- tentativa sem retorno abria outro caso.
--
-- Corpo copiado de producao (pg_get_functiondef, 2026-11-19); unica mudanca:
-- decisao 'spc' de qualquer caso (tentativas ou limite de remarcacao)
-- tambem recomeca. Mantem o REVOKE da 20261119000003.

CREATE OR REPLACE FUNCTION public._tentativas_sem_retorno_info(p_documento text)
 RETURNS TABLE(tentativas integer, ultima timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH tent AS (
    SELECT a.created_at, a.result
    FROM public.collection_attempts a
    JOIN public."BANCO_DADOS" b ON b.id_parcela::text = a.collection_id
    WHERE b.documento = p_documento
  ), ultimo_retorno AS (
    SELECT GREATEST(
      (SELECT max(t.created_at) FROM tent t
       WHERE t.result IN ('promise', 'refusal', 'partial_payment',
                          'full_payment', 'contact_made', 'agreement',
                          'disputed', 'claims_paid', 'sale_cancel_reported')),
      (SELECT max(p.created_at) FROM public.sale_payments p
       WHERE p.client_document = p_documento),
      (SELECT max(ac.created_at) FROM public.acordos ac
       WHERE ac.client_document = p_documento),
      -- 2026-11-19: decisao do gestor (devolveu ou mandou para o SPC) = recomeca.
      (SELECT max(cg.decidido_em) FROM public.casos_gestor cg
       WHERE cg.documento = p_documento
         AND (
           -- devolveu ao cobrador depois das tentativas sem retorno
           (cg.motivo = 'tentativas_sem_retorno' AND cg.status = 'mantido')
           -- SPC por qualquer caso (tentativas ou limite de remarcacao): o
           -- cliente vai para o juridico, que comeca a cobrar do zero.
           OR cg.status = 'spc'
         ))
    ) AS em
  )
  SELECT count(DISTINCT t.created_at)::integer, max(t.created_at)
  FROM tent t, ultimo_retorno u
  WHERE t.result IN ('no_answer', 'busy', 'not_found', 'message_sent')
    AND (u.em IS NULL OR t.created_at > u.em);
$function$;
