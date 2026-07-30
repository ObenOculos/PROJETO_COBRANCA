import { ScheduledVisit } from "../types";

/**
 * Rotulos dos status de visita. Fonte unica — o Acompanhamento e a Atribuicao
 * liam mapas proprios, e o do Acompanhamento ja estava incompleto
 * (sem "cancelamento_solicitado" e "pending_sync", que apareciam crus na tela).
 */
export const VISIT_STATUS_LABELS: Record<ScheduledVisit["status"], string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  nao_encontrado: "Não Encontrado",
  reagendada: "Reagendada",
  cancelamento_solicitado: "Cancelamento Solicitado",
  pending_sync: "Aguardando Sincronização",
};

/**
 * Status oferecidos nos filtros. Exclui "pending_sync", que e estado interno da
 * fila offline e nao um desfecho que o gestor filtraria.
 */
export const VISIT_STATUS_OPTIONS: { value: string; label: string }[] = (
  [
    "agendada",
    "realizada",
    "reagendada",
    "nao_encontrado",
    "cancelamento_solicitado",
    "cancelada",
  ] as ScheduledVisit["status"][]
).map((s) => ({ value: s, label: VISIT_STATUS_LABELS[s] }));

/** Rotulo de um status (para chips de filtro ativo). */
export const visitStatusLabel = (status: string): string =>
  VISIT_STATUS_LABELS[status as ScheduledVisit["status"]] ?? status;

/**
 * Data que posiciona a visita no tempo: a data em que foi realizada ou, se
 * ainda nao foi, a data para a qual esta marcada. Cai para os timestamps do
 * registro quando nenhuma das duas existe.
 */
const visitTime = (visit: ScheduledVisit): number => {
  const raw =
    visit.dataVisitaRealizada ||
    visit.scheduledDate ||
    visit.updatedAt ||
    visit.createdAt;
  return raw ? new Date(raw).getTime() : 0;
};

/**
 * Mapeia documento -> status da ULTIMA visita do cliente.
 *
 * "Ultima" pela data da visita (ver visitTime), nao pela ordem de cadastro.
 * Cada cliente cai em um unico status, espelhando a regra de
 * lastVisitOutcomeByClient (src/config/visitOutcomes).
 *
 * Atencao: uma visita AGENDADA para o futuro e mais recente que uma realizada
 * ontem, entao o cliente aparece como "Agendada". E o comportamento esperado de
 * "status da ultima visita"; para separar as duas coisas seria preciso um
 * filtro proprio de "tem agendamento".
 */
export const lastVisitStatusByClient = (
  visits: ScheduledVisit[],
): Map<string, string> => {
  const latest = new Map<string, { status: string; time: number }>();

  visits.forEach((v) => {
    if (!v.clientDocument || !v.status) return;
    const time = visitTime(v);
    const current = latest.get(v.clientDocument);
    if (!current || time > current.time) {
      latest.set(v.clientDocument, { status: v.status, time });
    }
  });

  const result = new Map<string, string>();
  latest.forEach((value, doc) => result.set(doc, value.status));
  return result;
};
