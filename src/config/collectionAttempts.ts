// Fonte unica de verdade pra regras sobre collection_attempts (tentativas
// de contato/cobranca registradas por CollectionModal e LogContactModal).
import { CollectionAttempt } from "../types";

/** Dias sem nenhum contato registrado pra um cliente entrar na secao "Sem
 * contato" da agenda priorizada da carteira (CollectorDashboard.tsx). */
export const SEM_CONTATO_DIAS = 7;

export const ATTEMPT_TYPE_LABELS: Record<CollectionAttempt["type"], string> = {
  call: "Ligação",
  visit: "Visita",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

export const ATTEMPT_RESULT_LABELS: Record<CollectionAttempt["result"], string> = {
  no_answer: "Não atendeu",
  busy: "Ocupado",
  not_found: "Não encontrado",
  promise: "Promessa de pagamento",
  refusal: "Recusa",
  partial_payment: "Pagamento parcial",
  full_payment: "Pagamento integral",
  contact_made: "Contato realizado",
  message_sent: "Mensagem enviada",
  agreement: "Acordo realizado",
};
