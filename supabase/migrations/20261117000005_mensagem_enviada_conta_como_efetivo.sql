-- Mensagem enviada passa a contar como contato efetivo (2026-11-17).
--
-- Decisão do gestor na reunião do dia: toda interação com o cliente -- mesmo
-- só mandar mensagem (WhatsApp/SMS), sem resposta confirmada -- é registrada
-- como ação de cobrança. Antes "message_sent" ficava fora de
-- EFFECTIVE_ATTEMPT_RESULTS (src/config/collectionAttempts.ts) e da função
-- espelho atribuicao_contato_conta porque enviar não confirma que o cliente
-- leu ou respondeu; o gestor decidiu que isso não importa para contar como
-- ação -- resolve de vez o caso relatado em 20261117000003 (pago na loja sem
-- "conversa efetiva" quando o único contato foi mensagem).
--
-- Efeito automático (mesma fonte, sem outra migration): meta de atendimentos
-- do cobrador de carteira (isEffectiveLabel/countsTowardVisitsGoal) e a
-- "a-ação" de item 66 (atribuição de pagamento ao cobrador -- pedido,
-- painel do gestor, exceção, conferência) passam a aceitar mensagem enviada.
-- "claims_paid" e "sale_cancel_reported" continuam de fora: ali é o cliente
-- avisando algo, não o cobrador cobrando.
--
-- Corpo copiado de produção (pg_get_functiondef); única mudança: acrescenta
-- 'message_sent' à lista.

CREATE OR REPLACE FUNCTION public.atribuicao_contato_conta(p_result text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_result IN ('promise', 'refusal', 'partial_payment', 'full_payment',
                      'contact_made', 'message_sent', 'agreement', 'disputed');
$function$;
