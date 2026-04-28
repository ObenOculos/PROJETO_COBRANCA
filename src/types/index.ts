// User types
export type UserType = "manager" | "collector" | "internal_collector";

export interface User {
  id: string;
  name: string;
  login: string;
  password: string;
  type: UserType;
  createdAt: string;
}

// Monthly Goal types
export interface MonthlyGoal {
  id: string;
  user_id: string;
  month: string; // YYYY-MM-DD
  visits_goal: number;
  payments_goal: number;
  created_at: string;
  updated_at: string;
}

// Authorization history types
export interface AuthorizationHistory {
  id: string;
  token: string;
  collector_id: string;
  collector_name: string;
  client_name: string;
  client_document: string;
  requested_at: string;
  expires_at: string;
  status: "pending" | "approved" | "rejected" | "expired";
  processed_at?: string;
  processed_by_id?: string;
  processed_by_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  client_address?: string;
  client_city?: string;
  client_mobile?: string;
  client_neighborhood?: string;
  client_phone?: string;
  collector_performance_score?: number;
  last_payment_amount?: number;
  last_payment_date?: string;
  metadata?: any;
  overdue_installments_count?: number;
  total_pending_value?: number;
  total_received_value?: number;
  total_sales_count?: number;
  total_sales_value?: number;
  type: string;
}

// Scheduled visits for collectors
export interface ScheduledVisit {
  id: string;
  collectorId: string;
  clientDocument: string;
  clientName: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM
  status:
    | "agendada"
    | "realizada"
    | "cancelada"
    | "nao_encontrado"
    | "cancelamento_solicitado"
    | "pending_sync"
    | "reagendada";
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  dataVisitaRealizada?: string; // Data em que a visita foi efetivamente realizada (YYYY-MM-DD)
  // Dados do cliente para facilitar exibição
  clientAddress?: string;
  clientNumber?: string;
  clientNeighborhood?: string;
  clientCity?: string;
  totalPendingValue?: number;
  overdueCount?: number;
  // Campos para controle de cancelamento
  cancellationRequestDate?: string;
  cancellationRequestReason?: string;
  cancellationApprovedBy?: string;
  cancellationApprovedAt?: string;
  cancellationRejectedBy?: string;
  cancellationRejectedAt?: string;
  cancellationRejectionReason?: string;
  rescheduleCount?: number;
  scheduled_by_manager_id?: string; // Added for manager scheduling
  rescheduledTo?: string; // Data para onde foi reagendada (YYYY-MM-DD)
}

export interface AllowedVisitDate {
  allowed_date: number; // Day of month (1-31)
  city: string;
  collector_id?: string | null; // ID do cobrador associado
  created_at: string | null;
  id: string;
  updated_at: string | null;
}

// Collection types based on BANCO_DADOS table
export interface Collection {
  id_parcela: number;
  nome_da_loja: string | null;
  data_lancamento: string | null;
  data_vencimento: string | null;
  valor_original: number;
  valor_reajustado: number;
  multa: number;
  juros_por_dia: number;
  multa_aplicada: number;
  juros_aplicado: number;
  valor_recebido: number;
  data_de_recebimento: string | null;
  dias_em_atraso: number | null;
  dias_carencia: number;
  desconto: number;
  acrescimo: number;
  multa_paga: number;
  juros_pago: number;
  tipo_de_cobranca: string | null;
  numero_titulo: number | null;
  parcela: number | null;
  status: string | null;
  cliente: string | null;
  documento: string | null;
  apelido: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  cep: string | null;
  cidade: string | null;
  estado: string | null;
  obs: string | null;
  codigo_externo: string | null;
  descricao: string | null;
  venda_n: number | null;
  convenio: string | null;
  telefone: string | null;
  celular: string | null;
  celular1: string | null;
  celular2: string | null;
  email: string | null;
  user_id: string | null;
  situacao: string | null;
  // Visit tracking properties
  data_visita_agendada: string | null;
  data_visita_realizada: string | null;
  data_recebimento: string | null;
  updated_at: string | null;
}

