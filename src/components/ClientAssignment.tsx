import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Users,
  AlertCircle,
  Filter,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Award,
  Building,
  HandCoins,
  Briefcase,
  CircleSlash,
  Building2,
  Zap,
} from "lucide-react";
import { useCollection } from "../contexts/CollectionContext";
import { Collection } from "../types";
import { formatCurrency } from "../utils/formatters";
import BulkAssignmentModal from "./BulkAssignmentModal";

interface ClientWithCollections {
  cliente: string;
  documento: string;
  apelido?: string;
  uniqueKey: string; // Adicionado para identificar clientes de forma única (documento ou nome)
  collections: Collection[];
  collectorId?: string;
  collectorName?: string;
  cidade?: string;
  bairro?: string;
}

// Helper function para obter indicador de situação
const getSituacaoIndicator = (collections: Collection[]) => {
  // Verificar se tem alguma parcela "Em mãos"
  const hasEmMaos = collections.some((c) => c.situacao === "Em mãos");
  if (hasEmMaos) {
    return {
      icon: HandCoins,
      label: "Em mãos",
      className: "bg-blue-100 text-blue-800",
    };
  }

  // Verificar se tem alguma parcela "Em tratamento"
  const hasEmTratamento = collections.some(
    (c) => c.situacao === "Em tratamento",
  );
  if (hasEmTratamento) {
    return {
      icon: Briefcase,
      label: "Em tratamento",
      className: "bg-yellow-100 text-yellow-800",
    };
  }

  // Verificar se tem alguma parcela "Cobrança Interna"
  const hasCobrancaInterna = collections.some(
    (c) => c.situacao === "Cobrança Interna",
  );
  if (hasCobrancaInterna) {
    return {
      icon: Building2,
      label: "Cobrança Interna",
      className: "bg-purple-100 text-purple-800",
    };
  }

  // Verificar se tem alguma parcela "Aguardando Interno"
  const hasAguardandoInterno = collections.some(
    (c) => c.situacao === "Aguardando Interno",
  );
  if (hasAguardandoInterno) {
    return {
      icon: AlertCircle,
      label: "Aguardando Interno",
      className: "bg-orange-100 text-orange-800",
    };
  }

  // Verificar se todas as parcelas têm situação vazia
  const allEmpty = collections.every(
    (c) => !c.situacao || c.situacao.trim() === "",
  );
  if (allEmpty) {
    return {
      icon: CircleSlash,
      label: "Vazio",
      className: "bg-gray-100 text-gray-600",
    };
  }

  // Se tem mix de situações ou outras situações
  return null;
};

