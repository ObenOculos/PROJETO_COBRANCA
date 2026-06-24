// Configuracao declarativa do painel de filtros compartilhado (FilterPanel).
// Cada pagina informa seu CONTEXTO e o painel le daqui quais campos exibir e
// quais regras valem. As particularidades de cada tela ficam centralizadas
// nesta config (e nao espalhadas em ifs pelo componente).

export type FilterContext =
  | "collections" // Cobranca (gerente)
  | "collectionsCollector" // Cobranca (cobrador)
  | "assignment" // Atribuicao de cobradores
  | "performance" // Ranking de Performance (agregada + periodo)
  | "stores"; // Acompanhamento de Lojas (agregada + cobrador)

/** Estado unificado dos filtros. Cada contexto usa um subconjunto. */
export interface FilterValues {
  search?: string;
  collector?: string;
  // Status de pagamento (Cobranca) -> ver src/filters/clientStatus.
  paymentStatus?: string;
  dueFrom?: string;
  dueTo?: string;
  launchFrom?: string;
  launchTo?: string;
  minAmount?: number;
  maxAmount?: number;
  visitsOnly?: boolean;
  includeWithoutDue?: boolean;
  // Faixa de atraso minima (dias) -> "30" | "60" | "90" | "120".
  aging?: string;
  // Status de atribuicao (Atribuicao) -> "" | "with_collector" | "without_collector".
  assignment?: string;
  city?: string;
  neighborhood?: string;
  store?: string;
  situacao?: string;
  createdFrom?: string;
  createdTo?: string;
  // Periodo (analise por mes/ano). Vazio/ausente = todos. Meses 0-11.
  months?: number[];
  years?: number[];
}

/** Quais campos o grid avancado exibe em cada contexto. */
export interface FilterFieldFlags {
  paymentStatus?: boolean;
  assignment?: boolean;
  collector?: boolean;
  city?: boolean;
  neighborhood?: boolean;
  store?: boolean;
  situacao?: boolean;
  dueRange?: boolean;
  launchRange?: boolean;
  amount?: boolean;
  visits?: boolean;
  createdRange?: boolean;
  period?: boolean;
}

export const FILTER_FIELDS: Record<FilterContext, FilterFieldFlags> = {
  collections: {
    paymentStatus: true,
    dueRange: true,
    launchRange: true,
    amount: true,
    store: true,
    collector: true,
  },
  collectionsCollector: {
    paymentStatus: true,
    dueRange: true,
    launchRange: true,
    amount: true,
    store: true,
    city: true,
    neighborhood: true,
    visits: true,
  },
  assignment: {
    assignment: true,
    paymentStatus: true,
    city: true,
    neighborhood: true,
    store: true,
    situacao: true,
    dueRange: true,
    launchRange: true,
    amount: true,
    createdRange: true,
  },
  // Ranking de Performance: foco em comparacao de desempenho. So filtros que
  // recortam de forma consistente (Periodo recorta todas as medidas pela mesma
  // janela; Cidade e um escopo que mantem a comparacao valida). Sem status de
  // pagamento / faixa de atraso / vencimento / lancamento / valor: recortam a
  // carteira pelo estado da divida e distorcem recebido x meta.
  performance: {
    city: true,
    period: true,
  },
  // Lojas: igual + cobrador (a dimensao da tela e a loja).
  stores: {
    paymentStatus: true,
    city: true,
    collector: true,
    dueRange: true,
    launchRange: true,
    amount: true,
  },
};

export interface SelectOption {
  value: string;
  label: string;
}

/** Rotulos curtos de mes (0-11) para o campo de Periodo. */
export const MONTHS_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** Anos selecionaveis no filtro de periodo (atual -2 .. atual +2). */
export const periodYears = (): number[] => {
  const y = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => y - 2 + i);
};

/** Rotulo do periodo selecionado (para chips). */
export const periodLabel = (months?: number[], years?: number[]): string => {
  const parts: string[] = [];
  if (months?.length) {
    parts.push(
      months.length <= 2
        ? months.map((m) => MONTHS_SHORT[m] ?? m).join(", ")
        : `${months.length} meses`,
    );
  }
  if (years?.length) {
    parts.push(years.length <= 2 ? years.join(", ") : `${years.length} anos`);
  }
  return parts.join(" · ");
};

