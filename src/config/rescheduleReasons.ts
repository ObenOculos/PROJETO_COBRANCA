import { ScheduledVisit } from "../types";

/**
 * Motivos pre-programados de reagendamento.
 *
 * Pre-programados, e nao texto livre, pelo mesmo motivo das observacoes de
 * conclusao (src/config/visitOutcomes): texto livre nao agrupa, nao filtra e
 * nao vira metrica. E o agrupamento por motivo que transforma "reagendado 4x"
 * em "reagendado 4x, 3 delas por ausencia" — de contagem para diagnostico.
 *
 * A `key` e o que fica gravado em scheduled_visits.reschedule_reason; o `label`
 * e so apresentacao e pode ser reescrito sem migrar dado.
 */
export interface RescheduleReason {
  key: string;
  label: string;
  /** Texto curto para chips/agrupamentos. */
  short: string;
}

export const RESCHEDULE_REASONS: readonly RescheduleReason[] = [
  { key: "ausente", label: "Cliente ausente", short: "Ausente" },
  {
    key: "pediu_outra_data",
    label: "Cliente pediu outra data",
    short: "Pediu outra data",
  },
  {
    key: "endereco_nao_localizado",
    label: "Endereço não localizado",
    short: "Endereço",
  },
  {
    key: "responsavel_ausente",
    label: "Responsável não estava presente",
    short: "Responsável ausente",
  },
  {
    key: "rota",
    label: "Problema na rota / agenda do cobrador",
    short: "Rota",
  },
  { key: "outro", label: "Outro motivo", short: "Outro" },
];

/** Chave usada quando a remarcacao e anterior a captura de motivo. */
export const REASON_NAO_INFORMADO = "nao_informado";

export const rescheduleReasonLabel = (key?: string | null): string => {
  if (!key) return "Motivo não informado";
  if (key === REASON_NAO_INFORMADO) return "Motivo não informado";
  return RESCHEDULE_REASONS.find((r) => r.key === key)?.label ?? key;
};

export const rescheduleReasonShort = (key?: string | null): string => {
  if (!key || key === REASON_NAO_INFORMADO) return "Não informado";
  return RESCHEDULE_REASONS.find((r) => r.key === key)?.short ?? key;
};

/**
 * Quantas vezes ESTA cobranca ja foi remarcada antes de chegar nesta visita.
 *
 * Percorre a cadeia para tras por rescheduledFromId. E o numero correto para
 * "este cliente e dificil": distingue uma cobranca empurrada 5x seguidas
 * (problema real) de 5 cobrancas diferentes empurradas 1x cada (rotina) —
 * distincao que contar registros por cliente nao faz.
 *
 * O limite de passos protege contra cadeia circular por dado corrompido.
 */
export const countPriorReschedules = (
  visit: ScheduledVisit,
  allVisits: ScheduledVisit[],
): number =>
  chainFromIndex(visit, new Map(allVisits.map((v) => [v.id, v]))).length;

/** Um elo da cadeia de reagendamentos, do mais antigo para o mais recente. */
export interface RescheduleChainStep {
  visitId: string;
  /** Data em que a visita estava marcada quando foi empurrada. */
  date: string;
  reasonKey: string;
  reasonLabel: string;
}

/**
 * Nucleo da reconstrucao da cadeia, sobre um indice JA montado.
 *
 * Recebe o indice em vez de monta-lo: `clientesReincidentes` chama isto uma vez
 * por ponta de cadeia, e remontar o Map a cada chamada tornava o calculo
 * quadratico no numero de visitas.
 */
const chainFromIndex = (
  visit: ScheduledVisit,
  byId: Map<string, ScheduledVisit>,
  /** YYYY-MM-DD: para a caminhada ao cruzar um ciclo ja encerrado. */
  resetAt?: string,
): RescheduleChainStep[] => {
  const steps: RescheduleChainStep[] = [];
  let current: ScheduledVisit | undefined = visit;
  const seen = new Set<string>([visit.id]);

  while (current?.rescheduledFromId) {
    const previous: ScheduledVisit | undefined = byId.get(
      current.rescheduledFromId,
    );
    if (!previous || seen.has(previous.id)) break;
    // Elo do ciclo anterior: a sequencia atual termina aqui.
    if (resetAt && previous.scheduledDate <= resetAt) break;
    seen.add(previous.id);
    steps.push({
      visitId: previous.id,
      date: previous.scheduledDate,
      reasonKey: previous.rescheduleReason || REASON_NAO_INFORMADO,
      reasonLabel: rescheduleReasonLabel(previous.rescheduleReason),
    });
    current = previous;
  }

  return steps.reverse();
};

