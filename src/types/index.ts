// User types
export interface User {
  id: string;
  name: string;
  login: string;
  password: string;
  type: 'manager' | 'collector';
  createdAt: string;
}

// Store assignment for collectors
export interface CollectorStore {
  id: string;
  collectorId: string;
  storeName: string;
  createdAt: string;
}

// Scheduled visits for collectors
export interface ScheduledVisit {
  id: string;
  collectorId: string;
  clientDocument: string;
  clientName: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM
  status: 'agendada' | 'realizada' | 'cancelada' | 'nao_encontrado' | 'cancelamento_solicitado';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  // Dados do cliente para facilitar exibição
  clientAddress?: string;
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
  // Visit tracking properties
  data_visita_agendada: string | null;
  data_visita_realizada: string | null;
  data_recebimento: string | null;
  updated_at: string | null;
}

export interface CollectionAttempt {
  id: string;
  date: string;
  type: 'call' | 'visit' | 'email' | 'whatsapp';
  result: 'no_answer' | 'busy' | 'not_found' | 'promise' | 'refusal' | 'partial_payment' | 'full_payment';
  notes?: string;
  nextAction?: string;
  nextActionDate?: string;
}

// Client grouping interface
export interface ClientGroup {
  clientId: string;
  client: string;
  document: string;
  phone?: string;
  mobile?: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  sales: SaleGroup[];
  totalValue: number;
  totalReceived: number;
  pendingValue: number;
}

export interface SaleGroup {
  saleNumber: number;
  titleNumber: number;
  description: string;
  installments: Collection[];
  totalValue: number;
  totalReceived: number;
  pendingValue: number;
  saleStatus: 'pending' | 'partially_paid' | 'fully_paid';
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
}

// Auth context types
export interface AuthContextType {
  user: User | null;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

// Collection context types
export interface CollectionContextType {
  collections: Collection[];
  users: User[];
  collectorStores: CollectorStore[];
  salePayments: SalePayment[];
  scheduledVisits: ScheduledVisit[];
  loading: boolean;
  error: string | null;
  fetchCollections: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchCollectorStores: () => Promise<void>;
  fetchSalePayments: () => Promise<void>;
  refreshData: () => Promise<void>;
  updateCollection: (id: number, updates: Partial<Collection>) => Promise<void>;
  assignCollectorToStore: (collectorId: string, storeName: string) => Promise<void>;
  removeCollectorFromStore: (collectorId: string, storeName: string) => Promise<void>;
  assignCollectorToClients: (collectorId: string, documentos: string[]) => Promise<void>;
  removeCollectorFromClients: (documentos: string[]) => Promise<void>;
  addAttempt: (collectionId: number, attempt: Omit<CollectionAttempt, 'id'>) => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  getDashboardStats: () => DashboardStats;
  getCollectorPerformance: () => CollectorPerformance[];
  getCollectorCollections: (collectorId: string) => Collection[];
  getClientGroups: (collectorId?: string) => ClientGroup[];
  getFilteredCollections: (filters: FilterOptions, userType: 'manager' | 'collector', collectorId?: string) => Collection[];
  getAvailableStores: () => string[];
  getCollectorStores: (collectorId: string) => string[];
  // Sale payment methods
  processSalePayment: (payment: SalePaymentInput, collectorId: string) => Promise<void>;
  processGeneralPayment: (clientDocument: string, paymentAmount: number, paymentMethod: string, notes: string, collectorId: string) => Promise<void>;
  getSalePayments: (saleNumber: number, clientDocument: string) => SalePayment[];
  calculateSaleBalance: (saleNumber: number, clientDocument: string) => SaleBalance;
  getSalesByClient: (clientDocument: string) => SaleGroup[];
  // Visit scheduling methods
  fetchScheduledVisits: () => Promise<void>;
  scheduleVisit: (visitData: Omit<ScheduledVisit, 'id' | 'createdAt'>) => Promise<ScheduledVisit>;
  updateVisitStatus: (visitId: string, status: ScheduledVisit['status'], notes?: string) => Promise<void>;
  requestVisitCancellation: (visitId: string, reason: string) => Promise<void>;
  approveVisitCancellation: (visitId: string, managerId: string) => Promise<void>;
  rejectVisitCancellation: (visitId: string, managerId: string, rejectionReason: string) => Promise<void>;
  getPendingCancellationRequests: () => ScheduledVisit[];
  getCancellationHistory: (days?: number) => ScheduledVisit[];
  getVisitsByDate: (date: string, collectorId?: string) => ScheduledVisit[];
  getVisitsByCollector: (collectorId: string) => ScheduledVisit[];
  getClientDataForVisit: (clientDocument: string) => {
    name: string;
    document: string;
    address: string;
    neighborhood: string;
    city: string;
    phone?: string;
    mobile?: string;
    totalPendingValue: number;
    overdueCount: number;
  } | null;
  rescheduleVisit: (visitId: string, newDate: string, newTime?: string, reason?: string) => Promise<void>;
}

// Sale payment types
export interface SalePayment {
  id: string;
  saleNumber: number;
  clientDocument: string;
  paymentAmount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
  collectorId: string;
  collectorName?: string;
  createdAt: string;
  distributionDetails: PaymentDistribution[];
}

export interface PaymentDistribution {
  installmentId: number;
  originalAmount: number;
  appliedAmount: number;
  installmentStatus: string;
}

export interface SalePaymentInput {
  saleNumber: number;
  clientDocument: string;
  paymentAmount: number;
  paymentMethod?: string;
  notes?: string;
}

export interface SaleBalance {
  totalValue: number;
  totalPaid: number;
  remainingBalance: number;
  status: 'pending' | 'partially_paid' | 'fully_paid';
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
  minAmount?: number;
  maxAmount?: number;
  overdueOnly?: boolean;
  highValueOnly?: boolean;
}