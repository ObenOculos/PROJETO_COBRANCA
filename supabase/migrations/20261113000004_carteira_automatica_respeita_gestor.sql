-- Item 55 (2026-11-13): a carteira automatica respeita por 30 dias o cliente
-- que o GESTOR colocou a mao na carteira de um cobrador (atribuir_clientes_em_lote,
-- motivo 'atribuicao'), inclusive a devolucao de quem saiu sem acao.
--
-- Sem isto, o cliente devolvido ao cobrador antigo (fora da faixa dele e
-- ainda sem acao desde a devolucao) seria tirado de novo na rodada seguinte
-- das 7h. Decisao do usuario: 30 dias para toda atribuicao manual; depois
-- vale a regra normal (sem acao do cobrador -> sai e volta para a lista).
--
-- Unica mudanca em cobrador_teve_acao_recente (20261113000002): a atribuicao
-- manual entra na lista de "acoes" que seguram o cliente.

CREATE OR REPLACE FUNCTION public.cobrador_teve_acao_recente(p_documento text, p_cobrador uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH entrada AS (
    SELECT max(h.assigned_at) AS t
    FROM public.atribuicoes_historico h
    WHERE h.documento = p_documento AND h.cobrador_novo_id = p_cobrador::text
  )
  SELECT COALESCE(GREATEST(
    (SELECT max(a.created_at)
       FROM public."BANCO_DADOS" b
       JOIN public.collection_attempts a ON a.collection_id = b.id_parcela::text
      WHERE b.documento = p_documento AND a.collector_id = p_cobrador),
    (SELECT max(p.created_at) FROM public.sale_payments p
      WHERE p.client_document = p_documento AND p.collector_id = p_cobrador),
    (SELECT max(ac.created_at) FROM public.acordos ac
      WHERE ac.client_document = p_documento AND ac.collector_id = p_cobrador),
    (SELECT max(ap.created_at)
       FROM public.acordo_pagamentos ap
       JOIN public.acordo_parcelas pa ON pa.id = ap.acordo_parcela_id
       JOIN public.acordos ac ON ac.id = pa.acordo_id
      WHERE ac.client_document = p_documento AND ap.collector_id = p_cobrador),
    (SELECT max(v.created_at) FROM public.scheduled_visits v
      WHERE v.client_document = p_documento AND v.collector_id = p_cobrador::text),
    -- Atribuicao manual do gestor para este cobrador.
    (SELECT max(h.assigned_at) FROM public.atribuicoes_historico h
      WHERE h.documento = p_documento AND h.cobrador_novo_id = p_cobrador::text
        AND h.motivo = 'atribuicao')
  ) >= GREATEST(now() - interval '30 days',
                COALESCE((SELECT t FROM entrada), '-infinity'::timestamptz)), false);
$function$;

COMMENT ON FUNCTION public.cobrador_teve_acao_recente(text, uuid) IS
  'Carteira automatica (item 55): o cobrador registrou algo sobre o cliente (Atender, pagamento, acordo, pagamento de acordo, agendamento) -- ou o gestor o atribuiu a mao a ele -- desde que o cliente entrou na carteira dele, nos ultimos 30 dias.';

REVOKE ALL ON FUNCTION public.cobrador_teve_acao_recente(text, uuid) FROM PUBLIC, anon, authenticated;
