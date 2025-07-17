import React, { useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  DollarSign,
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
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { ScheduledVisit } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import ClientDetailModal from "./ClientDetailModal";
import { DateValidationModal } from "../common/DateValidationModal";

interface VisitSchedulerProps {
  onClose?: () => void;
}

const VisitScheduler: React.FC<VisitSchedulerProps> = ({}) => {
  const {
    getClientGroups,
    scheduleVisit,
    scheduledVisits,
    getVisitsByCollector,
    getClientDataForVisit,
    updateVisitStatus,
    requestVisitCancellation,
    rescheduleVisit,
    collections,
  } = useCollection();
  const { user } = useAuth();

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

  const [selectedDate] = useState<string>(getLocalDate());

  const [selectedTime] = useState<string>(getDefaultTime());
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(
    new Set(),
  );
  const [clientSchedules, setClientSchedules] = useState<
    Map<string, { date: string; time: string }>
  >(new Map());
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"schedule" | "list">("schedule");
  const [currentPage, setCurrentPage] = useState(1);
  const [visitsPerPage] = useState(10);
  const [clientsCurrentPage, setClientsCurrentPage] = useState(1);
  const [clientsPerPage] = useState(20);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [selectedVisitForCancellation, setSelectedVisitForCancellation] =
    useState<ScheduledVisit | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedClientForModal, setSelectedClientForModal] =
    useState<any>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<{
    errors: string[];
    conflicts: string[];
  }>({ errors: [], conflicts: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    city: "",
    minValue: "",
    maxValue: "",
    visitStatus: "",
  });
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

  // Obter clientes do cobrador logado
  const availableClients = React.useMemo(() => {
    if (!user || user.type !== "collector") return [];

    const clientGroups = getClientGroups(user.id);

    // Obter visitas ativas (agendadas) do cobrador
    const activeVisits = getVisitsByCollector(user.id).filter(
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
          client.city.toLowerCase().includes(searchLower)
        );
      });
    }

    // Filtro por cidade
    if (filters.city) {
      filteredClients = filteredClients.filter((client) =>
        client.city.toLowerCase().includes(filters.city.toLowerCase()),
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
        today.setHours(0, 0, 0, 0);

        let daysSinceLastVisit: number;

        if (clientVisits.length === 0) {
          daysSinceLastVisit = 999; // Never visited
        } else {
          try {
            // Usar created_at da visita mais recente
            const visit = clientVisits[0];
            const visitDateStr = visit.createdAt.split("T")[0];
            let lastVisitDate: Date;

            if (visitDateStr.includes("-")) {
              // Format YYYY-MM-DD
              const [year, month, day] = visitDateStr.split("-");
              lastVisitDate = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
              );
            } else if (visitDateStr.includes("/")) {
              // Format DD/MM/YYYY
              const [day, month, year] = visitDateStr.split("/");
              lastVisitDate = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
              );
            } else {
              lastVisitDate = new Date(visitDateStr);
            }

            lastVisitDate.setHours(0, 0, 0, 0);
            daysSinceLastVisit = Math.floor(
              (today.getTime() - lastVisitDate.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            daysSinceLastVisit = Math.max(0, daysSinceLastVisit);
          } catch {
            daysSinceLastVisit = 999;
          }
        }

        // Match filter with status type
        switch (filters.visitStatus) {
          case "critical":
            return daysSinceLastVisit >= 120;
          case "high":
            return daysSinceLastVisit >= 90 && daysSinceLastVisit < 120;
          case "medium":
            return daysSinceLastVisit >= 60 && daysSinceLastVisit < 90;
          case "low":
            return daysSinceLastVisit >= 30 && daysSinceLastVisit < 60;
          case "recent":
            return daysSinceLastVisit < 30;
          default:
            return true;
        }
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
  ]);

  // Contar clientes com visitas ativas
  const clientsWithActiveVisits = React.useMemo(() => {
    if (!user || user.type !== "collector") return 0;

    const activeVisits = getVisitsByCollector(user.id).filter(
      (visit) => visit.status === "agendada",
    );
    return activeVisits.length;
  }, [user, getVisitsByCollector, scheduledVisits]);

  // Paginação para clientes
  const paginatedClients = React.useMemo(() => {
    const startIndex = (clientsCurrentPage - 1) * clientsPerPage;
    const endIndex = startIndex + clientsPerPage;
    return availableClients.slice(startIndex, endIndex);
  }, [availableClients, clientsCurrentPage, clientsPerPage]);

  const totalClientsPages = Math.ceil(availableClients.length / clientsPerPage);

  // Resetar página dos clientes quando a busca ou filtros mudarem
  React.useEffect(() => {
    setClientsCurrentPage(1);
  }, [searchTerm, filters]);

  // Obter visitas organizadas por data
  const { todayVisits, upcomingVisits, pastVisits, allVisits } =
    React.useMemo(() => {
      if (!user)
        return {
          todayVisits: [],
          upcomingVisits: [],
          pastVisits: [],
          allVisits: [],
        };

      // Usar a mesma lógica de data local
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;
      const visits = getVisitsByCollector(user.id);

      const todayVisits = visits
        .filter((visit) => {
          // Garantir que a comparação está correta
          return visit.scheduledDate === todayStr;
        })
        .sort((a, b) => {
          const timeA = a.scheduledTime || "00:00";
          const timeB = b.scheduledTime || "00:00";
          return timeA.localeCompare(timeB);
        });

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

      const pastVisits = visits
        .filter((visit) => {
          // Filtrar visitas passadas que ainda estão com status 'agendada'
          return visit.scheduledDate < todayStr && visit.status === "agendada";
        })
        .sort((a, b) => {
          const dateA = new Date(
            `${a.scheduledDate} ${a.scheduledTime || "00:00"}`,
          );
          const dateB = new Date(
            `${b.scheduledDate} ${b.scheduledTime || "00:00"}`,
          );
          return dateB.getTime() - dateA.getTime(); // Mais recentes primeiro
        });

      const allVisits = visits.sort((a, b) => {
        const dateA = new Date(
          `${a.scheduledDate} ${a.scheduledTime || "00:00"}`,
        );
        const dateB = new Date(
          `${b.scheduledDate} ${b.scheduledTime || "00:00"}`,
        );
        return dateA.getTime() - dateB.getTime();
      });

      return { todayVisits, upcomingVisits, pastVisits, allVisits };
    }, [user, getVisitsByCollector, scheduledVisits]);

  // Paginação para visitas de hoje
  const paginatedTodayVisits = React.useMemo(() => {
    const startIndex = (currentPage - 1) * visitsPerPage;
    const endIndex = startIndex + visitsPerPage;
    return todayVisits.slice(startIndex, endIndex);
  }, [todayVisits, currentPage, visitsPerPage]);

  const totalPages = Math.ceil(todayVisits.length / visitsPerPage);

  const handleScheduleVisit = async () => {
    return handleScheduleMultipleVisits();
  };

  const validateClientSchedules = () => {
    const errors: string[] = [];
    const conflicts: string[] = [];
    const scheduleMap = new Map<string, string[]>();

    for (const client of getSelectedClientsData()) {
      const schedule = clientSchedules.get(client.document);
      if (!schedule) {
        errors.push(`${client.client}: Data e horário não configurados`);
        continue;
      }

      // Validar se a data não é no passado (data de hoje é válida)
      const todayString = getLocalDate(); // Usar a mesma função que define a data de hoje

      if (schedule.date < todayString) {
        errors.push(`${client.client}: Data não pode ser anterior a hoje`);
        continue;
      }

      // Verificar conflitos de horário no mesmo dia
      const dateTimeKey = `${schedule.date}_${schedule.time}`;
      if (!scheduleMap.has(dateTimeKey)) {
        scheduleMap.set(dateTimeKey, []);
      }
      scheduleMap.get(dateTimeKey)!.push(client.client);
    }

    // Verificar conflitos
    for (const [dateTime, clients] of scheduleMap.entries()) {
      if (clients.length > 1) {
        const [date, time] = dateTime.split("_");
        conflicts.push(
          `${formatSafeDate(date)} às ${time}: ${clients.join(", ")}`,
        );
      }
    }

    return { errors, conflicts };
  };

  const handleConfirmScheduleWithConflicts = async () => {
    setShowConflictModal(false);
    await proceedWithScheduling();
  };

  const handleCloseConflictModal = () => {
    setShowConflictModal(false);
    setConflictData({ errors: [], conflicts: [] });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      city: "",
      minValue: "",
      maxValue: "",
      visitStatus: "",
    });
    setSearchTerm("");
  };

  const hasActiveFilters =
    searchTerm ||
    filters.city ||
    filters.minValue ||
    filters.maxValue ||
    filters.visitStatus;

  // Obter lista de cidades únicas (apenas de clientes com pendências)
  const availableCities = React.useMemo(() => {
    if (!user || user.type !== "collector") return [];

    const clientGroups = getClientGroups(user.id);
    // Filtrar apenas clientes com pendências
    const clientsWithPending = clientGroups.filter(
      (client) => client.pendingValue > 0,
    );
    const cities = [
      ...new Set(clientsWithPending.map((client) => client.city)),
    ];
    return cities.sort();
  }, [user, getClientGroups]);

  const proceedWithScheduling = async () => {
    try {
      setLoading(true);
      const selectedClientsData = getSelectedClientsData();
      let successCount = 0;
      let errorCount = 0;

      for (const client of selectedClientsData) {
        try {
          const clientData = getClientDataForVisit(client.document);
          if (!clientData) {
            errorCount++;
            continue;
          }

          // Usar data e hora específicas do cliente
          const clientSchedule = clientSchedules.get(client.document);
          const visitDate = clientSchedule?.date || selectedDate;
          const visitTime = clientSchedule?.time || selectedTime;

          const visitData: Omit<ScheduledVisit, "id" | "createdAt"> = {
            collectorId: user!.id,
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
          };

          await scheduleVisit(visitData);
          successCount++;
        } catch (error) {
          console.error(`Erro ao agendar visita para ${client.client}:`, error);
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
        showSuccessNotification(
          `${successCount} visita${successCount !== 1 ? "s" : ""} agendada${successCount !== 1 ? "s" : ""} com sucesso!`,
        );
      }
      if (errorCount > 0) {
        alert(
          `${errorCount} visita${errorCount !== 1 ? "s" : ""} não puderam ser agendada${errorCount !== 1 ? "s" : ""}.`,
        );
      }
    } catch (error) {
      console.error("Erro ao agendar visitas:", error);
      alert("Erro ao agendar visitas. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleMultipleVisits = async () => {
    if (selectedClients.size === 0 || !user) {
      alert("Selecione pelo menos um cliente para agendar as visitas");
      return;
    }

    // Validar agendamentos
    const { errors, conflicts } = validateClientSchedules();

    if (errors.length > 0) {
      // Verificar se há erro de data passada
      const pastDateErrors = errors.filter((error) =>
        error.includes("Data não pode ser anterior a hoje"),
      );
      if (pastDateErrors.length > 0) {
        setDateValidationMessage(
          "Não é possível agendar visitas para datas passadas",
        );
        setShowDateValidationModal(true);
        return;
      }
      // Outros erros
      alert(`Erros encontrados:\n\n${errors.join("\n")}`);
      return;
    }

    if (conflicts.length > 0) {
      setConflictData({ errors, conflicts });
      setShowConflictModal(true);
      return;
    }

    await proceedWithScheduling();
  };

  const handleUpdateVisitStatus = async (
    visitId: string,
    newStatus: ScheduledVisit["status"],
    visitNotes?: string,
  ) => {
    try {
      await updateVisitStatus(visitId, newStatus, visitNotes);
      showSuccessNotification(
        `Visita marcada como ${getStatusLabel(newStatus)}`,
      );
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
    if (selectedVisitForCompletion) {
      await handleUpdateVisitStatus(
        selectedVisitForCompletion.id,
        "realizada",
        selectedNote,
      );
      setShowCompletedModal(false);

      // Abrir modal perguntando sobre pagamento
      setSelectedVisitForPayment(selectedVisitForCompletion);
      setSelectedVisitForCompletion(null);
      setShowPaymentQuestionModal(true);
    }
  };

  // Função para abrir modal de confirmação "Não Encontrado"
  const handleMarkAsNotFound = (visit: ScheduledVisit) => {
    setSelectedVisitForNotFound(visit);
    setShowNotFoundConfirmModal(true);
  };

  // Função para confirmar que quer marcar como "Não Encontrado"
  const handleConfirmNotFoundFirst = () => {
    setShowNotFoundConfirmModal(false);
    setShowNotFoundObservationModal(true);
  };

  // Função para confirmar "Não Encontrado" com observação
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

  const getStatusLabel = (status: ScheduledVisit["status"]) => {
    switch (status) {
      case "agendada":
        return "Agendada";
      case "realizada":
        return "Realizada";
      case "cancelada":
        return "Cancelada";
      case "nao_encontrado":
        return "Não Encontrado";
      case "cancelamento_solicitado":
        return "Cancelamento Solicitado";
      default:
        return status;
    }
  };

  const getStatusColor = (status: ScheduledVisit["status"]) => {
    switch (status) {
      case "agendada":
        return "bg-blue-100 text-blue-800";
      case "realizada":
        return "bg-green-100 text-green-800";
      case "cancelada":
        return "bg-red-100 text-red-800";
      case "nao_encontrado":
        return "bg-orange-100 text-orange-800";
      case "cancelamento_solicitado":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const showSuccessNotification = (
    message: string = "Visita agendada com sucesso!",
  ) => {
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
      setShowCancellationModal(false);
      setSelectedVisitForCancellation(null);
      setCancellationReason("");
      showSuccessNotification(
        "Solicitação de cancelamento enviada para aprovação",
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
    setRescheduleDate(getLocalDate());

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

      showSuccessNotification("Visita reagendada com sucesso!");
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

  const handleCloseClientModal = () => {
    setShowClientModal(false);
    setSelectedClientForModal(null);
  };

  const handleToggleClientSelection = (clientDocument: string) => {
    const newSelection = new Set(selectedClients);
    const newSchedules = new Map(clientSchedules);

    if (newSelection.has(clientDocument)) {
      newSelection.delete(clientDocument);
      newSchedules.delete(clientDocument);
    } else {
      newSelection.add(clientDocument);
      // Inicializar com data e hora padrão
      newSchedules.set(clientDocument, {
        date: selectedDate,
        time: selectedTime,
      });
    }

    setSelectedClients(newSelection);
    setClientSchedules(newSchedules);
  };

  const handleSelectAllClients = () => {
    const newSelection = new Set(selectedClients);
    const newSchedules = new Map(clientSchedules);

    // Verificar se todos os clientes da página atual estão selecionados
    const allCurrentPageSelected = paginatedClients.every((client) =>
      selectedClients.has(client.document),
    );

    if (allCurrentPageSelected && paginatedClients.length > 0) {
      // Desmarcar todos da página atual
      paginatedClients.forEach((client) => {
        newSelection.delete(client.document);
        newSchedules.delete(client.document);
      });
    } else {
      // Selecionar todos da página atual
      paginatedClients.forEach((client) => {
        if (!newSelection.has(client.document)) {
          newSelection.add(client.document);
          newSchedules.set(client.document, {
            date: selectedDate,
            time: selectedTime,
          });
        }
      });
    }

    setSelectedClients(newSelection);
    setClientSchedules(newSchedules);
  };

  const getSelectedClientsData = () => {
    if (!user || user.type !== "collector") return [];

    const allClients = getClientGroups(user.id);
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
  };

  // Calcular dias de atraso da visita
  const getVisitOverdueDays = (visitDate: string): number => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Criar data da visita garantindo que não há problemas de fuso horário
      const [year, month, day] = visitDate.split("-");
      const visitDateObj = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
      );
      visitDateObj.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - visitDateObj.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      return Math.max(0, diffDays);
    } catch (error) {
      console.error("Erro ao calcular dias de atraso da visita:", error);
      return 0;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab("schedule")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "schedule"
                ? "border-b-2 border-purple-600 text-purple-600"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            <Plus className="h-4 w-4 mr-2 inline" />
            Agendar Nova Visita
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "list"
                ? "border-b-2 border-purple-600 text-purple-600"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            <Eye className="h-4 w-4 mr-2 inline" />
            Minhas Visitas ({allVisits.length})
          </button>
        </div>
      </div>

      {/* Filtro e Listagem */}
      <div className="p-4 lg:p-6">
        {activeTab === "schedule" ? (
          // Aba de Agendamento
          <div className="space-y-6">
            {/* Busca e Filtros */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Buscar e Filtrar Clientes
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center px-3 py-1.5 text-sm rounded-2xl transition-colors ${
                      showFilters
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters && (
                      <span className="ml-1 px-1 py-1 bg-purple-600 text-white text-xs rounded-full"></span>
                    )}
                  </button>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-sm text-gray-600 hover:text-gray-800 underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Digite o nome, documento ou endereço do cliente..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Filtros Avançados */}
              {showFilters && (
                <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Filtro por Cidade */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Cidade
                      </label>
                      <select
                        value={filters.city}
                        onChange={(e) =>
                          handleFilterChange("city", e.target.value)
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-2xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                      >
                        <option value="">Todas as cidades</option>
                        {availableCities.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filtro por Valor Mínimo */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Valor Mínimo
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={filters.minValue}
                        onChange={(e) =>
                          handleFilterChange("minValue", e.target.value)
                        }
                        placeholder="R$ 0,00"
                        className="w-full px-3 py-2 text-sm border rounded-2xl border-gray-300 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    {/* Filtro por Valor Máximo */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Valor Máximo
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={filters.maxValue}
                        onChange={(e) =>
                          handleFilterChange("maxValue", e.target.value)
                        }
                        placeholder="R$ 999.999,99"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-2xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    {/* Filtro por Status de Visita */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Status de Visita
                      </label>
                      <select
                        value={filters.visitStatus}
                        onChange={(e) =>
                          handleFilterChange("visitStatus", e.target.value)
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-2xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                      >
                        <option value="">Todos</option>
                        <option value="critical">
                          🔴 Nunca Visitado / Mais de 120 dias
                        </option>
                        <option value="high">🟠 90+ dias sem visita</option>
                        <option value="medium">🟡 60+ dias sem visita</option>
                        <option value="low">🔵 30+ dias sem visita</option>
                        <option value="recent">🟢 Visitado recentemente</option>
                      </select>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <div className="text-sm text-gray-600 py-4">
                      <span className="font-medium">Filtros ativos:</span>
                      {searchTerm && (
                        <span className="ml-1 px-2 py-1 bg-white rounded border">
                          Busca: "{searchTerm}"
                        </span>
                      )}
                      {filters.city && (
                        <span className="ml-1 px-2 py-1 bg-white rounded border">
                          Cidade: {filters.city}
                        </span>
                      )}
                      {filters.minValue && (
                        <span className="ml-1 px-2 py-1 bg-white rounded border">
                          Min: R$ {filters.minValue}
                        </span>
                      )}
                      {filters.maxValue && (
                        <span className="ml-1 px-2 py-1 bg-white rounded border">
                          Max: R$ {filters.maxValue}
                        </span>
                      )}
                      {filters.visitStatus && (
                        <span className="ml-1 px-2 py-1 bg-white rounded border">
                          Status:{" "}
                          {filters.visitStatus === "critical"
                            ? "Nunca/120+ dias"
                            : filters.visitStatus === "high"
                              ? "90+ dias"
                              : filters.visitStatus === "medium"
                                ? "60+ dias"
                                : filters.visitStatus === "low"
                                  ? "30+ dias"
                                  : filters.visitStatus === "recent"
                                    ? "Recente"
                                    : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedClients.size > 0 && (
                <div className="mt-2 text-sm text-purple-600 bg-purple-50 rounded-2xl p-2">
                  {selectedClients.size} cliente
                  {selectedClients.size !== 1 ? "s" : ""} selecionado
                  {selectedClients.size !== 1 ? "s" : ""}
                </div>
              )}
              {clientsWithActiveVisits > 0 && (
                <div className="mt-2 text-sm text-orange-600 bg-orange-50 rounded-2xl p-2 flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {clientsWithActiveVisits} cliente
                  {clientsWithActiveVisits !== 1 ? "s" : ""} com visita
                  {clientsWithActiveVisits !== 1 ? "s" : ""} já agendada
                  {clientsWithActiveVisits !== 1 ? "s" : ""} (não{" "}
                  {clientsWithActiveVisits !== 1 ? "aparecem" : "aparece"} na
                  lista)
                </div>
              )}
            </div>

            {/* Lista de Clientes */}
            {availableClients.length > 0 && (
              <div className="border border-gray-200 rounded-2xl">
                <div className="bg-gray-50 p-3 border-b border-gray-200 rounded-t-2xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-700">
                        {availableClients.length} cliente
                        {availableClients.length !== 1 ? "s" : ""} disponível
                        {availableClients.length !== 1 ? "s" : ""}
                      </span>
                      {totalClientsPages > 1 && (
                        <span className="ml-2 text-xs text-gray-500">
                          (Página {clientsCurrentPage} de {totalClientsPages})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                      <button
                        onClick={handleSelectAllClients}
                        className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                      >
                        {paginatedClients.every((client) =>
                          selectedClients.has(client.document),
                        ) && paginatedClients.length > 0
                          ? "Desmarcar Página"
                          : "Selecionar Página"}
                      </button>

                      {totalClientsPages > 1 && (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() =>
                              setClientsCurrentPage(
                                Math.max(1, clientsCurrentPage - 1),
                              )
                            }
                            disabled={clientsCurrentPage === 1}
                            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              setClientsCurrentPage(
                                Math.min(
                                  totalClientsPages,
                                  clientsCurrentPage + 1,
                                ),
                              )
                            }
                            disabled={clientsCurrentPage === totalClientsPages}
                            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-h-[32rem] overflow-y-auto p-3">
                  {/* Group clients by neighborhood */}
                  {(() => {
                    const groupedClients = paginatedClients.reduce(
                      (groups, client) => {
                        const neighborhood = client.neighborhood || "Outros";
                        if (!groups[neighborhood]) {
                          groups[neighborhood] = [];
                        }
                        groups[neighborhood].push(client);
                        return groups;
                      },
                      {} as Record<string, typeof paginatedClients>,
                    );

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
                            new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime()
                          );
                        });

                      const today = new Date();
                      today.setHours(0, 0, 0, 0);

                      let daysSinceLastVisit: number;

                      if (clientVisits.length === 0) {
                        // Never visited - consider as more than 120 days
                        daysSinceLastVisit = 999;
                      } else {
                        // Use the same safe date parsing as the formatSafeDate function
                        try {
                          // Usar created_at da visita mais recente
                          const visit = clientVisits[0];
                          const visitDateStr = visit.createdAt.split("T")[0];
                          let lastVisitDate: Date;

                          if (visitDateStr.includes("-")) {
                            // Format YYYY-MM-DD
                            const [year, month, day] = visitDateStr.split("-");
                            lastVisitDate = new Date(
                              parseInt(year),
                              parseInt(month) - 1,
                              parseInt(day),
                            );
                          } else if (visitDateStr.includes("/")) {
                            // Format DD/MM/YYYY
                            const [day, month, year] = visitDateStr.split("/");
                            lastVisitDate = new Date(
                              parseInt(year),
                              parseInt(month) - 1,
                              parseInt(day),
                            );
                          } else {
                            lastVisitDate = new Date(visitDateStr);
                          }

                          lastVisitDate.setHours(0, 0, 0, 0);
                          daysSinceLastVisit = Math.floor(
                            (today.getTime() - lastVisitDate.getTime()) /
                              (1000 * 60 * 60 * 24),
                          );

                          // Ensure we don't get negative days
                          daysSinceLastVisit = Math.max(0, daysSinceLastVisit);
                        } catch {
                          // If date parsing fails, consider as never visited
                          daysSinceLastVisit = 999;
                        }
                      }

                      // Determine status based on days without visit
                      if (daysSinceLastVisit >= 120) {
                        return {
                          type: "critical",
                          label:
                            daysSinceLastVisit === 999 ? "Nunca" : "120 dias",
                          color: "bg-red-100 text-red-800 border-red-200",
                          days:
                            daysSinceLastVisit === 999
                              ? "Nunca"
                              : `${daysSinceLastVisit} dias`,
                        };
                      } else if (daysSinceLastVisit >= 90) {
                        return {
                          type: "high",
                          label: "90+ dias",
                          color:
                            "bg-orange-100 text-orange-800 border-orange-200",
                          days: `${daysSinceLastVisit} dias`,
                        };
                      } else if (daysSinceLastVisit >= 60) {
                        return {
                          type: "medium",
                          label: "60+ dias",
                          color:
                            "bg-yellow-100 text-yellow-800 border-yellow-200",
                          days: `${daysSinceLastVisit} dias`,
                        };
                      } else if (daysSinceLastVisit >= 30) {
                        return {
                          type: "low",
                          label: "30+ dias",
                          color: "bg-blue-100 text-blue-800 border-blue-200",
                          days: `${daysSinceLastVisit} dias`,
                        };
                      } else {
                        return {
                          type: "recent",
                          label: "Recente",
                          color: "bg-green-100 text-green-800 border-green-200",
                          days:
                            daysSinceLastVisit === 0
                              ? "Hoje"
                              : `${daysSinceLastVisit} dias`,
                        };
                      }
                    };

                    const getLastVisitInfo = (client: any) => {
                      // Get real visit history from scheduled visits
                      const clientVisits = scheduledVisits
                        .filter(
                          (visit) =>
                            visit.clientDocument === client.document &&
                            visit.status === "realizada",
                        )
                        .sort((a, b) => {
                          // Ordenar por created_at (mais recente primeiro)
                          return (
                            new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime()
                          );
                        });

                      const lastVisit = clientVisits[0];
                      if (!lastVisit) return null;

                      return {
                        date:
                          lastVisit.dataVisitaRealizada ||
                          lastVisit.scheduledDate,
                        result: lastVisit.notes || "Visita realizada",
                      };
                    };

                    return Object.entries(groupedClients).map(
                      ([neighborhood, clients]) => (
                        <div key={neighborhood} className="mb-4">
                          {/* Neighborhood Header */}
                          <div className="flex items-center mb-3 pb-2 border-b border-gray-200">
                            <MapPin className="h-4 w-4 text-gray-500 mr-2" />
                            <h4 className="text-sm font-medium text-gray-700">
                              {neighborhood}
                            </h4>
                            <span className="ml-2 text-xs text-gray-500">
                              ({clients.length} cliente
                              {clients.length !== 1 ? "s" : ""})
                            </span>
                          </div>

                          {/* Client Cards */}
                          <div className="grid grid-cols-1 gap-3">
                            {clients.map((client) => {
                              const status = getClientStatus(client);
                              const lastVisit = getLastVisitInfo(client);
                              const isSelected = selectedClients.has(
                                client.document,
                              );

                              return (
                                <div
                                  key={client.document}
                                  className={`relative bg-white rounded-2xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${
                                    isSelected
                                      ? "border-purple-500 bg-purple-50 shadow-md ring-2 ring-purple-200"
                                      : "border-gray-200 hover:border-gray-300"
                                  }`}
                                  onClick={() =>
                                    handleToggleClientSelection(client.document)
                                  }
                                >
                                  {/* Status Indicator */}
                                  <div
                                    className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium border ${status.color}`}
                                  >
                                    {status.label}
                                  </div>

                                  <div className="p-4">
                                    <div className="flex items-start">
                                      {/* Large Checkbox */}
                                      <div className="mr-4 mt-1">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() =>
                                            handleToggleClientSelection(
                                              client.document,
                                            )
                                          }
                                          className="h-4 w-4 sm:h-6 sm:w-6 text-purple-600 focus:ring-2 focus:ring-purple-500 border-2 border-gray-300 rounded-md cursor-pointer"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        {/* Client Info */}
                                        <div className="flex items-start justify-between mb-2">
                                          <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-gray-900 text-lg truncate">
                                              {client.client}
                                            </h3>
                                            <p className="text-sm text-gray-600">
                                              {client.document}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Address */}
                                        <div className="text-sm text-gray-500 mb-3 flex items-center">
                                          <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
                                          <span className="truncate">
                                            {client.address}, {client.number} -{" "}
                                            {client.city}
                                          </span>
                                        </div>

                                        {/* Financial Info */}
                                        <div className="flex items-center justify-between mb-3">
                                          <div className="flex items-center space-x-4">
                                            <div>
                                              <p className="text-xs text-gray-500">
                                                Valor Pendente
                                              </p>
                                              <p className="text-lg font-bold text-red-600">
                                                {formatCurrency(
                                                  client.pendingValue,
                                                )}
                                              </p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-gray-500">
                                                Total de Parcelas
                                              </p>
                                              <p className="text-sm font-medium text-gray-900">
                                                {
                                                  collections.filter(
                                                    (c) =>
                                                      c.documento ===
                                                      client.document,
                                                  ).length
                                                }
                                              </p>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Last Visit Info */}
                                        <div className="bg-gray-50 rounded-md p-2 mb-2">
                                          {lastVisit ? (
                                            <div>
                                              <div className="flex items-center text-xs text-gray-600">
                                                <Clock className="h-3 w-3 mr-1" />
                                                <span className="font-medium">
                                                  Última visita:
                                                </span>
                                                <span className="ml-1">
                                                  {formatSafeDate(
                                                    lastVisit.date,
                                                  )}
                                                </span>
                                              </div>
                                              <p className="text-xs text-gray-500 mt-1">
                                                {lastVisit.result}
                                              </p>
                                            </div>
                                          ) : (
                                            <div className="flex items-center text-xs text-gray-500">
                                              <Clock className="h-3 w-3 mr-1" />
                                              <span>
                                                Nenhuma visita realizada
                                              </span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center space-x-2">
                                            {status.type === "critical" && (
                                              <div className="flex items-center text-xs text-red-600">
                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                <span>Prioridade Máxima</span>
                                              </div>
                                            )}
                                            {status.type === "high" && (
                                              <div className="flex items-center text-xs text-orange-600">
                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                <span>Prioridade Alta</span>
                                              </div>
                                            )}
                                            {status.type === "medium" && (
                                              <div className="flex items-center text-xs text-yellow-600">
                                                <Clock className="h-3 w-3 mr-1" />
                                                <span>Atenção</span>
                                              </div>
                                            )}
                                            <div className="flex items-center text-xs text-gray-600">
                                              <Clock className="h-3 w-3 mr-1" />
                                              <span>{status.days}</span>
                                            </div>
                                          </div>

                                          {isSelected && (
                                            <div className="flex items-center text-purple-600 text-xs font-medium">
                                              <CheckCircle className="h-4 w-4 mr-1" />
                                              Selecionado
                                            </div>
                                          )}
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
              </div>
            )}

            {availableClients.length === 0 &&
              user &&
              user.type === "collector" && (
                <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-2xl">
                  {hasActiveFilters
                    ? "Nenhum cliente encontrado com os filtros aplicados"
                    : clientsWithActiveVisits > 0
                      ? "Todos os clientes com pendências já têm visitas agendadas"
                      : "Nenhum cliente com pendências disponível para agendamento"}
                </div>
              )}

            {/* Cliente(s) Selecionado(s) */}
            {selectedClients.size > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 lg:p-4">
                <h3 className="font-semibold text-gray-900 mb-2">
                  {selectedClients.size} Cliente
                  {selectedClients.size !== 1 ? "s" : ""} Selecionado
                  {selectedClients.size !== 1 ? "s" : ""}
                </h3>
                {selectedClients.size > 0 && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 mb-3">
                      <div className="flex items-center text-sm text-blue-800">
                        <CalendarDays className="h-4 w-4 mr-2" />
                        <span className="font-medium">
                          Agendamento Individual:
                        </span>
                        <span className="ml-1">
                          Configure data e horário específicos para cada cliente
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {getSelectedClientsData().map((client) => {
                        const schedule = clientSchedules.get(
                          client.document,
                        ) || { date: selectedDate, time: getDefaultTime() };
                        return (
                          <div
                            key={client.document}
                            className="bg-white rounded-2xl p-3 border border-gray-200"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="font-medium text-gray-900">
                                  {client.client}
                                </span>
                                <span className="text-gray-500 ml-2">
                                  ({client.document})
                                </span>
                              </div>
                              <div className="text-red-600 font-medium">
                                {formatCurrency(client.pendingValue)}
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
                                    className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
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
                                    type="time"
                                    value={schedule.time}
                                    onFocus={(e) => {
                                      // Armazenar o valor atual antes de qualquer mudança
                                      e.target.dataset.previousValue =
                                        e.target.value;
                                    }}
                                    onChange={(e) => {
                                      // Apenas atualizar o valor, sem validação
                                      updateClientSchedule(
                                        client.document,
                                        "time",
                                        e.target.value,
                                      );
                                    }}
                                    onBlur={(e) => {
                                      const selectedTime = e.target.value;
                                      const selectedDate = schedule.date;
                                      const previousTime =
                                        e.target.dataset.previousValue ||
                                        schedule.time;

                                      // Verificar se é hoje e se o horário é no passado
                                      if (selectedDate === getLocalDate()) {
                                        const now = new Date();
                                        const [hours, minutes] = selectedTime
                                          .split(":")
                                          .map(Number);
                                        const selectedDateTime = new Date();
                                        selectedDateTime.setHours(
                                          hours,
                                          minutes,
                                          0,
                                          0,
                                        );

                                        if (selectedDateTime <= now) {
                                          // Mostrar modal de aviso
                                          setTimeWarningData({
                                            clientDocument: client.document,
                                            selectedTime: selectedTime,
                                            suggestedTime: getDefaultTime(),
                                            previousTime: previousTime,
                                          });
                                          setShowTimeWarningModal(true);
                                          return;
                                        }
                                      }
                                    }}
                                    className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
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
              </div>
            )}

            {/* Observações */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observações (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione observações sobre a visita..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Resumo de Visitas Agendadas */}
            {selectedClients.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  Resumo dos Agendamentos
                </h3>
                <div className="space-y-2">
                  {getSelectedClientsData().map((client) => {
                    const schedule = clientSchedules.get(client.document) || {
                      date: selectedDate,
                      time: selectedTime,
                    };
                    return (
                      <div
                        key={client.document}
                        className="flex items-center justify-between text-sm bg-white rounded p-2"
                      >
                        <div>
                          <span className="font-medium">{client.client}</span>
                          <span className="text-gray-500 ml-2">
                            ({client.document})
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-blue-600">
                            {formatSafeDate(schedule.date)} às {schedule.time}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end space-y-3 sm:space-y-0 sm:space-x-4">
              <button
                onClick={() => {
                  setSelectedClients(new Set());
                  setClientSchedules(new Map());
                  setNotes("");
                  clearAllFilters();
                  setCurrentPage(1);
                  setClientsCurrentPage(1);
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={handleScheduleVisit}
                disabled={selectedClients.size === 0 || loading}
                className="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center"
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                {loading
                  ? "Agendando..."
                  : selectedClients.size > 0
                    ? `Agendar ${selectedClients.size} Visita${selectedClients.size !== 1 ? "s" : ""}`
                    : "Agendar Visitas"}
              </button>
            </div>
          </div>
        ) : (
          // Aba de Lista de Visitas
          <div className="space-y-6">
            {/* Visitas de Hoje */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 flex items-center">
                  <CalendarDays className="h-5 w-5 mr-2 text-purple-600" />
                  Visitas de Hoje ({todayVisits.length})
                </h3>
                {todayVisits.length > visitsPerPage && (
                  <div className="flex items-center justify-center sm:justify-start space-x-2">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage === 1}
                      className="p-2 border border-gray-300 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-gray-600">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="p-2 border border-gray-300 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {todayVisits.length === 0 ? (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
                  <Calendar className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                  <p className="text-blue-600 font-medium">
                    Nenhuma. "" visita agendada para hoje
                  </p>
                  <p className="text-blue-500 text-sm">
                    Que tal agendar uma nova visita?
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedTodayVisits.map((visit) => (
                    <div
                      key={visit.id}
                      className="border-2 border-blue-300 bg-blue-50 rounded-2xl p-3 lg:p-4 hover:shadow-md transition-shadow"
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
                              className={`px-2 py-1 rounded-full text-xs ${getStatusColor(visit.status)}`}
                            >
                              {getStatusLabel(visit.status)}
                            </span>
                            <span className="text-sm text-blue-600 font-medium">
                              {visit.scheduledTime || "00:00"}
                            </span>
                          </div>

                          <div className="text-sm text-gray-600 space-y-1">
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-2" />
                              {visit.clientAddress}
                            </div>
                            {visit.totalPendingValue && (
                              <div className="flex items-center">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Pendente:{" "}
                                {formatCurrency(visit.totalPendingValue)}
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
                              <div className="text-gray-500 italic">
                                "{visit.notes}"
                              </div>
                            )}
                          </div>
                        </div>

                        {visit.status === "agendada" && (
                          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 lg:ml-4">
                            <button
                              onClick={() => handleMarkAsCompleted(visit)}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200 transition-colors flex items-center justify-center"
                            >
                              Realizada
                            </button>
                            <button
                              onClick={() => handleMarkAsNotFound(visit)}
                              className="px-3 py-2 bg-orange-100 text-orange-700 rounded text-sm hover:bg-orange-200 transition-colors flex items-center justify-center"
                            >
                              Não Encontrado
                            </button>
                            <button
                              onClick={() => handleOpenRescheduleModal(visit)}
                              className="px-3 py-2 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200 transition-colors flex items-center justify-center"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Reagendar
                            </button>
                            {!visit.cancellationRejectedBy && (
                              <button
                                onClick={() => handleRequestCancellation(visit)}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors flex items-center justify-center"
                              >
                                Solicitar Cancelamento
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

            {/* Próximas Visitas */}
            {upcomingVisits.length > 0 && (
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
                              className={`px-2 py-1 rounded-full text-xs ${getStatusColor(visit.status)}`}
                            >
                              {getStatusLabel(visit.status)}
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
                              {visit.clientAddress}
                            </div>
                            {visit.totalPendingValue && (
                              <div className="flex items-center">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Pendente:{" "}
                                {formatCurrency(visit.totalPendingValue)}
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
                              <div className="text-gray-500 italic">
                                "{visit.notes}"
                              </div>
                            )}
                          </div>
                        </div>

                        {visit.status === "agendada" && (
                          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 lg:ml-4">
                            <button
                              onClick={() => handleMarkAsCompleted(visit)}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200 transition-colors flex items-center justify-center"
                            >
                              Realizada
                            </button>
                            <button
                              onClick={() => handleMarkAsNotFound(visit)}
                              className="px-3 py-2 bg-orange-100 text-orange-700 rounded text-sm hover:bg-orange-200 transition-colors flex items-center justify-center"
                            >
                              Não Encontrado
                            </button>
                            <button
                              onClick={() => handleOpenRescheduleModal(visit)}
                              className="px-3 py-2 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200 transition-colors flex items-center justify-center"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Reagendar
                            </button>
                            {!visit.cancellationRejectedBy && (
                              <button
                                onClick={() => handleRequestCancellation(visit)}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors flex items-center justify-center"
                              >
                                Solicitar Cancelamento
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

            {/* Visitas Atrasadas */}
            {pastVisits.length > 0 && (
              <div>
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
                  Visitas Atrasadas ({pastVisits.length})
                </h3>

                <div className="space-y-3">
                  {pastVisits.slice(0, 5).map((visit) => (
                    <div
                      key={visit.id}
                      className="border-2 border-red-300 bg-red-50 rounded-2xl p-3 lg:p-4 hover:shadow-md transition-shadow"
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
                            <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                              Atrasada
                            </span>
                          </div>

                          <div className="text-sm text-gray-600 space-y-1">
                            <div className="flex items-center text-red-600 font-medium">
                              <Calendar className="h-4 w-4 mr-2" />
                              {formatSafeDateTime(
                                visit.scheduledDate,
                                visit.scheduledTime,
                              )}
                              {(() => {
                                const daysLate = getVisitOverdueDays(
                                  visit.scheduledDate,
                                );
                                if (daysLate > 0) {
                                  return (
                                    <span className="ml-2">
                                      ({daysLate}{" "}
                                      {daysLate === 1 ? "dia" : "dias"} de
                                      atraso)
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-2" />
                              {visit.clientAddress}
                            </div>
                            {visit.totalPendingValue && (
                              <div className="flex items-center">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Pendente:{" "}
                                {formatCurrency(visit.totalPendingValue)}
                              </div>
                            )}
                            {visit.notes && (
                              <div className="text-gray-500 italic">
                                "{visit.notes}"
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 lg:ml-4">
                          <button
                            onClick={() => handleMarkAsCompleted(visit)}
                            className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors flex items-center justify-center"
                          >
                            Marcar Realizada
                          </button>
                          <button
                            onClick={() => handleMarkAsNotFound(visit)}
                            className="px-3 py-2 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 transition-colors flex items-center justify-center"
                          >
                            Não Encontrado
                          </button>
                          <button
                            onClick={() => handleOpenRescheduleModal(visit)}
                            className="px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 transition-colors flex items-center justify-center"
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Reagendar
                          </button>
                          <button
                            onClick={() =>
                              handleUpdateVisitStatus(visit.id, "cancelada")
                            }
                            className="px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors flex items-center justify-center"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {pastVisits.length > 5 && (
                    <div className="text-center py-2">
                      <span className="text-sm text-red-600 font-medium">
                        ... e mais {pastVisits.length - 5} visita
                        {pastVisits.length - 5 !== 1 ? "s" : ""} atrasada
                        {pastVisits.length - 5 !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Caso não tenha nenhuma visita */}
            {todayVisits.length === 0 &&
              upcomingVisits.length === 0 &&
              pastVisits.length === 0 && (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    Nenhuma visita agendada
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    Comece agendando uma nova visita na aba "Agendar Nova
                    Visita"
                  </p>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Cliente */}
      {showClientModal && selectedClientForModal && (
        <ClientDetailModal
          clientGroup={selectedClientForModal}
          userType="collector"
          onClose={handleCloseClientModal}
        />
      )}

      {/* Modal de Solicitação de Cancelamento */}
      {showCancellationModal && selectedVisitForCancellation && (
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
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Descreva o motivo para solicitar o cancelamento desta visita..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  required
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 mb-4">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-700">
                    <strong>Atenção:</strong> Esta solicitação será enviada para
                    aprovação do gerente. A visita permanecerá agendada até que
                    seja aprovada ou rejeitada.
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
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Solicitar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento */}
      {showRescheduleModal && selectedVisitForReschedule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <RefreshCw className="h-5 w-5 mr-2 text-purple-600" />
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
                  {selectedVisitForReschedule.clientAddress}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nova Data *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      min={getLocalDate()}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Novo Horário *
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 mt-4">
                <div className="flex items-start">
                  <Calendar className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700">
                    <strong>Dica:</strong> Certifique-se de escolher um horário
                    que permita o deslocamento entre visitas.
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
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Reagendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conflito de Horários */}
      {showConflictModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 text-white mr-3" />
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Conflitos de Horário Detectados
                  </h2>
                  <p className="text-orange-100 text-sm">
                    Alguns clientes têm o mesmo horário agendado
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseConflictModal}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-2xl transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="p-6">
                {/* Lista de Conflitos */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Clock className="h-5 w-5 text-orange-600 mr-2" />
                    Conflitos Encontrados
                  </h3>

                  <div className="space-y-3">
                    {conflictData.conflicts.map((conflict, index) => (
                      <div
                        key={index}
                        className="bg-orange-50 border border-orange-200 rounded-2xl p-4"
                      >
                        <div className="flex items-start">
                          <AlertTriangle className="h-5 w-5 text-orange-600 mr-3 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-orange-800">
                            <div className="font-medium">{conflict}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opções */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <h4 className="font-medium text-gray-900 mb-2">
                    O que você gostaria de fazer?
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>
                      • <strong>Cancelar:</strong> Volte e ajuste os horários
                      manualmente
                    </li>
                    <li>
                      • <strong>Continuar:</strong> Agende mesmo com conflitos
                      (não recomendado)
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCloseConflictModal}
                className="flex-1 px-6 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors font-medium"
              >
                Cancelar e Ajustar
              </button>
              <button
                onClick={handleConfirmScheduleWithConflicts}
                disabled={loading}
                className="flex-1 px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center"
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                {loading ? "Agendando..." : "Continuar Mesmo Assim"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conclusão da Visita com Observações Pré-programadas */}
      {showCompletedModal && selectedVisitForCompletion && (
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
                    onClick={() => handleConfirmCompletion(note)}
                    className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-green-50 hover:border-green-200 border border-gray-200 rounded-2xl transition-colors text-sm"
                  >
                    {note}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <button
                  onClick={() => handleConfirmCompletion("")}
                  className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors text-sm"
                >
                  Marcar como realizada sem observação
                </button>
              </div>
            </div>

            <div className="px-4 lg:px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowCompletedModal(false);
                  setSelectedVisitForCompletion(null);
                }}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-2xl hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para "Não Encontrado" */}
      {showNotFoundConfirmModal && selectedVisitForNotFound && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-orange-600" />
                Confirmar "Não Encontrado"
              </h3>
            </div>

            <div className="px-4 lg:px-6 py-4">
              <p className="text-gray-700 mb-2">
                <strong>Cliente:</strong> {selectedVisitForNotFound.clientName}
              </p>
              <p className="text-gray-700 mb-4">
                <strong>Endereço:</strong>{" "}
                {selectedVisitForNotFound.clientAddress}
              </p>
              <p className="text-gray-700">
                Tem certeza de que deseja marcar esta visita como{" "}
                <strong>"Não Encontrado"</strong>?
              </p>
            </div>

            <div className="px-4 lg:px-6 py-4 border-t border-gray-200 flex space-x-3">
              <button
                onClick={() => {
                  setShowNotFoundConfirmModal(false);
                  setSelectedVisitForNotFound(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-2xl hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmNotFoundFirst}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-2xl hover:bg-orange-700 transition-colors"
              >
                Sim, Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de "Não Encontrado" com Observações Pré-programadas */}
      {showNotFoundObservationModal && selectedVisitForNotFound && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-orange-600" />
                Marcar como "Não Encontrado"
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

              <div className="mt-4">
                <button
                  onClick={() => handleConfirmNotFound("")}
                  className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors text-sm"
                >
                  Marcar como não encontrado sem observação
                </button>
              </div>
            </div>

            <div className="px-4 lg:px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowNotFoundObservationModal(false);
                  setSelectedVisitForNotFound(null);
                }}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-2xl hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pergunta sobre Pagamento */}
      {showPaymentQuestionModal && selectedVisitForPayment && (
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
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-colors font-medium flex items-center justify-center"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Sim, fez pagamento
                </button>
                <button
                  onClick={handleClientDidNotPay}
                  className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-2xl hover:bg-gray-700 transition-colors font-medium flex items-center justify-center"
                >
                  <X className="h-4 w-4 mr-2" />
                  Não fez pagamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTimeWarningModal && timeWarningData && (
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
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-2xl hover:bg-purple-700 transition-colors"
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
        </div>
      )}

      {/* DateValidationModal */}
      <DateValidationModal
        isOpen={showDateValidationModal}
        onClose={() => setShowDateValidationModal(false)}
        message={dateValidationMessage}
      />
    </div>
  );
};

export default VisitScheduler;
