// Fonte unica de verdade pra regras sobre collection_attempts (tentativas
// de contato/cobranca registradas pelo Atender -- LogContactModal).
import { CollectionAttempt, ScheduledVisit } from "../types";

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
  disputed: "Contestou a dívida (SPC)",
};

/**
 * Resultados que significam "conseguiu falar com o cliente" (contato
 * efetivo), usados pela meta de atendimentos do cobrador de carteira
 * (WALLET_COLLECTOR_TYPES) -- diferente da visita presencial, onde
 * "realizada" ja conta sozinho (o cobrador foi ao local, qualquer desfecho).
 * "Mensagem enviada" fica de fora: enviar nao confirma que o cliente leu ou
 * respondeu.
 */
const EFFECTIVE_ATTEMPT_RESULTS: ReadonlySet<CollectionAttempt["result"]> =
  new Set([
    "promise",
    "refusal",
    "partial_payment",
    "full_payment",
    "contact_made",
    "agreement",
    "disputed",
  ]);

export const isEffectiveAttemptResult = (
  result: CollectionAttempt["result"],
): boolean => EFFECTIVE_ATTEMPT_RESULTS.has(result);

/**
 * Motivo de reagendamento (config/rescheduleReasons) quando um contato NAO
 * efetivo empurra o agendamento ativo no "Registrar contato" -- o resultado
 * da tentativa ja diz por que remarcou, o cobrador nao escolhe de novo.
 */
const RESCHEDULE_REASON_BY_ATTEMPT_RESULT: Partial<
  Record<CollectionAttempt["result"], string>
> = {
  no_answer: "nao_atendeu_reagendar",
  busy: "nao_atendeu_reagendar",
};

export const rescheduleReasonForAttemptResult = (
  result: CollectionAttempt["result"],
): string => RESCHEDULE_REASON_BY_ATTEMPT_RESULT[result] ?? "outro";

/**
 * Desfecho do agendamento ativo ao registrar um contato com proximo contato
 * marcado: efetivo -> "realizada" (conta na meta) + novo agendamento de
 * ACOMPANHAMENTO; nao efetivo -> "reagendada" (mesma cadeia, entra em
 * Reincidentes). Sem proximo contato, sempre "realizada".
 */
export const attemptReschedulesActiveContact = (
  result: CollectionAttempt["result"],
): boolean => !isEffectiveAttemptResult(result);

/**
 * Mesma classificacao, mas a partir do ROTULO gravado em
 * scheduled_visits.notes na conclusao de um contato agendado (Etapa 4) --
 * la nao sobra o `result` estruturado, so o texto exibido. Espelha o padrao
 * de `exactVisitOutcome` (src/config/visitOutcomes): texto EXATO contra o
 * catalogo, nunca semelhanca.
 */
export const isEffectiveLabel = (notes?: string | null): boolean => {
  const text = (notes ?? "").trim();
  if (!text) return false;
  const result = (
    Object.entries(ATTEMPT_RESULT_LABELS) as [CollectionAttempt["result"], string][]
  ).find(([, label]) => label === text)?.[0];
  return result ? isEffectiveAttemptResult(result) : false;
};

/**
 * Decide se uma visita/contato CONTA pra meta de atendimento
 * (`monthly_goals.visits_goal`) -- "realizada" sempre vale pro cobrador
 * Externo (foi ao local, qualquer desfecho), mas pra carteira
 * (WALLET_COLLECTOR_TYPES) so conta quando foi CONTATO EFETIVO
 * (`isEffectiveLabel`). Fonte unica: antes de 2026-11-04,
 * CollectorPerformanceModal reimplementava so a metade "realizada" dessa
 * regra, sem o filtro de efetivo -- inflava o % de carteira no historico
 * mensal por cobrador (item 19, docs/PROGRESSO.md). Qualquer tela que
 * precise decidir "essa visita bate meta?" deve chamar esta funcao, nunca
 * comparar `status === "realizada"` sozinho.
 */
export const countsTowardVisitsGoal = (
  visit: Pick<ScheduledVisit, "status" | "notes">,
  isWalletCollector: boolean,
): boolean =>
  visit.status === "realizada" &&
  (!isWalletCollector || isEffectiveLabel(visit.notes));
