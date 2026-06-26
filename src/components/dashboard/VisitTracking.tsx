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
  Trash2,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import * as XLSX from "xlsx";
import { useAuth } from "../../contexts/AuthContext";
import { ScheduledVisit, isCollectorType, UserType } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import VisitScheduler from "./VisitScheduler"; // Import the VisitScheduler component
import AllowedVisitDatesManager from "./AllowedVisitDatesManager"; // Import the AllowedVisitDatesManager component
import ClearVisitsModal, {
  pendingVisitsCount,
} from "./ClearVisitsModal";

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

  // Limpar visitas pendentes de um cobrador (ex.: cobrador desativado).
  const [clearTarget, setClearTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<
    "visits" | "cancellations" | "scheduledDates"
  >("visits");
  const [selectedCollector, setSelectedCollector] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<UserType | "all">("all");
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

  const collectors = users.filter((u) => isCollectorType(u.type));
  // Tipo de cada cobrador (para o filtro por Tipo de Cobrador).
  const collectorTypeById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.type])),
    [users],
  );
  // Cobradores visíveis conforme o tipo selecionado.
  const visibleCollectors = useMemo(
    () =>
      typeFilter === "all"
        ? collectors
        : collectors.filter((c) => c.type === typeFilter),
    [collectors, typeFilter],
  );

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

      // Filtro por tipo de cobrador
      if (
        typeFilter !== "all" &&
        collectorTypeById[visit.collectorId] !== typeFilter
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
    typeFilter,
    collectorTypeById,
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
      visibleCollectors.forEach((collector) => {
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
    setTypeFilter("all");
    setStatusFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
    setSearchFilter("");
    setOverdueFilter("all");
    setCityFilter("all");
    setNeighborhoodFilter("all");
  };

  const applyQuickFilter = (type: string) => {
    const todayStr = formatDateToYYYYMMDD(new Date());

    switch (type) {
      case "today":
        setDateFromFilter(todayStr);
        setDateToFilter(todayStr);
        setStatusFilter("agendada");
        setOverdueFilter("all");
        break;
      case "overdue":
        setDateFromFilter("");
        setDateToFilter(todayStr);
        setOverdueFilter("overdue");
        setStatusFilter("agendada");
        break;
      case "pending":
        setStatusFilter("agendada");
        setOverdueFilter("not_overdue");
        break;
      case "all":
        clearAllFilters();
        break;
    }
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
    if (typeFilter !== "all") count++;
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
  // Mobile: recolhe ações/pills/painel atrás de um chevron (desktop sempre visível).
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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

    // Labels e chips de filtros ativos (mesmo padrao visual da barra global).
    const STATUS_LABELS: Record<string, string> = {
      agendada: "Agendada",
      realizada: "Realizada",
      cancelada: "Cancelada",
      nao_encontrado: "Não Encontrado",
      reagendada: "Reagendada",
    };
    const TYPE_LABELS: Record<string, string> = {
      internal_collector: "Interno",
      collector: "Externo",
      third_party_collector: "Terceirizado",
    };
    const filterChips: { label: string; onClear: () => void }[] = [];
    if (searchFilter)
      filterChips.push({
        label: `Busca: "${searchFilter}"`,
        onClear: () => setSearchFilter(""),
      });
    if (typeFilter !== "all")
      filterChips.push({
        label: `Tipo: ${TYPE_LABELS[typeFilter] ?? typeFilter}`,
        onClear: () => {
          setTypeFilter("all");
          setSelectedCollector("all");
        },
      });
    if (selectedCollector !== "all")
      filterChips.push({
        label: `Cobrador: ${
          visibleCollectors.find((c) => c.id === selectedCollector)?.name ?? ""
        }`,
        onClear: () => setSelectedCollector("all"),
      });
    if (statusFilter !== "all")
      filterChips.push({
        label: `Status: ${STATUS_LABELS[statusFilter] ?? statusFilter}`,
        onClear: () => setStatusFilter("all"),
      });
    if (overdueFilter !== "all")
      filterChips.push({
        label:
          overdueFilter === "overdue" ? "Somente atrasadas" : "Somente em dia",
        onClear: () => setOverdueFilter("all"),
      });
    if (cityFilter !== "all")
      filterChips.push({
        label: `Cidade: ${cityFilter}`,
        onClear: () => {
          setCityFilter("all");
          setNeighborhoodFilter("all");
        },
      });
    if (neighborhoodFilter !== "all")
      filterChips.push({
        label: `Bairro: ${neighborhoodFilter}`,
        onClear: () => setNeighborhoodFilter("all"),
      });
    if (dateFromFilter)
      filterChips.push({
        label: `De: ${dateFromFilter}`,
        onClear: () => setDateFromFilter(""),
      });
    if (dateToFilter)
      filterChips.push({
        label: `Até: ${dateToFilter}`,
        onClear: () => setDateToFilter(""),
      });

    const quickFilters: { key: string; label: string }[] = [
      { key: "all", label: "Todas" },
      { key: "today", label: "Hoje" },
      { key: "overdue", label: "Atrasadas" },
      { key: "pending", label: "Agendadas" },
    ];

    const typePills: { value: UserType | "all"; label: string }[] = [
      { value: "all", label: "Todos" },
      { value: "internal_collector", label: "Interno" },
      { value: "collector", label: "Externo" },
      { value: "third_party_collector", label: "Terceirizado" },
    ];

    return (
      <div className="space-y-4">
        {/* Barra de Filtros — visual unificado (igual às demais telas) */}
        <div className="bg-white dark:bg-dark-bg-secondary p-3 rounded-2xl border border-gray-150/80 dark:border-dark-border shadow-sm space-y-3">
          {/* Linha: busca + ações */}
          <div className="flex flex-row flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                id="visit-search-filter"
                name="visitSearchFilter"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Buscar por cliente, documento ou endereço..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-gray-450"
              />
            </div>

            {/* Mobile: chevron que recolhe/expande ações e filtros */}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              aria-label={mobileFiltersOpen ? "Recolher filtros" : "Expandir filtros"}
              className={`md:hidden px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 shrink-0 transition-all ${
                mobileFiltersOpen || activeFiltersCount > 0
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border"
              }`}
            >
              {activeFiltersCount > 0 && (
                <span className="text-xs font-semibold leading-none">{activeFiltersCount}</span>
              )}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Ações: no mobile aparecem só quando expandido */}
            <div className={`${mobileFiltersOpen ? "flex" : "hidden"} md:flex items-center gap-3 w-full md:w-auto`}>
              <button
                onClick={handleExportToExcel}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm whitespace-nowrap shrink-0"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Exportar</span>
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-sm font-medium transition-all border flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                  showFilters || activeFiltersCount > 0
                    ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                    : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span>
                  Filtros{activeFiltersCount > 0 && ` (${activeFiltersCount})`}
                </span>
              </button>
            </div>
          </div>

          {/* Demais filtros: no mobile ocultos até expandir; no desktop sempre visíveis */}
          <div className={`${mobileFiltersOpen ? "block" : "hidden"} md:block space-y-3`}>
          {/* Atalhos rápidos (pills) */}
          <div className="flex flex-wrap items-center gap-2">
            {quickFilters.map((q) => {
              const todayStr = formatDateToYYYYMMDD(new Date());
              const isTodayActive =
                dateFromFilter === todayStr &&
                dateToFilter === todayStr &&
                statusFilter === "agendada" &&
                overdueFilter === "all";
              const isOverdueActive =
                !dateFromFilter &&
                dateToFilter === todayStr &&
                overdueFilter === "overdue" &&
                statusFilter === "agendada";
              const isPendingActive =
                statusFilter === "agendada" && overdueFilter === "not_overdue";
              const isAnyQuickFilterActive =
                isTodayActive || isOverdueActive || isPendingActive;

              let isActive = false;
              if (q.key === "all") {
                isActive = !isAnyQuickFilterActive;
              } else if (q.key === "today") {
                isActive = isTodayActive;
              } else if (q.key === "overdue") {
                isActive = isOverdueActive;
              } else if (q.key === "pending") {
                isActive = isPendingActive;
              }

              return (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => applyQuickFilter(q.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    isActive
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                      : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                  }`}
                >
                  {q.label}
                </button>
              );
            })}

            <span className="w-px h-5 bg-gray-200 dark:bg-dark-border mx-1 hidden sm:block" />

            {typePills.map((p) => {
              const isActive = typeFilter === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setTypeFilter(p.value);
                    setSelectedCollector("all");
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    isActive
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                      : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}

            <span className="text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary ml-auto">
              {filteredVisitsFlat.length}{" "}
              {filteredVisitsFlat.length === 1 ? "registro" : "registros"}
            </span>
          </div>

          {/* Painel avançado */}
          {showFilters && (
            <div className="pt-3 border-t border-gray-100 dark:border-dark-border animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label htmlFor="type-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Tipo de Cobrador
                  </label>
                  <select
                    id="type-filter"
                    name="typeFilter"
                    value={typeFilter}
                    onChange={(e) => {
                      setTypeFilter(e.target.value as UserType | "all");
                      setSelectedCollector("all");
                    }}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  >
                    <option value="all">Todos</option>
                    <option value="internal_collector">Interno</option>
                    <option value="collector">Externo</option>
                    <option value="third_party_collector">Terceirizado</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="collector-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Cobrador
                  </label>
                  <select
                    id="collector-filter"
                    name="collectorFilter"
                    value={selectedCollector}
                    onChange={(e) => setSelectedCollector(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  >
                    <option value="all">Todos os Cobradores</option>
                    {visibleCollectors.map((collector) => (
                      <option key={collector.id} value={collector.id}>
                        {collector.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="status-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Status
                  </label>
                  <select
                    id="status-filter"
                    name="statusFilter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="agendada">Agendada</option>
                    <option value="realizada">Realizada</option>
                    <option value="cancelada">Cancelada</option>
                    <option value="nao_encontrado">Não Encontrado</option>
                    <option value="reagendada">Reagendada</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="overdue-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Atraso
                  </label>
                  <select
                    id="overdue-filter"
                    name="overdueFilter"
                    value={overdueFilter}
                    onChange={(e) => setOverdueFilter(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  >
                    <option value="all">Todas as Visitas</option>
                    <option value="overdue">Somente Atrasadas</option>
                    <option value="not_overdue">Somente em Dia</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="city-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Cidade
                  </label>
                  <select
                    id="city-filter"
                    name="cityFilter"
                    value={cityFilter}
                    onChange={(e) => {
                      setCityFilter(e.target.value);
                      setNeighborhoodFilter("all");
                    }}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  >
                    <option value="all">Todas as Cidades</option>
                    {availableCities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="neighborhood-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Bairro
                  </label>
                  <select
                    id="neighborhood-filter"
                    name="neighborhoodFilter"
                    value={neighborhoodFilter}
                    onChange={(e) => setNeighborhoodFilter(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  >
                    <option value="all">Todos os Bairros</option>
                    {availableNeighborhoods.map((neighborhood) => (
                      <option key={neighborhood} value={neighborhood}>
                        {neighborhood}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="date-from-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Início
                  </label>
                  <input
                    type="date"
                    id="date-from-filter"
                    name="dateFromFilter"
                    value={dateFromFilter}
                    onChange={(e) => setDateFromFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="date-to-filter" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Fim
                  </label>
                  <input
                    type="date"
                    id="date-to-filter"
                    name="dateToFilter"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="visits-per-page" className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Registros
                  </label>
                  <select
                    id="visits-per-page"
                    name="visitsPerPage"
                    value={visitsPerPage}
                    onChange={handleVisitsPerPageChange}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  >
                    <option value={5}>5 por Página</option>
                    <option value={10}>10 por Página</option>
                    <option value={50}>50 por Página</option>
                    <option value={100}>100 por Página</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={clearAllFilters}
                  className="text-xs font-medium text-red-500 hover:text-red-600 hover:underline transition-colors"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Chips de filtros ativos */}
        {filterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50/50 dark:bg-dark-bg/25 rounded-xl border border-gray-150/40 dark:border-dark-border/40">
            <span className="text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary pl-1.5 mr-1">
              Filtros ativos:
            </span>
            {filterChips.map((chip, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text border border-gray-200 dark:border-dark-border rounded-lg shadow-sm"
              >
                <span>{chip.label}</span>
                <button
                  onClick={chip.onClear}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-dark-bg transition-all ml-1"
                  title="Remover filtro"
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              onClick={clearAllFilters}
              className="ml-auto text-[10px] font-bold text-red-500 hover:text-red-600 hover:underline px-2 transition-colors"
            >
              Limpar Todos
            </button>
          </div>
        )}

        {/* Visit Cards */}
        {Object.keys(groupedVisits).length === 0 ? (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-8 sm:p-12 text-center">
            <Calendar className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text tracking-tight mb-2">
              Nenhum registro encontrado
            </h3>
            <p className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
              Ajuste os filtros para encontrar o que procura
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedVisits).map(([collectorId, visits]) => {
              const collectorName = getCollectorName(collectorId);
              const isExpanded = expandedCollectors.has(collectorId);

              // Calcular resumos de status para os "Color Dots"
              // Buckets mutuamente exclusivos (mesma regra do modal de limpeza):
              // agendada vencida conta como "atrasada", não como "agendada".
              const statusCounts = visits.reduce((acc, v) => {
                if (v.status === "agendada") {
                  if (isVisitOverdue(v)) {
                    acc.overdue = (acc.overdue || 0) + 1;
                  } else {
                    acc.agendada = (acc.agendada || 0) + 1;
                  }
                } else {
                  acc[v.status] = (acc[v.status] || 0) + 1;
                }
                return acc;
              }, {} as Record<string, number>);

              return (
                <div
                  key={collectorId}
                  className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden transition-all duration-300"
                >
                  {/* Linha: cabeçalho + barra de exclusão lateral (estilo Cobranças) */}
                  <div className="flex items-stretch">
                  {/* Header do cobrador — Estilo Refinado e Responsivo */}
                  <div
                    className="flex-1 min-w-0 p-4 sm:p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors flex items-center justify-between"
                    onClick={() => toggleCollectorExpansion(collectorId)}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-900/30 shrink-0">
                        <User className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-dark-text tracking-tight truncate">
                          {collectorName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary tracking-wider shrink-0">
                            {visits.length} {visits.length === 1 ? "Visita" : "Visitas"}
                          </p>
                          {/* Color Dots Summary — Novo */}
                          <div className="flex items-center gap-1.5 ml-1 border-l border-gray-100 dark:border-dark-border pl-2">
                            {statusCounts.agendada > 0 && (
                              <div className="flex items-center gap-1" title={`${statusCounts.agendada} Agendadas`}>
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                                <span className="text-[10px] font-bold text-blue-500">{statusCounts.agendada}</span>
                              </div>
                            )}
                            {statusCounts.realizada > 0 && (
                              <div className="flex items-center gap-1" title={`${statusCounts.realizada} Realizadas`}>
                                <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                                <span className="text-[10px] font-bold text-green-500">{statusCounts.realizada}</span>
                              </div>
                            )}
                            {statusCounts.overdue > 0 && (
                              <div className="flex items-center gap-1" title={`${statusCounts.overdue} Atrasadas`}>
                                <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                <span className="text-[10px] font-bold text-red-500">{statusCounts.overdue}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                      {user?.type === "manager" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCollectorForScheduler(collectorId);
                            setShowSchedulerModal(true);
                          }}
                          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-sm shrink-0"
                          title="Nova Visita"
                        >
                          <Calendar className="h-4 w-4" />
                          <span className="hidden sm:inline text-xs font-semibold">Nova Visita</span>
                        </button>
                      )}
                      <div className="bg-gray-50 dark:bg-dark-bg p-2 rounded-xl border border-gray-100 dark:border-dark-border">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                  {user?.type === "manager" &&
                    (() => {
                      const hasPending =
                        pendingVisitsCount(scheduledVisits, collectorId) > 0;
                      return (
                        <button
                          disabled={!hasPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!hasPending) return;
                            setClearTarget({
                              id: collectorId,
                              name:
                                users.find((u) => u.id === collectorId)?.name ||
                                "Cobrador",
                            });
                          }}
                          className={`flex items-center justify-center w-12 transition-colors flex-shrink-0 self-stretch ${
                            hasPending
                              ? "bg-red-500 text-white hover:bg-red-600 cursor-pointer"
                              : "bg-gray-100 dark:bg-dark-bg text-gray-300 dark:text-gray-600 cursor-not-allowed"
                          }`}
                          title={
                            hasPending
                              ? "Limpar visitas pendentes"
                              : "Nenhuma visita pendente para limpar"
                          }
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      );
                    })()}
                  </div>

                  {/* Área Expandida — Tabela e Cards */}
                  {isExpanded && (
                    <div className="px-4 sm:px-6 pb-6 animate-in fade-in slide-in-from-top-4 duration-300">
                      {visits.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg rounded-2xl border border-dashed border-gray-200 dark:border-dark-border">
                          <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">
                            Nenhuma visita encontrada
                          </p>
                        </div>
                      ) : (
                        (() => {
                          const currentPage = collectorPages[collectorId] || 1;
                          const totalPages = Math.ceil(visits.length / visitsPerPage);
                          const paginatedVisits = visits.slice((currentPage - 1) * visitsPerPage, currentPage * visitsPerPage);

                          return (
                            <div className="space-y-6">
                              {/* Visualização em Tabela (Desktop) — Refinada */}
                              <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-gray-100 dark:border-dark-border">
                                      <th className="pb-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Cliente / Documento</th>
                                      <th className="pb-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Agendamento</th>
                                      <th className="pb-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Localização</th>
                                      <th className="pb-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Status / Valor</th>
                                      <th className="pb-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide text-right">Ações</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                                    {paginatedVisits.map((visit) => {
                                      const isOverdue = isVisitOverdue(visit);
                                      return (
                                        <tr key={visit.id} className={`group hover:bg-gray-50/50 dark:hover:bg-dark-bg/30 transition-colors ${isOverdue ? 'bg-red-50/20' : ''}`}>
                                          <td className="py-4 pr-4">
                                            <div className="flex flex-col">
                                              <span className="text-sm font-semibold text-gray-900 dark:text-dark-text leading-tight">{visit.clientName}</span>
                                              <span className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary mt-0.5">{visit.clientDocument}</span>
                                            </div>
                                          </td>
                                          <td className="py-4 pr-4">
                                            <div className="flex flex-col">
                                              <div className="flex items-center text-xs font-medium text-gray-700 dark:text-dark-text-secondary">
                                                <Calendar className="h-3.5 w-3.5 mr-2 text-blue-500" />
                                                {formatSafeDate(visit.scheduledDate)}
                                              </div>
                                              <div className="flex items-center text-xs font-medium text-gray-400 mt-1">
                                                <Clock className="h-3.5 w-3.5 mr-2" />
                                                {visit.scheduledTime || "00:00"}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-4 pr-4">
                                            <div className="flex items-center text-xs font-medium text-gray-600 dark:text-dark-text-secondary max-w-[200px]">
                                              <MapPin className="h-4 w-4 mr-2 text-gray-400 shrink-0" />
                                              <span className="truncate">
                                                {visit.clientNeighborhood}, {visit.clientCity}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="py-4 pr-4">
                                            <div className="flex flex-col items-start gap-1.5">
                                              {getStatusBadge(visit.status)}
                                              {visit.totalPendingValue && (
                                                <span className="text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">
                                                  {formatCurrency(visit.totalPendingValue)}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-4 text-right">
                                            {visit.status === "cancelamento_solicitado" ? (
                                              <div className="flex items-center justify-end gap-2">
                                                <button
                                                  onClick={() => handleOpenApproval(visit, "approve")}
                                                  className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 transition-all border border-green-100 dark:border-green-900/30"
                                                  title="Aprovar"
                                                >
                                                  <CheckCircle className="h-5 w-5" />
                                                </button>
                                                <button
                                                  onClick={() => handleOpenApproval(visit, "reject")}
                                                  className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 transition-all border border-red-100 dark:border-red-900/30"
                                                  title="Rejeitar"
                                                >
                                                  <XCircle className="h-5 w-5" />
                                                </button>
                                              </div>
                                            ) : isOverdue ? (
                                              <div className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-semibold border border-red-100 dark:border-red-950/30">
                                                Atrasada {getOverdueDays(visit.scheduledDate)} Dias
                                              </div>
                                            ) : null}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Visualização em Cards (Mobile) — Refinada */}
                              <div className="md:hidden space-y-4">
                                {paginatedVisits.map((visit) => {
                                  const isOverdue = isVisitOverdue(visit);
                                  const statusColor = visit.status === 'realizada' ? 'border-green-500' : 
                                                     visit.status === 'cancelada' ? 'border-gray-300' :
                                                     isOverdue ? 'border-red-500' : 'border-blue-500';

                                  return (
                                    <div 
                                      key={visit.id} 
                                      className={`p-4 rounded-2xl border-l-4 border bg-white dark:bg-dark-bg-secondary shadow-sm transition-all ${statusColor} ${isOverdue ? 'bg-red-50/10 dark:bg-red-900/5' : ''}`}
                                    >
                                      <div className="flex justify-between items-start mb-4">
                                        <div className="min-w-0 pr-2">
                                          <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text leading-tight truncate">{visit.clientName}</h4>
                                          <p className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary mt-1">{visit.clientDocument}</p>
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                                          {visit.totalPendingValue && (
                                            <p className="text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(visit.totalPendingValue)}</p>
                                          )}
                                          {getStatusBadge(visit.status)}
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 gap-3 mb-4">
                                        <div className="flex items-center text-xs font-medium text-gray-700 dark:text-dark-text-secondary">
                                          <Calendar className="h-3.5 w-3.5 mr-2.5 text-blue-500 shrink-0" />
                                          {formatSafeDate(visit.scheduledDate)} {visit.scheduledTime && `ÀS ${visit.scheduledTime}`}
                                        </div>
                                        <div className="flex items-center text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                                          <MapPin className="h-3.5 w-3.5 mr-2.5 text-gray-400 shrink-0" />
                                          <span className="truncate">{visit.clientNeighborhood}, {visit.clientCity}</span>
                                        </div>
                                      </div>

                                      {visit.status === "cancelamento_solicitado" && (
                                        <div className="flex gap-2 border-t border-gray-100 dark:border-dark-border pt-4 mt-2">
                                          <button
                                            onClick={() => handleOpenApproval(visit, "approve")}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-xs font-semibold rounded-xl shadow-sm"
                                          >
                                            <CheckCircle className="h-4 w-4" /> Aprovar
                                          </button>
                                          <button
                                            onClick={() => handleOpenApproval(visit, "reject")}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-xs font-semibold rounded-xl shadow-sm"
                                          >
                                            <XCircle className="h-4 w-4" /> Rejeitar
                                          </button>
                                        </div>
                                      )}
                                      
                                      {isOverdue && visit.status === 'agendada' && (
                                        <div className="mt-2 text-center py-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-semibold rounded-xl border border-red-100 dark:border-red-955/30">
                                          Atrasada {getOverdueDays(visit.scheduledDate)} Dias
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Paginação — Estilo Dashboard Refinado */}
                              {totalPages > 1 && (
                                <div className="bg-white dark:bg-dark-bg-secondary border border-gray-100 dark:border-dark-border px-4 py-4 rounded-2xl shadow-sm mt-6">
                                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                      <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-100 dark:border-blue-900/30">
                                        Pág {currentPage} / {totalPages}
                                      </div>
                                      <span className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
                                        Exibindo {Math.min((currentPage - 1) * visitsPerPage + 1, visits.length)}–{Math.min(currentPage * visitsPerPage, visits.length)} de {visits.length}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setCollectorPages(prev => ({ ...prev, [collectorId]: Math.max(1, currentPage - 1) }))}
                                        disabled={currentPage === 1}
                                        className="p-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                                              className={`w-9 h-9 flex items-center justify-center text-xs font-semibold rounded-xl transition-all border ${
                                                pNum === currentPage
                                                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                                  : "bg-white dark:bg-dark-bg text-gray-400 border-gray-100 dark:border-dark-border hover:bg-gray-50"
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
                                        className="p-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text tracking-tight mb-2">
            Nenhuma solicitação pendente
          </h3>
          <p className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">
            Todas as solicitações de cancelamento foram processadas
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text tracking-tight">
                Solicitações de Cancelamento
              </h3>
              <p className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary mt-0.5">
                Aguardando aprovação do gerente ({pendingRequests.length})
              </p>
            </div>
          </div>

          {/* Visualização em Tabela (Desktop) */}
          <div className="hidden md:block bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-dark-bg border-b border-gray-100 dark:border-dark-border">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Cliente / Cobrador</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Agendamento</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Motivo do Cancelamento</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {pendingRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50/50 dark:hover:bg-dark-bg transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">{request.clientName}</span>
                        <span className="text-xs font-semibold text-blue-500 tracking-tighter mt-0.5">Cobrador: {getCollectorName(request.collectorId)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
                          {formatSafeDate(request.scheduledDate)}
                        </span>
                        <span className="text-xs text-gray-400 mt-0.5">
                          Solicitado em: {formatSafeDate(request.cancellationRequestDate || "")}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-lg p-2.5">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-400 italic leading-tight">
                          "{request.cancellationRequestReason || "NÃO INFORMADO"}"
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenApproval(request, "approve")}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleOpenApproval(request, "reject")}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
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

          {/* Visualização em Cards (Mobile) — Refinada */}
          <div className="md:hidden space-y-4">
            {pendingRequests.map((request) => (
              <div key={request.id} className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="min-w-0 pr-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text leading-tight truncate">{request.clientName}</h4>
                      <p className="text-xs font-medium text-blue-500 mt-1">{getCollectorName(request.collectorId)}</p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-semibold border border-amber-200 dark:border-amber-900/50">
                      Pendente
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-dark-bg p-3.5 rounded-xl mb-4 border border-gray-100 dark:border-dark-border">
                    <p className="text-[10px] font-semibold text-gray-400 tracking-wide mb-1.5">Motivo do Cancelamento</p>
                    <p className="text-xs font-medium text-gray-750 dark:text-dark-text-secondary italic leading-relaxed">"{request.cancellationRequestReason || "Não informado"}"</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenApproval(request, "approve")}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-xs font-semibold rounded-xl shadow-sm"
                    >
                      <CheckCircle className="h-4 w-4" /> Aprovar
                    </button>
                    <button
                      onClick={() => handleOpenApproval(request, "reject")}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-xs font-semibold rounded-xl shadow-sm"
                    >
                      <XCircle className="h-4 w-4" /> Rejeitar
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
      // "Agendadas" = somente no prazo; as vencidas entram em "atrasadas"
      // (buckets mutuamente exclusivos, igual aos dots e ao modal de limpeza).
      const agendadas = filteredVisitsFlat.filter(
        (v) => v.status === "agendada" && !isVisitOverdue(v),
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

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl shrink-0">
                <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight leading-none truncate">
                  Acompanhamento de Visitas
                </h2>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary mt-1 tracking-wide truncate">
                  Gestão estratégica de rotas e cancelamentos
                </p>
              </div>
            </div>

            {/* Ação de Fechar */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2.5 text-gray-400 hover:text-gray-900 dark:hover:text-dark-text bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl transition-all shrink-0"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Navegação por Tabs — Estilo Unificado e Scrollable Mobile com padding para evitar corte de shadow/ring */}
          <div className="mt-6 flex items-center gap-2 overflow-x-auto pt-1 pb-3 sm:overflow-visible -mx-2 px-2 scrollbar-hide">
            <button
              onClick={() => setActiveTab("visits")}
              className={`flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all shrink-0 ${
                activeTab === "visits"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/10"
                  : "bg-white dark:bg-dark-bg text-gray-500 dark:text-dark-text-secondary border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
              }`}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Visitas
            </button>
            <button
              onClick={() => setActiveTab("cancellations")}
              className={`flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all shrink-0 relative ${
                activeTab === "cancellations"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/10"
                  : "bg-white dark:bg-dark-bg text-gray-500 dark:text-dark-text-secondary border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
              }`}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Cancelamentos
              {pendingRequests.length > 0 && (
                <span className="ml-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0.5 rounded-md font-bold">
                  {pendingRequests.length}
                </span>
              )}
            </button>

            {user?.type === "manager" && (
              <button
                onClick={() => setActiveTab("scheduledDates")}
                className={`flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all shrink-0 ${
                  activeTab === "scheduledDates"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/10"
                    : "bg-white dark:bg-dark-bg text-gray-500 dark:text-dark-text-secondary border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
                }`}
              >
                <CalendarClock className="h-4 w-4 mr-2" />
                Datas Programadas
              </button>
            )}
          </div>
        </div>

        {/* Grid de Cards Executivos — Scroll horizontal em mobile com padding vertical para evitar corte de sombras */}
        <div className="flex overflow-x-auto pt-3 pb-5 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 custom-scrollbar snap-x">
          {/* Card: Total de Visitas */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              applyQuickFilter("all");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                applyQuickFilter("all");
              }
            }}
            title="Mostrar todas as visitas (limpar filtros)"
            className={`min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all snap-start cursor-pointer ${
              activeFiltersCount === 0 && activeTab === "visits"
                ? "border-blue-500 ring-2 ring-blue-500/10"
                : "border-gray-100 dark:border-dark-border"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Total Geral</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{overviewStats.totalVisits}</p>
            </div>
          </div>

          {/* Card: Agendadas */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setActiveTab("visits");
              setStatusFilter("agendada");
              setOverdueFilter("not_overdue");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveTab("visits");
                setStatusFilter("agendada");
                setOverdueFilter("all");
              }
            }}
            title="Filtrar visitas agendadas"
            className={`min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all snap-start cursor-pointer ${
              statusFilter === "agendada" && overdueFilter === "not_overdue" && activeTab === "visits"
                ? "border-blue-500 ring-2 ring-blue-500/10"
                : "border-gray-100 dark:border-dark-border"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              {overviewStats.atrasadas > 0 ? (
                <span className="text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-md tracking-wide border border-red-100 dark:border-red-900/35 flex items-center gap-1 animate-pulse">
                  <Zap className="h-3 w-3 fill-current" />
                  {overviewStats.atrasadas} Atrasadas
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-md tracking-wide border border-green-100 dark:border-green-900/35">
                  Em Dia
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Agendadas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{overviewStats.agendadas}</p>
            </div>
          </div>

          {/* Card: Realizadas */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setActiveTab("visits");
              setStatusFilter("realizada");
              setOverdueFilter("all");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveTab("visits");
                setStatusFilter("realizada");
                setOverdueFilter("all");
              }
            }}
            title="Filtrar visitas realizadas"
            className={`min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all snap-start cursor-pointer ${
              statusFilter === "realizada" && activeTab === "visits"
                ? "border-green-500 ring-2 ring-green-500/10"
                : "border-gray-100 dark:border-dark-border"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Realizadas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{overviewStats.realizadas}</p>
            </div>
          </div>

          {/* Card: Solicitações de Cancelamento */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setActiveTab("cancellations");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveTab("cancellations");
              }
            }}
            title="Ir para solicitações de cancelamento"
            className={`min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all snap-start cursor-pointer ${
              activeTab === "cancellations"
                ? "border-amber-500 ring-2 ring-amber-500/10"
                : "border-gray-100 dark:border-dark-border"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              {overviewStats.pendingRequests > 0 && (
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md tracking-wide border border-amber-100 dark:border-amber-900/35">
                  Aguardando
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Solicitações</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{overviewStats.pendingRequests}</p>
            </div>
          </div>
        </div>

        {/* Resumo por Cidade - Colapsável */}
        {user?.type === "manager" && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
            <button
              onClick={() => setShowCityStats(!showCityStats)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-dark-text">
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
                      className="p-4 bg-gray-50 dark:bg-dark-bg rounded-2xl border border-gray-100 dark:border-dark-border flex flex-col"
                    >
                      <span className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate mb-2">
                        {stat.name}
                      </span>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-text-secondary">
                        <span>Total de Clientes:</span>
                        <span className="font-bold text-gray-900 dark:text-dark-text">
                          {stat.totalClients}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-text-secondary mt-1">
                        <span>Visitas Agendadas:</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
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
                  <label htmlFor="rejection-reason" className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo da rejeição *
                  </label>
                  <textarea
                    id="rejection-reason"
                    name="rejectionReason"
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

      {/* Modal: Limpar visitas pendentes do cobrador */}
      {clearTarget && (
        <ClearVisitsModal
          collectorId={clearTarget.id}
          collectorName={clearTarget.name}
          onClose={() => setClearTarget(null)}
        />
      )}
    </>
  );
};

export default VisitTracking;