/** Cliente com reagendamentos relevantes, para a aba Reincidentes. */
export interface ClienteReincidente {
  document: string;
  name: string;
  collectorId: string;
  /**
   * Total de remarcacoes do cliente no conjunto. Metrica PRINCIPAL: funciona em
   * todo o historico, inclusive nos registros antigos sem vinculo de cadeia.
   */
  totalRemarcacoes: number;
  /**
   * Maior cadeia = quantas vezes a MESMA cobranca foi empurrada em sequencia.
   * Mais precisa, porem so calculavel onde rescheduled_from_id foi gravado;
   * vale 0 no historico anterior a esses campos. Sempre <= totalRemarcacoes.
   */
  maiorCadeia: number;
  /** Todas as remarcacoes do cliente, da mais antiga para a mais recente. */
  elos: RescheduleChainStep[];
  /** Contagem por motivo, do mais frequente para o menos. */
  motivos: { key: string; label: string; count: number }[];
}

/**
 * Agrupa as visitas por cliente e devolve os reincidentes, do mais remarcado
 * para o menos.
 *
 * Criterio: TOTAL de remarcacoes >= `minRemarcacoes`, e nao o comprimento da
 * cadeia. A cadeia e a medida mais precisa, mas 75% do historico desta base foi
 * gravado antes de rescheduled_from_id existir — filtrar por cadeia esconderia
 * justamente os clientes com mais remarcacoes acumuladas. A cadeia continua
 * exposta em `maiorCadeia` para quem quiser o dado preciso.
 *
 * `visits` deve vir JA filtrado (periodo/cobrador/etc.) pela tela chamadora —
 * assim a aba respeita exatamente os mesmos filtros do resto do Acompanhamento.
 */
export const clientesReincidentes = (
  visits: ScheduledVisit[],
  minRemarcacoes: number,
  /**
   * documento -> data em que o cliente zerou o saldo (clientes.reincidencia_reset_at).
   * Remarcacoes anteriores a ela pertencem a um ciclo de inadimplencia ja
   * encerrado e nao contam: quem quitou tudo comeca de ficha limpa se voltar a
   * dever. Ausente = nunca zerou, conta o historico todo.
   */
  ciclosResetados?: Map<string, string>,
): ClienteReincidente[] => {
  // Indice montado UMA vez e reusado por todas as pontas de cadeia.
  const byId = new Map(visits.map((v) => [v.id, v]));

  const porCliente = new Map<string, ScheduledVisit[]>();
  visits.forEach((v) => {
    if (!v.clientDocument) return;
    const lista = porCliente.get(v.clientDocument) ?? [];
    lista.push(v);
    porCliente.set(v.clientDocument, lista);
  });

  const resultado: ClienteReincidente[] = [];

  porCliente.forEach((doVisitas, document) => {
    // Toda visita que ficou como "reagendada" e uma remarcacao — independente
    // de ter vinculo de cadeia. E esta a base do criterio.
    //
    // Corta o que ficou para tras do ultimo ciclo encerrado. Comparacao por
    // string YYYY-MM-DD: scheduledDate ja e data pura e o reset e recortado
    // antes do "T", o que evita converter fuso de um lado so.
    const resetAt = ciclosResetados?.get(document)?.slice(0, 10);
    const remarcadas = doVisitas.filter(
      (v) =>
        v.status === "reagendada" && (!resetAt || v.scheduledDate > resetAt),
    );
    if (remarcadas.length < minRemarcacoes) return;

    const elos: RescheduleChainStep[] = remarcadas
      .map((v) => ({
        visitId: v.id,
        date: v.scheduledDate,
        reasonKey: v.rescheduleReason || REASON_NAO_INFORMADO,
        reasonLabel: rescheduleReasonLabel(v.rescheduleReason),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Cadeia mais longa (quando ha vinculo): quantas vezes a MESMA cobranca foi
    // empurrada em sequencia. Vale 0 no historico sem rescheduled_from_id.
    const pontas = doVisitas.filter((v) => !v.rescheduledToId);
    const candidatas = pontas.length > 0 ? pontas : doVisitas;
    let maiorCadeia = 0;
    let visitaRef = candidatas[0];
    candidatas.forEach((v) => {
      const tamanho = chainFromIndex(v, byId, resetAt).length;
      if (tamanho > maiorCadeia) {
        maiorCadeia = tamanho;
        visitaRef = v;
      }
    });

    const contagem = new Map<string, number>();
    elos.forEach((step) => {
      contagem.set(step.reasonKey, (contagem.get(step.reasonKey) ?? 0) + 1);
    });

    resultado.push({
      document,
      name: visitaRef?.clientName || remarcadas[0]?.clientName || document,
      collectorId: visitaRef?.collectorId || remarcadas[0]?.collectorId || "",
      totalRemarcacoes: remarcadas.length,
      maiorCadeia,
      elos,
      motivos: Array.from(contagem.entries())
        .map(([key, count]) => ({
          key,
          label: rescheduleReasonShort(key),
          count,
        }))
        .sort((a, b) => b.count - a.count),
    });
  });

  // Ordena pelo TOTAL: e a medida disponivel em todo o historico. Ordenar pela
  // cadeia jogaria para o fim os clientes com mais remarcacoes acumuladas so
  // porque os registros deles sao antigos e nao tem vinculo.
  return resultado.sort(
    (a, b) =>
      b.totalRemarcacoes - a.totalRemarcacoes || b.maiorCadeia - a.maiorCadeia,
  );
};