export interface CollectionAttempt {
  id: string;
  date: string;
  type: "call" | "visit" | "email" | "whatsapp";
  result:
    | "no_answer"
    | "busy"
    | "not_found"
    | "promise"
    | "refusal"
    | "partial_payment"
    | "full_payment";
  notes?: string;
  nextAction?: string;
  nextActionDate?: string;
}

// Client grouping interface
export interface ClientGroup {
  clientId: string;
  client: string;
  document: string;
  apelido?: string;
  phone?: string;
  mobile?: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  complemento?: string;
  cep?: string;
  state: string;
  sales: SaleGroup[];
  totalValue: number;
  totalReceived: number;
  totalDiscount?: number;
  pendingValue: number;
}

export interface SaleGroup {
  saleNumber: number;
  titleNumber: number;
  description: string;
  installments: Collection[];
  totalValue: number;
  totalReceived: number;
  totalDiscount?: number;
  pendingValue: number;
  saleStatus: "pending" | "partially_paid" | "fully_paid";
  payments: SalePayment[];
  clientDocument: string;
}

// Dashboard types
export interface DashboardStats {
  totalPending: number;
  totalOverdue: number;
  totalReceived: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  conversionRate: number;
  collectorsCount: number;
}

export interface CollectorPerformance {
  collectorId: string;
  collectorName: string;
  totalAssigned: number;
  totalReceived: number;
  totalAmount: number;
  receivedAmount: number;
  conversionRate: number;
  averageTime: number;
  clientCount: number;
}

