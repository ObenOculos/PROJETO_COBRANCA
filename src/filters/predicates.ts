// Predicados puros de filtragem de cliente. Substituem a logica inline que
// existia no useMemo do ClientAssignment, para que a mesma regra possa ser
// reutilizada por outras telas (atribuicao, carteira) sem duplicacao.
//
// Operam no nivel do CLIENTE (cliente ja agrupado com suas collections), nao no
// nivel do titulo. O comportamento reproduz exatamente o que o ClientAssignment
// fazia antes desta extracao.
import { Collection } from "../types";
import { parseAndNormalizeDate, toYYYYMMDD } from "./dates";
import { getClientPaymentStatus, normalizePaymentStatus } from "./clientStatus";

/** Forma minima de cliente que os predicados precisam para filtrar. */
export interface FilterableClient {
  cliente?: string | null;
  documento: string;
  apelido?: string | null;
  collectorId?: string;
  cidade?: string | null;
  bairro?: string | null;
  collections: Collection[];
}

/** Status de atribuicao (diferente do status de pagamento — ver clientStatus). */
export type AssignmentFilter = "" | "with_collector" | "without_collector";

/** Modelo de filtros aplicaveis a clientes (aba Atribuicao/Clientes). */
export interface ClientFilters {
  search?: string;
  collector?: string;
  assignment?: AssignmentFilter;
  city?: string;
  neighborhood?: string;
  store?: string;
  /** Valor de situacao, ou a marca especial "empty" para sem situacao. */
  situacao?: string;
  /**
   * Status de pagamento agregado do cliente (pago | parcial | pendente | cancelado).
   * Aceita um valor unico ou uma lista (multi-select): casa se o status do
   * cliente bater com QUALQUER um dos selecionados.
   */
  paymentStatus?: string | string[];
  /** Intervalo de data de vencimento das parcelas. */
  dueFrom?: string;
  dueTo?: string;
  /** Inclui clientes sem nenhuma data de vencimento valida quando ha filtro de data. */
  includeWithoutDue?: boolean;
  /** Intervalo de data de lancamento (data_lancamento). */
  launchFrom?: string;
  launchTo?: string;
  /** Faixa do valor pendente total do cliente. */
  minAmount?: number;
  maxAmount?: number;
  /** Intervalo sobre clientes.created_at (mapa passado a parte). */
  createdFrom?: string;
  createdTo?: string;
}

const matchesPaymentStatus = (
  client: FilterableClient,
  paymentStatus?: string | string[],
): boolean => {
  const list = (
    Array.isArray(paymentStatus) ? paymentStatus : paymentStatus ? [paymentStatus] : []
  ).filter(Boolean);
  if (list.length === 0) return true;

  const status = getClientPaymentStatus(client.collections);
  // Multi-select: basta casar com QUALQUER status selecionado.
  return list.some((p) => {
    // A base de clientes da Atribuicao e a ativa (sem cancelados), entao nenhum
    // cliente classifica como "cancelado" aqui.
    if (p.trim().toLowerCase() === "cancelado") return false;
    return status === normalizePaymentStatus(p);
  });
};

const matchesLaunchRange = (
  client: FilterableClient,
  filters: ClientFilters,
): boolean => {
  if (!filters.launchFrom && !filters.launchTo) return true;
  return client.collections.some((c) => {
    const launch = toYYYYMMDD(c.data_lancamento);
    if (!launch) return false;
    if (filters.launchFrom && launch < filters.launchFrom) return false;
    if (filters.launchTo && launch > filters.launchTo) return false;
    return true;
  });
};

const matchesAmount = (
  client: FilterableClient,
  filters: ClientFilters,
): boolean => {
  const hasMin = filters.minAmount != null && filters.minAmount > 0;
  const hasMax = filters.maxAmount != null && filters.maxAmount > 0;
  if (!hasMin && !hasMax) return true;

  const totalValue = client.collections.reduce(
    (sum, c) => sum + (c.valor_original || 0),
    0,
  );
  const totalReceived = client.collections.reduce(
    (sum, c) => sum + (c.valor_recebido || 0),
    0,
  );
  const pending = Math.max(0, totalValue - totalReceived);

  if (hasMin && pending < (filters.minAmount as number)) return false;
  if (hasMax && pending > (filters.maxAmount as number)) return false;
  return true;
};

