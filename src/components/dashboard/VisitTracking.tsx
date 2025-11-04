import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  CalendarClock,
  Clock,
  MapPin,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  MessageSquare,
  User,
  Filter,
  ChevronDown,
  ChevronUp,
  Search,
  Star, // Add Star icon
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { ScheduledVisit } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import VisitScheduler from "./VisitScheduler"; // Import the VisitScheduler component
import AllowedVisitDatesManager from "./AllowedVisitDatesManager"; // Import the AllowedVisitDatesManager component
import "../../styles/components.css"; // Import custom components styles

// Helper function to parse YYYY-MM-DD date strings safely
const parseDateString = (dateString: string): Date | null => {
  if (!dateString) return null;
  try {
    const [year, month, day] = dateString.split("-");
    // Create date in UTC to avoid timezone shifts
    return new Date(
      Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)),
    );
  } catch {
    return null;
  }
};

interface VisitTrackingProps {
  onClose?: () => void;
}

const VisitTracking: React.FC<VisitTrackingProps> = ({ onClose }) => {
  const {
    scheduledVisits,
    users,
    getPendingCancellationRequests,
    approveVisitCancellation,
    rejectVisitCancellation,
    fetchScheduledVisits,
  } = useCollection();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "visits" | "cancellations" | "history" | "scheduledDates"
  >("visits");
  const [selectedCollector, setSelectedCollector] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientSearchFilter, setClientSearchFilter] = useState<string>("");

  // Calculate first and last day of the current month for default filters
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const formatDateToYYYYMMDD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [dateFromFilter, setDateFromFilter] = useState<string>(
    formatDateToYYYYMMDD(firstDayOfMonth),
  );
  const [dateToFilter, setDateToFilter] = useState<string>(
    formatDateToYYYYMMDD(lastDayOfMonth),
  );
  const [expandedCollectors, setExpandedCollectors] = useState<Set<string>>(
    new Set(),
  );
  const [overdueFilter, setOverdueFilter] = useState<string>("all"); // 'all', 'overdue', 'not_overdue'

  // Estados para cancelamentos
  const [pendingRequests, setPendingRequests] = useState<ScheduledVisit[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ScheduledVisit | null>(
    null,
  );
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<
    "approve" | "reject" | null
  >(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);

  // State for the scheduling modal
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [selectedCollectorForScheduler, setSelectedCollectorForScheduler] =
    useState<string | null>(null);

  useEffect(() => {
    if (showSchedulerModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [showSchedulerModal]);

  useEffect(() => {
    const requests = getPendingCancellationRequests();
    setPendingRequests(requests);
  }, [getPendingCancellationRequests, scheduledVisits]); // Atualizar quando scheduledVisits mudar

  // Adicionar atualização periódica para garantir que novas solicitações apareçam
  useEffect(() => {
    // Fetch scheduled visits when the component mounts or when the activeTab changes to "cancellations"
    // or when the user changes (e.g., manager logs in)
    if (activeTab === "cancellations" && user?.type === "manager") {
      fetchScheduledVisits();
    }
    // No polling needed, updates will be event-driven
  }, [activeTab, user, fetchScheduledVisits]);

  // Adicionar listeners para eventos de cancelamento
  useEffect(() => {
    const handleCancellationRequested = async (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("Evento de cancelamento recebido:", customEvent.detail);

      // Aguardar um momento para garantir que o banco foi atualizado
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Atualizar dados de visitas agendadas
      await fetchScheduledVisits();

      // Atualizar lista de solicitações pendentes
      const requests = getPendingCancellationRequests();
      setPendingRequests(requests);

      // Mostrar notificação se for gerente
      if (user?.type === "manager") {
        showSuccessNotification(
          `Nova solicitação de cancelamento de ${customEvent.detail.clientName}`,
        );
      }
    };

    const handleCancellationApproved = async (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("Cancelamento aprovado:", customEvent.detail);

      // Aguardar um momento para garantir que o banco foi atualizado
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Atualizar dados
      await fetchScheduledVisits();
      const requests = getPendingCancellationRequests();
      setPendingRequests(requests);
    };

    const handleCancellationRejected = async (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("Cancelamento rejeitado:", customEvent.detail);

      // Aguardar um momento para garantir que o banco foi atualizado
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Atualizar dados
      await fetchScheduledVisits();
      const requests = getPendingCancellationRequests();
      setPendingRequests(requests);
    };

    // Escutar eventos
    window.addEventListener(
      "visitCancellationRequested",
      handleCancellationRequested,
    );
    window.addEventListener(
      "visitCancellationApproved",
      handleCancellationApproved,
    );
    window.addEventListener(
      "visitCancellationRejected",
      handleCancellationRejected,
    );

    return () => {
      window.removeEventListener(
        "visitCancellationRequested",
        handleCancellationRequested,
      );
      window.removeEventListener(
        "visitCancellationApproved",
        handleCancellationApproved,
      );
      window.removeEventListener(
        "visitCancellationRejected",
        handleCancellationRejected,
      );
    };
  }, [fetchScheduledVisits, getPendingCancellationRequests]);

  // Add error boundary to catch any rendering issues
  if (!scheduledVisits || !users) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Carregando dados das visitas...</div>
      </div>
    );
  }

  const collectors = users.filter((u) => u.type === "collector");

  const getCollectorName = (collectorId: string) => {
    const collector = users.find((u) => u.id === collectorId);
    return collector?.name || "Cobrador não encontrado";
  };

  // Função para verificar se uma visita está atrasada
  const isVisitOverdue = (visit: ScheduledVisit): boolean => {
    if (visit.status !== "agendada") return false;

    try {
      const today = new Date();
      const todayUTC = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        ),
      );

      const visitDate = parseDateString(visit.scheduledDate);
      if (!visitDate) return false; // This is already a UTC date at midnight

      return visitDate < todayUTC;
    } catch {
      return false;
    }
  };

  // Função para calcular dias de atraso
  const getOverdueDays = (visitDate: string): number => {
    try {
      const today = new Date();
      const todayUTC = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        ),
      );

      const date = parseDateString(visitDate);
      if (!date) return 0; // This is already a UTC date at midnight

      const diffTime = todayUTC.getTime() - date.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      return Math.max(0, diffDays);
    } catch {
      return 0;
    }
  };

  const formatSafeDateTime = (dateString: string, timeString?: string) => {
    try {
      const date = parseDateString(dateString);
      if (!date) return `${dateString} às ${timeString || "00:00"}`; // Handle invalid date

      const dateFormatted = date.toLocaleDateString("pt-BR", {
        timeZone: "UTC",
      });
      return `${dateFormatted} às ${timeString || "00:00"}`;
    } catch {
      return `${dateString} às ${timeString || "00:00"}`;
    }
  };

  const formatSafeDate = (dateString: string) => {
    try {
      const date = parseDateString(dateString);
      if (!date) return dateString; // Handle invalid date

      return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    } catch {
      return dateString;
    }
  };

  // Função para verificar se uma data está dentro do período filtrado
  const isDateInRange = (dateString: string): boolean => {
    if (!dateFromFilter && !dateToFilter) return true;

    try {
      const visitDate = parseDateString(dateString);
      if (!visitDate) return false; // Handle invalid date

      visitDate.setHours(0, 0, 0, 0); // Ensure comparison is only by date

      let fromDate = null;
      if (dateFromFilter) {
        fromDate = parseDateString(dateFromFilter);
        if (fromDate) fromDate.setHours(0, 0, 0, 0);
      }

      let toDate = null;
      if (dateToFilter) {
        toDate = parseDateString(dateToFilter);
        if (toDate) toDate.setHours(23, 59, 59, 999); // End of day
      }

      if (fromDate && visitDate < fromDate) return false;
      if (toDate && visitDate > toDate) return false;

      return true;
    } catch {
      return true;
    }
  };

  // Agrupa visitas por cobrador com filtros avançados
  const getVisitsByCollectorGrouped = () => {
    const filteredVisits = scheduledVisits.filter((visit) => {
      // Filtro por cobrador
      if (
        selectedCollector !== "all" &&
        visit.collectorId !== selectedCollector
      )
        return false;

      // Filtro por status
      if (statusFilter !== "all" && visit.status !== statusFilter) return false;

      // Filtro por período de data
      if (!isDateInRange(visit.scheduledDate)) return false;

      // Filtro por atraso
      if (overdueFilter !== "all") {
        const isOverdue = isVisitOverdue(visit);
        if (overdueFilter === "overdue" && !isOverdue) return false;
        if (overdueFilter === "not_overdue" && isOverdue) return false;
      }

      // Filtro por busca de cliente
      if (clientSearchFilter.trim()) {
        const searchTerm = clientSearchFilter.toLowerCase().trim();
        const clientName = visit.clientName?.toLowerCase() || "";
        const clientDocument = visit.clientDocument?.toLowerCase() || "";
        const clientAddress = visit.clientAddress?.toLowerCase() || "";

        if (
          !clientName.includes(searchTerm) &&
          !clientDocument.includes(searchTerm) &&
          !clientAddress.includes(searchTerm)
        ) {
          return false;
        }
      }

      return true;
    });

    const grouped: { [key: string]: ScheduledVisit[] } = {};

    // Inicializar apenas os cobradores relevantes
    // Se houver filtro específico de cobrador, inicializar apenas ele
    // Caso contrário, inicializar todos os cobradores
    if (selectedCollector !== "all") {
      // Filtro específico: inicializar apenas o cobrador selecionado
      grouped[selectedCollector] = [];
    } else {
      // Sem filtro: inicializar todos os cobradores
      collectors.forEach((collector) => {
        grouped[collector.id] = [];
      });
    }

    // Adicionar visitas aos cobradores
    filteredVisits.forEach((visit) => {
      if (grouped[visit.collectorId]) {
        grouped[visit.collectorId].push(visit);
      }
    });

    // Ordena as visitas dentro de cada grupo por data
    Object.keys(grouped).forEach((collectorId) => {
      grouped[collectorId].sort((a, b) => {
        const dateA = parseDateString(a.scheduledDate);
        const dateB = parseDateString(b.scheduledDate);

        if (!dateA || !dateB) return 0; // Handle invalid dates

        return dateB.getTime() - dateA.getTime(); // Mais recentes primeiro
      });
    });

    return grouped;
  };

  // Função para limpar todos os filtros
  const clearAllFilters = () => {
    setSelectedCollector("all");
    setStatusFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
    setClientSearchFilter("");
    setOverdueFilter("all");
  };

  // Função para contar filtros ativos
  const getActiveFiltersCount = () => {
    let count = 0;
    if (selectedCollector !== "all") count++;
    if (statusFilter !== "all") count++;
    if (dateFromFilter) count++;
    if (dateToFilter) count++;
    if (clientSearchFilter.trim()) count++;
    if (overdueFilter !== "all") count++;
    return count;
  };

  const toggleCollectorExpansion = (collectorId: string) => {
    const newExpanded = new Set(expandedCollectors);
    if (newExpanded.has(collectorId)) {
      newExpanded.delete(collectorId);
    } else {
      newExpanded.add(collectorId);
    }
    setExpandedCollectors(newExpanded);
  };

  const getStatusBadge = (status: ScheduledVisit["status"]) => {
    const statusConfig = {
      agendada: { bg: "bg-blue-100", text: "text-blue-800", label: "Agendada" },
      realizada: {
        bg: "bg-green-100",
        text: "text-green-800",
        label: "Realizada",
      },
      cancelada: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        label: "Cancelada",
      },
      nao_encontrado: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        label: "Não Encontrado",
      },
      cancelamento_solicitado: {
        bg: "bg-red-100",
        text: "text-red-800",
        label: "Cancelamento Solicitado",
      },
      pending_sync: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        label: "Pendente",
      },
    };

    const config = statusConfig[status] || statusConfig["agendada"];

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}
      >
        {config.label}
      </span>
    );
  };

  // Funções para aprovação de cancelamentos
  const handleOpenApproval = (
    request: ScheduledVisit,
    action: "approve" | "reject",
  ) => {
    setSelectedRequest(request);
    setApprovalAction(action);
    setShowApprovalModal(true);
    setRejectionReason("");
  };

  const handleCloseApproval = () => {
    setSelectedRequest(null);
    setApprovalAction(null);
    setShowApprovalModal(false);
    setRejectionReason("");
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || !user || !approvalAction) return;

    if (approvalAction === "reject" && !rejectionReason.trim()) {
      alert("Por favor, informe o motivo da rejeição");
      return;
    }

    try {
      setLoading(true);

      if (approvalAction === "approve") {
        await approveVisitCancellation(selectedRequest.id, user.id);

        // Disparar evento para notificar outros componentes
        window.dispatchEvent(
          new CustomEvent("visitCancellationApproved", {
            detail: {
              visitId: selectedRequest.id,
              clientName: selectedRequest.clientName,
              collectorId: selectedRequest.collectorId,
              managerId: user.id,
            },
          }),
        );

        showSuccessNotification("Cancelamento aprovado com sucesso");
      } else {
        await rejectVisitCancellation(
          selectedRequest.id,
          user.id,
          rejectionReason.trim(),
        );

        // Disparar evento para notificar outros componentes
        window.dispatchEvent(
          new CustomEvent("visitCancellationRejected", {
            detail: {
              visitId: selectedRequest.id,
              clientName: selectedRequest.clientName,
              collectorId: selectedRequest.collectorId,
              managerId: user.id,
              reason: rejectionReason.trim(),
            },
          }),
        );

        showSuccessNotification("Cancelamento rejeitado com sucesso");
      }

      const updatedRequests = getPendingCancellationRequests();
      setPendingRequests(updatedRequests);

      handleCloseApproval();
    } catch (error) {
      console.error("Erro ao processar solicitação:", error);
      alert("Erro ao processar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const showSuccessNotification = (message: string) => {
    const notification = document.createElement("div");
    notification.className =
      "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center";
    notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      ${message}
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  };

  const [showFilters, setShowFilters] = useState(false);

  const renderVisitsTab = () => {
    const groupedVisits = getVisitsByCollectorGrouped();
    const activeFiltersCount = getActiveFiltersCount();

    return (
      <div className="space-y-4">
        {/* Filtros Colapsáveis */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors relative"
                >
                  <Filter className="h-5 w-5" />
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Busca sempre visível */}
            <div>
              <label
                htmlFor="client-search-input"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Buscar Cliente
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="client-search-input"
                  name="clientSearch"
                  type="text"
                  value={clientSearchFilter}
                  onChange={(e) => setClientSearchFilter(e.target.value)}
                  placeholder="Nome, documento ou endereço..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Filtros Colapsáveis */}
            {showFilters && (
              <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-200 animate-in slide-in-from-top-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label
                      htmlFor="collector-select"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Cobrador
                    </label>
                    <select
                      id="collector-select"
                      name="collector"
                      value={selectedCollector}
                      onChange={(e) => setSelectedCollector(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Todos os cobradores</option>
                      {collectors.map((collector) => (
                        <option key={collector.id} value={collector.id}>
                          {collector.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="status-select"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Status
                    </label>
                    <select
                      id="status-select"
                      name="status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Todos os status</option>
                      <option value="agendada">Agendada</option>
                      <option value="realizada">Realizada</option>
                      <option value="cancelada">Cancelada</option>
                      <option value="nao_encontrado">Não Encontrado</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="date-from-filter"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Data Inicial
                    </label>
                    <input
                      id="date-from-filter"
                      name="dateFrom"
                      type="date"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="date-to-filter"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Data Final
                    </label>
                    <input
                      id="date-to-filter"
                      name="dateTo"
                      type="date"
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Visit Cards */}
        {Object.keys(groupedVisits).length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum cobrador encontrado
            </h3>
            <p className="text-gray-600">
              Cadastre cobradores para começar a agendar visitas
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedVisits).map(([collectorId, visits]) => {
              const collectorName = getCollectorName(collectorId);
              const isExpanded = expandedCollectors.has(collectorId);

              return (
                <div
                  key={collectorId}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200"
                >
                  {/* Header do cobrador */}
                  <div
                    className="p-4 lg:p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleCollectorExpansion(collectorId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="h-10 w-10 lg:h-12 lg:w-12 rounded-full flex items-center justify-center mr-3 lg:mr-4 bg-blue-100 flex-shrink-0">
                          <User className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base lg:text-lg font-semibold text-gray-900 truncate">
                            {collectorName}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {visits.length}{" "}
                            {visits.length === 1 ? "visita" : "visitas"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-xl lg:text-2xl font-bold text-gray-900">
                            {visits.length}
                          </div>
                          <div className="text-sm text-gray-600">Visitas</div>
                        </div>
                        {user?.type === "manager" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent collector card from expanding
                              setSelectedCollectorForScheduler(collectorId);
                              setShowSchedulerModal(true);
                            }}
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors"
                            title="Agendar Visita"
                          >
                            <Calendar className="h-5 w-5" />
                          </button>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-gray-600" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-600" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Lista de visitas */}
                  {isExpanded && (
                    <div className="p-4 lg:p-6 pt-0 space-y-4">
                      {visits.length === 0 ? (
                        <div className="text-center py-8">
                          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 text-sm">
                            Nenhuma visita agendada para este cobrador
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            Ajuste os filtros ou clique no ícone de calendário para agendar
                          </p>
                        </div>
                      ) : (
                        visits.map((visit) => {
                        const isOverdue = isVisitOverdue(visit);
                        return (
                          <div
                            key={visit.id}
                            className={`p-3 lg:p-4 rounded-2xl border transition-all duration-200 hover:shadow-md ${
                              isOverdue
                                ? "border-red-300 bg-red-50"
                                : "border-gray-200 bg-gray-50"
                            }`}
                          >
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-3 lg:space-y-0">
                              <div className="flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-3">
                                  <div className="font-semibold text-gray-900 mb-1 sm:mb-0">
                                    {visit.clientName}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {getStatusBadge(visit.status)}
                                    {isVisitOverdue(visit) && (
                                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 flex items-center">
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Atrasada{" "}
                                        {getOverdueDays(visit.scheduledDate)}{" "}
                                        {getOverdueDays(visit.scheduledDate) ===
                                        1
                                          ? "dia"
                                          : "dias"}
                                      </span>
                                    )}
                                    {visit.scheduled_by_manager_id && (
                                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 flex items-center">
                                        <Star className="h-3 w-3 mr-1" />
                                        Agendado pelo gerente
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 mb-3">
                                  <div className="space-y-2">
                                    <div className="flex items-center">
                                      <Calendar className="h-4 w-4 mr-2" />
                                      {formatSafeDateTime(
                                        visit.scheduledDate,
                                        visit.scheduledTime,
                                      )}
                                    </div>
                                    <div className="flex items-center">
                                      <MapPin className="h-4 w-4 mr-2" />
                                      {visit.clientAddress}
                                      {visit.clientNeighborhood &&
                                        `, ${visit.clientNeighborhood}`}
                                      {visit.clientCity &&
                                        `, ${visit.clientCity}`}
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    {visit.totalPendingValue && (
                                      <div className="flex items-center">
                                        <DollarSign className="h-4 w-4 mr-2" />
                                        Pendente:{" "}
                                        {formatCurrency(
                                          visit.totalPendingValue,
                                        )}
                                      </div>
                                    )}
                                    {visit.overdueCount && (
                                      <div className="flex items-center">
                                        <AlertTriangle className="h-4 w-4 mr-2" />
                                        {visit.overdueCount}{" "}
                                        {visit.overdueCount === 1
                                          ? "parcela vencida"
                                          : "parcelas vencidas"}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {visit.notes && (
                                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-3">
                                    <div className="flex items-start">
                                      <MessageSquare className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <div className="text-sm font-medium text-gray-700 mb-1">
                                          Observações da visita:
                                        </div>
                                        <div className="text-sm text-gray-600 italic whitespace-pre-line">
                                          {visit.notes}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {visit.cancellationRequestReason && (
                                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 mb-3">
                                    <div className="flex items-start">
                                      <MessageSquare className="h-4 w-4 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <div className="text-sm font-medium text-yellow-800 mb-1">
                                          Motivo do cancelamento solicitado:
                                        </div>
                                        <div className="text-sm text-yellow-700 italic">
                                          "{visit.cancellationRequestReason}"
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {visit.status === "cancelamento_solicitado" && (
                                <div className="flex flex-col sm:flex-row gap-2 mt-3 lg:ml-4">
                                  <button
                                    onClick={() =>
                                      handleOpenApproval(visit, "approve")
                                    }
                                    className="flex-1 sm:flex-none px-3 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-colors font-medium flex items-center justify-center text-sm"
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    <span className="hidden sm:inline">
                                      Aprovar
                                    </span>
                                    <span className="sm:hidden">✓</span>
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleOpenApproval(visit, "reject")
                                    }
                                    className="flex-1 sm:flex-none px-3 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-colors font-medium flex items-center justify-center text-sm"
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    <span className="hidden sm:inline">
                                      Rejeitar
                                    </span>
                                    <span className="sm:hidden">✕</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderCancellationsTab = () => (
    <div className="space-y-4">
      {pendingRequests.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhuma solicitação pendente
          </h3>
          <p className="text-gray-600">
            Todas as solicitações de cancelamento foram processadas
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Solicitações Pendentes ({pendingRequests.length})
            </h3>
          </div>

          {pendingRequests.map((request) => (
            <div
              key={request.id}
              className="bg-white rounded-2xl shadow-sm border border-red-200 p-4 lg:p-6"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-3 lg:space-y-0">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-3">
                    <div className="font-semibold text-gray-900 mb-1 sm:mb-0">
                      {request.clientName}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 w-fit">
                        Cancelamento Solicitado
                      </span>
                      {isVisitOverdue(request) && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 flex items-center">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Atrasada {getOverdueDays(request.scheduledDate)}{" "}
                          {getOverdueDays(request.scheduledDate) === 1
                            ? "dia"
                            : "dias"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 mb-3">
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        {formatSafeDateTime(
                          request.scheduledDate,
                          request.scheduledTime,
                        )}
                      </div>
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2" />
                        Cobrador: {getCollectorName(request.collectorId)}
                      </div>
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 mr-2" />
                        {request.clientAddress}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {request.totalPendingValue && (
                        <div className="flex items-center">
                          <DollarSign className="h-4 w-4 mr-2" />
                          Pendente: {formatCurrency(request.totalPendingValue)}
                        </div>
                      )}
                      {request.cancellationRequestDate && (
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2" />
                          Solicitado em:{" "}
                          {formatSafeDate(request.cancellationRequestDate)}
                        </div>
                      )}
                    </div>
                  </div>

                  {request.cancellationRequestReason && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-3 mb-3">
                      <div className="flex items-start">
                        <MessageSquare className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-1">
                            Motivo do cancelamento:
                          </div>
                          <div className="text-sm text-gray-600 italic">
                            "{request.cancellationRequestReason}"
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {request.notes && (
                    <div className="text-sm text-gray-500 italic mb-3 whitespace-pre-line">
                      Observações da visita: {request.notes}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mt-3 lg:ml-4">
                  <button
                    onClick={() => handleOpenApproval(request, "approve")}
                    className="flex-1 sm:flex-none px-3 lg:px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-colors font-medium flex items-center justify-center text-sm"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Aprovar</span>
                    <span className="sm:hidden">✓ Aprovar</span>
                  </button>
                  <button
                    onClick={() => handleOpenApproval(request, "reject")}
                    className="flex-1 sm:flex-none px-3 lg:px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-colors font-medium flex items-center justify-center text-sm"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Rejeitar</span>
                    <span className="sm:hidden">✕ Rejeitar</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderHistoryTab = () => {
    // Obter histórico de todas as visitas finalizadas dos últimos 30 dias
    const getHistoryVisits = () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      return scheduledVisits.filter((visit) => {
        // Incluir visitas finalizadas (não agendadas)
        if (visit.status === "agendada") return false;

        try {
          const updatedDate = visit.updatedAt
            ? parseDateString(visit.updatedAt.split("T")[0]) // Assuming updatedAt is ISO string
            : parseDateString(visit.createdAt.split("T")[0]); // Assuming createdAt is ISO string

          if (!updatedDate) return false; // Handle invalid date

          return updatedDate >= thirtyDaysAgo;
        } catch {
          return false;
        }
      });
    };

    // Agrupar por cobrador
    const getHistoryByCollector = () => {
      const historyVisits = getHistoryVisits();
      const grouped: { [key: string]: ScheduledVisit[] } = {};

      historyVisits.forEach((visit) => {
        if (!grouped[visit.collectorId]) {
          grouped[visit.collectorId] = [];
        }
        grouped[visit.collectorId].push(visit);
      });

      // Ordenar as visitas dentro de cada grupo por data de atualização (mais recentes primeiro)
      Object.keys(grouped).forEach((collectorId) => {
        grouped[collectorId].sort((a, b) => {
          const dateA = parseDateString(
            (a.updatedAt || a.createdAt).split("T")[0],
          );
          const dateB = parseDateString(
            (b.updatedAt || b.createdAt).split("T")[0],
          );

          if (!dateA || !dateB) return 0; // Handle invalid dates

          return dateB.getTime() - dateA.getTime();
        });
      });

      return grouped;
    };

    const historyGrouped = getHistoryByCollector();
    const totalHistoryVisits = Object.values(historyGrouped).reduce(
      (sum, visits) => sum + visits.length,
      0,
    );

    return (
      <div className="space-y-4">
        {totalHistoryVisits === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhuma visita finalizada
            </h3>
            <p className="text-gray-600">
              O histórico dos últimos 30 dias aparecerá aqui conforme as visitas
              forem finalizadas
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Histórico dos últimos 30 dias ({totalHistoryVisits}{" "}
                {totalHistoryVisits === 1 ? "visita" : "visitas"})
              </h3>
            </div>

            {Object.entries(historyGrouped).map(([collectorId, visits]) => {
              const collectorName = getCollectorName(collectorId);
              const isExpanded = expandedCollectors.has(
                `history_${collectorId}`,
              );

              return (
                <div
                  key={`history_${collectorId}`}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200"
                >
                  {/* Header do cobrador */}
                  <div
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      const newExpanded = new Set(expandedCollectors);
                      const key = `history_${collectorId}`;
                      if (newExpanded.has(key)) {
                        newExpanded.delete(key);
                      } else {
                        newExpanded.add(key);
                      }
                      setExpandedCollectors(newExpanded);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="h-12 w-12 rounded-full flex items-center justify-center mr-4 bg-gray-100">
                          <User className="h-6 w-6 text-gray-600" />
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900">
                            {collectorName}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {visits.length}{" "}
                            {visits.length === 1 ? "visita" : "visitas"}{" "}
                            finalizadas
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">
                          {visits.length}
                        </div>
                        <div className="text-sm text-gray-600">Histórico</div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-600 ml-4" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-600 ml-4" />
                      )}
                    </div>
                  </div>

                  {/* Lista de visitas do histórico */}
                  {isExpanded && (
                    <div className="p-6 pt-0 space-y-4">
                      {visits.map((visit) => {
                        const isCancellation =
                          visit.cancellationApprovedBy ||
                          visit.cancellationRejectedBy;

                        return (
                          <div
                            key={visit.id}
                            className="p-4 rounded-2xl border border-gray-200 bg-gray-50 transition-all duration-200 hover:shadow-md"
                          >
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-3 lg:space-y-0">
                              <div className="flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-3">
                                  <div className="font-semibold text-gray-900 mb-1 sm:mb-0">
                                    {visit.clientName}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {getStatusBadge(visit.status)}
                                    {isCancellation &&
                                      visit.status === "cancelada" && (
                                        <span className="px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                                          Cancelamento Aprovado
                                        </span>
                                      )}
                                    {isCancellation &&
                                      visit.status === "agendada" &&
                                      visit.cancellationRejectedBy && (
                                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                          Cancelamento Rejeitado
                                        </span>
                                      )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 mb-3">
                                  <div className="flex items-center">
                                    <MapPin className="h-4 w-4 mr-2" />
                                    {visit.clientAddress}
                                    {visit.clientNeighborhood &&
                                      `, ${visit.clientNeighborhood}`}
                                    {visit.clientCity &&
                                      `, ${visit.clientCity}`}
                                  </div>

                                  <div className="space-y-2">
                                    {visit.totalPendingValue && (
                                      <div className="flex items-center">
                                        <DollarSign className="h-4 w-4 mr-2" />
                                        Pendente:{" "}
                                        {formatCurrency(
                                          visit.totalPendingValue,
                                        )}
                                      </div>
                                    )}
                                    {visit.updatedAt && (
                                      <div className="flex items-center">
                                        <Clock className="h-4 w-4 mr-2" />
                                        Finalizada em:{" "}
                                        {formatSafeDate(
                                          visit.updatedAt.split("T")[0],
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {visit.notes && (
                                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-3">
                                    <div className="flex items-start">
                                      <MessageSquare className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <div className="text-sm font-medium text-gray-700 mb-1">
                                          Observações da visita:
                                        </div>
                                        <div className="text-sm text-gray-600 italic whitespace-pre-line">
                                          {visit.notes}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {visit.cancellationRequestReason && (
                                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 mb-3">
                                    <div className="flex items-start">
                                      <MessageSquare className="h-4 w-4 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <div className="text-sm font-medium text-orange-800 mb-1">
                                          Motivo da solicitação de cancelamento:
                                        </div>
                                        <div className="text-sm text-orange-700 italic">
                                          "{visit.cancellationRequestReason}"
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {visit.cancellationRejectedBy &&
                                  visit.cancellationRejectionReason && (
                                    <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-3">
                                      <div className="flex items-start">
                                        <XCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                                        <div>
                                          <div className="text-sm font-medium text-red-700 mb-1">
                                            Motivo da rejeição do cancelamento:
                                          </div>
                                          <div className="text-sm text-red-600 italic">
                                            "{visit.cancellationRejectionReason}
                                            "
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    try {
      const totalVisits = scheduledVisits.length;
      const agendadas = scheduledVisits.filter(
        (v) => v.status === "agendada",
      ).length;
      const realizadas = scheduledVisits.filter(
        (v) => v.status === "realizada",
      ).length;
      const canceladas = scheduledVisits.filter(
        (v) => v.status === "cancelada",
      ).length;
      const atrasadas = scheduledVisits.filter((v) => isVisitOverdue(v)).length;
      const pendingRequests = getPendingCancellationRequests().length;

      return {
        totalVisits,
        agendadas,
        realizadas,
        canceladas,
        atrasadas,
        pendingRequests,
      };
    } catch (error) {
      console.error("Error calculating overview stats:", error);
      return {
        totalVisits: 0,
        agendadas: 0,
        realizadas: 0,
        canceladas: 0,
        atrasadas: 0,
        pendingRequests: 0,
      };
    }
  }, [scheduledVisits, getPendingCancellationRequests]);

  return (
    <>
      <div className="space-y-6">
        {/* Header + Navegação Combinados */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                Acompanhamento de Visitas
              </h2>
              <p className="text-sm text-gray-600 mt-1 hidden sm:block">
                Gerencie visitas e cancelamentos
              </p>
            </div>

            {/* Ação de Fechar */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Navegação por Tabs - Desktop com texto, Mobile apenas ícones */}
          <div className="grid grid-cols-3 sm:flex gap-2">
            <button
              onClick={() => setActiveTab("visits")}
              className={`flex items-center justify-center px-4 py-3 sm:py-2 rounded-2xl text-sm font-medium transition-colors ${
                activeTab === "visits"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              title="Visitas"
            >
              <Calendar className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Visitas</span>
            </button>
            <button
              onClick={() => setActiveTab("cancellations")}
              className={`flex items-center justify-center px-4 py-3 sm:py-2 rounded-2xl text-sm font-medium transition-colors relative ${
                activeTab === "cancellations"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              title="Cancelamentos"
            >
              <AlertTriangle className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Cancelamentos</span>
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium sm:static sm:ml-2 sm:h-auto sm:w-auto sm:px-2 sm:py-0.5 sm:bg-red-100 sm:text-red-800">
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center justify-center px-4 py-3 sm:py-2 rounded-2xl text-sm font-medium transition-colors ${
                activeTab === "history"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              title="Histórico"
            >
              <Clock className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Histórico</span>
            </button>
            {user?.type === "manager" && (
              <button
                onClick={() => setActiveTab("scheduledDates")}
                className={`flex items-center justify-center px-4 py-3 sm:py-2 rounded-2xl text-sm font-medium transition-colors ${
                  activeTab === "scheduledDates"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                title="Datas Programadas"
              >
                <CalendarClock className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Datas Programadas</span>
              </button>
            )}
          </div>
        </div>

        {/* Card Principal - Visitas Agendadas */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">
                Visitas Agendadas
              </p>
              <p className="text-4xl font-bold mt-1">
                {overviewStats.agendadas}
              </p>
              {overviewStats.atrasadas > 0 && (
                <p className="text-red-200 text-sm mt-2 flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {overviewStats.atrasadas} atrasada
                  {overviewStats.atrasadas !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <Calendar className="h-16 w-16 text-blue-200 opacity-50" />
          </div>

          {/* Métricas secundárias */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-blue-400">
            <div>
              <p className="text-blue-100 text-xs">Total</p>
              <p className="text-2xl font-semibold">
                {overviewStats.totalVisits}
              </p>
            </div>
            <div>
              <p className="text-blue-100 text-xs">Realizadas</p>
              <p className="text-2xl font-semibold">
                {overviewStats.realizadas}
              </p>
            </div>
            <div>
              <p className="text-blue-100 text-xs">Pendências</p>
              <p className="text-2xl font-semibold">
                {overviewStats.pendingRequests}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-6">
            {activeTab === "visits" && renderVisitsTab()}
            {activeTab === "cancellations" && renderCancellationsTab()}
            {activeTab === "history" && renderHistoryTab()}
            {activeTab === "scheduledDates" && <AllowedVisitDatesManager />}
          </div>
        </div>
      </div>

      {/* Modal de Confirmação para Cancelamentos */}
      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {approvalAction === "approve" ? "Aprovar" : "Rejeitar"}{" "}
                Cancelamento
              </h3>
            </div>

            <div className="px-6 py-4">
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Cliente:</strong> {selectedRequest.clientName}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Data:</strong>{" "}
                  {formatSafeDateTime(
                    selectedRequest.scheduledDate,
                    selectedRequest.scheduledTime,
                  )}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Cobrador:</strong>{" "}
                  {getCollectorName(selectedRequest.collectorId)}
                </div>
              </div>

              {selectedRequest.cancellationRequestReason && (
                <div className="mb-4 p-3 bg-gray-50 rounded-2xl">
                  <div className="text-sm font-medium text-gray-700 mb-1">
                    Motivo solicitado:
                  </div>
                  <div className="text-sm text-gray-600 italic">
                    "{selectedRequest.cancellationRequestReason}"
                  </div>
                </div>
              )}

              {approvalAction === "reject" && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo da rejeição *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explique por que está rejeitando esta solicitação..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    required
                  />
                </div>
              )}

              <div
                className={`border rounded-2xl p-3 mb-4 ${
                  approvalAction === "approve"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-start">
                  {approvalAction === "approve" ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  )}
                  <div
                    className={`text-sm ${
                      approvalAction === "approve"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {approvalAction === "approve" ? (
                      <>
                        <strong>Confirmar aprovação:</strong> A visita será
                        cancelada e o cobrador será notificado.
                      </>
                    ) : (
                      <>
                        <strong>Confirmar rejeição:</strong> A visita
                        permanecerá agendada e o cobrador será notificado da
                        rejeição.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 lg:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                onClick={handleCloseApproval}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={
                  loading ||
                  (approvalAction === "reject" && !rejectionReason.trim())
                }
                className={`w-full sm:w-auto px-4 py-2 rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
                  approvalAction === "approve"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                ) : approvalAction === "approve" ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                {loading
                  ? "Processando..."
                  : approvalAction === "approve"
                    ? "Aprovar"
                    : "Rejeitar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduler Modal */}
      {showSchedulerModal && selectedCollectorForScheduler && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowSchedulerModal(false);
            setSelectedCollectorForScheduler(null);
          }}
        >
          <div
            className="rounded-2xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-y-auto minimal-scrollbar pr-4"
            onClick={(e) => e.stopPropagation()}
          >
            <VisitScheduler
              collectorId={selectedCollectorForScheduler}
              onClose={() => {
                setShowSchedulerModal(false);
                setSelectedCollectorForScheduler(null);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default VisitTracking;
