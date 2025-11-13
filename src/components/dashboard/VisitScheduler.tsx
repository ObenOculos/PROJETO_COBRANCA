import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  X,
  Search,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Filter,
  RefreshCw,
  Users,
  User,
  MapPinIcon,
  ArrowUpDown,
  Info,
  Star, // Add Star icon
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { ScheduledVisit } from "../../types";
import {
  formatCurrency,
  calculateDaysSinceLastVisit,
} from "../../utils/formatters";
import ClientDetailModal from "./ClientDetailModal";
import { DateValidationModal } from "../common/DateValidationModal";
import ConfirmationModal from "../common/ConfirmationModal";
import { getNextAllowedVisitDate } from "../../utils/visitScheduling";

interface VisitSchedulerProps {
  onClose?: () => void;
  collectorId?: string;
}

const VisitScheduler: React.FC<VisitSchedulerProps> = ({
  onClose,
  collectorId,
}) => {
  const {
    getClientGroups,
    scheduleVisit,
    scheduledVisits,
    getVisitsByCollector,
    getClientDataForVisit,
    updateVisitStatus,
    requestVisitCancellation,
    rescheduleVisit,
    refreshData,
    isOnline,
    users, // Get users from context
    fetchScheduledVisits, // Add fetchScheduledVisits
    allowedVisitDates, // Add allowedVisitDates
  } = useCollection();
  const { user } = useAuth();

  const effectiveCollectorId = collectorId || user?.id;

  const collectorName = useMemo(() => {
    if (!collectorId) return null;
    const collector = users.find((u) => u.id === collectorId);
    return collector?.name || null;
  }, [collectorId, users]);

  const getLocalDate = () => {
    const today = new Date();
    // Garantir que pegamos a data local, não UTC
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getDefaultTime = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getLocalDate());

  const [selectedTime] = useState<string>(getDefaultTime());
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(
    new Set(),
  );
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [clientSchedules, setClientSchedules] = useState<
    Map<string, { date: string; time: string }>
  >(new Map());
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  // const [activeTab, setActiveTab] = useState<"schedule" | "list">("schedule");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [modalStep, setModalStep] = useState<"selection" | "confirmation">(
    "selection",
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(
    null,
  );

  useEffect(() => {
    if (selectedCalendarDate) {
      setSelectedDate(selectedCalendarDate.toISOString().split("T")[0]);
    }
  }, [selectedCalendarDate]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [visitsPerPage] = useState(10);
  const [, setClientsCurrentPage] = useState(1);

  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const modalClientsPerPage = 20;
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState<
    "success" | "error" | "info"
  >("success");
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [selectedVisitForCancellation, setSelectedVisitForCancellation] =
    useState<ScheduledVisit | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedClientForModal, setSelectedClientForModal] =
    useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Estados para Modal de Conflitos de Visitas
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<
    Array<{ clientName: string; date: string }>
  >([]);
  const [filters, setFilters] = useState({
    city: [] as string[],
    neighborhood: [] as string[],
    minValue: "",
    maxValue: "",
    visitStatus: "",
    dueDateStart: "",
    dueDateEnd: "",
  });
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] =
    useState(false);

  // Estados para ordenação
  const [sortField, setSortField] = useState<
    "cliente" | "valor" | "cidade" | null
  >(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Função para lidar com ordenação
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Função para obter ícone de ordenação
  const getSortIcon = (field: typeof sortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUpDown className="h-4 w-4 text-white rotate-180" />
    ) : (
      <ArrowUpDown className="h-4 w-4 text-white" />
    );
  };
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedVisitForReschedule, setSelectedVisitForReschedule] =
    useState<ScheduledVisit | null>(null);

  // Estados para novos modais
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [selectedVisitForCompletion, setSelectedVisitForCompletion] =
    useState<ScheduledVisit | null>(null);
  const [showNotFoundConfirmModal, setShowNotFoundConfirmModal] =
    useState(false);
  const [showNotFoundObservationModal, setShowNotFoundObservationModal] =
    useState(false);
  const [selectedVisitForNotFound, setSelectedVisitForNotFound] =
    useState<ScheduledVisit | null>(null);
  const [showPaymentQuestionModal, setShowPaymentQuestionModal] =
    useState(false);
  const [selectedVisitForPayment, setSelectedVisitForPayment] =
    useState<ScheduledVisit | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [showTimeWarningModal, setShowTimeWarningModal] = useState(false);
  const [timeWarningData, setTimeWarningData] = useState<{
    clientDocument: string;
    selectedTime: string;
    suggestedTime: string;
    previousTime: string;
  } | null>(null);
  const [showDateValidationModal, setShowDateValidationModal] = useState(false);
  const [dateValidationMessage, setDateValidationMessage] = useState("");

  // Estado para rastrear visitas que caem no domingo
  const [sundayVisits, setSundayVisits] = useState<Set<string>>(new Set());

  // Estado para data geral no modal de confirmação
  const [generalScheduleDate, setGeneralScheduleDate] = useState<string>("");

  // Estado para o modal de notificação de visitas atrasadas
  const [showOverdueNotificationModal, setShowOverdueNotificationModal] =
    useState(false);
  const [overdueVisitsByDate, setOverdueVisitsByDate] = useState<
    Record<string, ScheduledVisit[]>
  >({});

  // Estados para filtro das visitas do dia selecionado
  const [visitsSortBy, setVisitsSortBy] = useState<"name" | "city" | "value">(
    "name",
  );
  const [visitsSortOrder, setVisitsSortOrder] = useState<"asc" | "desc">("asc");

  // Estados para swipe (mobile)
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentPage < totalSelectedDatePages) {
      setCurrentPage((prev) => prev + 1);
    }
    if (isRightSwipe && currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  // Listen for visits scheduled by a manager to refresh data
  useEffect(() => {
    const handleVisitScheduled = async () => {
      if (!collectorId) {
        // Only collectors should refresh their own view
        await fetchScheduledVisits(false); // Force a fresh fetch, bypassing cache
      }
    };

    window.addEventListener("visitScheduledByManager", handleVisitScheduled);

    return () => {
      window.removeEventListener(
        "visitScheduledByManager",
        handleVisitScheduled,
      );
    };
  }, [collectorId, fetchScheduledVisits]);

  // Gerenciar scroll da página quando qualquer modal estiver ativo
  useEffect(() => {
    // Se o componente for renderizado com a prop onClose, assume-se que o controle de scroll é feito pelo componente pai.
    if (onClose) {
      return;
    }

    const anyModalOpen =
      showScheduleModal ||
      showCancellationModal ||
      showClientModal ||
      showRescheduleModal ||
      showCompletedModal ||
      showNotFoundConfirmModal ||
      showNotFoundObservationModal ||
      showPaymentQuestionModal ||
      showTimeWarningModal ||
      showDateValidationModal ||
      showOverdueNotificationModal;

    if (anyModalOpen) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    return () => {
      // Apenas limpa o estilo se não for controlado pelo pai
      if (!onClose) {
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      }
    };
  }, [
    onClose, // Adicionado ao array de dependências
    showScheduleModal,
    showCancellationModal,
    showClientModal,
    showRescheduleModal,
    showCompletedModal,
    showNotFoundConfirmModal,
    showNotFoundObservationModal,
    showPaymentQuestionModal,
    showTimeWarningModal,
    showDateValidationModal,
    showOverdueNotificationModal,
  ]);

  // Fechar modal com tecla ESC
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && showScheduleModal) {
        setShowScheduleModal(false);
        setModalStep("selection");
      }
    };

    if (showScheduleModal) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [showScheduleModal]);

  // Adicionado para buscar visitas ao navegar entre os meses
  useEffect(() => {
    const debounceFetch = setTimeout(() => {
      if (user) {
        // Força a busca de visitas para o mês/ano que está sendo visualizado
        // Assumindo que fetchScheduledVisits pode ser otimizado no futuro para aceitar um range
        fetchScheduledVisits(false);
      }
    }, 500); // Debounce de 500ms para evitar buscas excessivas

    return () => {
      clearTimeout(debounceFetch);
    };
  }, [currentMonth, user, fetchScheduledVisits]);

  const availableClients = React.useMemo(() => {
    if (!effectiveCollectorId) return [];

    const clientGroups = getClientGroups(effectiveCollectorId);

    // Obter visitas ativas (agendadas) do cobrador
    const activeVisits = getVisitsByCollector(effectiveCollectorId).filter(
      (visit) => visit.status === "agendada",
    );
    const activeClientDocuments = new Set(
      activeVisits.map((visit) => visit.clientDocument),
    );

    // Filtrar clientes que não têm visitas ativas E que têm pendências
    const availableClientGroups = clientGroups.filter(
      (client) =>
        !activeClientDocuments.has(client.document) && client.pendingValue > 0, // Apenas clientes com valor pendente
    );

    // Aplicar filtros
    let filteredClients = availableClientGroups;

    // Filtro de busca por texto
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredClients = filteredClients.filter((client) => {
        return (
          client.client.toLowerCase().includes(searchLower) ||
          client.document.toLowerCase().includes(searchLower) ||
          client.address.toLowerCase().includes(searchLower) ||
          client.city.toLowerCase().includes(searchLower) ||
          client.neighborhood.toLowerCase().includes(searchLower) ||
          (client.apelido && client.apelido.toLowerCase().includes(searchLower))
        );
      });
    }

    // Filtro por cidade
    if (filters.city.length > 0) {
      filteredClients = filteredClients.filter((client) =>
        filters.city.includes(client.city),
      );
    }

    // Filtro por bairro
    if (filters.neighborhood.length > 0) {
      filteredClients = filteredClients.filter((client) =>
        filters.neighborhood.includes(client.neighborhood),
      );
    }

    // Filtro por valor pendente mínimo
    if (filters.minValue) {
      const minValue = parseFloat(filters.minValue);
      if (!isNaN(minValue)) {
        filteredClients = filteredClients.filter(
          (client) => client.pendingValue >= minValue,
        );
      }
    }

    // Filtro por valor pendente máximo
    if (filters.maxValue) {
      const maxValue = parseFloat(filters.maxValue);
      if (!isNaN(maxValue)) {
        filteredClients = filteredClients.filter(
          (client) => client.pendingValue <= maxValue,
        );
      }
    }

    // Filtro por status de visita
    if (filters.visitStatus) {
      filteredClients = filteredClients.filter((client) => {
        // Get visit status for this client using the same logic as in the component
        const clientVisits = scheduledVisits
          .filter(
            (visit) =>
              visit.clientDocument === client.document &&
              visit.status === "realizada",
          )
          .sort((a, b) => {
            // Ordenar por created_at (mais recente primeiro)
            return (
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          });

        const today = new Date();
        const daysSinceLastVisit = calculateDaysSinceLastVisit(
          clientVisits.length > 0 ? clientVisits[0].createdAt : "",
          today,
        );

        // Match filter with status type
        switch (filters.visitStatus) {
          case "recent":
            return daysSinceLastVisit < 30;
          case "low":
            return daysSinceLastVisit >= 30 && daysSinceLastVisit < 60;
          case "medium":
            return daysSinceLastVisit >= 60 && daysSinceLastVisit < 90;
          case "high":
            return daysSinceLastVisit >= 90 && daysSinceLastVisit < 120;
          case "critical":
            return daysSinceLastVisit >= 120 && daysSinceLastVisit !== 999;
          case "never-visited":
            return daysSinceLastVisit === 999;
          default:
            return true;
        }
      });
    }

    // Filtro por período de vencimento
    if (filters.dueDateStart || filters.dueDateEnd) {
      const startDate = filters.dueDateStart
        ? new Date(filters.dueDateStart)
        : null;
      const endDate = filters.dueDateEnd ? new Date(filters.dueDateEnd) : null;

      if (startDate) startDate.setHours(0, 0, 0, 0);
      if (endDate) endDate.setHours(23, 59, 59, 999);

      filteredClients = filteredClients.filter((client) => {
        return client.sales.some((sale) => {
          return sale.installments.some((installment) => {
            if (!installment.data_vencimento) return false;

            const dueDate = new Date(installment.data_vencimento);

            if (startDate && dueDate < startDate) {
              return false;
            }
            if (endDate && dueDate > endDate) {
              return false;
            }
            return true;
          });
        });
      });
    }

    // Aplicar ordenação
    if (sortField) {
      filteredClients.sort((a, b) => {
        let result = 0;

        switch (sortField) {
          case "cliente":
            result = a.client.localeCompare(b.client);
            break;
          case "valor":
            result = a.pendingValue - b.pendingValue;
            break;
          case "cidade":
            result = a.city.localeCompare(b.city);
            break;
          default:
            result = 0;
        }

        return sortDirection === "asc" ? result : -result;
      });
    }

    return filteredClients;
  }, [
    user,
    searchTerm,
    filters,
    getClientGroups,
    getVisitsByCollector,
    scheduledVisits,
    sortField,
    sortDirection,
  ]);

  // Contar clientes com visitas ativas

  // Paginação para clientes

  // Resetar página dos clientes quando a busca ou filtros mudarem
  React.useEffect(() => {
    setClientsCurrentPage(1);
  }, [searchTerm, filters]);

  // Obter visitas organizadas por data
  const { upcomingVisits, allVisits } = React.useMemo(() => {
    if (!effectiveCollectorId)
      return {
        upcomingVisits: [],
        allVisits: [],
      };

    // Usar a mesma lógica de data local
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;
    const visits = getVisitsByCollector(effectiveCollectorId);

    const upcomingVisits = visits
      .filter((visit) => {
        // Filtrar apenas visitas futuras (não incluir hoje)
        return visit.scheduledDate > todayStr;
      })
      .sort((a, b) => {
        const dateA = new Date(
          `${a.scheduledDate} ${a.scheduledTime || "00:00"}`,
        );
        const dateB = new Date(
          `${b.scheduledDate} ${b.scheduledTime || "00:00"}`,
        );
        return dateA.getTime() - dateB.getTime();
      });

    const allVisits = [...visits].sort((a, b) => {
      const dateA = new Date(
        `${a.scheduledDate} ${a.scheduledTime || "00:00"}`,
      );
      const dateB = new Date(
        `${b.scheduledDate} ${b.scheduledTime || "00:00"}`,
      );
      return dateA.getTime() - dateB.getTime();
    });

    return { upcomingVisits, allVisits };
  }, [user, getVisitsByCollector, scheduledVisits]);

  // Detectar e agrupar visitas atrasadas
  React.useEffect(() => {
    if (!user || !allVisits) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // Filtrar visitas atrasadas
    const overdueVisits = allVisits.filter((visit) => {
      return (
        visit.scheduledDate < todayStr &&
        (visit.status === "agendada" ||
          visit.status === "cancelamento_solicitado")
      );
    });

    // Agrupar por data
    const groupedByDate: Record<string, ScheduledVisit[]> = {};
    overdueVisits.forEach((visit) => {
      if (!groupedByDate[visit.scheduledDate]) {
        groupedByDate[visit.scheduledDate] = [];
      }
      groupedByDate[visit.scheduledDate].push(visit);
    });

    setOverdueVisitsByDate(groupedByDate);

    // Mostrar modal se houver visitas atrasadas
    if (Object.keys(groupedByDate).length > 0) {
      setShowOverdueNotificationModal(true);
    }
  }, [user, allVisits]);

  const handleScheduleVisit = async () => {
    return handleScheduleMultipleVisits();
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCityFilterChange = (city: string) => {
    setFilters((prev) => {
      const newCities = prev.city.includes(city)
        ? prev.city.filter((c) => c !== city)
        : [...prev.city, city];
      return { ...prev, city: newCities, neighborhood: [] };
    });
  };

  const handleNeighborhoodFilterChange = (neighborhood: string) => {
    setFilters((prev) => {
      const newNeighborhoods = prev.neighborhood.includes(neighborhood)
        ? prev.neighborhood.filter((n) => n !== neighborhood)
        : [...prev.neighborhood, neighborhood];
      return { ...prev, neighborhood: newNeighborhoods };
    });
  };

  const clearAllFilters = () => {
    setFilters({
      city: [],
      neighborhood: [],
      minValue: "",
      maxValue: "",
      visitStatus: "",
      dueDateStart: "",
      dueDateEnd: "",
    });
    setSearchTerm("");
    setSelectedClients(new Set());
    setClientSchedules(new Map());
    setSundayVisits(new Set());
    setIsAllSelected(false);
  };

  // Reset pagination when filters change
  useEffect(() => {
    setModalCurrentPage(1);
  }, [searchTerm, filters]);

  // Obter lista de cidades únicas (apenas de clientes com pendências)
  const availableCities = React.useMemo(() => {
    if (!effectiveCollectorId) return [];

    const clientGroups = getClientGroups(effectiveCollectorId);
    // Filtrar apenas clientes com pendências
    const clientsWithPending = clientGroups.filter(
      (client) => client.pendingValue > 0,
    );
    const cities = [
      ...new Set(clientsWithPending.map((client) => client.city)),
    ];
    return cities.sort();
  }, [user, getClientGroups]);

  const availableNeighborhoods = React.useMemo(() => {
    if (!effectiveCollectorId) return [];

    const clientGroups = getClientGroups(effectiveCollectorId);
    let clients = clientGroups.filter((client) => client.pendingValue > 0);

    if (filters.city.length > 0) {
      clients = clients.filter((client) => filters.city.includes(client.city));
    }

    const neighborhoods = [
      ...new Set(clients.map((client) => client.neighborhood)),
    ];
    return neighborhoods.sort();
  }, [user, getClientGroups, filters.city]);

  // Funções do calendário
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const getVisitsForDate = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    return allVisits.filter((visit) => {
      const visitDate = visit.scheduledDate;
      return (
        visitDate === dateStr &&
        (visit.status === "agendada" ||
          visit.status === "realizada" ||
          visit.status === "nao_encontrado" ||
          visit.status === "cancelamento_solicitado" ||
          visit.status === "pending_sync")
      );
    });
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const newMonth = new Date(currentMonth);
    if (direction === "prev") {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  const selectDate = (date: Date) => {
    setSelectedCalendarDate(date);
    setCurrentPage(1); // Reset paginação ao selecionar nova data
  };

  // Função para navegar para o dia de uma visita atrasada
  const navigateToOverdueDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    // Atualizar o mês do calendário se necessário
    setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));

    // Selecionar a data
    selectDate(date);

    // Fechar o modal
    setShowOverdueNotificationModal(false);
  };

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const monthNamesAbbr = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // Visitas do dia selecionado no calendário
  const selectedDateVisits = useMemo(() => {
    if (!selectedCalendarDate) return [];
    const visits = getVisitsForDate(selectedCalendarDate);

    // Verificar se a data selecionada é passada para marcar como atrasada
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(selectedCalendarDate);
    selectedDate.setHours(0, 0, 0, 0);
    const isOverdue = selectedDate < today;

    // Calcular dias de atraso
    const daysDiff = isOverdue
      ? Math.floor(
          (today.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      : 0;

    // Adicionar flag de atrasada nas visitas
    const visitsWithOverdueFlag = visits.map((visit) => ({
      ...visit,
      isOverdue:
        isOverdue &&
        (visit.status === "agendada" ||
          visit.status === "cancelamento_solicitado"),
      overdueDays: daysDiff,
    }));

    // Ordenar visitas
    return [...visitsWithOverdueFlag].sort((a, b) => {
      let comparison = 0;

      switch (visitsSortBy) {
        case "name":
          comparison = a.clientName.localeCompare(b.clientName);
          break;
        case "city":
          const aCity = a.clientAddress?.split(",").pop()?.trim() || "";
          const bCity = b.clientAddress?.split(",").pop()?.trim() || "";
          comparison = aCity.localeCompare(bCity);
          break;
        case "value":
          const aValue = a.totalPendingValue || 0;
          const bValue = b.totalPendingValue || 0;
          comparison = aValue - bValue;
          break;
        default:
          comparison = 0;
      }

      return visitsSortOrder === "asc" ? comparison : -comparison;
    });
  }, [selectedCalendarDate, allVisits, visitsSortBy, visitsSortOrder]);

  // Paginação para visitas do dia selecionado
  const paginatedSelectedDateVisits = useMemo(() => {
    const startIndex = (currentPage - 1) * visitsPerPage;
    const endIndex = startIndex + visitsPerPage;
    return selectedDateVisits.slice(startIndex, endIndex);
  }, [selectedDateVisits, currentPage, visitsPerPage]);

  const totalSelectedDatePages = Math.ceil(
    selectedDateVisits.length / visitsPerPage,
  );

  // Validação: Detectar conflitos de visitas (mesmo cliente, mesma data)
  const checkVisitConflicts = (): {
    hasConflicts: boolean;
    conflicts: Array<{ clientName: string; date: string }>;
  } => {
    const conflicts: Array<{ clientName: string; date: string }> = [];
    const selectedClientsData = getSelectedClientsData();

    for (const client of selectedClientsData) {
      const clientSchedule = clientSchedules.get(client.document);
      const visitDate = clientSchedule?.date || selectedDate;

      // Procurar por visitas agendadas para este cliente na mesma data
      const existingVisits = scheduledVisits.filter(
        (visit) =>
          visit.clientDocument === client.document &&
          visit.scheduledDate === visitDate &&
          (visit.status === "agendada" ||
            visit.status === "cancelamento_solicitado"),
      );

      if (existingVisits.length > 0) {
        conflicts.push({
          clientName: client.client,
          date: visitDate,
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  };

  // Validação: Verificar se a data é válida (ex: 31 de fevereiro)
  const isValidDate = (dateString: string): boolean => {
    if (!dateString) return false;

    const [year, month, day] = dateString.split("-").map(Number);

    // Verificar se os valores estão no intervalo válido
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    // Criar a data e verificar se o dia retornado é o mesmo que foi solicitado
    // Isso detecta datas inválidas como 31 de fevereiro
    const date = new Date(year, month - 1, day);
    return (
      date.getDate() === day &&
      date.getMonth() === month - 1 &&
      date.getFullYear() === year
    );
  };

  // Função auxiliar para processar agendamento com conflito já confirmado
  const continueWithScheduling = async () => {
    await executeScheduling();
  };

  const proceedWithScheduling = async () => {
    try {
      // ========== VALIDAÇÃO 1: CONFLITOS DE VISITAS ==========
      const conflictCheck = checkVisitConflicts();
      if (conflictCheck.hasConflicts) {
        // Armazenar dados do conflito e mostrar modal
        setConflictData(conflictCheck.conflicts);
        setShowConflictModal(true);
        return;
      }

      // Se não há conflitos, prosseguir direto
      await executeScheduling();
    } catch (error) {
      console.error("Erro ao iniciar agendamento:", error);
      triggerNotification("❌ Erro ao iniciar agendamento", "error");
    }
  };

  const executeScheduling = async () => {
    try {
      // ========== VALIDAÇÃO 2: DATAS INVÁLIDAS ==========
      const selectedClientsData = getSelectedClientsData();
      const invalidDates: string[] = [];

      for (const client of selectedClientsData) {
        const clientSchedule = clientSchedules.get(client.document);
        const visitDate = clientSchedule?.date || selectedDate;

        if (!isValidDate(visitDate)) {
          invalidDates.push(`${client.client}: ${visitDate}`);
        }
      }

      if (invalidDates.length > 0) {
        const invalidList = invalidDates.join("\n");
        triggerNotification(
          `❌ Erro: As seguintes datas são inválidas:\n${invalidList}`,
          "error",
        );
        return;
      }

      setLoading(true);
      let successCount = 0;
      let errorCount = 0;

      for (const client of selectedClientsData) {
        try {
          const clientData = getClientDataForVisit(client.document);
          if (!clientData) {
            triggerNotification(
              `⚠️ Dados do cliente ${client.client} não encontrados`,
              "error",
            );
            errorCount++;
            continue;
          }

          // Usar data e hora específicas do cliente
          const clientSchedule = clientSchedules.get(client.document);
          const visitDate = clientSchedule?.date || selectedDate;
          const visitTime = clientSchedule?.time || selectedTime;

          // ========== VALIDAÇÃO: HORA VÁLIDA ==========
          if (!visitTime || visitTime.length !== 5) {
            triggerNotification(
              `⚠️ Horário inválido para ${client.client}: ${visitTime}`,
              "error",
            );
            errorCount++;
            continue;
          }

          const visitData: Omit<ScheduledVisit, "id" | "createdAt"> = {
            collectorId: effectiveCollectorId!,
            clientDocument: client.document,
            clientName: client.client,
            scheduledDate: visitDate,
            scheduledTime: visitTime,
            status: "agendada",
            notes: notes.trim(),
            clientAddress: clientData.address,
            clientNeighborhood: clientData.neighborhood,
            clientCity: clientData.city,
            totalPendingValue: clientData.totalPendingValue,
            overdueCount: clientData.overdueCount,
            scheduled_by_manager_id: collectorId ? user?.id : undefined,
          };

          await scheduleVisit(visitData);
          successCount++;

          // If a manager is scheduling, dispatch an event
          if (collectorId && user?.type === "manager") {
            window.dispatchEvent(
              new CustomEvent("visitScheduledByManager", {
                detail: {
                  collectorId: effectiveCollectorId,
                  clientName: client.client,
                },
              }),
            );
          }
        } catch (error) {
          console.error(`Erro ao agendar visita para ${client.client}:`, error);

          // ========== TRATAMENTO DE ERRO MELHORADO ==========
          let errorMessage = `Erro ao agendar visita para ${client.client}`;

          if (error instanceof Error) {
            if (error.message.includes("network")) {
              errorMessage += ": Problema de conexão. Verifique sua internet.";
            } else if (error.message.includes("unauthorized")) {
              errorMessage += ": Você não tem permissão para agendar visitas.";
            } else if (error.message.includes("conflict")) {
              errorMessage +=
                ": Conflito detectado. Esta visita pode já estar agendada.";
            } else {
              errorMessage += `: ${error.message}`;
            }
          }

          triggerNotification(errorMessage, "error");
          errorCount++;
        }
      }

      // Limpar seleções
      setSelectedClients(new Set());
      setClientSchedules(new Map());
      setNotes("");
      clearAllFilters();
      setCurrentPage(1);
      setClientsCurrentPage(1);

      // Mostrar resultado
      if (successCount > 0) {
        triggerNotification(
          `✅ ${successCount} visita${successCount !== 1 ? "s" : ""} agendada${successCount !== 1 ? "s" : ""} com sucesso!`,
          "success",
        );

        // Refresh dos dados para atualizar outras abas
        if (isOnline) {
          await refreshData();
        }
      }
      if (errorCount > 0) {
        triggerNotification(
          `⚠️ ${errorCount} visita${errorCount !== 1 ? "s" : ""} não pode${errorCount !== 1 ? "m" : ""} ser agendada${errorCount !== 1 ? "s" : ""}. Verifique os detalhes acima.`,
          "error",
        );
      }
    } catch (error) {
      console.error("Erro crítico ao agendar visitas:", error);

      let errorMessage = "❌ Erro ao agendar visitas";
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      }
      triggerNotification(errorMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleMultipleVisits = async () => {
    if (selectedClients.size === 0 || !effectiveCollectorId) {
      alert("Selecione pelo menos um cliente para agendar as visitas");
      return;
    }

    await proceedWithScheduling();
  };

  useEffect(() => {
    if (modalStep === "confirmation") {
      const dates = Array.from(clientSchedules.values()).map((s) => s.date);
      if (dates.length > 0) {
        const dateCounts = dates.reduce(
          (acc, date) => {
            if (date) acc[date] = (acc[date] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        if (Object.keys(dateCounts).length > 0) {
          const mostFrequentDate = Object.keys(dateCounts).reduce((a, b) =>
            dateCounts[a] > dateCounts[b] ? a : b,
          );
          setGeneralScheduleDate(mostFrequentDate);
        } else {
          setGeneralScheduleDate(selectedDate);
        }
      } else {
        setGeneralScheduleDate(selectedDate);
      }
    }
  }, [modalStep, clientSchedules, selectedDate]);

  const handleGeneralDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setGeneralScheduleDate(newDate);

    if (!newDate) return;

    const newSchedules = new Map(clientSchedules);
    const newSundayVisits = new Set(sundayVisits);

    selectedClients.forEach((clientDoc) => {
      const currentSchedule = newSchedules.get(clientDoc) || {
        date: "",
        time: selectedTime,
      };
      newSchedules.set(clientDoc, { ...currentSchedule, date: newDate });

      const [year, month, day] = newDate.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      if (dateObj.getDay() === 0) {
        newSundayVisits.add(clientDoc);
      } else {
        newSundayVisits.delete(clientDoc);
      }
    });

    setClientSchedules(newSchedules);
    setSundayVisits(newSundayVisits);
  };

  const handleUpdateVisitStatus = async (
    visitId: string,
    newStatus: ScheduledVisit["status"],
    visitNotes?: string,
  ) => {
    try {
      await updateVisitStatus(visitId, newStatus, visitNotes);
      // Find the updated visit from the scheduledVisits state
      const updatedVisit = scheduledVisits.find((v) => v.id === visitId);
      if (updatedVisit) {
        triggerNotification(
          `Visita marcada como ${getStatusLabel(updatedVisit)}`,
          "success",
        );
      } else {
        triggerNotification(
          `Visita marcada como ${newStatus}`, // Fallback if visit not found
          "success",
        );
      }

      // Refresh dos dados para atualizar outras abas
      if (isOnline) {
        await refreshData();
      }
    } catch (error) {
      console.error("Erro ao atualizar status da visita:", error);
      alert("Erro ao atualizar status da visita");
    }
  };

  // Função para abrir modal de conclusão de visita
  const handleMarkAsCompleted = (visit: ScheduledVisit) => {
    setSelectedVisitForCompletion(visit);
    setShowCompletedModal(true);
  };

  // Função para confirmar conclusão com observação
  const handleConfirmCompletion = async (selectedNote: string) => {
    if (!selectedVisitForCompletion) return;

    // Primeiro fechar o modal atual
    setShowCompletedModal(false);

    // Preparar dados do cliente
    const clientData = getClientDataForVisit(
      selectedVisitForCompletion.clientDocument,
    );
    if (!clientData) {
      alert("Erro: dados do cliente não encontrados");
      setSelectedVisitForCompletion(null);
      return;
    }

    // Criar um ClientGroup mock para o modal de pagamento
    const clientGroup = {
      clientId: clientData.document,
      client: clientData.name,
      document: clientData.document,
      phone: clientData.phone,
      mobile: clientData.mobile,
      address: clientData.address,
      number: "",
      neighborhood: clientData.neighborhood,
      city: clientData.city,
      state: "",
      sales: [],
      totalValue: clientData.totalPendingValue,
      totalReceived: 0,
      pendingValue: clientData.totalPendingValue,
    };

    // Abrir modal do cliente imediatamente
    setSelectedClientForModal(clientGroup);
    setShowClientModal(true);

    // Atualizar status da visita em background
    setTimeout(async () => {
      try {
        await updateVisitStatus(
          selectedVisitForCompletion.id,
          "realizada",
          selectedNote,
        );
        triggerNotification(
          `Visita marcada como ${getStatusLabel(selectedVisitForCompletion)}`,
          "success",
        );
      } catch (error) {
        console.error("Erro ao atualizar status da visita:", error);
        // Não mostrar alert para não interromper o fluxo do usuário
      }
    }, 100);

    setSelectedVisitForCompletion(null);
  };

  // Função para abrir modal de confirmação "Não Localizado"
  const handleMarkAsNotFound = (visit: ScheduledVisit) => {
    setSelectedVisitForNotFound(visit);
    setShowNotFoundConfirmModal(true);
  };

  // Função para confirmar que quer marcar como "Não Localizado"
  const handleConfirmNotFoundFirst = () => {
    setShowNotFoundConfirmModal(false);
    setShowNotFoundObservationModal(true);
  };

  // Função para confirmar "Não Localizado" com observação
  const handleConfirmNotFound = async (selectedNote: string) => {
    if (selectedVisitForNotFound) {
      await handleUpdateVisitStatus(
        selectedVisitForNotFound.id,
        "nao_encontrado",
        selectedNote,
      );
      setShowNotFoundObservationModal(false);
      setSelectedVisitForNotFound(null);
    }
  };

  // Função para quando cliente fez pagamento
  const handleClientMadePayment = () => {
    setShowPaymentQuestionModal(false);
    if (selectedVisitForPayment) {
      // Buscar dados do cliente para abrir modal de pagamento
      const clientData = getClientDataForVisit(
        selectedVisitForPayment.clientDocument,
      );
      if (clientData) {
        // Criar um ClientGroup mock para o modal de pagamento
        const clientGroup = {
          clientId: clientData.document,
          client: clientData.name,
          document: clientData.document,
          phone: clientData.phone,
          mobile: clientData.mobile,
          address: clientData.address,
          number: "",
          neighborhood: clientData.neighborhood,
          city: clientData.city,
          state: "",
          sales: [],
          totalValue: clientData.totalPendingValue,
          totalReceived: 0,
          pendingValue: clientData.totalPendingValue,
        };

        setSelectedClientForModal(clientGroup);
        setShowClientModal(true);
      }
    }
    setSelectedVisitForPayment(null);
  };

  // Função para quando cliente não fez pagamento
  const handleClientDidNotPay = () => {
    setShowPaymentQuestionModal(false);
    setSelectedVisitForPayment(null);
  };

  const getStatusLabel = (visit: ScheduledVisit) => {
    // Verificar se é uma visita reagendada
    if (visit.status === "agendada" && (visit.rescheduleCount || 0) > 0) {
      const count = visit.rescheduleCount || 0;
      return count > 1 ? `Reagendada (${count}x)` : "Reagendada";
    }

    switch (visit.status) {
      case "agendada":
        return "Agendada";
      case "realizada":
        return "Realizada";
      case "cancelada":
        return "Cancelada";
      case "nao_encontrado":
        return "Não Localizado";
      case "cancelamento_solicitado":
        return "Cancelamento Solicitado";
      case "pending_sync":
        return "Pendente";
      default:
        return visit.status;
    }
  };

  const getStatusColor = (visit: ScheduledVisit) => {
    // Verificar se é uma visita reagendada
    if (visit.status === "agendada" && (visit.rescheduleCount || 0) > 0) {
      return "bg-purple-100 text-purple-800";
    }

    switch (visit.status) {
      case "agendada":
        return "bg-blue-100 text-blue-800";
      case "realizada":
        return "bg-green-100 text-green-800";
      case "cancelada":
        return "bg-red-100 text-red-800";
      case "nao_encontrado":
        return "bg-orange-100 text-orange-800";
      case "cancelamento_solicitado":
        return "bg-yellow-100 text-yellow-800 border border-yellow-300";
      case "pending_sync":
        return "bg-gray-100 text-gray-800 border border-gray-300";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const triggerNotification = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);

    // Automatically hide after 5 seconds
    setTimeout(() => {
      setShowNotification(false);
      setNotificationMessage("");
    }, 5000);
  };

  const formatSafeDate = (dateString: string) => {
    try {
      let date: Date;

      if (dateString.includes("-")) {
        // Format YYYY-MM-DD
        const [year, month, day] = dateString.split("-");
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else if (dateString.includes("/")) {
        // Format DD/MM/YYYY (Brazilian format)
        const [day, month, year] = dateString.split("/");
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else {
        // Try to parse as is
        date = new Date(dateString);
      }

      // Validate that the date is valid
      if (isNaN(date.getTime())) {
        return dateString;
      }

      return date.toLocaleDateString("pt-BR");
    } catch {
      return dateString;
    }
  };

  const formatSafeDateTime = (dateString: string, timeString?: string) => {
    try {
      let date: Date;

      if (dateString.includes("-")) {
        // Format YYYY-MM-DD
        const [year, month, day] = dateString.split("-");
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else if (dateString.includes("/")) {
        // Format DD/MM/YYYY (Brazilian format)
        const [day, month, year] = dateString.split("/");
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else {
        // Try to parse as is
        date = new Date(dateString);
      }

      // Validate that the date is valid
      if (isNaN(date.getTime())) {
        return `${dateString} às ${timeString || "00:00"}`;
      }

      const dateFormatted = date.toLocaleDateString("pt-BR");
      return `${dateFormatted} às ${timeString || "00:00"}`;
    } catch {
      return `${dateString} às ${timeString || "00:00"}`;
    }
  };

  const handleRequestCancellation = (visit: ScheduledVisit) => {
    setSelectedVisitForCancellation(visit);
    setShowCancellationModal(true);
  };

  const handleConfirmCancellation = async () => {
    if (!selectedVisitForCancellation || !cancellationReason.trim()) {
      alert("Por favor, informe o motivo do cancelamento");
      return;
    }

    try {
      await requestVisitCancellation(
        selectedVisitForCancellation.id,
        cancellationReason.trim(),
      );

      // Disparar evento para notificar outros componentes
      window.dispatchEvent(
        new CustomEvent("visitCancellationRequested", {
          detail: {
            visitId: selectedVisitForCancellation.id,
            clientName: selectedVisitForCancellation.clientName,
            collectorId: selectedVisitForCancellation.collectorId,
            reason: cancellationReason.trim(),
          },
        }),
      );

      setShowCancellationModal(false);
      setSelectedVisitForCancellation(null);
      setCancellationReason("");
      triggerNotification(
        "Solicitação de cancelamento enviada para aprovação",
        "info", // Changed to 'info' as it's a request, not a final success
      );
    } catch (error) {
      console.error("Erro ao solicitar cancelamento:", error);
      alert("Erro ao solicitar cancelamento. Tente novamente.");
    }
  };

  const handleCloseCancellationModal = () => {
    setShowCancellationModal(false);
    setSelectedVisitForCancellation(null);
    setCancellationReason("");
  };

  const handleOpenRescheduleModal = (visit: ScheduledVisit) => {
    setSelectedVisitForReschedule(visit);

    // Buscar dados do cliente para obter cidade e bairro
    const clientData = getClientDataForVisit(visit.clientDocument);

    let suggestedDate = getLocalDate();

    // Verificar se existe data permitida configurada para esta cidade
    if (clientData) {
      const allowedDate = getNextAllowedVisitDate(
        clientData.city,
        clientData.neighborhood,
        allowedVisitDates,
      );

      if (allowedDate) {
        suggestedDate = allowedDate;
      }
    }

    setRescheduleDate(suggestedDate);

    // Para visitas de hoje, usar hora atual + 1 hora; para outras visitas, manter o horário original
    const isToday = visit.scheduledDate === getLocalDate();
    setRescheduleTime(
      isToday ? getDefaultTime() : visit.scheduledTime || "09:00",
    );

    setShowRescheduleModal(true);
  };

  const handleCloseRescheduleModal = () => {
    setShowRescheduleModal(false);
    setSelectedVisitForReschedule(null);
    setRescheduleDate("");
    setRescheduleTime("");
  };

  const handleConfirmReschedule = async () => {
    if (!selectedVisitForReschedule || !rescheduleDate || !rescheduleTime) {
      alert("Por favor, selecione uma nova data e horário");
      return;
    }

    // Validar se a data não está no passado
    const today = getLocalDate();
    if (rescheduleDate < today) {
      setDateValidationMessage(
        "Não é possível agendar visitas para datas passadas",
      );
      setShowDateValidationModal(true);
      return;
    }

    // Validar se a hora não está no passado para hoje
    if (rescheduleDate === today) {
      const now = new Date();
      const [hours, minutes] = rescheduleTime.split(":").map(Number);
      const selectedDateTime = new Date();
      selectedDateTime.setHours(hours, minutes, 0, 0);

      if (selectedDateTime <= now) {
        setDateValidationMessage(
          "Não é possível agendar visitas para horários passados",
        );
        setShowDateValidationModal(true);
        return;
      }
    }

    try {
      // Usar a nova função rescheduleVisit
      await rescheduleVisit(
        selectedVisitForReschedule.id,
        rescheduleDate,
        rescheduleTime,
      );

      triggerNotification("Visita reagendada com sucesso!", "success");

      // Refresh dos dados para atualizar outras abas
      await refreshData();

      handleCloseRescheduleModal();
    } catch (error) {
      console.error("Erro ao reagendar visita:", error);
      alert("Erro ao reagendar visita. Tente novamente.");
    }
  };

  const handleOpenClientModal = (visit: ScheduledVisit) => {
    const clientData = getClientDataForVisit(visit.clientDocument);
    if (clientData) {
      setSelectedClientForModal(clientData);
      setShowClientModal(true);
    }
  };

  const handleCloseClientModal = async () => {
    setShowClientModal(false);
    setSelectedClientForModal(null);

    // Fazer refresh dos dados apenas quando o modal for fechado
    try {
      await refreshData();
    } catch (error) {
      console.error("Erro ao atualizar dados:", error);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allClientDocuments = new Set(
        availableClients.map((client) => client.document),
      );

      const newSundayVisits = new Set<string>();

      // Criar schedules com datas permitidas quando disponíveis
      const allClientSchedules = new Map(
        availableClients.map((client) => {
          // Verificar se existe data permitida configurada
          const allowedDate = getNextAllowedVisitDate(
            client.city,
            client.neighborhood,
            allowedVisitDates,
          );

          const scheduledDate = allowedDate || selectedDate;

          // Verificar se cai em domingo
          if (allowedDate) {
            // Parsear data corretamente para evitar problemas de timezone
            const [year, month, day] = allowedDate.split("-").map(Number);
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

            if (dayOfWeek === 0) {
              newSundayVisits.add(client.document);
            }
          }

          return [client.document, { date: scheduledDate, time: selectedTime }];
        }),
      );

      setSelectedClients(allClientDocuments);
      setClientSchedules(allClientSchedules);
      setSundayVisits(newSundayVisits);
    } else {
      setSelectedClients(new Set());
      setClientSchedules(new Map());
      setSundayVisits(new Set());
    }
    setIsAllSelected(checked);
  };

  const handleToggleClientSelection = (clientDocument: string) => {
    const newSelection = new Set(selectedClients);
    const newSchedules = new Map(clientSchedules);
    const newSundayVisits = new Set(sundayVisits);

    if (newSelection.has(clientDocument)) {
      newSelection.delete(clientDocument);
      newSchedules.delete(clientDocument);
      newSundayVisits.delete(clientDocument);
    } else {
      newSelection.add(clientDocument);

      // Buscar dados do cliente para obter cidade e bairro
      const clientData = getClientGroups(effectiveCollectorId!).find(
        (c) => c.document === clientDocument,
      );

      let scheduledDate = selectedCalendarDate
        ? selectedCalendarDate.toISOString().split("T")[0]
        : selectedDate;

      // Verificar se existe data permitida configurada para esta cidade/bairro
      if (clientData) {
        const allowedDate = getNextAllowedVisitDate(
          clientData.city,
          clientData.neighborhood,
          allowedVisitDates,
        );

        if (allowedDate) {
          scheduledDate = allowedDate;

          // Verificar se a data cai em um domingo
          // Parsear data corretamente para evitar problemas de timezone
          const [year, month, day] = allowedDate.split("-").map(Number);
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

          if (dayOfWeek === 0) {
            newSundayVisits.add(clientDocument);
          }
        }
      }

      // Inicializar com data (permitida ou padrão) e hora padrão
      newSchedules.set(clientDocument, {
        date: scheduledDate,
        time: selectedTime,
      });
    }

    setSelectedClients(newSelection);
    setClientSchedules(newSchedules);
    setSundayVisits(newSundayVisits);

    // Update isAllSelected based on the new selection
    setIsAllSelected(newSelection.size === availableClients.length);
  };

  const getSelectedClientsData = () => {
    if (!effectiveCollectorId) return [];

    const allClients = getClientGroups(effectiveCollectorId);
    return allClients.filter((client) => selectedClients.has(client.document));
  };

  const updateClientSchedule = (
    clientDocument: string,
    field: "date" | "time",
    value: string,
  ) => {
    const newSchedules = new Map(clientSchedules);
    const currentSchedule = newSchedules.get(clientDocument) || {
      date: selectedDate,
      time: selectedTime,
    };

    newSchedules.set(clientDocument, {
      ...currentSchedule,
      [field]: value,
    });

    setClientSchedules(newSchedules);

    // Se o campo alterado foi a data, recalcular se é domingo
    if (field === "date") {
      const newSundayVisits = new Set(sundayVisits);

      // Parsear data corretamente para evitar problemas de timezone
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day); // Month é 0-indexed
      const dayOfWeek = date.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

      if (dayOfWeek === 0) {
        // É domingo - adicionar ao set e mostrar notificação
        newSundayVisits.add(clientDocument);

        // Buscar nome do cliente
        const clientData = getClientGroups(effectiveCollectorId!).find(
          (c) => c.document === clientDocument,
        );

        // Mostrar notificação
        triggerNotification(
          `⚠️ Atenção: Visita de ${clientData?.client || "cliente"} agendada para DOMINGO (${formatSafeDate(value)})`,
          "info",
        );
      } else {
        // Não é domingo - remover do set
        newSundayVisits.delete(clientDocument);
      }

      setSundayVisits(newSundayVisits);
    }
  };

  const getClientStatus = (client: any) => {
    // Check days without visit based on last visit
    const clientVisits = scheduledVisits
      .filter(
        (visit) =>
          visit.clientDocument === client.document &&
          visit.status === "realizada",
      )
      .sort((a, b) => {
        // Ordenar por created_at (mais recente primeiro)
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

    const today = new Date();
    const daysSinceLastVisit = calculateDaysSinceLastVisit(
      clientVisits.length > 0 ? clientVisits[0].createdAt : "",
      today,
    );

    // Determine status based on days without visit
    if (daysSinceLastVisit === 999) {
      return {
        type: "never-visited",
        label: "Nunca",
        color: "bg-red-100 text-red-800 border-red-200",
        days: "Nunca",
      };
    }
    if (daysSinceLastVisit >= 120) {
      return {
        type: "critical",
        label: "120+ dias",
        color: "bg-red-100 text-red-800 border-red-200",
        days: `${daysSinceLastVisit} dias`,
      };
    }
    if (daysSinceLastVisit >= 90) {
      return {
        type: "high",
        label: "90+ dias",
        color: "bg-orange-100 text-orange-800 border-orange-200",
        days: `${daysSinceLastVisit} dias`,
      };
    }
    if (daysSinceLastVisit >= 60) {
      return {
        type: "medium",
        label: "60+ dias",
        color: "bg-yellow-100 text-yellow-800 border-yellow-200",
        days: `${daysSinceLastVisit} dias`,
      };
    }
    if (daysSinceLastVisit >= 30) {
      return {
        type: "low",
        label: "30+ dias",
        color: "bg-blue-100 text-blue-800 border-blue-200",
        days: `${daysSinceLastVisit} dias`,
      };
    }
    return {
      type: "recent",
      label: "Recente",
      color: "bg-green-100 text-green-800 border-green-200",
      days: daysSinceLastVisit === 0 ? "Hoje" : `${daysSinceLastVisit} dias`,
    };
  };

  const Notification: React.FC<{
    message: string;
    type: "success" | "error" | "info";
    show: boolean;
  }> = ({ message, type, show }) => {
    if (!show) return null;

    const bgColor = {
      success: "bg-green-500",
      error: "bg-red-500",
      info: "bg-blue-500",
    }[type];

    const Icon = {
      success: CheckCircle,
      error: AlertTriangle,
      info: Info,
    }[type];

    return createPortal(
      <div
        className={`fixed top-4 right-4 ${bgColor} text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center transition-all duration-300 transform ${
          show ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
        }`}
      >
        {Icon && <Icon className="h-5 w-5 mr-2" />}
        {message}
      </div>,
      document.body,
    );
  };

  return (
    <>
      <div className="rounded-2xl">
        {/* Filtro e Listagem */}
        <div className="p-0 lg:p-0">
          <div className="space-y-6">
            {/* Calendário de Visitas */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="relative p-2 sm:p-4 bg-gray-50 border-b">
                {onClose && (
                  <div className="flex justify-end">
                    <button
                      onClick={onClose}
                      className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-full transition-colors"
                      title="Fechar"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="p-2 sm:p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                      <div>
                        <span>Agendando</span>
                        {collectorName && (
                          <span className="block text-xs font-normal text-blue-500 -mt-1">
                            para {collectorName}
                          </span>
                        )}
                      </div>
                    </h3>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={() => navigateMonth("prev")}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="text-sm font-medium min-w-[110px] text-center">
                      <span className="hidden sm:inline">
                        {monthNames[currentMonth.getMonth()]}
                      </span>
                      <span className="sm:hidden">
                        {monthNamesAbbr[currentMonth.getMonth()]}
                      </span>{" "}
                      {currentMonth.getFullYear()}
                    </span>
                    <button
                      onClick={() => navigateMonth("next")}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Grade do Calendário */}
                <div className="grid grid-cols-7 gap-2 sm:gap-2 md:gap-3">
                  {/* Cabeçalho dos dias da semana */}
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="flex items-center justify-center text-xs font-medium text-gray-500 pb-2"
                    >
                      {day}
                    </div>
                  ))}

                  {/* Dias do mês */}
                  {(() => {
                    const { daysInMonth, startingDayOfWeek } =
                      getDaysInMonth(currentMonth);
                    const days = [];
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // Dias vazios no início
                    for (let i = 0; i < startingDayOfWeek; i++) {
                      days.push(
                        <div key={`empty-${i}`} className="h-10 sm:h-12" />,
                      );
                    }

                    // Dias do mês
                    for (let day = 1; day <= daysInMonth; day++) {
                      const date = new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth(),
                        day,
                      );
                      const visitsForDay = getVisitsForDate(date);
                      const isToday =
                        date.toDateString() === today.toDateString();
                      const isSelected =
                        selectedCalendarDate?.toDateString() ===
                        date.toDateString();
                      const isPast = date < today;
                      const hasVisits = visitsForDay.length > 0;

                      const getVisitStatusForDay = (
                        visits: ScheduledVisit[],
                      ) => {
                        if (visits.length === 0) return "";

                        const today = new Date();
                        const todayUTC = new Date(
                          Date.UTC(
                            today.getUTCFullYear(),
                            today.getUTCMonth(),
                            today.getUTCDate(),
                          ),
                        );

                        const hasPending = visits.some(
                          (v) =>
                            v.status === "agendada" ||
                            v.status === "cancelamento_solicitado",
                        );

                        if (!hasPending) {
                          return "bg-green-500"; // Verde: Todas as visitas concluídas ou finalizadas
                        }

                        const hasOverdue = visits.some((v) => {
                          const visitDate = new Date(
                            Date.UTC(
                              parseInt(v.scheduledDate.split("-")[0]),
                              parseInt(v.scheduledDate.split("-")[1]) - 1,
                              parseInt(v.scheduledDate.split("-")[2]),
                            ),
                          );
                          return (
                            (v.status === "agendada" ||
                              v.status === "cancelamento_solicitado") &&
                            visitDate < todayUTC
                          );
                        });

                        if (hasOverdue) {
                          return "bg-red-500"; // Vermelho: Há visitas pendentes e atrasadas
                        }

                        return "bg-yellow-500"; // Amarelo: Há visitas pendentes, mas não atrasadas
                      };

                      const dotColor = getVisitStatusForDay(visitsForDay);

                      days.push(
                        <button
                          key={day}
                          onClick={() => selectDate(date)}
                          className={`
                          h-10 sm:h-12 md:h-16 rounded-lg flex flex-col items-center justify-center
                          relative transition-all duration-200 transform hover:scale-105
                          ${
                            isSelected
                              ? "bg-blue-600 text-white shadow-lg"
                              : isToday
                                ? "bg-blue-100 text-blue-800 font-bold"
                                : isPast
                                  ? "bg-gray-50 text-gray-400"
                                  : "hover:bg-gray-100 text-gray-700"
                          }
                          ${hasVisits ? "ring-2 ring-blue-400 ring-offset-1" : ""}
                        `}
                        >
                          <span className="text-sm font-medium">{day}</span>
                          {dotColor && (
                            <div className="absolute bottom-1">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  isSelected ? "bg-white" : dotColor
                                }`}
                              />
                            </div>
                          )}
                        </button>,
                      );
                    }

                    return days;
                  })()}
                </div>

                {/* Legenda */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-4 gap-y-1 sm:gap-y-2 text-xs text-gray-600">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-1.5" />
                    <span>Concluídas</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-1.5" />
                    <span>Atrasadas</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full mr-1.5" />
                    <span>Pendentes</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-100 rounded-full mr-1.5" />
                    <span>Hoje</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Visitas do dia selecionado */}
            {selectedCalendarDate ? (
              <div>
                <div className="relative bg-gradient-to-r from-blue-50/80 via-white to-blue-50/80 rounded-xl border border-blue-100/60 p-4 mb-6 shadow-sm backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-transparent rounded-xl"></div>
                  <div className="relative flex flex-col sm:flex-row sm:items-center justify-between space-y-3 sm:space-y-0">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center space-x-3">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 leading-tight">
                            {selectedCalendarDate.toLocaleDateString("pt-BR")}
                          </h3>
                          <p className="text-sm text-gray-600 font-medium">
                            {selectedDateVisits.length}{" "}
                            {selectedDateVisits.length === 1
                              ? "visita agendada"
                              : "visitas agendadas"}
                          </p>
                        </div>
                      </div>

                      {/* Busca e Filtros */}
                      {selectedDateVisits.length > 1 && (
                        <div className="bg-white/70 backdrop-blur-sm rounded-lg border border-white/50 px-3 py-2 shadow-sm">
                          {/* Botões de Ordenação com Ícones */}
                          <div className="flex items-center gap-2 justify-center">
                            <button
                              onClick={() => {
                                setVisitsSortBy("name");
                                setVisitsSortOrder(
                                  visitsSortBy === "name" &&
                                    visitsSortOrder === "asc"
                                    ? "desc"
                                    : "asc",
                                );
                              }}
                              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                visitsSortBy === "name"
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                              }`}
                              title="Ordenar por Nome"
                            >
                              <User className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setVisitsSortBy("value");
                                setVisitsSortOrder(
                                  visitsSortBy === "value" &&
                                    visitsSortOrder === "asc"
                                    ? "desc"
                                    : "asc",
                                );
                              }}
                              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                visitsSortBy === "value"
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                              }`}
                              title="Ordenar por Valor"
                            >
                              <DollarSign className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setVisitsSortBy("city");
                                setVisitsSortOrder(
                                  visitsSortBy === "city" &&
                                    visitsSortOrder === "asc"
                                    ? "desc"
                                    : "asc",
                                );
                              }}
                              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                visitsSortBy === "city"
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                              }`}
                              title="Ordenar por Cidade"
                            >
                              <MapPinIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedDateVisits.length === 0 ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
                    <Calendar className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                    <p className="text-blue-600 font-medium">
                      Nenhuma visita agendada para{" "}
                      {selectedCalendarDate.toLocaleDateString("pt-BR")}.
                    </p>
                    <p className="text-blue-500 text-sm">
                      Que tal agendar uma nova visita?
                    </p>
                  </div>
                ) : (
                  <div
                    className="space-y-3"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    {paginatedSelectedDateVisits.map((visit) => (
                      <div
                        key={visit.id}
                        className={`border rounded-2xl p-3 lg:p-4 hover:shadow-md transition-shadow ${
                          visit.isOverdue
                            ? "border-red-300 bg-red-50"
                            : "border-blue-300 bg-blue-50"
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-3 lg:space-y-0">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <button
                                onClick={() => handleOpenClientModal(visit)}
                                className={`font-semibold hover:underline ${
                                  visit.isOverdue
                                    ? "text-red-600 hover:text-red-800"
                                    : "text-blue-600 hover:text-blue-800"
                                }`}
                              >
                                {visit.clientName}
                              </button>
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  visit.isOverdue
                                    ? "bg-red-100 text-red-800"
                                    : getStatusColor(visit)
                                }`}
                              >
                                {visit.isOverdue
                                  ? "Atrasada"
                                  : getStatusLabel(visit)}
                              </span>
                              <span
                                className={`text-sm font-medium ${
                                  visit.isOverdue
                                    ? "text-red-600"
                                    : "text-blue-600"
                                }`}
                              >
                                {visit.scheduledTime || "00:00"}
                              </span>
                              {visit.isOverdue && (
                                <>
                                  <AlertTriangle className="h-4 w-4 text-red-600" />
                                  {visit.overdueDays > 0 && (
                                    <span className="text-xs text-red-600 font-medium">
                                      ({visit.overdueDays}{" "}
                                      {visit.overdueDays === 1 ? "dia" : "dias"}{" "}
                                      de atraso)
                                    </span>
                                  )}
                                </>
                              )}
                              {visit.scheduled_by_manager_id && (
                                <div className="flex items-center text-yellow-600">
                                  <Star className="h-4 w-4 mr-1" />
                                  <span className="text-xs font-medium">
                                    Agendado pelo gerente
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="text-sm text-gray-600 space-y-1">
                              <div className="flex items-center">
                                <MapPin className="h-4 w-4 mr-2" />
                                {[
                                  visit.clientNeighborhood,
                                  visit.clientCity,
                                  visit.clientAddress,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </div>
                              {(visit.totalPendingValue ?? 0) > 0 && (
                                <div className="flex items-center">
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  Pendente:{" "}
                                  {formatCurrency(visit.totalPendingValue ?? 0)}
                                  {visit.overdueCount &&
                                    visit.overdueCount > 0 && (
                                      <span className="ml-2 text-red-600">
                                        <AlertTriangle className="h-4 w-4 inline mr-1" />
                                        {visit.overdueCount}{" "}
                                        {visit.overdueCount === 1
                                          ? "título"
                                          : "títulos"}{" "}
                                        em atraso
                                      </span>
                                    )}
                                </div>
                              )}
                              {visit.notes && (
                                <div className="bg-white border border-gray-200 rounded-2xl p-3 mb-3">
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
                            </div>
                          </div>

                          {visit.status === "agendada" && (
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 lg:ml-4">
                              <button
                                onClick={() => handleMarkAsCompleted(visit)}
                                className="px-3 py-2 bg-green-500 text-white rounded-2xl text-sm hover:bg-green-700 transition-colors flex items-center justify-center"
                              >
                                Realizada
                              </button>
                              <button
                                onClick={() => handleMarkAsNotFound(visit)}
                                className="px-3 py-2 bg-orange-500 text-white rounded-2xl text-sm hover:bg-orange-700 transition-colors flex items-center justify-center"
                              >
                                Não Localizado
                              </button>
                              <button
                                onClick={() => handleOpenRescheduleModal(visit)}
                                className="px-3 py-2 bg-blue-500 text-white rounded-2xl text-sm hover:bg-blue-700 transition-colors flex items-center justify-center"
                              >
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Reagendar
                              </button>
                              {!visit.cancellationRejectedBy && (
                                <button
                                  onClick={() =>
                                    handleRequestCancellation(visit)
                                  }
                                  className="px-3 py-2 bg-red-500 text-white rounded-2xl text-sm hover:bg-red-700 transition-colors flex items-center justify-center"
                                >
                                  Cancelar Visita
                                </button>
                              )}
                            </div>
                          )}
                          {visit.status === "cancelamento_solicitado" && (
                            <div className="lg:ml-4 text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-2xl">
                              <div className="font-medium">
                                Cancelamento Solicitado
                              </div>
                              <div className="text-xs mt-1">
                                Aguardando aprovação do gerente
                              </div>
                              {visit.cancellationRequestReason && (
                                <div className="text-xs mt-1 italic">
                                  Motivo: {visit.cancellationRequestReason}
                                </div>
                              )}
                            </div>
                          )}
                          {visit.cancellationRejectedBy &&
                            visit.status === "agendada" && (
                              <div className="lg:ml-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-2xl">
                                <div className="font-medium">
                                  Cancelamento Rejeitado pelo Gerente
                                </div>
                                <div className="text-xs mt-1">
                                  A visita permanece agendada
                                </div>
                                {visit.cancellationRejectionReason && (
                                  <div className="text-xs mt-1 italic">
                                    Motivo da rejeição:{" "}
                                    {visit.cancellationRejectionReason}
                                  </div>
                                )}
                                {visit.cancellationRejectedAt && (
                                  <div className="text-xs mt-1 text-gray-600">
                                    Rejeitado em:{" "}
                                    {new Date(
                                      visit.cancellationRejectedAt,
                                    ).toLocaleDateString("pt-BR")}{" "}
                                    às{" "}
                                    {new Date(
                                      visit.cancellationRejectedAt,
                                    ).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Mensagem quando nenhuma data é selecionada */
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
                <Calendar className="h-12 w-12 text-blue-400 mx-auto mb-3" />
                <p className="text-blue-700 font-medium text-lg mb-2">
                  Selecione um dia no calendário
                </p>
                <p className="text-blue-600 text-sm">
                  Clique em qualquer dia para visualizar as visitas agendadas
                </p>
              </div>
            )}

            {/* Próximas Visitas */}
            {upcomingVisits.length > 0 && false && (
              <div>
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-gray-600" />
                  Próximas Visitas ({upcomingVisits.length})
                </h3>

                <div className="space-y-3">
                  {upcomingVisits.slice(0, 5).map((visit) => (
                    <div
                      key={visit.id}
                      className="border border-gray-200 rounded-2xl p-3 lg:p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-3 lg:space-y-0">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <button
                              onClick={() => handleOpenClientModal(visit)}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {visit.clientName}
                            </button>
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${getStatusColor(visit)}`}
                            >
                              {getStatusLabel(visit)}
                            </span>
                          </div>

                          <div className="text-sm text-gray-600 space-y-1">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-2" />
                              {visit.status === "realizada" &&
                              visit.dataVisitaRealizada
                                ? `${formatSafeDateTime(visit.dataVisitaRealizada)} (Realizada)`
                                : formatSafeDateTime(
                                    visit.scheduledDate,
                                    visit.scheduledTime,
                                  )}
                            </div>
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-2" />
                              {[
                                visit.clientNeighborhood,
                                visit.clientCity,
                                visit.clientAddress,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </div>
                            {(visit.totalPendingValue ?? 0) > 0 && (
                              <div className="flex items-center">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Pendente:{" "}
                                {formatCurrency(visit.totalPendingValue ?? 0)}
                                {visit.overdueCount &&
                                  visit.overdueCount > 0 && (
                                    <span className="ml-2 text-red-600">
                                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                                      {visit.overdueCount}{" "}
                                      {visit.overdueCount === 1
                                        ? "título"
                                        : "títulos"}{" "}
                                      em atraso
                                    </span>
                                  )}
                              </div>
                            )}
                            {visit.notes && (
                              <div className="text-gray-500 italic whitespace-pre-line">
                                {visit.notes}
                              </div>
                            )}
                          </div>
                        </div>

                        {visit.status === "agendada" && (
                          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 lg:ml-4">
                            <button
                              onClick={() => handleMarkAsCompleted(visit)}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded-2xl text-sm hover:bg-green-200 transition-colors flex items-center justify-center"
                            >
                              Realizada
                            </button>
                            <button
                              onClick={() => handleMarkAsNotFound(visit)}
                              className="px-3 py-2 bg-orange-100 text-orange-700 rounded-2xl text-sm hover:bg-orange-200 transition-colors flex items-center justify-center"
                            >
                              Não Localizado
                            </button>
                            <button
                              onClick={() => handleOpenRescheduleModal(visit)}
                              className="px-3 py-2 bg-blue-100 text-blue-700 rounded-2xl text-sm hover:bg-blue-200 transition-colors flex items-center justify-center"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Reagendar
                            </button>
                            {!visit.cancellationRejectedBy && (
                              <button
                                onClick={() => handleRequestCancellation(visit)}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded-2xl text-sm hover:bg-red-200 transition-colors flex items-center justify-center"
                              >
                                Cancelar Visita
                              </button>
                            )}
                          </div>
                        )}
                        {visit.status === "cancelamento_solicitado" && (
                          <div className="lg:ml-4 text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-2xl">
                            <div className="font-medium">
                              Cancelamento Solicitado
                            </div>
                            <div className="text-xs mt-1">
                              Aguardando aprovação do gerente
                            </div>
                            {visit.cancellationRequestReason && (
                              <div className="text-xs mt-1 italic">
                                Motivo: {visit.cancellationRequestReason}
                              </div>
                            )}
                          </div>
                        )}
                        {visit.cancellationRejectedBy &&
                          visit.status === "agendada" && (
                            <div className="lg:ml-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-2xl">
                              <div className="font-medium">
                                Cancelamento Rejeitado pelo Gerente
                              </div>
                              <div className="text-xs mt-1">
                                A visita permanece agendada
                              </div>
                              {visit.cancellationRejectionReason && (
                                <div className="text-xs mt-1 italic">
                                  Motivo da rejeição:{" "}
                                  {visit.cancellationRejectionReason}
                                </div>
                              )}
                              {visit.cancellationRejectedAt && (
                                <div className="text-xs mt-1 text-gray-600">
                                  Rejeitado em:{" "}
                                  {new Date(
                                    visit.cancellationRejectedAt,
                                  ).toLocaleDateString("pt-BR")}{" "}
                                  às{" "}
                                  {new Date(
                                    visit.cancellationRejectedAt,
                                  ).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  ))}

                  {upcomingVisits.length > 5 && (
                    <div className="text-center py-2">
                      <span className="text-sm text-gray-500">
                        ... e mais {upcomingVisits.length - 5} visita
                        {upcomingVisits.length - 5 !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Paginação no final da página */}
            {selectedDateVisits.length > visitsPerPage && (
              <div className="relative flex items-center justify-center mt-8 pt-6 border-t border-blue-100">
                <div className="flex items-center space-x-4 bg-white rounded-xl border border-blue-200 shadow-sm px-6 py-3">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-50 transition-colors group"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-600 group-hover:text-blue-600" />
                  </button>

                  <div className="flex items-center space-x-2">
                    {Array.from(
                      { length: totalSelectedDatePages },
                      (_, i) => i + 1,
                    ).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-lg font-medium text-sm transition-colors ${
                          currentPage === page
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-gray-600 hover:bg-blue-50 hover:text-blue-600"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage(
                        Math.min(totalSelectedDatePages, currentPage + 1),
                      )
                    }
                    disabled={currentPage === totalSelectedDatePages}
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-50 transition-colors group"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-blue-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal de Notificação de Visitas Atrasadas - Renderizado via Portal */}
        {showOverdueNotificationModal &&
          Object.keys(overdueVisitsByDate).length > 0 &&
          createPortal(
            <div
              className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50"
              onClick={() => setShowOverdueNotificationModal(false)}
            >
              <div
                className="bg-white rounded-2xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 lg:px-6 py-4 border-b border-gray-200 bg-red-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Visitas Atrasadas
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowOverdueNotificationModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="px-4 lg:px-6 py-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                  <p className="text-sm text-gray-600 mb-4">
                    Você possui{" "}
                    {Object.values(overdueVisitsByDate).flat().length} visita
                    {Object.values(overdueVisitsByDate).flat().length > 1
                      ? "s"
                      : ""}{" "}
                    atrasada
                    {Object.values(overdueVisitsByDate).flat().length > 1
                      ? "s"
                      : ""}
                    .
                  </p>

                  <div className="space-y-3">
                    {Object.entries(overdueVisitsByDate)
                      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                      .map(([date, visits]) => {
                        const formattedDate = new Date(
                          date + "T00:00:00",
                        ).toLocaleDateString("pt-BR");
                        const daysDiff = Math.floor(
                          (new Date().getTime() -
                            new Date(date + "T00:00:00").getTime()) /
                            (1000 * 60 * 60 * 24),
                        );

                        return (
                          <div
                            key={date}
                            className="border border-red-200 rounded-lg p-3 bg-red-50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {formattedDate}
                                </p>
                                <p className="text-xs text-red-600">
                                  {daysDiff} {daysDiff === 1 ? "dia" : "dias"}{" "}
                                  de atraso - {visits.length} visita
                                  {visits.length > 1 ? "s" : ""}
                                </p>
                              </div>
                              <button
                                onClick={() => navigateToOverdueDate(date)}
                                className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
                              >
                                Ver Visitas
                              </button>
                            </div>

                            <div className="text-xs text-gray-600 space-y-1">
                              {visits.slice(0, 3).map((visit) => (
                                <div
                                  key={visit.id}
                                  className="flex items-center"
                                >
                                  <User className="h-3 w-3 mr-1" />
                                  {visit.clientName}
                                </div>
                              ))}
                              {visits.length > 3 && (
                                <div className="text-gray-500 italic">
                                  ... e mais {visits.length - 3} cliente
                                  {visits.length - 3 > 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="px-4 lg:px-6 py-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowOverdueNotificationModal(false)}
                    className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-2xl hover:bg-gray-300 transition-colors font-medium"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Modal de Detalhes do Cliente - Renderizado via Portal */}
        {showClientModal &&
          selectedClientForModal &&
          createPortal(
            <ClientDetailModal
              clientGroup={selectedClientForModal}
              userType="collector"
              onClose={handleCloseClientModal}
            />,
            document.body,
          )}

        {/* Modal de Solicitação de Cancelamento - Renderizado via Portal */}
        {showCancellationModal &&
          selectedVisitForCancellation &&
          createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
                <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Solicitar Cancelamento de Visita
                  </h3>
                </div>

                <div className="px-4 lg:px-6 py-4">
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Cliente:</strong>{" "}
                      {selectedVisitForCancellation.clientName}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Data:</strong>{" "}
                      {formatSafeDateTime(
                        selectedVisitForCancellation.scheduledDate,
                        selectedVisitForCancellation.scheduledTime,
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Motivo do cancelamento *
                    </label>
                    <textarea
                      id="cancellation-reason"
                      name="cancellation-reason"
                      value={cancellationReason}
                      onChange={(e) => setCancellationReason(e.target.value)}
                      placeholder="Descreva o motivo para solicitar o cancelamento desta visita..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 mb-4">
                    <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-yellow-700">
                        <strong>Atenção:</strong> Esta solicitação será enviada
                        para aprovação do gerente. A visita permanecerá agendada
                        até que seja aprovada ou rejeitada.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 lg:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleCloseCancellationModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmCancellation}
                    disabled={!cancellationReason.trim()}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-2xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Solicitar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Modal de Reagendamento - Renderizado via Portal */}
        {showRescheduleModal &&
          selectedVisitForReschedule &&
          createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
                <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <RefreshCw className="h-5 w-5 mr-2 text-blue-600" />
                    Reagendar Visita
                  </h3>
                </div>

                <div className="px-4 lg:px-6 py-4">
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Cliente:</strong>{" "}
                      {selectedVisitForReschedule.clientName}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Agendamento atual:</strong>{" "}
                      {formatSafeDateTime(
                        selectedVisitForReschedule.scheduledDate,
                        selectedVisitForReschedule.scheduledTime,
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-4">
                      <strong>Endereço:</strong>{" "}
                      {[
                        selectedVisitForReschedule.clientNeighborhood,
                        selectedVisitForReschedule.clientCity,
                        selectedVisitForReschedule.clientAddress,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </div>{" "}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nova Data *
                      </label>
                      {(() => {
                        const clientData = selectedVisitForReschedule
                          ? getClientDataForVisit(
                              selectedVisitForReschedule.clientDocument,
                            )
                          : null;
                        const hasAllowedDate =
                          clientData &&
                          allowedVisitDates.some(
                            (d) => d.city === clientData.city,
                          );
                        const allowedDays = clientData
                          ? allowedVisitDates
                              .filter((d) => d.city === clientData.city)
                              .map((d) => d.allowed_date)
                              .sort((a, b) => a - b)
                          : [];

                        return (
                          <>
                            {hasAllowedDate && (
                              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-start">
                                <Info className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                                <span>
                                  <strong>
                                    Data(s) permitida(s) para {clientData?.city}
                                    :
                                  </strong>{" "}
                                  dia(s) {allowedDays.join(", ")} de cada mês
                                </span>
                              </div>
                            )}
                            <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                              <input
                                id="reschedule-date"
                                name="reschedule-date"
                                type="date"
                                value={rescheduleDate}
                                onChange={(e) =>
                                  setRescheduleDate(e.target.value)
                                }
                                min={getLocalDate()}
                                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Novo Horário *
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          id="reschedule-time"
                          name="reschedule-time"
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 mt-4">
                    <div className="flex items-start">
                      <Calendar className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-700">
                        <strong>Dica:</strong> Certifique-se de escolher um
                        horário que permita o deslocamento entre visitas.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 lg:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleCloseRescheduleModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmReschedule}
                    disabled={!rescheduleDate || !rescheduleTime}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Reagendar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Modal de Conclusão da Visita com Observações Pré-programadas - Renderizado via Portal */}
        {showCompletedModal &&
          selectedVisitForCompletion &&
          createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
                <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                    Marcar Visita como Realizada
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Cliente: {selectedVisitForCompletion.clientName}
                  </p>
                </div>

                <div className="px-4 lg:px-6 py-4">
                  <p className="text-sm text-gray-700 mb-4">
                    Selecione uma observação sobre como foi a visita:
                  </p>

                  <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 lg:gap-2">
                    {[
                      "Visitado e o cliente pagou tudo.",
                      "Visitado, mas cliente pagou parcialmente",
                      "Visitado, mas cliente mudou de endereço",
                      "Visitado, mas cliente contestou a dívida",
                    ].map((note, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleConfirmCompletion(note);
                        }}
                        className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-green-50 hover:border-green-200 border border-gray-200 rounded-2xl transition-colors text-sm"
                      >
                        {note}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-4 lg:px-6 py-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowCompletedModal(false);
                      setSelectedVisitForCompletion(null);
                    }}
                    className="w-full px-4 py-2 bg-gray-500 text-white rounded-2xl hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Modal de Confirmação para "Não Localizado" - Renderizado via Portal */}
        {showNotFoundConfirmModal &&
          selectedVisitForNotFound &&
          createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
                <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2 text-orange-600" />
                    Confirmar "Não Localizado"
                  </h3>
                </div>

                <div className="px-4 lg:px-6 py-4">
                  <p className="text-gray-700 mb-2">
                    <strong>Cliente:</strong>{" "}
                    {selectedVisitForNotFound.clientName}
                  </p>
                  <p className="text-gray-700 mb-4">
                    <strong>Endereço:</strong>{" "}
                    {[
                      selectedVisitForNotFound.clientNeighborhood,
                      selectedVisitForNotFound.clientCity,
                      selectedVisitForNotFound.clientAddress,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="text-gray-700">
                    Tem certeza de que deseja marcar esta visita como{" "}
                    <strong>"Não Localizado"</strong>?
                  </p>
                </div>

                <div className="px-4 lg:px-6 py-4 border-t border-gray-200 flex space-x-3">
                  <button
                    onClick={() => {
                      setShowNotFoundConfirmModal(false);
                      setSelectedVisitForNotFound(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-2xl hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmNotFoundFirst}
                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-2xl hover:bg-orange-700 transition-colors"
                  >
                    Sim, Confirmar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Modal de "Não Localizado" com Observações Pré-programadas - Renderizado via Portal */}
        {showNotFoundObservationModal &&
          selectedVisitForNotFound &&
          createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
                <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2 text-orange-600" />
                    Marcar como "Não Localizado"
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Cliente: {selectedVisitForNotFound.clientName}
                  </p>
                </div>

                <div className="px-4 lg:px-6 py-4">
                  <p className="text-sm text-gray-700 mb-4">
                    Selecione o motivo de não ter encontrado o cliente:
                  </p>

                  <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 lg:gap-2">
                    {[
                      "Cliente não estava em casa",
                      "Cliente mudou de endereço",
                      "Cliente evitou o atendimento",
                      "Não foi possível localizar o endereço",
                    ].map((note, index) => (
                      <button
                        key={index}
                        onClick={() => handleConfirmNotFound(note)}
                        className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-orange-50 hover:border-orange-200 border border-gray-200 rounded-2xl transition-colors text-sm"
                      >
                        {note}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-4 lg:px-6 py-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowNotFoundObservationModal(false);
                      setSelectedVisitForNotFound(null);
                    }}
                    className="w-full px-4 py-2 bg-gray-500 text-white rounded-2xl hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Modal de Pergunta sobre Pagamento - Renderizado via Portal */}
        {showPaymentQuestionModal &&
          selectedVisitForPayment &&
          createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
                <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                    Pagamento Realizado?
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Cliente: {selectedVisitForPayment.clientName}
                  </p>
                </div>

                <div className="px-4 lg:px-6 py-6">
                  <p className="text-gray-700 text-center mb-6">
                    O cliente fez algum pagamento durante esta visita?
                  </p>

                  <div className="flex space-x-3">
                    <button
                      onClick={handleClientMadePayment}
                      className="flex-1 px-4 py-3 bg-green-500 text-white rounded-2xl hover:bg-green-700 transition-colors font-medium flex items-center justify-center"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Sim, fez pagamento
                    </button>
                    <button
                      onClick={handleClientDidNotPay}
                      className="flex-1 px-4 py-3 bg-gray-500 text-white rounded-2xl hover:bg-gray-700 transition-colors font-medium flex items-center justify-center"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Não fez pagamento
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {showTimeWarningModal &&
          timeWarningData &&
          createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Horário Inválido
                    </h3>
                    <button
                      onClick={() => setShowTimeWarningModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center mb-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" />
                      <p className="text-gray-700">
                        Não é possível agendar para um horário no passado.
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                      <p className="text-sm text-gray-600 mb-2">
                        <strong>Horário selecionado:</strong>{" "}
                        {timeWarningData.selectedTime}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong>Horário sugerido:</strong>{" "}
                        {timeWarningData.suggestedTime}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        updateClientSchedule(
                          timeWarningData.clientDocument,
                          "time",
                          timeWarningData.suggestedTime,
                        );
                        setShowTimeWarningModal(false);
                        setTimeWarningData(null);
                      }}
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-2xl hover:bg-blue-700 transition-colors"
                    >
                      Usar Horário Sugerido
                    </button>

                    <button
                      onClick={() => {
                        // Reverter para o horário anterior
                        if (timeWarningData.previousTime) {
                          updateClientSchedule(
                            timeWarningData.clientDocument,
                            "time",
                            timeWarningData.previousTime,
                          );
                        }
                        setShowTimeWarningModal(false);
                        setTimeWarningData(null);
                      }}
                      className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-2xl hover:bg-gray-300 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Modal de Agendamento de Nova Visita - Renderizado via Portal */}
        {showScheduleModal &&
          createPortal(
            <div
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-hidden"
              onClick={(e) => {
                // Fechar modal ao clicar fora dele
                if (e.target === e.currentTarget) {
                  setShowScheduleModal(false);
                  setModalStep("selection");
                }
              }}
            >
              <div
                className="bg-white rounded-xl sm:rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-gradient-to-r from-blue-600 to-indigo-500 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 rounded-t-xl sm:rounded-t-2xl flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center min-w-0 flex-1">
                      {modalStep === "selection" ? (
                        <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white mr-1.5 sm:mr-2 flex-shrink-0" />
                      ) : (
                        <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-white mr-1.5 sm:mr-2 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-lg font-semibold text-white truncate sm:ml-3">
                          {modalStep === "selection"
                            ? `Clientes para Visita (${selectedClients.size})`
                            : "Confirmar Agendamento"}
                        </h3>
                        <span className="text-[10px] sm:text-sm text-blue-100 block sm:inline sm:ml-3">
                          {modalStep === "selection"
                            ? "Passo 1 de 2"
                            : "Passo 2 de 2"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowScheduleModal(false)}
                      className="p-1.5 sm:p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors flex-shrink-0"
                      title="Fechar"
                    >
                      <X className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="bg-gray-50 px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
                    {/* Content from the schedule tab */}
                    {modalStep === "selection" ? (
                      <div className="space-y-4 sm:space-y-6">
                        {/* Busca e Filtros */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="relative flex-1">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                              <input
                                id="search-clients"
                                type="text"
                                placeholder="Buscar por nome, documento, apelido, endereço ou cidade..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <button
                              onClick={() => setShowFilters(!showFilters)}
                              className={`flex items-center px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                showFilters
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                              }`}
                              title="Filtros Avançados"
                            >
                              <Filter className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Botões de Ordenação com Ícones */}
                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => handleSort("cliente")}
                              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                sortField === "cliente"
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                              }`}
                              title="Ordenar por Nome"
                            >
                              <User className="h-4 w-4" />
                              {getSortIcon("cliente")}
                            </button>
                            <button
                              onClick={() => handleSort("valor")}
                              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                sortField === "valor"
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                              }`}
                              title="Ordenar por Valor"
                            >
                              <DollarSign className="h-4 w-4" />
                              {getSortIcon("valor")}
                            </button>
                            <button
                              onClick={() => handleSort("cidade")}
                              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                sortField === "cidade"
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                              }`}
                              title="Ordenar por Cidade"
                            >
                              <MapPinIcon className="h-4 w-4" />
                              {getSortIcon("cidade")}
                            </button>
                          </div>
                        </div>

                        {/* Filtros Expandidos */}
                        {showFilters && (
                          <div className="bg-gray-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3 sm:space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                              <div>
                                <label className="flex items-center text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                  <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                                  Cidade
                                </label>
                                <div className="relative">
                                  <button
                                    onClick={() =>
                                      setShowCityDropdown(!showCityDropdown)
                                    }
                                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm text-left bg-white"
                                  >
                                    {filters.city.length === 0
                                      ? "Todas as cidades"
                                      : `${filters.city.length} cidades selecionadas`}
                                  </button>
                                  {showCityDropdown && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-xl sm:rounded-2xl shadow-lg max-h-60 overflow-y-auto">
                                      {availableCities.map((city) => (
                                        <label
                                          key={city}
                                          className="flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                                        >
                                          <input
                                            id={`city-filter-${city}`}
                                            type="checkbox"
                                            checked={filters.city.includes(
                                              city,
                                            )}
                                            onChange={() =>
                                              handleCityFilterChange(city)
                                            }
                                            className="mr-2"
                                          />
                                          {city}
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="flex items-center text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                  <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                                  Bairro
                                </label>
                                <div className="relative">
                                  <button
                                    onClick={() =>
                                      setShowNeighborhoodDropdown(
                                        !showNeighborhoodDropdown,
                                      )
                                    }
                                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm text-left bg-white"
                                  >
                                    {filters.neighborhood.length === 0
                                      ? "Todos os bairros"
                                      : `${filters.neighborhood.length} bairros selecionados`}
                                  </button>
                                  {showNeighborhoodDropdown && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-xl sm:rounded-2xl shadow-lg max-h-60 overflow-y-auto">
                                      {availableNeighborhoods.map(
                                        (neighborhood) => (
                                          <label
                                            key={neighborhood}
                                            className="flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                                          >
                                            <input
                                              id={`neighborhood-filter-${neighborhood}`}
                                              type="checkbox"
                                              checked={filters.neighborhood.includes(
                                                neighborhood,
                                              )}
                                              onChange={() =>
                                                handleNeighborhoodFilterChange(
                                                  neighborhood,
                                                )
                                              }
                                              className="mr-2"
                                            />
                                            {neighborhood}
                                          </label>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="flex items-center text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                  <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                                  Valor Mínimo
                                </label>
                                <div className="relative">
                                  <DollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                                  <input
                                    id="valorminimo"
                                    type="number"
                                    placeholder="0"
                                    value={filters.minValue}
                                    onChange={(e) =>
                                      setFilters({
                                        ...filters,
                                        minValue: e.target.value,
                                      })
                                    }
                                    className="w-full pl-7 sm:pl-8 pr-2 sm:pr-3 py-1.5 sm:py-2 border border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="flex items-center text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                  <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                                  Valor Máximo
                                </label>
                                <div className="relative">
                                  <DollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                                  <input
                                    id="valormaximo"
                                    type="number"
                                    placeholder="∞"
                                    value={filters.maxValue}
                                    onChange={(e) =>
                                      setFilters({
                                        ...filters,
                                        maxValue: e.target.value,
                                      })
                                    }
                                    className="w-full pl-7 sm:pl-8 pr-2 sm:pr-3 py-1.5 sm:py-2 border border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="flex items-center text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                  <Eye className="h-3 w-3 mr-1 flex-shrink-0" />
                                  Status da Visita
                                </label>
                                <div className="relative">
                                  <Eye className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400 pointer-events-none" />
                                  <select
                                    value={filters.visitStatus}
                                    onChange={(e) =>
                                      handleFilterChange(
                                        "visitStatus",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full pl-7 sm:pl-8 pr-2 sm:pr-3 py-1.5 sm:py-2 border border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm bg-white appearance-none"
                                  >
                                    <option value="">Todos os status</option>
                                    <option value="recent">
                                      Recente (&lt; 30 dias)
                                    </option>
                                    <option value="low">30-59 dias</option>
                                    <option value="medium">60-89 dias</option>
                                    <option value="high">90-119 dias</option>
                                    <option value="critical">120+ dias</option>
                                    <option value="never-visited">
                                      Nunca visitado
                                    </option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="flex items-center text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                  <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />
                                  Vencimento De
                                </label>
                                <input
                                  id="vencimentode"
                                  type="date"
                                  value={filters.dueDateStart}
                                  onChange={(e) =>
                                    handleFilterChange(
                                      "dueDateStart",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                                />
                              </div>
                              <div>
                                <label className="flex items-center text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                  <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />
                                  Vencimento Até
                                </label>
                                <input
                                  id="vencimentoate"
                                  type="date"
                                  value={filters.dueDateEnd}
                                  onChange={(e) =>
                                    handleFilterChange(
                                      "dueDateEnd",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-2 mt-3 sm:mt-4">
                              <button
                                onClick={clearAllFilters}
                                className="px-3 py-1.5 text-xs sm:text-sm text-gray-600 hover:text-gray-800 transition-colors flex items-center"
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Limpar filtros
                              </button>
                              <button
                                onClick={() => setShowFilters(false)}
                                className="mt-2 sm:mt-4 px-3 py-1.5 text-xs sm:text-sm bg-gray-200 text-gray-700 rounded-xl sm:rounded-2xl hover:bg-gray-300 transition-colors flex items-center"
                              >
                                <X className="h-3 w-3 mr-1" />
                                Fechar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Lista de Clientes */}
                        <div className="space-y-6">
                          {false && selectedClients.size > 0 && (
                            <div
                              id="clienteselecionadosdalistagem"
                              className="bg-blue-50 border border-blue-200 rounded-2xl p-4"
                            >
                              <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Clientes Selecionados ({selectedClients.size})
                              </h4>
                              <div className="grid grid-cols-1 gap-3 max-h-95 overflow-y-auto">
                                {availableClients
                                  .filter((client) =>
                                    selectedClients.has(client.document),
                                  )
                                  .map((client) => {
                                    const schedule = clientSchedules.get(
                                      client.document,
                                    ) || {
                                      date: "",
                                      time: "",
                                    };
                                    return (
                                      <div key={client.document}>
                                        <div className="flex items-center justify-between mb-2">
                                          <div>
                                            <span className="font-medium text-gray-900">
                                              {client.client}
                                              {client.apelido && (
                                                <span className="text-sm text-blue-600 ml-1">
                                                  ({client.apelido})
                                                </span>
                                              )}
                                            </span>
                                            <span className="text-gray-500 ml-2">
                                              ({client.document})
                                            </span>
                                          </div>
                                          <div className="text-red-600 font-medium">
                                            {formatCurrency(
                                              client.pendingValue,
                                            )}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                              Data da Visita
                                            </label>
                                            <div className="relative">
                                              <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                              <input
                                                id={`visit-date-${client.document}`}
                                                name={`visit-date-${client.document}`}
                                                type="date"
                                                value={schedule.date}
                                                onChange={(e) =>
                                                  updateClientSchedule(
                                                    client.document,
                                                    "date",
                                                    e.target.value,
                                                  )
                                                }
                                                min={getLocalDate()}
                                                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-2xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                              Horário
                                            </label>
                                            <div className="relative">
                                              <Clock className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                              <input
                                                id={`visit-time-${client.document}`}
                                                name={`visit-time-${client.document}`}
                                                type="time"
                                                value={schedule.time}
                                                onChange={(e) => {
                                                  const selectedTime =
                                                    e.target.value;
                                                  updateClientSchedule(
                                                    client.document,
                                                    "time",
                                                    selectedTime,
                                                  );
                                                  // Verificar se é um horário no passado
                                                  const selectedDate =
                                                    schedule.date;
                                                  if (
                                                    selectedDate &&
                                                    selectedTime
                                                  ) {
                                                    const [year, month, day] =
                                                      selectedDate.split("-");
                                                    const [hours, minutes] =
                                                      selectedTime.split(":");
                                                    const selectedDateTime =
                                                      new Date(
                                                        parseInt(year),
                                                        parseInt(month) - 1,
                                                        parseInt(day),
                                                        parseInt(hours),
                                                        parseInt(minutes),
                                                      );
                                                    const now = new Date();
                                                    if (
                                                      selectedDateTime <= now
                                                    ) {
                                                      // Mostrar modal de aviso
                                                      setTimeWarningData({
                                                        clientDocument:
                                                          client.document,
                                                        selectedTime:
                                                          selectedTime,
                                                        suggestedTime: "",
                                                        previousTime: "",
                                                      });
                                                      setShowTimeWarningModal(
                                                        true,
                                                      );
                                                    }
                                                  }
                                                }}
                                                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-2xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          {/* Resumo das Visitas Selecionadas */}
                          {false && selectedClients.size > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                              <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                                <CalendarDays className="h-4 w-4 mr-2" />
                                Resumo do Agendamento
                              </h4>
                              <div className="space-y-2">
                                {availableClients
                                  .filter((client) =>
                                    selectedClients.has(client.document),
                                  )
                                  .map((client) => {
                                    const schedule = clientSchedules.get(
                                      client.document,
                                    ) || {
                                      date: "",
                                      time: "",
                                    };
                                    if (!schedule.date || !schedule.time)
                                      return null;
                                    return (
                                      <div
                                        key={client.document}
                                        className="flex items-center justify-between text-sm bg-white rounded-2xl p-2"
                                      >
                                        <div>
                                          <span className="font-medium">
                                            {client.client}
                                            {client.apelido && (
                                              <span className="text-sm text-blue-600 ml-1">
                                                ({client.apelido})
                                              </span>
                                            )}
                                          </span>
                                          <span className="text-gray-500 ml-2">
                                            ({client.document})
                                          </span>
                                        </div>
                                        <div className="text-right">
                                          <div className="font-medium text-blue-600">
                                            {formatSafeDate(schedule.date)} às{" "}
                                            {schedule.time}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          {/* Lista de Clientes Disponíveis */}
                          <div>
                            <div className="flex items-center justify-between mb-3 gap-2">
                              <h4 className="font-semibold text-gray-900 flex items-center text-sm sm:text-base">
                                <Users className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 text-blue-600 flex-shrink-0" />
                                <span className="truncate">
                                  {availableClients.length === 0
                                    ? "Nenhum cliente"
                                    : `${availableClients.length} ${
                                        availableClients.length === 1
                                          ? "cliente"
                                          : "clientes"
                                      }`}
                                </span>
                              </h4>
                              <div className="flex items-center gap-2">
                                {availableClients.length > 0 && (
                                  <label
                                    className={`relative flex items-center text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer
                                      ${isAllSelected ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-50"}
                                      px-2 py-1 sm:p-2 border border-gray-300`}
                                  >
                                    <input
                                      id="select-all"
                                      type="checkbox"
                                      checked={isAllSelected}
                                      onChange={(e) =>
                                        handleSelectAll(e.target.checked)
                                      }
                                      className="sr-only"
                                    />
                                    <span className="whitespace-nowrap">
                                      Todos
                                    </span>
                                  </label>
                                )}
                                {/* Indicador de Paginação */}
                                {availableClients.length >
                                  modalClientsPerPage && (
                                  <div className="flex items-center">
                                    <button
                                      onClick={() =>
                                        setModalCurrentPage(
                                          modalCurrentPage - 1,
                                        )
                                      }
                                      disabled={modalCurrentPage === 1}
                                      className="p-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      title="Página anterior"
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="px-1 sm:px-2 text-xs sm:text-sm font-medium text-gray-700 min-w-[35px] sm:min-w-[40px] text-center">
                                      {modalCurrentPage}/
                                      {Math.ceil(
                                        availableClients.length /
                                          modalClientsPerPage,
                                      )}
                                    </span>
                                    <button
                                      onClick={() =>
                                        setModalCurrentPage(
                                          modalCurrentPage + 1,
                                        )
                                      }
                                      disabled={
                                        modalCurrentPage >=
                                        Math.ceil(
                                          availableClients.length /
                                            modalClientsPerPage,
                                        )
                                      }
                                      className="p-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      title="Próxima página"
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {loading ? (
                              <div className="flex items-center justify-center py-12">
                                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                              </div>
                            ) : availableClients.length === 0 ? (
                              <div className="text-center py-12">
                                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-500">
                                  {searchTerm ||
                                  Object.values(filters).some(Boolean)
                                    ? "Nenhum cliente encontrado com os filtros aplicados."
                                    : "Nenhum cliente encontrado."}
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-6">
                                {(() => {
                                  // Paginação dos clientes
                                  const startIndex =
                                    (modalCurrentPage - 1) *
                                    modalClientsPerPage;
                                  const endIndex =
                                    startIndex + modalClientsPerPage;
                                  const paginatedClients =
                                    availableClients.slice(
                                      startIndex,
                                      endIndex,
                                    );

                                  // Agrupar clientes paginados por bairro
                                  const groupedClients =
                                    paginatedClients.reduce(
                                      (groups, client) => {
                                        const neighborhood =
                                          client.neighborhood || "Outros";
                                        if (!groups[neighborhood]) {
                                          groups[neighborhood] = [];
                                        }
                                        groups[neighborhood].push(client);
                                        return groups;
                                      },
                                      {} as Record<
                                        string,
                                        typeof paginatedClients
                                      >,
                                    );

                                  return Object.entries(groupedClients).map(
                                    ([neighborhood, clients]) => (
                                      <div
                                        key={neighborhood}
                                        className="mb-3 sm:mb-4"
                                      >
                                        {/* Neighborhood Header */}
                                        <div className="flex items-center mb-2 pb-1.5 border-b border-gray-200">
                                          <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500 mr-1 sm:mr-2 flex-shrink-0" />
                                          <h4 className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                                            {neighborhood}
                                          </h4>
                                          <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">
                                            ({clients.length}{" "}
                                            {clients.length !== 1
                                              ? "clientes"
                                              : "cliente"}
                                            )
                                          </span>
                                        </div>
                                        {/* Client Cards */}
                                        <div className="grid grid-cols-1 gap-2 sm:gap-3">
                                          {clients.map((client) => {
                                            const isSelected =
                                              selectedClients.has(
                                                client.document,
                                              );
                                            const status =
                                              getClientStatus(client);
                                            return (
                                              <div
                                                key={client.document}
                                                className={`relative bg-white rounded-xl sm:rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md ${
                                                  isSelected
                                                    ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200"
                                                    : "border-gray-200 hover:border-gray-300"
                                                }`}
                                                onClick={() =>
                                                  handleToggleClientSelection(
                                                    client.document,
                                                  )
                                                }
                                              >
                                                <div
                                                  className={`absolute top-2 sm:top-3 right-2 sm:right-3 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border ${status.color}`}
                                                >
                                                  {status.days}
                                                </div>
                                                <div className="p-2.5 sm:p-4 bg-white border-1 rounded-xl sm:rounded-2xl">
                                                  <div className="flex items-start">
                                                    <div className="flex-1 min-w-0 pr-12 sm:pr-16">
                                                      {/* Client Info */}
                                                      <div className="flex items-start justify-between mb-1.5 sm:mb-2">
                                                        <div className="min-w-0 flex-1">
                                                          <h3 className="font-semibold text-gray-900 text-sm sm:text-lg leading-tight">
                                                            {client.client
                                                              .length > 25
                                                              ? `${client.client.substring(0, 25)}...`
                                                              : client.client}
                                                          </h3>
                                                          {client.apelido && (
                                                            <p className="text-xs sm:text-sm text-blue-600 mt-0.5 sm:mt-1">
                                                              {client.apelido}
                                                            </p>
                                                          )}
                                                          <p className="text-[11px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
                                                            {client.document}
                                                          </p>
                                                        </div>
                                                      </div>
                                                      {/* Client Details */}
                                                      <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-gray-600">
                                                        <div className="flex items-center">
                                                          <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 flex-shrink-0" />
                                                          <span className="truncate">
                                                            {[
                                                              client.neighborhood,
                                                              client.city,
                                                              client.address,
                                                            ]
                                                              .filter(Boolean)
                                                              .join(", ")}
                                                          </span>
                                                        </div>
                                                        <div className="flex items-center">
                                                          <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 flex-shrink-0" />
                                                          <span className="font-medium text-red-600">
                                                            {formatCurrency(
                                                              client.pendingValue,
                                                            )}{" "}
                                                            <span className="hidden sm:inline">
                                                              pendente
                                                            </span>
                                                          </span>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ),
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Etapa de confirmação - Usando os componentes existentes
                      <div className="space-y-6">
                        <div className="bg-gray-100 border border-gray-200 rounded-2xl p-3 sm:p-4">
                          <h4 className="font-semibold text-gray-800 mb-2 text-sm sm:text-base flex items-center">
                            <Calendar className="h-4 w-4 mr-2 text-gray-600" />
                            Definir Data Geral para Todos
                          </h4>
                          <div className="grid grid-cols-1">
                            <div>
                              <label
                                htmlFor="general-date-input"
                                className="sr-only"
                              >
                                Data Geral
                              </label>
                              <div className="relative">
                                <input
                                  id="general-date-input"
                                  type="date"
                                  value={generalScheduleDate}
                                  onChange={handleGeneralDateChange}
                                  min={getLocalDate()}
                                  className="w-full text-sm border border-gray-300 rounded-lg sm:rounded-xl px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Sugestões de datas permitidas */}
                          {(() => {
                            const suggestedDates = new Map<string, number>(); // date -> count
                            const selectedClientsData =
                              getSelectedClientsData();

                            // Coletar TODAS as datas permitidas configuradas para os clientes
                            selectedClientsData.forEach((client) => {
                              const clientAllowedDates =
                                allowedVisitDates.filter(
                                  (d) => d.city === client.city,
                                );

                              clientAllowedDates.forEach((config) => {
                                // Calcular as próximas 3 ocorrências do dia permitido
                                const today = new Date();
                                const currentYear = today.getFullYear();
                                const currentMonth = today.getMonth();
                                const currentDay = today.getDate();

                                // Mês atual
                                if (config.allowed_date >= currentDay) {
                                  const date = new Date(
                                    currentYear,
                                    currentMonth,
                                    config.allowed_date,
                                  );
                                  if (date.getDate() === config.allowed_date) {
                                    const dateStr = date
                                      .toISOString()
                                      .split("T")[0];
                                    suggestedDates.set(
                                      dateStr,
                                      (suggestedDates.get(dateStr) || 0) + 1,
                                    );
                                  }
                                }

                                // Próximo mês
                                const nextMonthDate = new Date(
                                  currentYear,
                                  currentMonth + 1,
                                  config.allowed_date,
                                );
                                if (
                                  nextMonthDate.getDate() ===
                                  config.allowed_date
                                ) {
                                  const dateStr = nextMonthDate
                                    .toISOString()
                                    .split("T")[0];
                                  suggestedDates.set(
                                    dateStr,
                                    (suggestedDates.get(dateStr) || 0) + 1,
                                  );
                                }

                                // Mês seguinte ao próximo
                                const nextNextMonthDate = new Date(
                                  currentYear,
                                  currentMonth + 2,
                                  config.allowed_date,
                                );
                                if (
                                  nextNextMonthDate.getDate() ===
                                  config.allowed_date
                                ) {
                                  const dateStr = nextNextMonthDate
                                    .toISOString()
                                    .split("T")[0];
                                  suggestedDates.set(
                                    dateStr,
                                    (suggestedDates.get(dateStr) || 0) + 1,
                                  );
                                }
                              });
                            });

                            if (suggestedDates.size > 0) {
                              const sortedDates = Array.from(
                                suggestedDates,
                              ).sort(([dateA], [dateB]) =>
                                dateA.localeCompare(dateB),
                              );

                              return (
                                <div className="mt-3 pt-3 border-t border-gray-300">
                                  <p className="text-xs sm:text-sm text-gray-700 mb-2 font-medium">
                                    Datas permitidas:
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {sortedDates.map(([date, count]) => {
                                      // Verificar se é domingo
                                      const [year, month, day] = date
                                        .split("-")
                                        .map(Number);
                                      const dateObj = new Date(
                                        year,
                                        month - 1,
                                        day,
                                      );
                                      const isSunday = dateObj.getDay() === 0;

                                      return (
                                        <button
                                          key={date}
                                          onClick={() =>
                                            handleGeneralDateChange({
                                              target: {
                                                value: date,
                                              },
                                            } as React.ChangeEvent<HTMLInputElement>)
                                          }
                                          className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors font-medium relative ${
                                            isSunday
                                              ? "bg-yellow-100 border border-yellow-400 text-yellow-800 hover:bg-yellow-200"
                                              : "bg-white border border-blue-300 text-blue-700 hover:bg-blue-50"
                                          }`}
                                          title={`${count} cliente${count !== 1 ? "s" : ""} com esta data${isSunday ? " (Domingo!)" : ""}`}
                                        >
                                          {formatSafeDate(date)}
                                          {isSunday && (
                                            <span className="ml-1 text-yellow-600">
                                              ⚠️
                                            </span>
                                          )}
                                          {count > 1 && (
                                            <span
                                              className={`ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] sm:text-xs rounded-full ${
                                                isSunday
                                                  ? "bg-yellow-300 text-yellow-900"
                                                  : "bg-blue-200 text-blue-700"
                                              }`}
                                            >
                                              {count}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        {/* Lista de Clientes Selecionados - Mesmo conteúdo do componente principal */}
                        {selectedClients.size > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 sm:p-4">
                            <h4 className="font-semibold text-blue-900 mb-2 sm:mb-3 flex items-center text-sm sm:text-base">
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Clientes Selecionados ({selectedClients.size})
                            </h4>
                            <div className="grid grid-cols-1 gap-2 sm:gap-3 max-h-95 overflow-y-auto">
                              {availableClients
                                .filter((client) =>
                                  selectedClients.has(client.document),
                                )
                                .map((client) => {
                                  const schedule = clientSchedules.get(
                                    client.document,
                                  ) || {
                                    date: "",
                                    time: "",
                                  };

                                  // Verificar se a data agendada é domingo
                                  const isSunday = schedule.date
                                    ? (() => {
                                        const [year, month, day] = schedule.date
                                          .split("-")
                                          .map(Number);
                                        const date = new Date(
                                          year,
                                          month - 1,
                                          day,
                                        );
                                        return date.getDay() === 0;
                                      })()
                                    : false;

                                  return (
                                    <div
                                      key={client.document}
                                      className={`rounded-xl sm:rounded-2xl p-2 sm:p-3 border ${
                                        isSunday
                                          ? "bg-orange-50 border-orange-300"
                                          : "bg-white border-gray-200"
                                      }`}
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-1 sm:gap-0">
                                        <div className="min-w-0">
                                          <span className="font-medium text-gray-900 text-xs sm:text-sm block truncate">
                                            {client.client.length > 30
                                              ? `${client.client.substring(0, 30)}...`
                                              : client.client}
                                            {client.apelido && (
                                              <span className="text-[10px] sm:text-sm text-blue-600 ml-1">
                                                ({client.apelido})
                                              </span>
                                            )}
                                          </span>
                                          <span className="text-gray-500 text-[10px] sm:text-sm block sm:inline sm:ml-2">
                                            {client.document}
                                          </span>
                                        </div>
                                        <div className="text-left sm:text-right flex-shrink-0">
                                          <div className="text-[11px] sm:text-sm text-gray-600">
                                            {formatSafeDate(schedule.date)} às{" "}
                                            {schedule.time}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 sm:gap-4">
                                        <div>
                                          <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                            <input
                                              id={`date-input-${client.document}`}
                                              type="date"
                                              value={schedule.date}
                                              onChange={(e) => {
                                                const newSchedules = new Map(
                                                  clientSchedules,
                                                );
                                                newSchedules.set(
                                                  client.document,
                                                  {
                                                    ...schedule,
                                                    date: e.target.value,
                                                  },
                                                );
                                                setClientSchedules(
                                                  newSchedules,
                                                );

                                                // Recalcular se é domingo
                                                const newSundayVisits = new Set(
                                                  sundayVisits,
                                                );

                                                // Parsear data corretamente para evitar problemas de timezone
                                                const [year, month, day] =
                                                  e.target.value
                                                    .split("-")
                                                    .map(Number);
                                                const date = new Date(
                                                  year,
                                                  month - 1,
                                                  day,
                                                );
                                                const dayOfWeek = date.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

                                                if (dayOfWeek === 0) {
                                                  newSundayVisits.add(
                                                    client.document,
                                                  );

                                                  // Mostrar notificação
                                                  triggerNotification(
                                                    `⚠️ Atenção: Visita de ${client.client} agendada para DOMINGO (${formatSafeDate(e.target.value)})`,
                                                    "info",
                                                  );
                                                } else {
                                                  newSundayVisits.delete(
                                                    client.document,
                                                  );
                                                }

                                                setSundayVisits(
                                                  newSundayVisits,
                                                );
                                              }}
                                              className="w-full text-[11px] sm:text-sm border border-gray-300 rounded-lg sm:rounded-2xl px-1.5 sm:px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                            <input
                                              id={`time-input-${client.document}`}
                                              type="time"
                                              value={schedule.time}
                                              onChange={(e) => {
                                                const newSchedules = new Map(
                                                  clientSchedules,
                                                );
                                                newSchedules.set(
                                                  client.document,
                                                  {
                                                    ...schedule,
                                                    time: e.target.value,
                                                  },
                                                );
                                                setClientSchedules(
                                                  newSchedules,
                                                );
                                              }}
                                              className="w-full text-[11px] sm:text-sm border border-gray-300 rounded-lg sm:rounded-2xl px-1.5 sm:px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Resumo dos Agendamentos - Mesmo conteúdo do componente principal */}
                        {selectedClients.size > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                            <h3 className="font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center text-sm sm:text-base">
                              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 flex-shrink-0" />
                              Resumo dos Agendamentos
                            </h3>
                            <div className="space-y-1.5 sm:space-y-2">
                              {getSelectedClientsData().map((client) => {
                                const schedule = clientSchedules.get(
                                  client.document,
                                ) || {
                                  date: selectedDate,
                                  time: selectedTime,
                                };
                                return (
                                  <div
                                    key={client.document}
                                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 text-xs sm:text-sm bg-white rounded-lg sm:rounded-2xl p-2 sm:p-2.5"
                                  >
                                    <div className="min-w-0">
                                      <span className="font-medium text-gray-900 block truncate">
                                        {client.client.length > 30
                                          ? `${client.client.substring(0, 30)}...`
                                          : client.client}
                                        {client.apelido && (
                                          <span className="text-[10px] sm:text-sm text-blue-600 ml-1">
                                            ({client.apelido})
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-gray-500 text-[10px] sm:text-xs block sm:inline sm:ml-2">
                                        {client.document}
                                      </span>
                                    </div>
                                    <div className="text-left sm:text-right flex-shrink-0">
                                      <div className="font-medium text-blue-600 text-[11px] sm:text-sm whitespace-nowrap">
                                        {formatSafeDate(schedule.date)} às{" "}
                                        {schedule.time}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Aviso de Visitas em Domingo */}
                        {sundayVisits.size > 0 && (
                          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-orange-900 text-center sm:text-2xl mb-1.5 sm:mb-2">
                                Existe visitas agendadas para domingo!
                              </h4>
                              <p className="text-xs sm:text-sm text-justify text-orange-800 mb-2 sm:mb-3">
                                {sundayVisits.size === 1
                                  ? "Uma visita foi agendada"
                                  : `${sundayVisits.size} visitas foram agendadas`}{" "}
                                para um <strong>domingo</strong> devido à
                                configuração de data automática. Verifique se
                                deseja manter essa data ou ajustá-la
                                manualmente.
                              </p>
                              <div className="space-y-1.5 sm:space-y-2">
                                {getSelectedClientsData()
                                  .filter((client) =>
                                    sundayVisits.has(client.document),
                                  )
                                  .map((client) => {
                                    const schedule = clientSchedules.get(
                                      client.document,
                                    ) || { date: "", time: "" };
                                    return (
                                      <div
                                        key={client.document}
                                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0 text-xs sm:text-sm bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 border border-orange-200"
                                      >
                                        <div className="flex items-start sm:items-center min-w-0">
                                          <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-orange-500 mr-1.5 sm:mr-2 flex-shrink-0 mt-0.5 sm:mt-0" />
                                          <div className="min-w-0 flex-1">
                                            <span className="font-medium text-gray-900 block truncate text-xs sm:text-sm">
                                              {client.client.length > 25
                                                ? `${client.client.substring(0, 25)}...`
                                                : client.client}
                                              {client.apelido && (
                                                <span className="text-[10px] sm:text-sm text-blue-600 ml-1">
                                                  ({client.apelido})
                                                </span>
                                              )}
                                            </span>
                                            <div className="text-[10px] sm:text-xs text-gray-500 truncate">
                                              {client.city} -{" "}
                                              {client.neighborhood}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-left sm:text-right flex-shrink-0 ml-5 sm:ml-0">
                                          <div className="font-semibold text-orange-700 text-[11px] sm:text-sm whitespace-nowrap">
                                            {formatSafeDate(schedule.date)}
                                          </div>
                                          <div className="text-[10px] sm:text-xs text-orange-600">
                                            Domingo
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                              <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-orange-700 bg-orange-100 rounded-md sm:rounded-lg p-1.5 sm:p-2">
                                <strong>Dica:</strong> Você pode ajustar a data
                                individualmente na lista acima, ou configurar um
                                dia diferente nas "Datas Permitidas" para evitar
                                domingos.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-4 lg:px-6 py-4 border-t border-gray-200 bg-white rounded-b-2xl flex-shrink-0">
                  {/* Mobile: Layout em duas linhas */}
                  <div className="sm:hidden space-y-3">
                    {/* Primeira linha mobile: Limpar e Cancelar */}
                    <div className="flex flex-row items-center justify-start space-x-4">
                      <button
                        onClick={() => {
                          setSelectedClients(new Set());
                          setClientSchedules(new Map());
                          setNotes("");
                          clearAllFilters();
                          setCurrentPage(1);
                          setClientsCurrentPage(1);
                          setModalCurrentPage(1);
                          setModalStep("selection");
                        }}
                        className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-center"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Limpar
                      </button>
                      <button
                        onClick={() => {
                          setShowScheduleModal(false);
                          setModalStep("selection");
                        }}
                        className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-center"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                      </button>
                    </div>

                    {/* Segunda linha mobile: Botões de ação */}
                    <div className="flex flex-col items-stretch justify-end space-y-2">
                      {modalStep === "confirmation" && (
                        <button
                          onClick={() => setModalStep("selection")}
                          className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-center"
                        >
                          <ChevronLeft className="h-4 w-4 mr-2" />
                          Voltar
                        </button>
                      )}
                      {modalStep === "selection" ? (
                        <button
                          onClick={() => setModalStep("confirmation")}
                          disabled={selectedClients.size === 0}
                          className="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center"
                        >
                          <ChevronRight className="h-4 w-4 mr-2" />
                          Avançar
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            handleScheduleVisit();
                            setShowScheduleModal(false);
                            setModalStep("selection");
                          }}
                          disabled={selectedClients.size === 0 || loading}
                          className="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center"
                        >
                          {loading ? (
                            <div className="animate-spin h-4 w-4 border border-white border-t-transparent rounded-full mr-2"></div>
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          {loading
                            ? "Agendando..."
                            : `Confirmar ${selectedClients.size} Visita${selectedClients.size > 1 ? "s" : ""}`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Desktop: Layout em uma linha */}
                  <div className="hidden sm:flex items-center justify-between">
                    {/* Lado esquerdo: Limpar e Cancelar */}
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => {
                          setSelectedClients(new Set());
                          setClientSchedules(new Map());
                          setNotes("");
                          clearAllFilters();
                          setCurrentPage(1);
                          setClientsCurrentPage(1);
                          setModalCurrentPage(1);
                          setModalStep("selection");
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-center"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Limpar
                      </button>
                      <button
                        onClick={() => {
                          setShowScheduleModal(false);
                          setModalStep("selection");
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-center"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                      </button>
                    </div>

                    {/* Lado direito: Botões de ação */}
                    <div className="flex items-center space-x-4">
                      {modalStep === "confirmation" && (
                        <button
                          onClick={() => setModalStep("selection")}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors flex items-center justify-center"
                        >
                          <ChevronLeft className="h-4 w-4 mr-2" />
                          Voltar
                        </button>
                      )}
                      {modalStep === "selection" ? (
                        <button
                          onClick={() => setModalStep("confirmation")}
                          disabled={selectedClients.size === 0}
                          className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center"
                        >
                          <ChevronRight className="h-4 w-4 mr-2" />
                          Avançar
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            handleScheduleVisit();
                            setShowScheduleModal(false);
                            setModalStep("selection");
                          }}
                          disabled={selectedClients.size === 0 || loading}
                          className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center"
                        >
                          {loading ? (
                            <div className="animate-spin h-4 w-4 border border-white border-t-transparent rounded-full mr-2"></div>
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          {loading
                            ? "Agendando..."
                            : `Confirmar ${selectedClients.size} Visita${selectedClients.size > 1 ? "s" : ""}`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* DateValidationModal */}
        <DateValidationModal
          isOpen={showDateValidationModal}
          onClose={() => setShowDateValidationModal(false)}
          message={dateValidationMessage}
        />

        {/* Modal de Conflito de Visitas */}
        <ConfirmationModal
          isOpen={showConflictModal}
          onClose={() => {
            setShowConflictModal(false);
            setConflictData([]);
          }}
          onConfirm={continueWithScheduling}
          title="⚠️ Conflito Detectado!"
          message={
            <div>
              <p className="mb-3">
                As seguintes visitas <strong>já estão agendadas</strong>:
              </p>
              <ul className="space-y-2 mb-4">
                {conflictData.map((conflict, idx) => (
                  <li key={idx} className="flex items-center text-sm">
                    <span className="mr-2">•</span>
                    <strong>{conflict.clientName}</strong>
                    <span className="ml-1 text-gray-600">
                      em {formatSafeDate(conflict.date)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                Deseja continuar mesmo assim? Isso criará visitas duplicadas.
              </p>
            </div>
          }
          confirmButtonText="Continuar Mesmo Assim"
          cancelButtonText="Cancelar"
        />
      </div>

      {/* Botão Flutuante para Agendar Nova Visita - Renderizado via Portal */}
      {createPortal(
        <button
          onClick={() => {
            setShowScheduleModal(true);
            setModalCurrentPage(1);
            setModalStep("selection");
          }}
          className="shadow-xl fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all duration-200 flex items-center justify-center z-50 hover:scale-110"
          title="Agendar Nova Visita"
        >
          <Plus className="h-6 w-6" />
        </button>,
        document.body,
      )}

      <Notification
        message={notificationMessage}
        type={notificationType}
        show={showNotification}
      />
    </>
  );
};

export default VisitScheduler;