// Auth context types
export interface AuthContextType {
  user: User | null;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

// Collection context types
export interface CollectionContextType {
  collections: Collection[];
  users: User[];
  salePayments: SalePayment[];
  scheduledVisits: ScheduledVisit[];
  monthlyGoals: MonthlyGoal[]; // Added
  allowedVisitDates: AllowedVisitDate[];
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  fetchCollections: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchSalePayments: () => Promise<void>;
  fetchAllowedVisitDates: () => Promise<void>;
  refreshData: () => Promise<void>;
  refreshCollections: () => Promise<void>;
  updateCollection: (id: number, updates: Partial<Collection>) => Promise<void>;
  assignCollectorToClients: (
    collectorId: string,
    clientIdentifiers: { document?: string; clientName?: string }[],
  ) => Promise<void>;
  removeCollectorFromClients: (
    clientIdentifiers: { document?: string; clientName?: string }[],
  ) => Promise<void>;
  addAttempt: (
    collectionId: number,
    attempt: Omit<CollectionAttempt, "id">,
  ) => Promise<void>;
  addUser: (user: Omit<User, "id" | "createdAt">) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  setMonthlyGoal: (
    goal: Omit<MonthlyGoal, "id" | "created_at" | "updated_at">,
  ) => Promise<any>; // Added
  getDashboardStats: () => DashboardStats;
  getCollectorPerformance: () => CollectorPerformance[];
  getCollectorCollections: (collectorId: string) => Collection[];
  getClientGroups: (collectorId?: string) => ClientGroup[];
  getFilteredCollections: (
    filters: FilterOptions,
    userType: UserType,
    collectorId?: string,
  ) => Collection[];
  getAvailableStores: () => string[];
  // Sale payment methods
  processSalePayment: (
    payment: SalePaymentInput,
    collectorId: string,
  ) => Promise<void>;
  processGeneralPayment: (
    clientDocument: string,
    paymentAmount: number,
    paymentMethod: string,
    notes: string,
    collectorId: string,
    discountAmount?: number,
    saleNumber?: number | null,
  ) => Promise<void>;
  recordPaymentAdjustment: (
    saleNumber: number,
    clientDocument: string,
    clientName: string, // Added clientName
    adjustmentAmount: number,
    managerId: string,
    managerName: string,
    notes?: string,
  ) => Promise<void>;
  getSalePayments: (
    saleNumber: number,
    clientDocument: string,
  ) => SalePayment[];
  calculateSaleBalance: (
    saleNumber: number,
    clientDocument: string,
  ) => SaleBalance;
  getSalesByClient: (clientDocument: string) => SaleGroup[];
  // Visit scheduling methods
  fetchScheduledVisits: (useCache?: boolean) => Promise<void>;
  scheduleVisit: (
    visitData: Omit<ScheduledVisit, "id" | "createdAt">,
  ) => Promise<ScheduledVisit>;
  updateVisitStatus: (
    visitId: string,
    status: ScheduledVisit["status"],
    notes?: string,
  ) => Promise<void>;
  requestVisitCancellation: (visitId: string, reason: string) => Promise<void>;
  approveVisitCancellation: (
    visitId: string,
    managerId: string,
  ) => Promise<void>;
  rejectVisitCancellation: (
    visitId: string,
    managerId: string,
    rejectionReason: string,
  ) => Promise<void>;
  getPendingCancellationRequests: () => ScheduledVisit[];
  getCancellationHistory: (days?: number) => ScheduledVisit[];
  getVisitsByDate: (date: string, collectorId?: string) => ScheduledVisit[];
  getVisitsByCollector: (collectorId: string) => ScheduledVisit[];
  getClientDataForVisit: (clientDocument: string) => Promise<{
    name: string;
    document: string;
    apelido?: string;
    address: string;
    number: string;
    neighborhood: string;
    city: string;
    complemento?: string;
    phone?: string;
    mobile?: string;
    totalPendingValue: number;
    overdueCount: number;
    addressUpdateDays?: number;
    created_at?: string;
  } | null>;
  rescheduleVisit: (
    visitId: string,
    newDate: string,
    newTime?: string,
    reason?: string,
  ) => Promise<void>;
  updateScheduledVisitsAfterPayment: (clientDocument: string) => Promise<void>;
  deleteClient: (clientDocument: string) => Promise<void>;
  deleteSalesFromClient: (
    clientDocument: string,
    saleNumbers: number[],
  ) => Promise<void>;
  bulkDeleteClients: (clientDocuments: string[]) => Promise<void>;
  // NOVOS CAMPOS PARA OTIMIZAÇÃO:
  prefetchClientsData: (clientDocuments: string[]) => Promise<void>;
  clientDataCache: Map<string, any>;
}

// Sale payment types
export interface SalePayment {
  id: string; // Re-added
  saleNumber: number | null;
  clientDocument: string;
  clientName?: string;
  paymentAmount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
  collectorId: string;
  collectorName?: string;
  createdAt: string;
  distribution_details: PaymentDistribution[];
  discountAmount?: number;
  isAgreement?: boolean;
  storeName?: string;
  updatedAt?: string;
}

export interface PaymentDistribution {
  installmentId: number;
  appliedAmount: number;
  appliedDiscount: number;
  installmentStatus: string;
}

export interface SalePaymentInput {
  saleNumber: number | null;
  clientDocument: string;
  paymentAmount: number;
  paymentMethod?: string;
  notes?: string;
  discountAmount?: number;
}

export interface SaleBalance {
  totalValue: number;
  totalPaid: number;
  totalDiscount?: number;
  remainingBalance: number;
  status: "pending" | "partially_paid" | "fully_paid";
  installmentBreakdown: {
    installmentId: number;
    originalValue: number;
    paidValue: number;
    remainingValue: number;
    status: string;
  }[];
}

export interface FilterOptions {
  status?: string;
  dueDate?: string;
  collector?: string;
  store?: string;
  city?: string;
  neighborhood?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  launchDateFrom?: string;
  launchDateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  overdueOnly?: boolean;
  highValueOnly?: boolean;
  visitsOnly?: boolean;
}
