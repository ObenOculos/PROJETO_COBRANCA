// Configuracao declarativa do painel de filtros compartilhado (FilterPanel).
// Cada pagina informa seu CONTEXTO e o painel le daqui quais campos exibir e
// quais regras valem. As particularidades de cada tela ficam centralizadas
// nesta config (e nao espalhadas em ifs pelo componente).

export type FilterContext = "collections" | "assignment" | "collector";

/** Estado unificado dos filtros. Cada contexto usa um subconjunto. */
export interface FilterValues {
  search?: string;
  collector?: string;
  // Status de pagamento (Cobranca / Carteira) -> ver src/filters/clientStatus.
  paymentStatus?: string;
  dueFrom?: string;
  dueTo?: string;
  includeWithoutDue?: boolean;
  // Status de atribuicao (Atribuicao) -> "" | "with_collector" | "without_collector".
  assignment?: string;
  city?: string;
  neighborhood?: string;
  store?: string;
  situacao?: string;
  createdFrom?: string;
  createdTo?: string;
  // Faixa de atraso (Carteira do cobrador).
  aging?: string;
}

/** Quais campos o grid avancado exibe em cada contexto. */
export interface FilterFieldFlags {
  paymentStatus?: boolean;
  assignment?: boolean;
  city?: boolean;
  neighborhood?: boolean;
  store?: boolean;
  situacao?: boolean;
  dueRange?: boolean;
  createdRange?: boolean;
  aging?: boolean;
}

export const FILTER_FIELDS: Record<FilterContext, FilterFieldFlags> = {
  collections: {
    paymentStatus: true,
    city: true,
    neighborhood: true,
    store: true,
    dueRange: true,
  },
  assignment: {
    assignment: true,
    city: true,
    neighborhood: true,
    store: true,
    situacao: true,
    createdRange: true,
  },
  collector: {
    paymentStatus: true,
    city: true,
    aging: true,
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

/** Opcoes de status de pagamento (Cobranca / Carteira). */
export const PAYMENT_STATUS_OPTIONS: SelectOption[] = [
  { value: "pendente", label: "EM ATRASO" },
  { value: "parcial", label: "PARCIAL" },
  { value: "pago", label: "PAGO" },
  { value: "cancelado", label: "CANCELADO" },
];

/** Opcoes de faixa de atraso (Carteira do cobrador). */
export const AGING_OPTIONS: SelectOption[] = [
  { value: "low", label: "ATÉ 30 DIAS" },
  { value: "medium", label: "31-60 DIAS" },
  { value: "high", label: "61-90 DIAS" },
  { value: "critical", label: "+90 DIAS" },
];
