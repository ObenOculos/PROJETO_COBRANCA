// Fonte unica de verdade pra regras sobre collection_attempts (tentativas
// de contato/cobranca registradas pelo Atender -- LogContactModal).
import { CollectionAttempt, ScheduledVisit } from "../types";

/** Dias sem nenhum contato registrado pra um cliente entrar na secao "Sem
 * contato" da agenda priorizada da carteira (CollectorDashboard.tsx). */
export const SEM_CONTATO_DIAS = 7;

/** Quantos dias para tras a carteira do cobrador busca o "ultimo contato" de
 * cada titulo. Sem limite, o historico importado do Cedrus (dezenas de
 * milhares de contatos desde 2025) faria a tela do cobrador carregar tudo.
 * Contato mais antigo que isso conta como "sem contato recente". */
export const ULTIMO_CONTATO_JANELA_DIAS = 180;

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
  claims_paid: "Cliente diz que já pagou",
  sale_cancel_reported: "Cliente informou venda cancelada",
  contact_no_result: "Contato sem resultado registrado",
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
    "claims_paid",
    "sale_cancel_reported",
  ]);

export const isEffectiveAttemptResult = (
  result: CollectionAttempt["result"],
): boolean => EFFECTIVE_ATTEMPT_RESULTS.has(result);

// Contatos importados do log do Cedrus (item 50) gravam a observacao como
// "Importado do Cedrus - log de contatos: NAO ATENDE (tentativa), duração
// 00:01:50 #1". Na tela isso vira "Cedrus: Não atendeu (1min50s)".
const CEDRUS_LOG_PREFIXO = "Importado do Cedrus - log de contatos:";
const CEDRUS_RESULTADO_LABEL: Record<string, string> = {
  "NAO ATENDE": "Não atendeu",
  CPC: "Falou com o cliente",
  "JA PAGOU": "Disse que já pagou",
  ACORDO: "Acordo",
  PROMESSA: "Promessa de pagamento",
  RETORNO: "Pediu retorno",
  "SEM CONTATO": "Sem contato",
  INDEVIDO: "Cobrança indevida",
  "NAO CONCORDA": "Não concorda com a cobrança",
  "FONE ERRADO": "Telefone errado",
  OCUPADO: "Ocupado",
};

/** Observacao de um atendimento pronta para exibir. Contato importado do
 * Cedrus vira um resumo curto; os demais ficam como foram escritos. */
export const notaContatoExibicao = (notes: string | null | undefined): string => {
  if (!notes) return "";
  if (!notes.startsWith(CEDRUS_LOG_PREFIXO)) return notes;
  const m = notes
    .slice(CEDRUS_LOG_PREFIXO.length)
    .match(/^\s*(.+?)\s*\([^)]*\),\s*dura[cç][aã]o\s*(\d+):(\d+):(\d+)/i);
  if (!m) return "Contato no Cedrus";
  const [, resultado, h, min, seg] = m;
  const rotulo = CEDRUS_RESULTADO_LABEL[resultado.trim()] ?? resultado.trim();
  const totalMin = Number(h) * 60 + Number(min);
  const duracao =
    totalMin > 0
      ? `${totalMin}min${Number(seg) > 0 ? `${Number(seg)}s` : ""}`
      : Number(seg) > 0
        ? `${Number(seg)}s`
        : "";
  return `Cedrus: ${rotulo}${duracao ? ` (${duracao})` : ""}`;
};

/** A mesma lista, para mandar ao banco (RPC ultimos_contatos_titulos). */
export const EFFECTIVE_ATTEMPT_RESULT_LIST: string[] = Array.from(
  EFFECTIVE_ATTEMPT_RESULTS,
);

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