/** Opcoes de situacao (Atribuicao). Centralizadas para nao repetir no JSX. */
export const SITUACAO_OPTIONS: SelectOption[] = [
  { value: "Em mãos", label: "Em mãos" },
  { value: "Em tratamento", label: "Em tratamento" },
  { value: "Aguardando Interno", label: "Aguardando interno" },
  { value: "Cobrança Interna", label: "Cobrança interna" },
  { value: "Aguardando Terceirizado", label: "Aguardando terceirizado" },
  { value: "Cobrança Terceirizada", label: "Cobrança terceirizada" },
  { value: "empty", label: "Sem situação" },
];

/** Opcoes de status de pagamento (Cobranca). */
export const PAYMENT_STATUS_OPTIONS: SelectOption[] = [
  { value: "pendente", label: "Em atraso" },
  { value: "parcial", label: "Parcial" },
  { value: "pago", label: "Pago" },
  { value: "cancelado", label: "Cancelado" },
];

/** Atalhos rapidos (pills) de status de pagamento, com a cor do estado ativo. */
export const PAYMENT_STATUS_PILLS: {
  value: string;
  label: string;
  active: string;
}[] = [
  {
    value: "pendente",
    label: "Em atraso",
    active: "bg-red-600 border-red-600 text-white shadow-sm",
  },
  {
    value: "pago",
    label: "Pago",
    active: "bg-green-600 border-green-600 text-white shadow-sm",
  },
  {
    value: "parcial",
    label: "Parcial",
    active: "bg-orange-500 border-orange-500 text-white shadow-sm",
  },
  {
    value: "cancelado",
    label: "Cancelado",
    active: "bg-gray-700 border-gray-700 text-white shadow-sm",
  },
];

/**
 * Faixas de atraso (em dias), por parcela. Cada faixa vira um intervalo de
 * vencimento (de/ate), entao os pills permanecem sincronizados com o filtro
 * detalhado de Vencimento. `maxDays: null` = sem teto (121+).
 */
export interface AgingBand {
  value: string;
  label: string;
  active: string;
  minDays: number;
  maxDays: number | null;
}

export const AGING_PILLS: AgingBand[] = [
  {
    value: "0-30",
    label: "0–30 dias",
    minDays: 0,
    maxDays: 30,
    active: "bg-yellow-400 border-yellow-400 text-white shadow-sm",
  },
  {
    value: "31-60",
    label: "31–60 dias",
    minDays: 31,
    maxDays: 60,
    active: "bg-amber-500 border-amber-500 text-white shadow-sm",
  },
  {
    value: "61-90",
    label: "61–90 dias",
    minDays: 61,
    maxDays: 90,
    active: "bg-orange-500 border-orange-500 text-white shadow-sm",
  },
  {
    value: "91-120",
    label: "91–120 dias",
    minDays: 91,
    maxDays: 120,
    active: "bg-orange-600 border-orange-600 text-white shadow-sm",
  },
  {
    value: "121",
    label: "121+ dias",
    minDays: 121,
    maxDays: null,
    active: "bg-red-700 border-red-700 text-white shadow-sm",
  },
];

/** Data (YYYY-MM-DD local) de hoje menos N dias. */
const dateDaysAgo = (days: number): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Converte uma faixa de atraso no intervalo de vencimento (de/ate).
 * Atraso em [min, max] dias <=> vencimento em [hoje-max, hoje-min].
 * Faixa sem teto (121+) nao tem "de".
 */
export const agingToDueRange = (
  bandValue: string,
): { dueFrom: string; dueTo: string } => {
  const band = AGING_PILLS.find((b) => b.value === bandValue);
  if (!band) return { dueFrom: "", dueTo: "" };
  return {
    dueFrom: band.maxDays != null ? dateDaysAgo(band.maxDays) : "",
    dueTo: dateDaysAgo(band.minDays),
  };
};

/**
 * Deriva qual faixa de atraso corresponde ao intervalo de vencimento atual.
 * Mantem os pills e o filtro detalhado de Vencimento sincronizados.
 */
export const dueToAging = (
  dueFrom: string | undefined,
  dueTo: string | undefined,
): string => {
  if (!dueTo) return "";
  const match = AGING_PILLS.find((b) => {
    const range = agingToDueRange(b.value);
    return range.dueFrom === (dueFrom || "") && range.dueTo === dueTo;
  });
  return match ? match.value : "";
};

/** Rotulo amigavel de uma faixa de atraso (para chips). */
export const agingLabel = (bandValue: string): string =>
  AGING_PILLS.find((b) => b.value === bandValue)?.label ?? "";