export const ClientAssignment = React.memo(() => {
  const {
    collections,
    users,
    assignCollectorToClients,
    removeCollectorFromClients,
    updateCollection,
    refreshData,
  } = useCollection();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCollector, setSelectedCollector] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);

  // Novos filtros
  const [filterCollector, setFilterCollector] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>(""); // 'with_collector', 'without_collector', ''
  const [filterCity, setFilterCity] = useState<string>("");
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>("");
  const [filterStore, setFilterStore] = useState<string>(""); // Novo filtro de loja
  const [filterSituacao, setFilterSituacao] = useState<string>(""); // Novo filtro de situação
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [includeWithoutDate, setIncludeWithoutDate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [maxButtons, setMaxButtons] = useState(
    typeof window !== "undefined" && window.innerWidth < 640 ? 2 : 5,
  );

  useEffect(() => {
    const handleResize = () => {
      setMaxButtons(window.innerWidth < 640 ? 2 : 5);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Limite para operações em massa
  const MAX_BATCH_SIZE = 100;

  const collectors = users.filter(
    (user) => user.type === "collector" || user.type === "internal_collector",
  );

  // Função utilitária para parsear e normalizar datas
  const parseAndNormalizeDate = (
    dateStr: string | null | undefined,
  ): Date | null => {
    if (!dateStr || dateStr === "null" || dateStr === "") {
      return null;
    }

    try {
      // Tentar diferentes formatos de data
      let date: Date;

      // Se já está no formato ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)
      if (dateStr.includes("-")) {
        date = new Date(dateStr);
      }
      // Se está no formato brasileiro (DD/MM/YYYY)
      else if (dateStr.includes("/")) {
        const [day, month, year] = dateStr.split("/");
        date = new Date(
          `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
        );
      }
      // Outro formato
      else {
        date = new Date(dateStr);
      }

      // Verificar se a data é válida
      if (isNaN(date.getTime())) {
        return null;
      }

      // Normalizar para meia-noite no timezone local
      date.setHours(0, 0, 0, 0);
      return date;
    } catch (error) {
      console.error("Erro ao parsear data:", dateStr, error);
      return null;
    }
  };

  // Obter opções únicas para filtros
  const clientsData = useMemo(() => {
    const getCollectorForCollection = (
      collection: Collection,
    ): { collectorId?: string; collectorName?: string } => {
      if (collection.user_id) {
        const collector = users.find((u) => u.id === collection.user_id);
        return {
          collectorId: collection.user_id,
          collectorName: collector?.name,
        };
      }

      return { collectorId: undefined, collectorName: undefined };
    };

    const clientsMap = new Map<string, ClientWithCollections>();

    collections.forEach((collection) => {
      const key = (collection.documento || collection.cliente || "").trim();

      if (!key) {
        console.warn("Collection sem documento ou nome válido:", collection);
        return;
      }

      if (!clientsMap.has(key)) {
        const { collectorId, collectorName } =
          getCollectorForCollection(collection);

        clientsMap.set(key, {
          cliente: collection.cliente || "Cliente sem nome",
          documento: collection.documento || "",
          apelido: collection.apelido || undefined,
          uniqueKey: key,
          collections: [],
          collectorId: collectorId,
          collectorName: collectorName,
          cidade: collection.cidade || undefined,
          bairro: collection.bairro || undefined,
        });
      } else {
        const existingClient = clientsMap.get(key)!;
        if (!existingClient.collectorId) {
          const { collectorId, collectorName } =
            getCollectorForCollection(collection);
          if (collectorId) {
            existingClient.collectorId = collectorId;
            existingClient.collectorName = collectorName;
          }
        }
        if (!existingClient.apelido && collection.apelido) {
          existingClient.apelido = collection.apelido;
        }
      }

      clientsMap.get(key)!.collections.push(collection);
    });

    return Array.from(clientsMap.values());
  }, [collections, users]);

  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    clientsData.forEach((client) => {
      if (client.cidade) cities.add(client.cidade);
    });
    return Array.from(cities).sort();
  }, [clientsData]);

  const availableNeighborhoods = useMemo(() => {
    const neighborhoods = new Set<string>();
    clientsData.forEach((client) => {
      if (client.bairro && (!filterCity || client.cidade === filterCity)) {
        neighborhoods.add(client.bairro);
      }
    });
    return Array.from(neighborhoods).sort();
  }, [clientsData, filterCity]);

  const availableStores = useMemo(() => {
    const stores = new Set<string>();
    clientsData.forEach((client) => {
      client.collections.forEach((collection) => {
        if (collection.nome_da_loja) stores.add(collection.nome_da_loja);
      });
    });
    return Array.from(stores).sort();
  }, [clientsData]);

  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (searchTerm) {
      chips.push({
        label: `Busca: "${searchTerm}"`,
        onClear: () => setSearchTerm(""),
      });
    }
    if (filterCollector) {
      const collector = collectors.find((c) => c.id === filterCollector);
      chips.push({
        label: `Cobrador: ${collector?.name || "Desconhecido"}`,
        onClear: () => setFilterCollector(""),
      });
    }
    if (filterStatus) {
      const statusLabel =
        filterStatus === "with_collector" ? "Com Cobrador" : "Sem Cobrador";
      chips.push({
        label: `Status: ${statusLabel}`,
        onClear: () => setFilterStatus(""),
      });
    }
    if (filterCity) {
      chips.push({
        label: `Cidade: ${filterCity}`,
        onClear: () => setFilterCity(""),
      });
    }
    if (filterNeighborhood) {
      chips.push({
        label: `Bairro: ${filterNeighborhood}`,
        onClear: () => setFilterNeighborhood(""),
      });
    }
    if (filterStore) {
      chips.push({
        label: `Loja: ${filterStore}`,
        onClear: () => setFilterStore(""),
      });
    }
    if (filterSituacao) {
      const situacaoLabel =
        filterSituacao === "empty" ? "Vazio" : filterSituacao;
      chips.push({
        label: `Situação: ${situacaoLabel}`,
        onClear: () => setFilterSituacao(""),
      });
    }
    if (filterDateFrom) {
      chips.push({
        label: `De: ${filterDateFrom}`,
        onClear: () => setFilterDateFrom(""),
      });
    }
    if (filterDateTo) {
      chips.push({
        label: `Até: ${filterDateTo}`,
        onClear: () => setFilterDateTo(""),
      });
    }
    if (includeWithoutDate && (filterDateFrom || filterDateTo)) {
      chips.push({
        label: `Incluir sem data`,
        onClear: () => setIncludeWithoutDate(false),
      });
    }

    return chips;
  }, [
    searchTerm,
    filterCollector,
    filterStatus,
    filterCity,
    filterNeighborhood,
    filterStore,
    filterSituacao,
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
    collectors,
  ]);

  const filteredClients = useMemo(() => {
    const filtered = clientsData.filter((client) => {
      const matchesSearch =
        client.cliente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.documento?.includes(searchTerm) ||
        client.apelido?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCollector =
        !filterCollector || client.collectorId === filterCollector;

      const matchesStatus =
        !filterStatus ||
        (filterStatus === "with_collector" && client.collectorId) ||
        (filterStatus === "without_collector" && !client.collectorId);

      const matchesCity = !filterCity || client.cidade === filterCity;

      const matchesNeighborhood =
        !filterNeighborhood || client.bairro === filterNeighborhood;

      const matchesStore =
        !filterStore ||
        client.collections.some((c) => c.nome_da_loja === filterStore);

      // Filtro por situação
      const matchesSituacao = (() => {
        if (!filterSituacao) return true;

        // Verificar se alguma collection tem a situação desejada
        const hasSituacao = client.collections.some((c) => {
          if (filterSituacao === "empty") {
            return !c.situacao || c.situacao.trim() === "";
          }
          return c.situacao === filterSituacao;
        });

        return hasSituacao;
      })();

      // Filtro por período de data de vencimento - VERSÃO CORRIGIDA
      const matchesDateRange = (() => {
        // Se não há filtros de data, incluir todos
        if (!filterDateFrom && !filterDateTo) return true;

        // Parsear as datas do filtro uma vez
        const fromDate = filterDateFrom
          ? parseAndNormalizeDate(filterDateFrom)
          : null;
        const toDate = filterDateTo
          ? parseAndNormalizeDate(filterDateTo)
          : null;

        // Se as datas do filtro são inválidas, incluir todos
        if ((filterDateFrom && !fromDate) || (filterDateTo && !toDate)) {
          console.warn("Datas de filtro inválidas:", {
            filterDateFrom,
            filterDateTo,
          });
          return true;
        }

        // Verificar se o cliente tem alguma parcela válida
        let hasValidDate = false;
        let hasDateInRange = false;

        for (const collection of client.collections) {
          const dueDate = parseAndNormalizeDate(collection.data_vencimento);

          if (dueDate) {
            hasValidDate = true;

            // Verificar se está no range
            let inRange = true;

            if (fromDate) {
              inRange = inRange && dueDate >= fromDate;
            }

            if (toDate) {
              inRange = inRange && dueDate <= toDate;
            }

            if (inRange) {
              hasDateInRange = true;
              break; // Encontrou uma data no range, pode parar
            }
          }
        }

        // Lógica de retorno
        if (hasDateInRange) {
          return true; // Tem pelo menos uma parcela no período
        }

        if (!hasValidDate && includeWithoutDate) {
          return true; // Não tem data válida mas checkbox está marcado
        }

        return false; // Tem data válida mas nenhuma no período OU não tem data e checkbox não está marcado
      })();

      return (
        matchesSearch &&
        matchesCollector &&
        matchesStatus &&
        matchesCity &&
        matchesNeighborhood &&
        matchesStore &&
        matchesSituacao &&
        matchesDateRange
      );
    });

    return filtered;
  }, [
    clientsData,
    searchTerm,
    filterCollector,
    filterStatus,
    filterCity,
    filterNeighborhood,
    filterStore,
    filterSituacao,
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredClients]);

  // Clientes da página atual
  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredClients.slice(startIndex, endIndex);
  }, [filteredClients, currentPage, itemsPerPage]);

  // Informações da paginação
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startItem =
    filteredClients.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(currentPage * itemsPerPage, filteredClients.length);

  const handleSelectAll = () => {
    const currentPageUniqueKeys = paginatedClients.map((c) => c.uniqueKey);
    const allCurrentPageSelected = currentPageUniqueKeys.every((key) =>
      selectedClients.has(key),
    );

    if (allCurrentPageSelected) {
      // Remover todos da página atual
      const newSelected = new Set(selectedClients);
      currentPageUniqueKeys.forEach((key) => newSelected.delete(key));
      setSelectedClients(newSelected);
    } else {
      // Adicionar todos da página atual
      const newSelected = new Set(selectedClients);
      currentPageUniqueKeys.forEach((key) => newSelected.add(key));
      setSelectedClients(newSelected);
    }
  };

  const handleSelectAllFiltered = () => {
    if (selectedClients.size === filteredClients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(filteredClients.map((c) => c.uniqueKey)));
    }
  };

  const handleSelectClient = (uniqueKey: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(uniqueKey)) {
      newSelected.delete(uniqueKey);
    } else {
      newSelected.add(uniqueKey);
    }
    setSelectedClients(newSelected);
  };

  const hasActiveFilters = activeFilterChips.length > 0;

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    const totalClients = clientsData.length;
    const assignedClients = clientsData.filter((c) => c.collectorId).length;
    const unassignedClients = totalClients - assignedClients;
    
    // Calcular valor total pendente
    const totalPendingValue = clientsData.reduce((sum, client) => {
      const clientTotal = client.collections.reduce((s, c) => s + c.valor_original, 0);
      const clientReceived = client.collections.reduce((s, c) => s + c.valor_recebido, 0);
      return sum + (clientTotal - clientReceived);
    }, 0);

    // Calcular novos clientes (Mês Atual vs Mês Anterior)
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const newClientsMonth = clientsData.filter(client => {
      return client.collections.some(c => {
        const launchDate = parseAndNormalizeDate(c.data_lancamento);
        return launchDate && launchDate >= currentMonthStart;
      });
    }).length;

    const prevMonthCount = clientsData.filter(client => {
      return client.collections.some(c => {
        const launchDate = parseAndNormalizeDate(c.data_lancamento);
        return launchDate && launchDate >= prevMonthStart && launchDate <= prevMonthEnd;
      });
    }).length;

    const assignmentRate = totalClients > 0 ? (assignedClients / totalClients) * 100 : 0;

    return {
      totalClients,
      assignedClients,
      unassignedClients,
      totalPendingValue,
      newClientsMonth,
      prevMonthCount,
      assignmentRate,
    };
  }, [clientsData]);

  // Calculate filtered overview statistics
  const filteredStats = useMemo(() => {
    const totalFiltered = filteredClients.length;
    const assignedFiltered = filteredClients.filter((c) => c.collectorId).length;
    const unassignedFiltered = totalFiltered - assignedFiltered;
    
    const totalPendingFiltered = filteredClients.reduce((sum, client) => {
      const clientTotal = client.collections.reduce((s, c) => s + c.valor_original, 0);
      const clientReceived = client.collections.reduce((s, c) => s + c.valor_recebido, 0);
      return sum + (clientTotal - clientReceived);
    }, 0);

    // Novos clientes filtrados (Mês Atual vs Mês Anterior)
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const newClientsFiltered = filteredClients.filter(client => {
      return client.collections.some(c => {
        const launchDate = parseAndNormalizeDate(c.data_lancamento);
        return launchDate && launchDate >= currentMonthStart;
      });
    }).length;

    const prevMonthFiltered = filteredClients.filter(client => {
      return client.collections.some(c => {
        const launchDate = parseAndNormalizeDate(c.data_lancamento);
        return launchDate && launchDate >= prevMonthStart && launchDate <= prevMonthEnd;
      });
    }).length;

    return {
      totalFiltered,
      assignedFiltered,
      unassignedFiltered,
      totalPendingFiltered,
      newClientsFiltered,
      prevMonthFiltered,
    };
  }, [filteredClients]);

  // Debug info para datas (remover em produção)
  useEffect(() => {
    if (filterDateFrom || filterDateTo) {
      console.log("=== DEBUG FILTRO DE DATA ===");
      console.log("Filtros ativos:", {
        filterDateFrom,
        filterDateTo,
        includeWithoutDate,
      });
      console.log("Total de clientes filtrados:", filteredClients.length);

      // Analisar algumas datas para debug
      const sampleDates = new Set<string>();
      let validCount = 0;
      let invalidCount = 0;

      clientsData.slice(0, 100).forEach((client) => {
        client.collections.forEach((col) => {
          if (col.data_vencimento) {
            sampleDates.add(col.data_vencimento);
            const parsed = parseAndNormalizeDate(col.data_vencimento);
            if (parsed) validCount++;
            else invalidCount++;
          }
        });
      });

      console.log(
        "Amostra de datas (primeiras 10):",
        Array.from(sampleDates).slice(0, 10),
      );
      console.log("Datas válidas/inválidas na amostra:", {
        validCount,
        invalidCount,
      });
    }
  }, [
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
    filteredClients,
    clientsData,
  ]);

  // Calcular estatísticas para o card principal
  const mainStats = useMemo(() => {
    const total = hasActiveFilters
      ? filteredStats.totalFiltered
      : overviewStats.totalClients;
    const assigned = hasActiveFilters
      ? filteredStats.assignedFiltered
      : overviewStats.assignedClients;
    const newClients = hasActiveFilters
      ? filteredStats.newClientsFiltered
      : overviewStats.newClientsMonth;
    const prevMonth = hasActiveFilters
      ? filteredStats.prevMonthFiltered
      : overviewStats.prevMonthCount;
    const pendingValue = hasActiveFilters
      ? filteredStats.totalPendingFiltered
      : overviewStats.totalPendingValue;
    
    const assignmentRate = total > 0 ? (assigned / total) * 100 : 0;

    return {
      total,
      assigned,
      unassigned: total - assigned,
      newClients,
      prevMonth,
      pendingValue,
      assignmentRate,
    };
  }, [hasActiveFilters, filteredStats, overviewStats]);

  return (
    <div className="space-y-6">
      {/* Header — Estilo Ranking de Performance */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-dark-text tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600 flex-shrink-0" />
              Atribuição de Cobradores
            </h2>
            <p className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary mt-1 uppercase tracking-wider">
              {hasActiveFilters ? "Visão Filtrada" : "Gestão Estratégica de Carteira"}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                showFilters || hasActiveFilters
                  ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100 dark:shadow-none"
                  : "bg-white dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtros {hasActiveFilters && `(${activeFilterChips.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* Grid de Cards Executivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card: Total de Clientes */}
        <div className="bg-white dark:bg-dark-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            {mainStats.unassigned > 0 && (
              <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg uppercase tracking-tight">
                {mainStats.unassigned} Pendentes
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-1">Total Clientes</p>
            <p className="text-3xl font-black text-gray-900 dark:text-dark-text tracking-tighter">{mainStats.total}</p>
          </div>
        </div>

        {/* Card: Novos Clientes */}
        <div className="bg-white dark:bg-dark-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            {mainStats.prevMonth > 0 ? (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tight ${mainStats.newClients >= mainStats.prevMonth ? 'text-green-600 bg-green-50' : 'text-amber-600 bg-amber-50'}`}>
                {mainStats.newClients >= mainStats.prevMonth ? '+' : ''}{((mainStats.newClients / mainStats.prevMonth - 1) * 100).toFixed(0)}% vs mês ant.
              </span>
            ) : (
              <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-lg uppercase tracking-tight">
                Mês Atual
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-1">Novos Clientes</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-gray-900 dark:text-dark-text tracking-tighter">{mainStats.newClients}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">vs {mainStats.prevMonth} no mês ant.</p>
            </div>
          </div>
        </div>

        {/* Card: Valor em Aberto */}
        <div className="bg-white dark:bg-dark-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
              <HandCoins className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-1">Valor em Aberto</p>
            <p className="text-2xl font-black text-indigo-700 dark:text-indigo-400 tracking-tighter">{formatCurrency(mainStats.pendingValue)}</p>
          </div>
        </div>

        {/* Card: Taxa de Atribuição */}
        <div className={`p-5 rounded-2xl shadow-xl flex flex-col justify-between relative overflow-hidden group transition-all ${mainStats.assignmentRate > 90 ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white' : 'bg-white dark:bg-dark-bg-secondary border border-gray-100 dark:border-dark-border text-gray-900 dark:text-dark-text'}`}>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className={`p-2 rounded-xl ${mainStats.assignmentRate > 90 ? 'bg-white/20 backdrop-blur-md' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
              <Award className={`h-5 w-5 ${mainStats.assignmentRate > 90 ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
            </div>
            <div className={`flex items-center text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tight ${mainStats.assignmentRate > 90 ? 'bg-white/20 text-blue-100' : 'bg-blue-50 text-blue-600'}`}>
              {mainStats.assignmentRate > 90 ? 'Excelente' : 'Em progresso'}
            </div>
          </div>
          <div className="relative z-10">
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${mainStats.assignmentRate > 90 ? 'text-blue-100' : 'text-gray-400 dark:text-dark-text-secondary'}`}>Taxa Atribuição</p>
            <p className="text-3xl font-black tracking-tighter">{mainStats.assignmentRate.toFixed(1)}%</p>
          </div>
          {mainStats.assignmentRate > 90 && (
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
          )}
        </div>
      </div>

      {/* Filtros Rápidos */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        <span className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mr-2">Visão Rápida:</span>
        
        <button
          onClick={() => {
            setFilterStatus("");
            setFilterDateFrom("");
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
            !filterStatus && !filterDateFrom
              ? "bg-gray-900 text-white border-gray-900 shadow-md"
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
          }`}
        >
          Todos
        </button>

        <button
          onClick={() => {
            setFilterStatus("without_collector");
            setFilterDateFrom("");
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
            filterStatus === "without_collector"
              ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20"
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text border-gray-200 dark:border-dark-border hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:text-amber-600 hover:border-amber-200"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Pendentes
        </button>

        <button
          onClick={() => {
            setFilterStatus("with_collector");
            setFilterDateFrom("");
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
            filterStatus === "with_collector"
              ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20"
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text border-gray-200 dark:border-dark-border hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:text-blue-600 hover:border-blue-200"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Atribuídos
        </button>

        <button
          onClick={() => {
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            setFilterDateFrom(currentMonthStart.toISOString().split('T')[0]);
            setFilterStatus("");
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
            filterDateFrom && !filterStatus
              ? "bg-green-600 text-white border-green-600 shadow-md shadow-green-600/20"
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text border-gray-200 dark:border-dark-border hover:bg-green-50 dark:hover:bg-green-900/10 hover:text-green-600 hover:border-green-200"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Novos (Mês)
        </button>
      </div>

      {/* Filtros Rápidos: Cobradores */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 custom-scrollbar">
        <span className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mr-2 whitespace-nowrap">Por Cobrador:</span>
        
        <button
          onClick={() => setFilterCollector("")}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap ${
            !filterCollector
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-gray-100 dark:bg-dark-bg text-gray-500 dark:text-dark-text-secondary border-transparent hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary"
          }`}
        >
          Todos
        </button>

        {collectors.map((collector) => (
          <button
            key={collector.id}
            onClick={() => setFilterCollector(collector.id)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap ${
              filterCollector === collector.id
                ? "bg-blue-600 text-white border-blue-600 shadow-md"
                : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text border-gray-200 dark:border-dark-border hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {collector.name}
          </button>
        ))}
      </div>

      {/* Filtros Colapsáveis */}
      {showFilters && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] flex items-center">
                <Search className="h-3 w-3 mr-1.5" />
                Buscar Cliente
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nome ou documento..."
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] flex items-center">
                <Users className="h-3 w-3 mr-1.5" />
                Cobrador
              </label>
              <select
                value={filterCollector}
                onChange={(e) => setFilterCollector(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">TODOS OS COBRADORES</option>
                {collectors.map((collector) => (
                  <option key={collector.id} value={collector.id}>
                    {collector.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] flex items-center">
                <AlertCircle className="h-3 w-3 mr-1.5" />
                Status de Atribuição
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">TODOS</option>
                <option value="with_collector">COM COBRADOR</option>
                <option value="without_collector">SEM COBRADOR</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] flex items-center">
                <MapPin className="h-3 w-3 mr-1.5" />
                Cidade
              </label>
              <select
                value={filterCity}
                onChange={(e) => {
                  setFilterCity(e.target.value);
                  setFilterNeighborhood("");
                }}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">TODAS AS CIDADES</option>
                {availableCities.map((city) => (
                  <option key={city} value={city}>
                    {city.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] flex items-center">
                <MapPin className="h-3 w-3 mr-1.5" />
                Bairro
              </label>
              <select
                value={filterNeighborhood}
                onChange={(e) => setFilterNeighborhood(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!filterCity}
              >
                <option value="">TODOS OS BAIRROS</option>
                {availableNeighborhoods.map((neighborhood) => (
                  <option key={neighborhood} value={neighborhood}>
                    {neighborhood.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] flex items-center">
                <Building className="h-3 w-3 mr-1.5" />
                Loja
              </label>
              <select
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">TODAS AS LOJAS</option>
                {availableStores.map((store) => (
                  <option key={store} value={store}>
                    {store.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] flex items-center">
                <Award className="h-3 w-3 mr-1.5" />
                Situação
              </label>
              <select
                value={filterSituacao}
                onChange={(e) => setFilterSituacao(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">TODAS AS SITUAÇÕES</option>
                <option value="Em mãos">EM MÃOS</option>
                <option value="Em tratamento">EM TRATAMENTO</option>
                <option value="Aguardando Interno">AGUARDANDO INTERNO</option>
                <option value="Cobrança Interna">COBRANÇA INTERNA</option>
                <option value="empty">VAZIO</option>
              </select>
            </div>

            <div className="col-span-full pt-4 border-t border-gray-100 dark:border-dark-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setSearchTerm("");
                  setFilterCollector("");
                  setFilterStatus("");
                  setFilterCity("");
                  setFilterNeighborhood("");
                  setFilterStore("");
                  setFilterSituacao("");
                  setFilterDateFrom("");
                  setFilterDateTo("");
                  setIncludeWithoutDate(false);
                  setCurrentPage(1);
                }}
                className="px-4 py-2 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 dark:hover:text-dark-text transition-colors"
              >
                Limpar Filtros
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="px-6 py-2 bg-gray-900 dark:bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all sm:hidden"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-900 dark:text-dark-text uppercase tracking-tight">
              Lista de Clientes
            </h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Mostrando {filteredClients.length} registros filtrados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-dark-border dark:text-dark-text rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg/50 transition-all"
            >
              {paginatedClients.every((c) => selectedClients.has(c.uniqueKey))
                ? "Desmarcar Página"
                : "Selecionar Página"}
            </button>
            {filteredClients.length > itemsPerPage && (
              <button
                onClick={handleSelectAllFiltered}
                className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded-xl hover:bg-blue-100 transition-all"
              >
                Todos ({filteredClients.length})
              </button>
            )}
          </div>
        </div>

        {/* Visualização em Tabela (Desktop) */}
        <div className="hidden md:block bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-dark-bg border-b border-gray-100 dark:border-dark-border">
                  <th className="px-6 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={paginatedClients.length > 0 && paginatedClients.every((c) => selectedClients.has(c.uniqueKey))}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg"
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cliente / Documento</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Parcelas</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status / Cobrador</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Localização</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Valores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {paginatedClients.map((client) => {
                  const isWithoutCollector = !client.collectorId;
                  const totalValue = client.collections.reduce((sum, c) => sum + c.valor_original, 0);
                  const pendingValue = totalValue - client.collections.reduce((sum, c) => sum + c.valor_recebido, 0);
                  const situacao = getSituacaoIndicator(client.collections);

                  return (
                    <tr
                      key={client.uniqueKey}
                      className={`hover:bg-gray-50/50 dark:hover:bg-dark-bg transition-colors cursor-pointer group ${
                        selectedClients.has(client.uniqueKey) ? "bg-blue-50/30 dark:bg-blue-900/10" : ""
                      }`}
                      onClick={() => handleSelectClient(client.uniqueKey)}
                    >
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedClients.has(client.uniqueKey)}
                          onChange={() => handleSelectClient(client.uniqueKey)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-gray-900 dark:text-dark-text truncate max-w-[250px]" title={client.cliente}>
                            {client.cliente.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{client.documento}</span>
                          {client.apelido && <span className="text-[10px] text-blue-500 font-black italic mt-0.5">"{client.apelido.toUpperCase()}"</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text border border-gray-200 dark:border-dark-border">
                          {client.collections.length}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          {client.collectorName ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/30 uppercase tracking-widest w-fit">
                              {client.collectorName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 uppercase tracking-widest w-fit">
                              Sem Cobrador
                            </span>
                          )}
                          {situacao && (
                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight w-fit ${situacao.className} border border-current opacity-80`}>
                              <situacao.icon className="h-3 w-3" />
                              {situacao.label}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-[11px] font-bold text-gray-500 dark:text-dark-text-secondary">
                          <MapPin className="h-3.5 w-3.5 mr-1.5 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[180px] uppercase">
                            {client.bairro && client.cidade ? `${client.bairro}, ${client.cidade}` : client.cidade || client.bairro || "-"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-red-600 dark:text-red-400 tracking-tight">{formatCurrency(pendingValue)}</span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Total: {formatCurrency(totalValue)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visualização em Cards (Mobile) */}
        <div className="md:hidden space-y-4">
          {paginatedClients.map((client) => {
            const isWithoutCollector = !client.collectorId;
            const totalValue = client.collections.reduce((sum, c) => sum + c.valor_original, 0);
            const pendingValue = totalValue - client.collections.reduce((sum, c) => sum + c.valor_recebido, 0);
            const situacao = getSituacaoIndicator(client.collections);

            return (
              <div
                key={client.uniqueKey}
                className={`bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border transition-all duration-200 cursor-pointer overflow-hidden ${
                  selectedClients.has(client.uniqueKey) ? "ring-2 ring-blue-500 border-blue-500 shadow-lg" : "border-gray-100 dark:border-dark-border"
                } ${isWithoutCollector && !selectedClients.has(client.uniqueKey) ? "border-amber-200 dark:border-amber-900/30 bg-amber-50/20" : ""}`}
                onClick={() => handleSelectClient(client.uniqueKey)}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={selectedClients.has(client.uniqueKey)}
                      onChange={() => handleSelectClient(client.uniqueKey)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-dark-border rounded mt-1 bg-white dark:bg-dark-bg"
                    />
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-gray-900 dark:text-dark-text truncate uppercase tracking-tight">{client.cliente}</h4>
                          <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase">{client.documento}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-red-600 dark:text-red-400 tracking-tight">{formatCurrency(pendingValue)}</p>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Total: {formatCurrency(totalValue)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        {client.collectorName ? (
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/30 uppercase tracking-widest">
                            {client.collectorName}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 uppercase tracking-widest">
                            Sem Cobrador
                          </span>
                        )}
                        {situacao && (
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border border-current ${situacao.className}`}>
                            <situacao.icon className="h-3 w-3" />
                            {situacao.label}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-gray-50 dark:border-dark-border flex items-center justify-between">
                        <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                          <MapPin className="h-3 w-3 mr-1 text-gray-400" />
                          <span className="truncate max-w-[120px]">{client.cidade || "-"}</span>
                        </div>
                        <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                          {client.collections.length} Parcelas
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

      {/* Empty State */}
      {filteredClients.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum cliente encontrado
          </h3>
          <p className="text-gray-600">
            {hasActiveFilters
              ? "Tente ajustar los filtros de busca."
              : "Não há clientes cadastrados no sistema."}
          </p>
        </div>
      )}

      {/* Controles de Paginação — Estilo Dashboard */}
      {totalPages > 1 && (
        <div className="bg-gray-900 dark:bg-dark-bg-secondary mt-6 border border-gray-800 dark:border-dark-border px-6 py-4 rounded-2xl shadow-lg">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-600/30">
                Página {currentPage} de {totalPages}
              </div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Exibindo {startItem}–{endItem} de {filteredClients.length}
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-2 lg:pb-0 custom-scrollbar">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="flex items-center px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Início
              </button>

              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex items-center px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Anterior
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(maxButtons, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= maxButtons) pageNum = i + 1;
                  else if (currentPage <= Math.ceil(maxButtons / 2)) pageNum = i + 1;
                  else if (currentPage >= totalPages - Math.floor(maxButtons / 2)) pageNum = totalPages - maxButtons + 1 + i;
                  else pageNum = currentPage - Math.floor(maxButtons / 2) + i;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-[36px] h-9 flex items-center justify-center text-xs font-black rounded-xl transition-all ${
                        pageNum === currentPage
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                          : "bg-white/5 text-gray-400 hover:text-white border border-white/5 hover:border-white/20"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="flex items-center px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Fim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Ação Contextual (Substitui o botão flutuante e os modais antigos) */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 transform ${selectedClients.size > 0 ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
        <div className="bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-6 border border-gray-700">
          <div className="flex items-center gap-3 pr-6 border-r border-gray-700">
            <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
              {selectedClients.size}
            </div>
            <span className="text-sm font-medium text-gray-300 whitespace-nowrap">
              {selectedClients.size === 1 ? 'cliente selecionado' : 'clientes selecionados'}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedClients(new Set())}
              className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
            >
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-black uppercase tracking-widest">
                Atribuir / Ajustar
              </span>
            </button>
          </div>
        </div>
      </div>

      <BulkAssignmentModal
        isOpen={showBulkModal}
        onClose={() => { setShowBulkModal(false); setSelectedClients(new Set()); }}
        selectedClients={selectedClients}
        clientsData={clientsData}
        collectors={collectors}
        onComplete={() => setSelectedClients(new Set())}
      />
    </div>
  );
});
