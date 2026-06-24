// Configuracao declarativa do painel de filtros compartilhado (FilterPanel).
// Cada pagina informa seu CONTEXTO e o painel le daqui quais campos exibir e
// quais regras valem. As particularidades de cada tela ficam centralizadas
// nesta config (e nao espalhadas em ifs pelo componente).

export type FilterContext =
  | "collections" // Cobranca (gerente)
  | "collectionsCollector" // Cobranca (cobrador)
  | "assignment"; // Atribuicao de cobradores

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
};

export interface SelectOption {
  value: string;
  label: string;
}

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
    label: "Pendente",
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
 * Converte um atalho de atraso (dias) na data-limite de vencimento (YYYY-MM-DD,
 * local). Ex.: "30" -> hoje menos 30 dias. E a unica fonte: o pill so escreve no
 * campo de vencimento (dueTo), nao em um filtro separado.
 */
export const agingToDueTo = (threshold: string): string => {
  const days = parseInt(threshold, 10);
  if (!days) return "";
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Deriva qual atalho de atraso corresponde ao intervalo de vencimento atual.
 * So casa quando ha apenas "ate" (dueTo) igual a hoje menos o limite e sem "de"
 * (dueFrom). Mantem pills e filtro detalhado sincronizados.
 */
export const dueToAging = (
  dueFrom: string | undefined,
  dueTo: string | undefined,
): string => {
  if (dueFrom || !dueTo) return "";
  const match = AGING_PILLS.find((p) => agingToDueTo(p.value) === dueTo);
  return match ? match.value : "";
};

/** Atalhos rapidos de faixa de atraso (atraso minimo, em dias). */
export const AGING_PILLS: { value: string; label: string; active: string }[] = [
  {
    value: "30",
    label: "+30 dias",
    active: "bg-yellow-500 border-yellow-500 text-white shadow-sm",
  },
  {
    value: "60",
    label: "+60 dias",
    active: "bg-amber-600 border-amber-600 text-white shadow-sm",
  },
  {
    value: "90",
    label: "+90 dias",
    active: "bg-orange-600 border-orange-600 text-white shadow-sm",
  },
  {
    value: "120",
    label: "+120 dias",
    active: "bg-red-700 border-red-700 text-white shadow-sm",
  },
];