const matchesSearch = (client: FilterableClient, search?: string): boolean => {
  const term = (search ?? "").toLowerCase();
  if (!term) return true;
  return Boolean(
    client.cliente?.toLowerCase().includes(term) ||
      client.documento?.includes(search ?? "") ||
      client.apelido?.toLowerCase().includes(term),
  );
};

const matchesAssignment = (
  client: FilterableClient,
  assignment?: AssignmentFilter,
): boolean => {
  if (!assignment) return true;
  if (assignment === "with_collector") return Boolean(client.collectorId);
  return !client.collectorId;
};

const matchesSituacao = (
  client: FilterableClient,
  situacao?: string,
): boolean => {
  if (!situacao) return true;
  return client.collections.some((c) => {
    if (situacao === "empty") return !c.situacao || c.situacao.trim() === "";
    return c.situacao === situacao;
  });
};

const matchesDueRange = (
  client: FilterableClient,
  filters: ClientFilters,
): boolean => {
  if (!filters.dueFrom && !filters.dueTo) return true;

  const fromDate = filters.dueFrom
    ? parseAndNormalizeDate(filters.dueFrom)
    : null;
  const toDate = filters.dueTo ? parseAndNormalizeDate(filters.dueTo) : null;

  // Datas de filtro invalidas -> nao restringe (inclui todos).
  if ((filters.dueFrom && !fromDate) || (filters.dueTo && !toDate)) return true;

  let hasValidDate = false;
  let hasDateInRange = false;

  for (const collection of client.collections) {
    const dueDate = parseAndNormalizeDate(collection.data_vencimento);
    if (!dueDate) continue;

    hasValidDate = true;
    let inRange = true;
    if (fromDate) inRange = inRange && dueDate >= fromDate;
    if (toDate) inRange = inRange && dueDate <= toDate;
    if (inRange) {
      hasDateInRange = true;
      break;
    }
  }

  if (hasDateInRange) return true;
  if (!hasValidDate && filters.includeWithoutDue) return true;
  return false;
};

const matchesCreatedRange = (
  client: FilterableClient,
  filters: ClientFilters,
  createdAt?: Map<string, Date>,
): boolean => {
  if (!filters.createdFrom && !filters.createdTo) return true;

  const created = createdAt?.get(client.documento);
  if (!created) return false;

  if (filters.createdFrom) {
    const fromDate = parseAndNormalizeDate(filters.createdFrom);
    if (fromDate && created < fromDate) return false;
  }
  if (filters.createdTo) {
    const toDate = parseAndNormalizeDate(filters.createdTo);
    if (toDate) {
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (created > endOfDay) return false;
    }
  }
  return true;
};

/**
 * Aplica todos os filtros de cliente. `createdAt` mapeia documento -> data de
 * criacao (clientes.created_at), necessario apenas para o filtro "Criado em".
 */
export const clientMatchesFilters = (
  client: FilterableClient,
  filters: ClientFilters,
  createdAt?: Map<string, Date>,
): boolean => {
  return (
    matchesSearch(client, filters.search) &&
    (!filters.collector || client.collectorId === filters.collector) &&
    matchesAssignment(client, filters.assignment) &&
    (!filters.city || client.cidade === filters.city) &&
    (!filters.neighborhood || client.bairro === filters.neighborhood) &&
    (!filters.store ||
      client.collections.some((c) => c.nome_da_loja === filters.store)) &&
    matchesSituacao(client, filters.situacao) &&
    matchesPaymentStatus(client, filters.paymentStatus) &&
    matchesDueRange(client, filters) &&
    matchesLaunchRange(client, filters) &&
    matchesAmount(client, filters) &&
    matchesCreatedRange(client, filters, createdAt)
  );
};
