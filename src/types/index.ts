import type { ClientesRegistry } from "../services/clientesRegistry";

// User types
export type UserType =
  | "manager"
  | "collector"
  | "internal_collector"
  | "third_party_collector"
  | "legal_collector";

/** Tipos de usuário que são cobradores: Externo, Interno, Terceirizado e Jurídico. */
export const COLLECTOR_TYPES: UserType[] = [
  "collector",
  "internal_collector",
  "third_party_collector",
  "legal_collector",
];

/** True quando o usuário é cobrador de qualquer tipo. Fonte única — use sempre
 * que precisar listar/contar cobradores, nunca compare so com "collector". */
export const isCollectorType = (type: UserType | null | undefined): boolean =>
  !!type && COLLECTOR_TYPES.includes(type);

export interface User {
  id: string;
  name: string;
  login: string;
  type: UserType;
  createdAt: string;
  /** false = usuário desativado (login bloqueado). Ausente/true = ativo. */
  active?: boolean;
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

// Regra da carteira: faixa de dias de atraso (inclusiva) x lojas que um
// cobrador atende. Um cobrador pode ter VARIAS regras vigentes (vigenteAte
// null); o banco nao deixa duas vigentes se sobreporem (mesma loja e faixas
// que se cruzam). Atraso = parcela vencida mais antiga do cliente.
export type FilaOrdem = "atraso" | "valor";

/** Configuração da Fila de Cobrança de UMA regra (RPC definir_fila_cobranca). */
export interface FilaConfigRegra {
  regraId: string;
  peso: number;
  pesoTarde: number | null;
  ordem: FilaOrdem;
  saldoMin: number | null;
  saldoMax: number | null;
}

export interface CollectorOverdueRange {
  id: string;
  collectorId: string;
  minDias: number;
  maxDias: number | null;
  /** Lojas que a regra cobre; null = todas. */
  lojas: string[] | null;
  /** Regra desligada fica cadastrada, mas a distribuicao ignora. */
  ativa: boolean;
  /** Fila de Cobrança (itens 39/40): clientes desta faixa em cada lote
   * (manhã, ou o dia todo sem turnos). null = fila desligada.
   * Regras em `filters/filaCobranca.ts`. */
  filaPeso: number | null;
  /** Peso a partir das 12h; null = sem turnos. */
  filaPesoTarde: number | null;
  /** Ordem dentro da faixa: maior atraso (padrão) ou maior dívida vencida. */
  filaOrdem: FilaOrdem;
  /** Dívida vencida (R$) para entrar na fila; fora vai para o fim. null = sem limite. */
  filaSaldoMin: number | null;
  filaSaldoMax: number | null;
  vigenteDesde: string;
  vigenteAte: string | null;
}

// Vínculo gerente<->cobrador (bonificação/consolidação de equipe).
// Vigência: só a linha com vigenteAte null é o vínculo atual do cobrador.
export interface ManagerCollectorLink {
  id: string;
  managerId: string;
  collectorId: string;
  vigenteDesde: string;
  vigenteAte: string | null;
}

// Linha de clientes_fora_da_faixa(): cliente de cobrador com regra que
// nenhuma regra dele cobre mais. faixaMin/faixaMax/diasExcedidos = a regra
// dele que o cliente acabou de passar; null quando a loja do cliente nem
// esta nas regras dele. bloqueadoPor null = a distribuicao move;
// "acordo_ativo"/"visita_agendada" explica por que nao.
export interface ClienteForaDaFaixa {
  documento: string;
  cliente: string | null;
  collectorId: string;
  collectorName: string | null;
  atrasoAtual: number;
  faixaMin: number | null;
  faixaMax: number | null;
  diasExcedidos: number | null;
  bloqueadoPor: string | null;
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
  rescheduledFromId?: string; // ID da visita de origem (quando esta foi gerada por reagendamento)
  rescheduledToId?: string; // ID da nova visita gerada ao reagendar esta
  /** Motivo pelo qual ESTA visita foi empurrada (src/config/rescheduleReasons). */
  rescheduleReason?: string;
  /**
   * Canal do agendamento. Ausente na criação = "presencial" (default no
   * banco) — só o cobrador externo cria sem informar. Cobrador de carteira
   * (interno/terceirizado/jurídico) informa "ligacao"/"whatsapp".
   */
  channel?: "presencial" | "ligacao" | "whatsapp";
}

export type ScheduledVisitChannel = NonNullable<ScheduledVisit["channel"]>;

export interface AllowedVisitDate {
  allowed_date: number; // Day of month (1-31)
  city: string;
  // Bairro opcional: NULL/undefined = regra de nível cidade (cidade inteira);
  // preenchido = regra específica do bairro (agendamento prefere o bairro e cai
  // na cidade como fallback). Ver src/utils/visitScheduling.
  neighborhood?: string | null;
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
  /** Razao social do cadastro (ERP Ciclone); `cliente` e o nome fantasia. */
  razao_social: string | null;
  /** Codigo do cliente no ERP Ciclone (cadastro); null fora do Ciclone. */
  codigo_cliente_erp?: string | null;
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
    | "full_payment"
    | "contact_made"
    | "message_sent"
    | "agreement"
    | "disputed"
    // Cliente diz que ja pagou (com ou sem comprovante em maos).
    | "claims_paid"
    // Cliente informa que a venda foi cancelada (vai para conferencia).
    | "sale_cancel_reported"
    // Contato importado de outro sistema (Cedrus) sem o resultado: conta
    // como cliente atendido, nao como conversa. Nao e opcao do Atender.
    | "contact_no_result";
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
  /** Razao social (ERP Ciclone), quando difere do nome exibido em `client`. */
  razaoSocial?: string;
  /** Codigo do cliente no ERP Ciclone (pode ter mais de um, com virgula). */
  codigoErp?: string;
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
/** Escopo da carga de BANCO_DADOS. Ver `CollectionContextType.collectionsScope`. */
export type CollectionsScope = "active" | "all";

export interface CollectionContextType {
  collections: Collection[];
  users: User[];
  /**
   * documento -> data em que o cliente zerou o saldo pendente
   * (clientes.reincidencia_reset_at). Fecha o ciclo de inadimplência:
   * reagendamentos anteriores não contam para a reincidência.
   */
  reincidenciaResets: Map<string, string>;
  /**
   * Cadastro do cliente (tabela `clientes`) indexado por documento: nome,
   * apelido, telefones, e-mail, nascimento, data de cadastro e o marco de
   * reincidência. Fonte de verdade desses campos — em `collections` eles já
   * vêm sobrepostos, então use este mapa só para o que não está lá
   * (data de nascimento, data de cadastro).
   */
  clientesRegistry: ClientesRegistry;
  salePayments: SalePayment[];
  scheduledVisits: ScheduledVisit[];
  monthlyGoals: MonthlyGoal[]; // Added
  allowedVisitDates: AllowedVisitDate[];
  /** Faixa de atraso vigente de cada cobrador (uma por collectorId). */
  collectorOverdueRanges: CollectorOverdueRange[];
  /** Vínculo gerente<->cobrador vigente de cada cobrador (uma por collectorId). */
  managerCollectorLinks: ManagerCollectorLink[];
  loading: boolean;
  /**
   * Quanto de BANCO_DADOS está carregado em `collections`.
   *
   * - `"active"`: só os clientes que ainda têm algo em aberto (view
   *   `banco_dados_clientes_ativos`). Escopo padrão do gestor — metade das
   *   linhas, saldo de venda e histórico do cliente continuam exatos.
   * - `"all"`: a tabela inteira. Necessário para Desempenho/Dashboard, que
   *   somam recebimentos de clientes já quitados.
   *
   * Cobrador está sempre em `"all"`: o escopo dele já é a própria carteira.
   */
  collectionsScope: CollectionsScope;
  /** Verdadeiro enquanto a promoção de `"active"` para `"all"` está em curso. */
  loadingFullScope: boolean;
  /**
   * Garante que `collections` cobre a tabela inteira. No-op se já estiver em
   * `"all"`. Telas que somam valores de clientes quitados (Desempenho,
   * Dashboard, Lojas, Clientes) precisam chamar antes de exibir números.
   */
  ensureAllCollections: () => Promise<void>;
  /**
   * Soma a `collections` os clientes 100% quitados (view
   * `banco_dados_clientes_quitados`), sem promover o escopo para `"all"`.
   * No-op se já estiver em `"all"` ou se já tiver sido chamada nesta sessão.
   * Usada pelo filtro "Pago" da Cobrança: é o único consumidor que precisa
   * das linhas de quem quitou, não de agregados.
   */
  ensureSettledCollections: () => Promise<void>;
  /** Verdadeiro enquanto `ensureSettledCollections` está em curso. Flag
   * própria, separada de `loadingFullScope`: as duas cargas podem estar em
   * voo ao mesmo tempo. */
  loadingSettledCollections: boolean;
  /**
   * Falso enquanto o gestor ainda não pediu os dados de cobrança. Nesse estado
   * `collections` está vazio POR ESCOLHA — a tela deve oferecer a consulta, e
   * não dizer que não há resultados. Já nasce verdadeiro para cobradores, que
   * carregam a própria carteira no login.
   */
  collectionsRequested: boolean;
  /**
   * Dispara a carga de cobranças sob demanda (botão "Consultar" do gestor).
   * Idempotente: não refaz nada se os dados já foram pedidos.
   */
  requestCollections: () => Promise<void>;
  error: string | null;
  isOnline: boolean;
  fetchCollections: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchSalePayments: () => Promise<void>;
  fetchAllowedVisitDates: () => Promise<void>;
  fetchCollectorOverdueRanges: () => Promise<void>;
  fetchManagerCollectorLinks: () => Promise<void>;
  /** Cria (regraId null) ou edita uma regra da carteira (faixa x lojas) de
   * um cobrador. O banco recusa sobreposicao com outra regra vigente. Só
   * gestor. `lojas` null/vazio = todas as lojas. */
  salvarRegraCarteira: (
    regraId: string | null,
    collectorId: string,
    minDias: number,
    maxDias: number | null,
    lojas: string[] | null,
    ativa?: boolean,
  ) => Promise<void>;
  /** Liga/desliga uma regra (ativar recusa conflito com regra ativa de outro). */
  definirRegraCarteiraAtiva: (regraId: string, ativa: boolean) => Promise<void>;
  /** Define a Fila de Cobrança do cobrador (pesos por regra; turnos se
   * pesoTarde preenchido em todas). Lista vazia desliga. Só gestor. */
  definirFilaCobranca: (
    collectorId: string,
    config: FilaConfigRegra[],
  ) => Promise<void>;
  /** Fecha o vínculo vigente do cobrador (se houver) e abre um novo com o gestor informado. Só gestor. */
  vincularCobradorAGerente: (
    managerId: string,
    collectorId: string,
  ) => Promise<void>;
  /** Fecha o vínculo vigente do cobrador, sem abrir um novo. Só gestor. */
  desvincularCobrador: (collectorId: string) => Promise<void>;
  /** Encerra UMA regra da carteira (vigente_ate = hoje). Só gestor. */
  encerrarRegraCarteira: (regraId: string) => Promise<void>;
  refreshData: () => Promise<void>;
  refreshCollections: () => Promise<void>;
  updateCollection: (id: number, updates: Partial<Collection>) => Promise<void>;
  assignCollectorToClients: (
    collectorId: string,
    clientIdentifiers: { document?: string; clientName?: string }[],
    skipRefresh?: boolean,
    onBatchProgress?: (completed: number, total: number) => void,
    transferVisits?: boolean,
  ) => Promise<{ transferredVisitDocs: string[] }>;
  removeCollectorFromClients: (
    clientIdentifiers: { document?: string; clientName?: string }[],
    skipRefresh?: boolean,
    onBatchProgress?: (completed: number, total: number) => void,
  ) => Promise<void>;
  // Patches locais otimistas (refletem na UI sem refetch).
  applyLocalAssignment: (
    collectorId: string,
    clientIdentifiers: { document?: string; clientName?: string }[],
    transferVisits?: boolean,
    transferredVisitDocs?: string[],
  ) => void;
  applyLocalRemoval: (
    clientIdentifiers: { document?: string; clientName?: string }[],
  ) => void;
  applyLocalStatus: (idParcelas: number[], situacao: string | null) => void;
  // Acordos de renegociacao (perfis carteira: Interno/Terceirizado/
  // Juridico). Ver supabase/migrations/20261030000005_criar_acordos_renegociacao.sql.
  acordos: Acordo[];
  fetchAcordos: () => Promise<void>;
  getAcordoAtivoDoCliente: (clientDocument: string) => Acordo | undefined;
  getAcordoQuebradoDoCliente: (clientDocument: string) => Acordo | undefined;
  /**
   * documento -> parcelas em aberto (dataVencimento + saldo) do acordo ATIVO
   * do cliente. Uma entrada (mesmo array vazio) = cliente tem acordo ativo.
   * Carregado em lote junto de fetchAcordos (so para acordos ativos, lista
   * pequena). Usado por clientMaxOverdueDays (src/filters/clientStatus.ts)
   * para o atraso refletir o cronograma do acordo em vez do titulo original
   * -- ver migration 20261104000001_atraso_considera_acordo_ativo.
   */
  acordoAtivoOverdueMap: Map<string, { dataVencimento: string; saldo: number }[]>;
  // Configuracao padrao de acordo (Etapa 3a). null = ainda nao carregada ou
  // nunca cadastrada (gestor ve formulario vazio, cobrador ve 0% em tudo).
  acordoConfiguracaoPadrao: AcordoConfiguracaoPadrao | null;
  fetchAcordoConfiguracaoPadrao: () => Promise<void>;
  definirConfiguracaoPadraoAcordo: (params: {
    multaPercentual: number;
    jurosPercentualAm: number;
    descontoPadraoPercentual: number;
    descontoMaximoPercentual: number;
    diasEntreParcelas: number;
    empresaNome: string;
    empresaCnpj: string;
    empresaEndereco: string;
    empresaChavePix: string;
  }) => Promise<AcordoConfiguracaoPadrao>;
  criarAcordo: (params: {
    clientDocument: string;
    titulos: {
      collectionId: number;
      saldoNoMomento: number;
      diasAtrasoNoMomento: number;
      multaValor: number;
      jurosValor: number;
      descontoValor: number;
    }[];
    parcelas: {
      numero: number;
      valorParcela: number;
      dataVencimento: string;
    }[];
    multaPercentualAplicado: number;
    jurosPercentualAmAplicado: number;
    descontoPercentualAplicado: number;
    formaPagamentoParcelas: string;
    testemunha1Nome: string;
    testemunha1Cpf: string;
    testemunha2Nome: string;
    testemunha2Cpf: string;
    /** Gestor: em nome de quem fica o acordo (cobrador da carteira). */
    emNomeDe?: string | null;
  }) => Promise<Acordo>;
  fetchAcordoDetalhe: (acordoId: string) => Promise<{
    acordo: Acordo;
    titulos: AcordoTitulo[];
    parcelas: AcordoParcela[];
    pagamentos: AcordoPagamento[];
  }>;
  fetchAcordoLancamentoCiclone: (
    acordoId: string,
    sistema?: SistemaLancamentoAcordo,
  ) => Promise<AcordoLancamentoCiclone>;
  registrarPagamentoAcordo: (params: {
    acordoParcelaId: string;
    valorPago: number;
    dataPagamento: string;
    notes?: string;
  }) => Promise<AcordoPagamento>;
  /** destinoPagamentos: obrigatorio quando o acordo tem pagamento --
   * "estornar" (sera refeito / nao aconteceu) ou "manter" (cliente pagou e
   * desistiu). Migration 20261110000006. */
  cancelarAcordo: (
    acordoId: string,
    motivo: string,
    destinoPagamentos?: "estornar" | "manter",
  ) => Promise<void>;
  /** Cria o perfil e a conta de login (senha) — RPC criar_usuario_com_login. */
  addUser: (
    user: Pick<User, "name" | "login" | "type">,
    senha: string,
  ) => Promise<void>;
  /** Gestor redefine a senha de login — RPC redefinir_senha_usuario. */
  redefinirSenhaUsuario: (userId: string, senha: string) => Promise<void>;
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
  /**
   * Registra a diferenca de uma correcao manual do recebido de uma venda.
   * Negativa com `pagamentoEstornadoId`: estorno ligado ao pagamento do app
   * (sai do credito do cobrador dele). Sem ele, ou positiva: ajuste
   * administrativo de quem editou. Motivo obrigatorio.
   */
  registrarAjusteRecebimento: (params: {
    saleNumber: number;
    clientDocument: string;
    clientName: string;
    diferenca: number;
    motivo: string;
    usuarioId: string;
    pagamentoEstornadoId?: string | null;
  }) => Promise<void>;
  // Item 62: estorno (total ou parcial) de um pagamento do app, so gestor.
  // Desfaz nas parcelas so o que o pagamento aplicou (recebimentos_historico).
  estornarPagamento: (params: {
    pagamentoId: string;
    valor: number;
    motivo: string;
  }) => Promise<{ valor: number; revertidoParcelas: number; parcelas: number }>;
  // Item 62 etapa 2: gestor decide o pedido de correcao do cobrador
  // (aprovar = estorna e liga ao pedido; recusar exige resposta).
  decidirPedidoCorrecao: (params: {
    pedidoId: string;
    aprovar: boolean;
    valor?: number;
    resposta?: string;
  }) => Promise<{ valor: number; revertidoParcelas: number; parcelas: number } | null>;
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
  /** Cancelamento DIRETO (sem aprovacao), so pra contato ligacao/whatsapp
   * da carteira -- ver cancelScheduledContact em CollectionContext. */
  cancelScheduledContact: (visitId: string, reason: string) => Promise<void>;
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
  /** Exclui visitas pelos ids (ex.: limpar pendentes de um cobrador). */
  deleteScheduledVisits: (visitIds: string[]) => Promise<void>;
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
    data_nascimento?: string | null;
  } | null>;
  rescheduleVisit: (
    visitId: string,
    newDate: string,
    newTime?: string,
    reason?: string,
  ) => Promise<void>;
  updateScheduledVisitsAfterPayment: (clientDocument: string) => Promise<void>;
  /** Marca as vendas como canceladas (no ERP), com motivo. Nada e apagado. */
  cancelarVendas: (
    clientDocument: string,
    saleNumbers: number[],
    motivo: string,
  ) => Promise<void>;
  /** Cancela todas as vendas ativas dos clientes, com motivo. */
  cancelarClientes: (
    clientDocuments: string[],
    motivo: string,
  ) => Promise<void>;
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
  /** Pagamento que este registro estorna (valor negativo). */
  estornoDe?: string | null;
  /** Motivo de estorno/ajuste. */
  motivo?: string | null;
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
  /** Juros/multa pagos junto: registrados no pagamento, nao abatem parcela. */
  jurosAmount?: number;
  /** Dia em que o cliente pagou (YYYY-MM-DD); ausente = hoje. */
  paymentDate?: string;
}

// Acordo de renegociacao (parcelamento futuro combinado com o cliente).
// Ver supabase/migrations/20261030000005_criar_acordos_renegociacao.sql.
export type AcordoStatus = "ativo" | "cumprido" | "cancelado" | "quebrado";

export interface Acordo {
  id: string;
  clientDocument: string;
  clientName?: string | null;
  collectorId: string;
  valorNegociado: number;
  numeroParcelas: number;
  status: AcordoStatus;
  motivoCancelamento?: string | null;
  acordoOrigemId?: string | null;
  createdById?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  // Congelados no momento da negociacao (Etapa 3b) -- nunca recalculados.
  formaPagamentoParcelas?: string | null;
  testemunha1Nome?: string | null;
  testemunha1Cpf?: string | null;
  testemunha2Nome?: string | null;
  testemunha2Cpf?: string | null;
  multaPercentualAplicado: number;
  jurosPercentualAmAplicado: number;
  descontoPercentualAplicado: number;
}

export interface AcordoTitulo {
  id: string;
  acordoId: string;
  collectionId: number;
  saldoNoMomento: number;
  // Congelados no momento da negociacao (Etapa 3b) -- nunca recalculados.
  diasAtrasoNoMomento: number;
  multaValor: number;
  jurosValor: number;
  descontoValor: number;
  createdAt: string;
  /**
   * Enriquecido a partir de BANCO_DADOS em fetchAcordoDetalhe (leitura, não
   * vem de acordo_titulos) — ausente se o título não for mais encontrado.
   */
  saleNumber?: number;
  saleLabel?: string;
  vencimentoOriginal?: string | null;
}

export interface AcordoParcela {
  id: string;
  acordoId: string;
  numero: number;
  valorParcela: number;
  dataVencimento: string;
  createdAt: string;
}

export interface AcordoPagamento {
  id: string;
  acordoParcelaId: string;
  valorPago: number;
  dataPagamento: string;
  collectorId?: string | null;
  notes?: string | null;
  estornoDe?: string | null;
  motivo?: string | null;
  registradoPorId?: string | null;
  createdAt: string;
}

// Conferencia "acordo do app x lancamento no ERP Ciclone" (RPC
// acordo_lancamento_ciclone, migration 20261106000002). So leitura.
/** Onde o acordo do app e lancado: Ciclone (Focco Brasil) ou SSOtica (oticas). */
export type SistemaLancamentoAcordo = "ciclone" | "ssotica";

export type AcordoLancamentoCicloneStatus =
  | "fora_do_ciclone" // titulos do acordo nao vem do Ciclone (outra loja)
  | "fora_da_ssotica" // titulos do acordo nao sao de loja SSOtica (Focco)
  | "nao_lancado" // nenhuma renegociacao do cliente com esses titulos ainda
  | "lancado" // achou e bate: titulos, parcelas, valores e vencimentos
  | "divergente"; // achou, mas algo difere (ver divergencias)

export interface AcordoLancamentoCicloneParcela {
  ordem: number;
  numeroApp: number | null;
  valorApp: number | null;
  vencimentoApp: string | null;
  valorErp: number | null;
  vencimentoErp: string | null;
  recebidoErp: number | null;
  bate: boolean;
}

export interface AcordoLancamentoCiclone {
  status: AcordoLancamentoCicloneStatus;
  novoDocumento?: string;
  dataBaixa?: string;
  divergencias: string[];
  parcelas: AcordoLancamentoCicloneParcela[];
}

// Configuracao padrao de acordo (multa/juros/desconto/dados da empresa),
// ponto de partida editavel pelo cobrador ao negociar. Ver
// supabase/migrations/20261104000002_acordo_configuracao_padrao.sql.
export interface AcordoConfiguracaoPadrao {
  id: string;
  multaPercentual: number;
  jurosPercentualAm: number;
  descontoPadraoPercentual: number;
  descontoMaximoPercentual: number;
  diasEntreParcelas: number;
  empresaNome: string | null;
  empresaCnpj: string | null;
  empresaEndereco: string | null;
  empresaChavePix: string | null;
  vigenteDesde: string;
  vigenteAte: string | null;
  createdBy: string | null;
  createdAt: string;
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
  // Status de pagamento agregado. Aceita um valor ou varios (multi-select pills).
  status?: string | string[];
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
  /**
   * Chave da observacao da ultima visita realizada (config/visitOutcomes).
   * Ex.: "spc" | "falecido" | "outra". Vazio/ausente = sem filtro.
   */
  visitOutcome?: string;
  /** Periodo de analise por mes (0-11) e ano. Vazio/ausente = todos. */
  months?: number[];
  years?: number[];
}
