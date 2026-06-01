import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  CalendarClock,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  User,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  FileDown,
  Zap,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import * as XLSX from "xlsx";
import { useAuth } from "../../contexts/AuthContext";
import { ScheduledVisit } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import VisitScheduler from "./VisitScheduler"; // Import the VisitScheduler component
import AllowedVisitDatesManager from "./AllowedVisitDatesManager"; // Import the AllowedVisitDatesManager component

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
    collections, // Add collections from context
  } = useCollection();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "visits" | "cancellations" | "scheduledDates"
  >("visits");
  const [selectedCollector, setSelectedCollector] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>("all");
  const [showCityStats, setShowCityStats] = useState(false);

  // Get available cities and neighborhoods from scheduled visits
  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    scheduledVisits.forEach((v) => {
      if (v.clientCity) cities.add(v.clientCity);
    });
    return Array.from(cities).sort();
  }, [scheduledVisits]);

  const availableNeighborhoods = useMemo(() => {
    const neighborhoods = new Set<string>();
    scheduledVisits.forEach((v) => {
      const cityMatch = cityFilter === "all" || v.clientCity === cityFilter;
      if (cityMatch && v.clientNeighborhood) {
        neighborhoods.add(v.clientNeighborhood);
      }
    });
    return Array.from(neighborhoods).sort();
  }, [scheduledVisits, cityFilter]);

  // Calculate city statistics
  const cityStats = useMemo(() => {
    const stats: Record<
      string,
      { totalClients: number; scheduledVisits: number }
    > = {};

    // Count total unique clients per city from collections
    const clientsByCity = new Map<string, Set<string>>();
    collections.forEach((c) => {
      if (c.cidade && c.documento) {
        if (!clientsByCity.has(c.cidade)) {
          clientsByCity.set(c.cidade, new Set());
        }
        clientsByCity.get(c.cidade)?.add(c.documento);
      }
    });

    clientsByCity.forEach((clients, city) => {
      stats[city] = { totalClients: clients.size, scheduledVisits: 0 };
    });

    // Count scheduled visits per city
    scheduledVisits.forEach((v) => {
      if (v.clientCity && v.status === "agendada") {
        if (!stats[v.clientCity]) {
          stats[v.clientCity] = { totalClients: 0, scheduledVisits: 0 };
        }
        stats[v.clientCity].scheduledVisits++;
      }
    });

    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalClients - a.totalClients);
  }, [collections, scheduledVisits]);

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
  const [collectorPages, setCollectorPages] = useState<Record<string, number>>(
    {},
  );
  const [visitsPerPage, setVisitsPerPage] = useState(5);
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
    const anyModalOpen = showSchedulerModal || showApprovalModal;

    if (anyModalOpen) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [showSchedulerModal, showApprovalModal]);

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

  const filteredVisitsFlat = useMemo(() => {
    return scheduledVisits.filter((visit) => {
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

      // Filtro por cidade
      if (cityFilter !== "all" && visit.clientCity !== cityFilter) return false;

      // Filtro por bairro
      if (
        neighborhoodFilter !== "all" &&
        visit.clientNeighborhood !== neighborhoodFilter
      )
        return false;

      // Filtro por atraso
      if (overdueFilter !== "all") {
        const isOverdue = isVisitOverdue(visit);
        if (overdueFilter === "overdue" && !isOverdue) return false;
        if (overdueFilter === "not_overdue" && isOverdue) return false;
      }

      // Filtro por busca de cliente
      if (searchFilter.trim()) {
        const searchTerm = searchFilter.toLowerCase().trim();
        const clientName = visit.clientName?.toLowerCase() || "";
        const clientDocument = visit.clientDocument?.toLowerCase() || "";
        const clientAddress = visit.clientAddress?.toLowerCase() || "";
        const visitNotes = visit.notes?.toLowerCase() || "";

        if (
          !clientName.includes(searchTerm) &&
          !clientDocument.includes(searchTerm) &&
          !clientAddress.includes(searchTerm) &&
          !visitNotes.includes(searchTerm)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    scheduledVisits,
    selectedCollector,
    statusFilter,
    dateFromFilter,
    dateToFilter,
    overdueFilter,
    searchFilter,
  ]);

  // Agrupa visitas por cobrador com filtros avançados
  const getVisitsByCollectorGrouped = () => {
    const grouped: { [key: string]: ScheduledVisit[] } = {};

    if (selectedCollector !== "all") {
      grouped[selectedCollector] = [];
    } else {
      collectors.forEach((collector) => {
        grouped[collector.id] = [];
      });
    }

    filteredVisitsFlat.forEach((visit) => {
      if (grouped[visit.collectorId]) {
        grouped[visit.collectorId].push(visit);
      }
    });

    Object.keys(grouped).forEach((collectorId) => {
      grouped[collectorId].sort((a, b) => {
        const dateA = parseDateString(a.scheduledDate);
        const dateB = parseDateString(b.scheduledDate);

        if (!dateA || !dateB) return 0;

        return dateB.getTime() - dateA.getTime();
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
    setSearchFilter("");
    setOverdueFilter("all");
    setCityFilter("all");
    setNeighborhoodFilter("all");
  };

  const handleVisitsPerPageChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const newSize = parseInt(e.target.value, 10);
    setVisitsPerPage(newSize);
    setCollectorPages({}); // Reset all collector pages
  };

  // Função para contar filtros ativos
  const getActiveFiltersCount = () => {
    let count = 0;
    if (selectedCollector !== "all") count++;
    if (statusFilter !== "all") count++;
    if (dateFromFilter) count++;
    if (dateToFilter) count++;
    if (searchFilter.trim()) count++;
    if (overdueFilter !== "all") count++;
    if (cityFilter !== "all") count++;
    if (neighborhoodFilter !== "all") count++;
    return count;
  };

  const toggleCollectorExpansion = (collectorId: string) => {
    const newExpanded = new Set(expandedCollectors);
    if (newExpanded.has(collectorId)) {
      newExpanded.delete(collectorId);
    } else {
      newExpanded.add(collectorId);
      setCollectorPages((prev) => ({ ...prev, [collectorId]: 1 }));
    }
    setExpandedCollectors(newExpanded);
  };

  const getStatusLabel = (status: ScheduledVisit["status"]) => {
    const statusConfig = {
      agendada: "Agendada",
      realizada: "Realizada",
      cancelada: "Cancelada",
      nao_encontrado: "Não Encontrado",
      cancelamento_solicitado: "Cancelamento Solicitado",
      pending_sync: "Pendente",
      reagendada: "Reagendada",
    };
    return statusConfig[status] || "Agendada";
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
      reagendada: {
        bg: "bg-orange-100",
        text: "text-orange-800",
        label: "Reagendada",
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

  const handleExportToExcel = () => {
    const dataToExport = filteredVisitsFlat.map((visit) => ({
      Cobrador: getCollectorName(visit.collectorId),
      Cliente: visit.clientName,
      Documento: visit.clientDocument,
      Endereço: `${visit.clientAddress}${visit.clientNumber ? `, ${visit.clientNumber}` : ""}, ${visit.clientNeighborhood}, ${visit.clientCity}`,
      "Data Agendada": formatSafeDate(visit.scheduledDate),
      "Hora Agendada": visit.scheduledTime || "N/A",
      Status: getStatusLabel(visit.status),
      "Valor Pendente": visit.totalPendingValue
        ? formatCurrency(visit.totalPendingValue)
        : "N/A",
      Atrasada: isVisitOverdue(visit) ? "Sim" : "Não",
      "Dias de Atraso": isVisitOverdue(visit)
        ? getOverdueDays(visit.scheduledDate)
        : 0,
      Observações: visit.notes,
      "Motivo Cancelamento": visit.cancellationRequestReason,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Visitas");

    // Auto-dimensionar colunas
    const cols = Object.keys(dataToExport[0] || {});
    const colWidths = cols.map((col) => {
      const maxLength = Math.max(
        ...dataToExport.map((row) =>
          (row as any)[col] ? String((row as any)[col]).length : 0,
        ),
        col.length, // Include header length
      );
      return { wch: maxLength + 2 }; // Add extra padding
    });
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, "relatorio_visitas.xlsx");
  };

  const renderVisitsTab = () => {
    const groupedVisits = getVisitsByCollectorGrouped();
    const activeFiltersCount = getActiveFiltersCount();

    return (
      <div className="space-y-4">
        {/* Filtros — Estilo Moderno */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-black text-gray-900 dark:text-dark-text uppercase tracking-widest">
                  Filtros e Ferramentas
                </h3>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-dark-text transition-colors"
                  >
                    Limpar Tudo
                  </button>
                )}
                <button
                  onClick={handleExportToExcel}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-green-100 dark:shadow-none"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Exportar CSV
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2.5 rounded-xl transition-all border ${
                    showFilters || activeFiltersCount > 0
                      ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100 dark:shadow-none"
                      : "bg-gray-50 dark:bg-dark-bg text-gray-400 border-gray-100 dark:border-dark-border hover:bg-gray-100"
                  }`}
                >
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Busca Principal */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="BUSCAR POR CLIENTE, DOCUMENTO OU ENDEREÇO..."
                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-xs font-bold dark:text-dark-text placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase"
              />
            </div>

            {/* Filtros Avançados Colapsáveis */}
            {showFilters && (
              <div className="mt-6 pt-6 border-t border-gray-50 dark:border-dark-border animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Cobrador</label>
                    <select
                      value={selectedCollector}
                      onChange={(e) => setSelectedCollector(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500 uppercase tracking-tighter"
                    >
                      <option value="all">TODOS OS COBRADORES</option>
                      {collectors.map((collector) => (
                        <option key={collector.id} value={collector.id}>
                          {collector.name.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500 uppercase tracking-tighter"
                    >
                      <option value="all">TODOS OS STATUS</option>
                      <option value="agendada">AGENDADA</option>
                      <option value="realizada">REALIZADA</option>
                      <option value="cancelada">CANCELADA</option>
                      <option value="nao_encontrado">NÃO ENCONTRADO</option>
                      <option value="reagendada">REAGENDADA</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Atraso</label>
                    <select
                      value={overdueFilter}
                      onChange={(e) => setOverdueFilter(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500 uppercase tracking-tighter"
                    >
                      <option value="all">TODAS</option>
                      <option value="overdue">SOMENTE ATRASADAS</option>
                      <option value="not_overdue">SOMENTE EM DIA</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Cidade</label>
                    <select
                      value={cityFilter}
                      onChange={(e) => {
                        setCityFilter(e.target.value);
                        setNeighborhoodFilter("all");
                      }}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500 uppercase tracking-tighter"
                    >
                      <option value="all">TODAS AS CIDADES</option>
                      {availableCities.map((city) => (
                        <option key={city} value={city}>
                          {city.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Bairro</label>
                    <select
                      value={neighborhoodFilter}
                      onChange={(e) => setNeighborhoodFilter(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500 uppercase tracking-tighter"
                    >
                      <option value="all">TODOS OS BAIRROS</option>
                      {availableNeighborhoods.map((neighborhood) => (
                        <option key={neighborhood} value={neighborhood}>
                          {neighborhood.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Início</label>
                    <input
                      type="date"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Fim</label>
                    <input
                      type="date"
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Registros</label>
                    <select
                      value={visitsPerPage}
                      onChange={handleVisitsPerPageChange}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-[11px] font-black dark:text-dark-text focus:ring-2 focus:ring-blue-500 uppercase tracking-tighter"
                    >
                      <option value={5}>5 POR PÁGINA</option>
                      <option value={10}>10 POR PÁGINA</option>
                      <option value={50}>50 POR PÁGINA</option>
                      <option value={100}>100 POR PÁGINA</option>
                    </select>
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
                  className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden"
                >
                  {/* Header do cobrador — Estilo Refinado */}
                  <div
                    className="p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors flex items-center justify-between"
                    onClick={() => toggleCollectorExpansion(collectorId)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-900/30">
                        <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-dark-text uppercase tracking-tight">
                          {collectorName}
                        </h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                          {visits.length} {visits.length === 1 ? "Visita Programada" : "Visitas Programadas"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {user?.type === "manager" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCollectorForScheduler(collectorId);
                            setShowSchedulerModal(true);
                          }}
                          className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-100 dark:shadow-none"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Nova Visita
                        </button>
                      )}
                      <div className="bg-gray-50 dark:bg-dark-bg p-2 rounded-xl border border-gray-100 dark:border-dark-border">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Área Expandida — Tabela e Cards */}
                  {isExpanded && (
                    <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-4 duration-300">
                      {visits.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg rounded-2xl border border-dashed border-gray-200 dark:border-dark-border">
                          <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            Nenhuma visita para este cobrador
                          </p>
                        </div>
                      ) : (
                        (() => {
                          const currentPage = collectorPages[collectorId] || 1;
                          const totalPages = Math.ceil(visits.length / visitsPerPage);
                          const paginatedVisits = visits.slice((currentPage - 1) * visitsPerPage, currentPage * visitsPerPage);
                          const startItemCollector = (currentPage - 1) * visitsPerPage + 1;
                          const endItemCollector = Math.min(currentPage * visitsPerPage, visits.length);

                          return (
                            <div className="space-y-6">
                              {/* Visualização em Tabela (Desktop) */}
                              <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-gray-100 dark:border-dark-border">
                                      <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente / Documento</th>
                                      <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Agendamento</th>
                                      <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Localização</th>
                                      <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status / Valor</th>
                                      <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                                    {paginatedVisits.map((visit) => {
                                      const isOverdue = isVisitOverdue(visit);
                                      return (
                                        <tr key={visit.id} className={`group hover:bg-gray-50/50 dark:hover:bg-dark-bg/30 transition-colors ${isOverdue ? 'bg-red-50/20' : ''}`}>
                                          <td className="py-4 pr-4">
                                            <div className="flex flex-col">
                                              <span className="text-xs font-black text-gray-900 dark:text-dark-text uppercase">{visit.clientName}</span>
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{visit.clientDocument}</span>
                                            </div>
                                          </td>
                                          <td className="py-4 pr-4">
                                            <div className="flex flex-col">
                                              <div className="flex items-center text-[11px] font-bold text-gray-700 dark:text-dark-text-secondary">
                                                <Calendar className="h-3 w-3 mr-1.5 text-blue-500" />
                                                {formatSafeDate(visit.scheduledDate)}
                                              </div>
                                              <div className="flex items-center text-[10px] font-bold text-gray-400 mt-1">
                                                <Clock className="h-3 w-3 mr-1.5" />
                                                {visit.scheduledTime || "00:00"}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-4 pr-4">
                                            <div className="flex items-center text-[11px] font-bold text-gray-600 dark:text-dark-text-secondary max-w-[200px]">
                                              <MapPin className="h-3.5 w-3.5 mr-1.5 text-gray-400 shrink-0" />
                                              <span className="truncate uppercase">
                                                {visit.clientNeighborhood}, {visit.clientCity}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="py-4 pr-4">
                                            <div className="flex flex-col gap-2">
                                              {getStatusBadge(visit.status)}
                                              {visit.totalPendingValue && (
                                                <span className="text-[10px] font-black text-red-600 dark:text-red-400 tracking-tight">
                                                  {formatCurrency(visit.totalPendingValue)}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-4 text-right">
                                            {visit.status === "cancelamento_solicitado" && (
                                              <div className="flex items-center justify-end gap-2">
                                                <button
                                                  onClick={() => handleOpenApproval(visit, "approve")}
                                                  className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 transition-all"
                                                  title="Aprovar"
                                                >
                                                  <CheckCircle className="h-4 w-4" />
                                                </button>
                                                <button
                                                  onClick={() => handleOpenApproval(visit, "reject")}
                                                  className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 transition-all"
                                                  title="Rejeitar"
                                                >
                                                  <XCircle className="h-4 w-4" />
                                                </button>
                                              </div>
                                            )}
                                            {isOverdue && (
                                              <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-black uppercase">
                                                Atrasada
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Visualização em Cards (Mobile) */}
                              <div className="md:hidden space-y-4">
                                {paginatedVisits.map((visit) => {
                                  const isOverdue = isVisitOverdue(visit);
                                  return (
                                    <div key={visit.id} className={`p-4 rounded-2xl border transition-all ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-dark-bg/50'}`}>
                                      <div className="flex justify-between items-start mb-3">
                                        <div className="min-w-0">
                                          <h4 className="text-xs font-black text-gray-900 dark:text-dark-text truncate uppercase tracking-tight">{visit.clientName}</h4>
                                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">{visit.clientDocument}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                          {visit.totalPendingValue && (
                                            <p className="text-xs font-black text-red-600 dark:text-red-400">{formatCurrency(visit.totalPendingValue)}</p>
                                          )}
                                          {getStatusBadge(visit.status)}
                                        </div>
                                      </div>

                                      <div className="space-y-2 mb-4">
                                        <div className="flex items-center text-[10px] font-bold text-gray-600 dark:text-dark-text-secondary">
                                          <Calendar className="h-3 w-3 mr-2 text-blue-500" />
                                          {formatSafeDate(visit.scheduledDate)} {visit.scheduledTime && `ÀS ${visit.scheduledTime}`}
                                        </div>
                                        <div className="flex items-center text-[10px] font-bold text-gray-500 dark:text-dark-text-secondary">
                                          <MapPin className="h-3 w-3 mr-2" />
                                          <span className="truncate uppercase">{visit.clientNeighborhood}, {visit.clientCity}</span>
                                        </div>
                                      </div>

                                      {visit.status === "cancelamento_solicitado" && (
                                        <div className="flex gap-2 border-t border-gray-100 dark:border-dark-border pt-3 mt-3">
                                          <button
                                            onClick={() => handleOpenApproval(visit, "approve")}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                                          >
                                            <CheckCircle className="h-3.5 w-3.5" /> Aprovar
                                          </button>
                                          <button
                                            onClick={() => handleOpenApproval(visit, "reject")}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> Rejeitar
                                          </button>
                                        </div>
                                      )}
                                      
                                      {isOverdue && (
                                        <div className="mt-2 text-center py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-black uppercase rounded-lg">
                                          Visita Atrasada — {getOverdueDays(visit.scheduledDate)} Dias
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Paginação — Estilo Dashboard */}
                              {totalPages > 1 && (
                                <div className="bg-gray-900 dark:bg-dark-bg-secondary mt-6 border border-gray-800 dark:border-dark-border px-6 py-4 rounded-2xl shadow-lg">
                                  <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                                    <div className="flex items-center gap-3">
                                      <div className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-600/30">
                                        Pág {currentPage} / {totalPages}
                                      </div>
                                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                        Exibindo {startItemCollector}–{endItemCollector} de {visits.length}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setCollectorPages(prev => ({ ...prev, [collectorId]: Math.max(1, currentPage - 1) }))}
                                        disabled={currentPage === 1}
                                        className="p-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                      >
                                        <ChevronLeft className="h-4 w-4" />
                                      </button>
                                      <div className="flex items-center gap-1">
                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                          let pNum;
                                          if (totalPages <= 5) pNum = i + 1;
                                          else if (currentPage <= 3) pNum = i + 1;
                                          else if (currentPage >= totalPages - 2) pNum = totalPages - 4 + i;
                                          else pNum = currentPage - 2 + i;
                                          return (
                                            <button
                                              key={pNum}
                                              onClick={() => setCollectorPages(prev => ({ ...prev, [collectorId]: pNum }))}
                                              className={`w-9 h-9 flex items-center justify-center text-xs font-black rounded-xl transition-all ${
                                                pNum === currentPage
                                                  ? "bg-blue-600 text-white shadow-lg"
                                                  : "bg-white/5 text-gray-400 hover:text-white border border-white/5"
                                              }`}
                                            >
                                              {pNum}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      <button
                                        onClick={() => setCollectorPages(prev => ({ ...prev, [collectorId]: Math.min(totalPages, currentPage + 1) }))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                      >
                                        <ChevronRight className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()
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
    <div className="space-y-6">
      {pendingRequests.length === 0 ? (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-12 text-center">
          <div className="h-16 w-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100 dark:border-green-900/30">
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
          <h3 className="text-lg font-black text-gray-900 dark:text-dark-text uppercase tracking-tight mb-2">
            Nenhuma solicitação pendente
          </h3>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
            Todas as solicitações de cancelamento foram processadas
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-dark-text uppercase tracking-tight">
                Solicitações de Cancelamento
              </h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Aguardando aprovação do gerente ({pendingRequests.length})
              </p>
            </div>
          </div>

          {/* Visualização em Tabela (Desktop) */}
          <div className="hidden md:block bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-dark-bg border-b border-gray-100 dark:border-dark-border">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente / Cobrador</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Agendamento</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Motivo do Cancelamento</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {pendingRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50/50 dark:hover:bg-dark-bg transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-gray-900 dark:text-dark-text uppercase">{request.clientName}</span>
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter">Cobrador: {getCollectorName(request.collectorId)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-gray-700 dark:text-dark-text-secondary uppercase">
                          {formatSafeDate(request.scheduledDate)}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                          Solicitado em: {formatSafeDate(request.cancellationRequestDate || "")}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-lg p-2">
                        <p className="text-[10px] font-medium text-amber-800 dark:text-amber-400 italic leading-tight">
                          "{request.cancellationRequestReason || "NÃO INFORMADO"}"
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenApproval(request, "approve")}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleOpenApproval(request, "reject")}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                        >
                          Rejeitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Visualização em Cards (Mobile) */}
          <div className="md:hidden space-y-4">
            {pendingRequests.map((request) => (
              <div key={request.id} className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 overflow-hidden">
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-xs font-black text-gray-900 dark:text-dark-text uppercase tracking-tight">{request.clientName}</h4>
                      <p className="text-[10px] font-bold text-blue-500 uppercase mt-0.5">{getCollectorName(request.collectorId)}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase">
                      Pendente
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-dark-bg p-3 rounded-xl mb-4 space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Motivo do Cancelamento:</p>
                    <p className="text-[11px] font-medium text-gray-700 dark:text-dark-text-secondary italic">"{request.cancellationRequestReason}"</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenApproval(request, "approve")}
                      className="flex-1 py-2 bg-green-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleOpenApproval(request, "reject")}
                      className="flex-1 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                    >
                      Rejeitar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    try {
      const totalVisits = filteredVisitsFlat.filter(
        (v) => v.status !== "reagendada",
      ).length;
      const agendadas = filteredVisitsFlat.filter(
        (v) => v.status === "agendada",
      ).length;
      const realizadas = filteredVisitsFlat.filter(
        (v) => v.status === "realizada",
      ).length;
      const canceladas = filteredVisitsFlat.filter(
        (v) => v.status === "cancelada",
      ).length;
      const atrasadas = filteredVisitsFlat.filter((v) =>
        isVisitOverdue(v),
      ).length;
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
  }, [filteredVisitsFlat, getPendingCancellationRequests]);

  return (
    <>
      <div className="space-y-6">
        {/* Header — Estilo Ranking de Performance */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-xl">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-dark-text tracking-tight uppercase">
                  Acompanhamento de Visitas
                </h2>
                <p className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mt-1">
                  Gestão estratégica de rotas e cancelamentos
                </p>
              </div>
            </div>

            {/* Ação de Fechar */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2.5 text-gray-400 hover:text-gray-900 dark:hover:text-dark-text bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl transition-all"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Navegação por Tabs — Estilo Unificado */}
          <div className="mt-8 grid grid-cols-1 sm:flex gap-2">
            <button
              onClick={() => setActiveTab("visits")}
              className={`flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === "visits"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-none"
                  : "bg-white dark:bg-dark-bg text-gray-500 dark:text-dark-text border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
              }`}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Visitas
            </button>
            <button
              onClick={() => setActiveTab("cancellations")}
              className={`flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative ${
                activeTab === "cancellations"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-none"
                  : "bg-white dark:bg-dark-bg text-gray-500 dark:text-dark-text border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
              }`}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Cancelamentos
              {pendingRequests.length > 0 && (
                <span className="ml-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0.5 rounded-md">
                  {pendingRequests.length}
                </span>
              )}
            </button>

            {user?.type === "manager" && (
              <button
                onClick={() => setActiveTab("scheduledDates")}
                className={`flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeTab === "scheduledDates"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-none"
                    : "bg-white dark:bg-dark-bg text-gray-500 dark:text-dark-text border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
                }`}
              >
                <CalendarClock className="h-4 w-4 mr-2" />
                Datas Programadas
              </button>
            )}
          </div>
        </div>

        {/* Card Principal — Taxa e Resumo */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white rounded-2xl shadow-xl p-8 relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-blue-100 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                  Fluxo de Visitas Agendadas
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black tracking-tighter">
                    {overviewStats.agendadas}
                  </span>
                  <div className={`flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md ${overviewStats.atrasadas > 0 ? 'text-red-200' : 'text-green-300'}`}>
                    <Zap className="w-3 h-3 mr-1 fill-current" />
                    {overviewStats.atrasadas > 0 ? `${overviewStats.atrasadas} Atrasadas` : 'Em Dia'}
                  </div>
                </div>
              </div>
              <Calendar className="h-16 w-16 text-white opacity-20 group-hover:opacity-30 transition-opacity" />
            </div>

            {/* Métricas secundárias */}
            <div className="grid grid-cols-3 gap-8 mt-10 pt-8 border-t border-white/10">
              <div>
                <p className="text-blue-200 text-[9px] font-bold uppercase tracking-wider mb-1">Total Geral</p>
                <p className="text-2xl font-black">{overviewStats.totalVisits}</p>
              </div>
              <div>
                <p className="text-blue-200 text-[9px] font-bold uppercase tracking-wider mb-1">Realizadas</p>
                <p className="text-2xl font-black text-green-300">
                  {overviewStats.realizadas}
                </p>
              </div>
              <div>
                <p className="text-blue-200 text-[9px] font-bold uppercase tracking-wider mb-1">Solic. Cancel.</p>
                <p className="text-2xl font-black text-amber-300">
                  {overviewStats.pendingRequests}
                </p>
              </div>
            </div>
          </div>

          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
        </div>

        {/* Resumo por Cidade - Colapsável */}
        {user?.type === "manager" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowCityStats(!showCityStats)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Resumo de Clientes por Cidade
                </h3>
              </div>
              {showCityStats ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </button>

            {showCityStats && (
              <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cityStats.map((stat) => (
                    <div
                      key={stat.name}
                      className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col"
                    >
                      <span className="text-sm font-semibold text-gray-900 truncate mb-2">
                        {stat.name}
                      </span>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>Total de Clientes:</span>
                        <span className="font-bold text-gray-900">
                          {stat.totalClients}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                        <span>Visitas Agendadas:</span>
                        <span className="font-bold text-blue-600">
                          {stat.scheduledVisits}
                        </span>
                      </div>
                    </div>
                  ))}
                  {cityStats.length === 0 && (
                    <p className="text-sm text-gray-500 col-span-full text-center py-4">
                      Nenhum dado geográfico disponível.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="animate-in fade-in duration-500">
          {activeTab === "visits" && renderVisitsTab()}
          {activeTab === "cancellations" && renderCancellationsTab()}

          {activeTab === "scheduledDates" && (
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6">
              <AllowedVisitDatesManager />
            </div>
          )}
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
            className="rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto minimal-scrollbar pr-4"
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
