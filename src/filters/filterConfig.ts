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
    city: true,
    neighborhood: true,
    store: true,
    situacao: true,
    createdRange: true,
  },
};

export interface SelectOption {
  value: string;
  label: string;
}

/** Opcoes de situacao (Atribuicao). Centralizadas para nao repetir no JSX. */
export const SITUACAO_OPTIONS: SelectOption[] = [
  { value: "Em mãos", label: "EM MÃOS" },
  { value: "Em tratamento", label: "EM TRATAMENTO" },
  { value: "Aguardando Interno", label: "AGUARDANDO INTERNO" },
  { value: "Cobrança Interna", label: "COBRANÇA INTERNA" },
  { value: "Aguardando Terceirizado", label: "AGUARDANDO TERCEIRIZADO" },
  { value: "Cobrança Terceirizada", label: "COBRANÇA TERCEIRIZADA" },
  { value: "empty", label: "VAZIO" },
];

/** Opcoes de status de pagamento (Cobranca). */
export const PAYMENT_STATUS_OPTIONS: SelectOption[] = [
  { value: "pendente", label: "EM ATRASO" },
  { value: "parcial", label: "PARCIAL" },
  { value: "pago", label: "PAGO" },
  { value: "cancelado", label: "CANCELADO" },
];
