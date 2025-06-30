import { useState, useEffect, useMemo } from "react";
import {
  Search,
  UserPlus,
  UserMinus,
  Users,
  AlertCircle,
  Filter,
  MapPin,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { useCollection } from "../contexts/CollectionContext";
import { Collection } from "../types";
import { formatCurrency } from "../utils/mockData";
import { Modal } from "./Modal";

interface ClientWithCollections {
  cliente: string;
  documento: string;
  collections: Collection[];
  collectorId?: string;
  collectorName?: string;
  cidade?: string;
  bairro?: string;
}

export function ClientAssignment() {
  const {
    collections,
    users,
    collectorStores,
    assignCollectorToClients,
    removeCollectorFromClients,
  } = useCollection();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCollector, setSelectedCollector] = useState<string>("");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [clientsData, setClientsData] = useState<ClientWithCollections[]>([]);

  // Novos filtros
  const [filterCollector, setFilterCollector] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>(""); // 'with_collector', 'without_collector', ''
  const [filterCity, setFilterCity] = useState<string>("");
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [includeWithoutDate, setIncludeWithoutDate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [modalData, setModalData] = useState<{ clientsWithCollectors?: number; totalClients?: number }>({});

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Limite para operações em massa
  const MAX_BATCH_SIZE = 200;

  const collectors = users.filter((user) => user.type === "collector");

  // Obter opções únicas para filtros
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

  // Função utilitária para parsear e normalizar datas
  const parseAndNormalizeDate = (
    dateStr: string | null | undefined
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
          `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
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

  useEffect(() => {
    // Função para determinar qual cobrador está atribuído a uma collection
    const getCollectorForCollection = (
      collection: Collection
    ): { collectorId?: string; collectorName?: string } => {
      // 1. Verificar atribuição direta (user_id)
      if (collection.user_id) {
        const collector = users.find((u) => u.id === collection.user_id);
        return {
          collectorId: collection.user_id,
          collectorName: collector?.name,
        };
      }

      // 2. Verificar atribuição por loja
      if (collection.nome_da_loja) {
        const storeAssignment = collectorStores.find(
          (cs) => cs.storeName === collection.nome_da_loja
        );
        if (storeAssignment) {
          const collector = users.find(
            (u) => u.id === storeAssignment.collectorId
          );
          return {
            collectorId: storeAssignment.collectorId,
            collectorName: collector?.name,
          };
        }
      }

      // 3. Sem atribuição
      return { collectorId: undefined, collectorName: undefined };
    };

    // Agrupar collections por cliente
    const clientsMap = new Map<string, ClientWithCollections>();

    collections.forEach((collection) => {
      // Só processar se tiver documento válido
      if (!collection.documento || collection.documento.trim() === "") {
        console.warn("Collection sem documento válido:", collection);
        return;
      }

      const key = collection.documento.trim();

      if (!clientsMap.has(key)) {
        // Determinar cobrador através da nova função
        const { collectorId, collectorName } =
          getCollectorForCollection(collection);

        clientsMap.set(key, {
          cliente: collection.cliente || "Cliente sem nome",
          documento: collection.documento,
          collections: [],
          collectorId: collectorId,
          collectorName: collectorName,
          cidade: collection.cidade || undefined,
          bairro: collection.bairro || undefined,
        });
      } else {
        // Se cliente já existe, verificar se há um cobrador mais específico
        const existingClient = clientsMap.get(key)!;
        if (!existingClient.collectorId) {
          const { collectorId, collectorName } =
            getCollectorForCollection(collection);
          if (collectorId) {
            existingClient.collectorId = collectorId;
            existingClient.collectorName = collectorName;
          }
        }
      }

      clientsMap.get(key)!.collections.push(collection);
    });

    console.log("Total de collections:", collections.length);
    console.log("Total de clientes únicos encontrados:", clientsMap.size);
    console.log(
      "Clientes com cobrador (direto + loja):",
      Array.from(clientsMap.values()).filter((c) => c.collectorId).length
    );

    setClientsData(Array.from(clientsMap.values()));
  }, [collections, users, collectorStores]);

  const filteredClients = useMemo(() => {
    const filtered = clientsData.filter((client) => {
      const matchesSearch =
        client.cliente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.documento?.includes(searchTerm);

      const matchesCollector =
        !filterCollector || client.collectorId === filterCollector;

      const matchesStatus =
        !filterStatus ||
        (filterStatus === "with_collector" && client.collectorId) ||
        (filterStatus === "without_collector" && !client.collectorId);

      const matchesCity = !filterCity || client.cidade === filterCity;

      const matchesNeighborhood =
        !filterNeighborhood || client.bairro === filterNeighborhood;

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
        matchesDateRange
      );
    });

    // Reset para primeira página quando filtros mudarem
    setCurrentPage(1);

    return filtered;
  }, [
    clientsData,
    searchTerm,
    filterCollector,
    filterStatus,
    filterCity,
    filterNeighborhood,
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
  ]);

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

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset para primeira página
  };

  const handleSelectAll = () => {
    const currentPageDocuments = paginatedClients.map((c) => c.documento);
    const allCurrentPageSelected = currentPageDocuments.every((doc) =>
      selectedClients.has(doc)
    );

    if (allCurrentPageSelected) {
      // Remover todos da página atual
      const newSelected = new Set(selectedClients);
      currentPageDocuments.forEach((doc) => newSelected.delete(doc));
      setSelectedClients(newSelected);
    } else {
      // Adicionar todos da página atual
      const newSelected = new Set(selectedClients);
      currentPageDocuments.forEach((doc) => newSelected.add(doc));
      setSelectedClients(newSelected);
    }
  };

  const handleSelectAllFiltered = () => {
    if (selectedClients.size === filteredClients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(filteredClients.map((c) => c.documento)));
    }
  };

  const handleSelectClient = (documento: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(documento)) {
      newSelected.delete(documento);
    } else {
      newSelected.add(documento);
    }
    setSelectedClients(newSelected);
  };

  const handleAssignCollectorClick = () => {
    if (!selectedCollector || selectedClients.size === 0) {
      // Toast notification seria melhor aqui
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50";
      notification.textContent =
        "Selecione um cobrador e pelo menos um cliente";
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 3000);
      return;
    }

    setShowAssignModal(true);
  };

  const handleAssignCollector = async () => {
    setShowAssignModal(false);

    setLoading(true);
    try {
      await assignCollectorToClients(
        selectedCollector,
        Array.from(selectedClients)
      );
      // Success notification
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center";
      notification.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
        ${selectedClients.size} cliente(s) atribuído(s) com sucesso!
      `;
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 5000);
      setSelectedClients(new Set());
    } catch (error) {
      console.error("Erro ao atribuir cobrador:", error);
      // Error notification
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center";
      notification.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        Erro ao atribuir cobrador. Tente novamente.
      `;
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCollectorClick = () => {
    if (selectedClients.size === 0) {
      // Toast notification
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50";
      notification.textContent = "Selecione pelo menos um cliente";
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 3000);
      return;
    }

    // Verificar se os clientes selecionados realmente têm cobradores
    const selectedClientsData = Array.from(selectedClients)
      .map((doc) => clientsData.find((c) => c.documento === doc))
      .filter(Boolean);

    const clientsWithCollectors = selectedClientsData.filter(
      (c) => c?.collectorId
    );

    if (clientsWithCollectors.length === 0) {
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg z-50";
      notification.textContent =
        "Nenhum dos clientes selecionados possui cobrador atribuído";
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 4000);
      return;
    }

    setModalData({
      clientsWithCollectors: clientsWithCollectors.length,
      totalClients: selectedClients.size
    });
    setShowRemoveModal(true);
  };

  const handleRemoveCollector = async () => {
    setShowRemoveModal(false);

    setLoading(true);
    try {
      console.log(
        "Iniciando remoção de cobradores para:",
        Array.from(selectedClients)
      );

      await removeCollectorFromClients(Array.from(selectedClients));

      // Success notification
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center";
      notification.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
        Cobrador removido de ${modalData.clientsWithCollectors || 0} cliente(s)!
      `;
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 5000);
      setSelectedClients(new Set());
    } catch (error) {
      console.error("Erro ao remover cobrador:", error);
      // Error notification with more details
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center max-w-md";
      notification.innerHTML = `
        <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        <div>
          <div>Erro ao remover cobrador</div>
          <div class="text-xs mt-1 opacity-90">${
            error instanceof Error ? error.message : "Erro desconhecido"
          }</div>
        </div>
      `;
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 8000);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterCollector("");
    setFilterStatus("");
    setFilterCity("");
    setFilterNeighborhood("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setIncludeWithoutDate(false);
    setShowFilters(false);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm ||
    filterCollector ||
    filterStatus ||
    filterCity ||
    filterNeighborhood ||
    filterDateFrom ||
    filterDateTo;

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    const totalClients = clientsData.length;
    const assignedClients = clientsData.filter((c) => c.collectorId).length;
    const unassignedClients = totalClients - assignedClients;
    const totalCollections = clientsData.reduce(
      (sum, c) => sum + c.collections.length,
      0
    );
    const avgCollectionsPerClient =
      totalClients > 0 ? totalCollections / totalClients : 0;
    const assignmentRate =
      totalClients > 0 ? (assignedClients / totalClients) * 100 : 0;

    return {
      totalClients,
      assignedClients,
      unassignedClients,
      totalCollections,
      avgCollectionsPerClient,
      assignmentRate,
    };
  }, [clientsData]);

  // Calculate filtered overview statistics
  const filteredStats = useMemo(() => {
    const totalFiltered = filteredClients.length;
    const assignedFiltered = filteredClients.filter(
      (c) => c.collectorId
    ).length;
    const unassignedFiltered = totalFiltered - assignedFiltered;
    const totalCollectionsFiltered = filteredClients.reduce(
      (sum, c) => sum + c.collections.length,
      0
    );

    return {
      totalFiltered,
      assignedFiltered,
      unassignedFiltered,
      totalCollectionsFiltered,
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
        Array.from(sampleDates).slice(0, 10)
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

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 lg:p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                <Users className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
                <span className="truncate">Atribuição de Cobradores</span>
              </h2>
              <p className="text-gray-600 mt-1 text-sm lg:text-base">
                Gerencie a atribuição de clientes aos cobradores
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 lg:gap-3">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center justify-center px-3 lg:px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                >
                  <X className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Limpar Filtros</span>
                  <span className="sm:hidden">Limpar</span>
                </button>
              )}
              {selectedClients.size > 0 && (
                <button
                  onClick={() => setSelectedClients(new Set())}
                  className="flex items-center justify-center px-3 lg:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  <X className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">
                    Limpar Seleção ({selectedClients.size})
                  </span>
                  <span className="sm:hidden">
                    Seleção ({selectedClients.size})
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>



      {/* Overview Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 lg:p-6 rounded-xl border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-700">
                Total de Clientes
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-blue-900 truncate">
                {hasActiveFilters
                  ? filteredStats.totalFiltered
                  : overviewStats.totalClients}
              </p>
              {hasActiveFilters && (
                <p className="text-xs text-blue-600 mt-1">
                  De {overviewStats.totalClients} total
                </p>
              )}
            </div>
            <Users className="h-8 w-8 lg:h-10 lg:w-10 text-blue-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 lg:p-6 rounded-xl border border-green-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-700">Com Cobrador</p>
              <p className="text-2xl lg:text-3xl font-bold text-green-900">
                {hasActiveFilters
                  ? filteredStats.assignedFiltered
                  : overviewStats.assignedClients}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {hasActiveFilters
                  ? Math.round(
                      (filteredStats.assignedFiltered /
                        filteredStats.totalFiltered) *
                        100
                    ) || 0
                  : Math.round(overviewStats.assignmentRate)}
                % atribuídos
              </p>
            </div>
            <UserPlus className="h-8 w-8 lg:h-10 lg:w-10 text-green-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 lg:p-6 rounded-xl border border-amber-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-700">Sem Cobrador</p>
              <p className="text-2xl lg:text-3xl font-bold text-amber-900">
                {hasActiveFilters
                  ? filteredStats.unassignedFiltered
                  : overviewStats.unassignedClients}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {hasActiveFilters
                  ? Math.round(
                      (filteredStats.unassignedFiltered /
                        filteredStats.totalFiltered) *
                        100
                    ) || 0
                  : Math.round(100 - overviewStats.assignmentRate)}
                % pendentes
              </p>
            </div>
            <AlertCircle className="h-8 w-8 lg:h-10 lg:w-10 text-amber-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 lg:p-6 rounded-xl border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-purple-700">
                Total Parcelas
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-purple-900">
                {hasActiveFilters
                  ? filteredStats.totalCollectionsFiltered
                  : overviewStats.totalCollections}
              </p>
              <p className="text-xs text-purple-600 mt-1">
                Média: {overviewStats.avgCollectionsPerClient.toFixed(1)} por
                cliente
              </p>
            </div>
            <ArrowUpDown className="h-8 w-8 lg:h-10 lg:w-10 text-purple-600 flex-shrink-0 ml-2" />
          </div>
        </div>
      </div>


      {/* Search and Filters Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 lg:p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar Cliente
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nome do cliente ou documento..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`w-full flex items-center justify-center px-3 py-2 border rounded-lg transition-colors ${
                  showFilters
                    ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Filter className="h-4 w-4 mr-2" />
                {showFilters ? "Ocultar" : "Mostrar"} Filtros
                {hasActiveFilters && !showFilters && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {
                      [
                        filterCollector,
                        filterStatus,
                        filterCity,
                        filterNeighborhood,
                        filterDateFrom,
                        filterDateTo,
                      ].filter(Boolean).length
                    }
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    <option value="with_collector">Com Cobrador</option>
                    <option value="without_collector">Sem Cobrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cobrador
                  </label>
                  <select
                    value={filterCollector}
                    onChange={(e) => setFilterCollector(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Todos os Cobradores</option>
                    {collectors.map((collector) => (
                      <option key={collector.id} value={collector.id}>
                        {collector.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cidade
                  </label>
                  <select
                    value={filterCity}
                    onChange={(e) => {
                      setFilterCity(e.target.value);
                      setFilterNeighborhood("");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Todas as Cidades</option>
                    {availableCities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bairro
                  </label>
                  <select
                    value={filterNeighborhood}
                    onChange={(e) => setFilterNeighborhood(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    disabled={!filterCity}
                  >
                    <option value="">Todos os Bairros</option>
                    {availableNeighborhoods.map((neighborhood) => (
                      <option key={neighborhood} value={neighborhood}>
                        {neighborhood}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vencimento De
                  </label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vencimento Até
                  </label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {(filterDateFrom || filterDateTo) && (
                <div className="mt-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={includeWithoutDate}
                      onChange={(e) =>
                        setIncludeWithoutDate(e.target.checked)
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Incluir clientes sem data de vencimento
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

                  {/* Assignment Actions */}
      {selectedClients.size > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 lg:p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Ações em Massa
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedClients.size} cliente
                  {selectedClients.size !== 1 ? "s" : ""} selecionado
                  {selectedClients.size !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="space-y-3">
                <select
                  value={selectedCollector}
                  onChange={(e) => setSelectedCollector(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecione um cobrador</option>
                  {collectors.map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.name}
                    </option>
                  ))}
                </select>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleAssignCollectorClick}
                    disabled={loading || !selectedCollector}
                    className="flex-1 flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    <span className="hidden sm:inline">Atribuir Cobrador</span>
                    <span className="sm:hidden">Atribuir</span>
                  </button>

                  <button
                    onClick={handleRemoveCollectorClick}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <UserMinus className="h-4 w-4 mr-2" />
                    )}
                    <span className="hidden sm:inline">Remover Cobrador</span>
                    <span className="sm:hidden">Remover</span>
                  </button>
                </div>
              </div>
            </div>

            {selectedClients.size > MAX_BATCH_SIZE && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center text-amber-700">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <span className="text-sm">
                    Operação será processada em{" "}
                    {Math.ceil(selectedClients.size / MAX_BATCH_SIZE)} lotes de{" "}
                    {MAX_BATCH_SIZE} clientes
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Client List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Lista de Clientes ({filteredClients.length})
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              <span className="hidden sm:inline">
                {paginatedClients.every((c) => selectedClients.has(c.documento))
                  ? "Desmarcar"
                  : "Selecionar"}{" "}
                página
              </span>
              <span className="sm:hidden">
                {paginatedClients.every((c) => selectedClients.has(c.documento))
                  ? "Desmarcar"
                  : "Selecionar"}{" "}
                página
              </span>
            </button>
            {filteredClients.length > itemsPerPage && (
              <button
                onClick={handleSelectAllFiltered}
                className="px-4 py-2 text-sm border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors font-medium"
              >
                <span className="hidden sm:inline">
                  Selecionar todos ({filteredClients.length})
                </span>
                <span className="sm:hidden">
                  Todos ({filteredClients.length})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Client Cards - Mobile Optimized */}
        {paginatedClients.map((client) => {
          const isWithoutCollector = !client.collectorId;
          const totalValue = client.collections.reduce(
            (sum, c) => sum + c.valor_original,
            0
          );
          const pendingValue = totalValue - client.collections.reduce(
            (sum, c) => sum + c.valor_recebido,
            0
          );

          return (
            <div
              key={client.documento}
              className={`bg-white rounded-lg shadow-sm border transition-all duration-200 hover:shadow-md cursor-pointer ${
                isWithoutCollector
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-200"
              } ${
                selectedClients.has(client.documento)
                  ? "ring-2 ring-blue-500"
                  : ""
              }`}
              onClick={(e) => {
                // Previne o clique no card quando clicar no checkbox
                if ((e.target as HTMLElement).tagName !== 'INPUT') {
                  handleSelectClient(client.documento);
                }
              }}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Larger checkbox for mobile */}
                  <input
                    type="checkbox"
                    checked={selectedClients.has(client.documento)}
                    onChange={() => handleSelectClient(client.documento)}
                    onClick={(e) => e.stopPropagation()} // Evita duplo clique
                    className="h-5 w-5 text-blue-600 focus:ring-2 focus:ring-blue-500 border-gray-300 rounded mt-1 flex-shrink-0"
                  />
                  
                  <div className="flex-1 min-w-0">
                    {/* Client info - more compact */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-semibold text-gray-900 truncate flex items-center gap-2">
                          {client.cliente}
                          {isWithoutCollector && (
                            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                          )}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {client.documento} • {client.collections.length} parcela{client.collections.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      
                      {/* Collector status - more prominent */}
                      <div className="flex-shrink-0 ml-2">
                        {client.collectorName ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {client.collectorName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Sem cobrador
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Location info - condensed */}
                    {(client.cidade || client.bairro) && (
                      <div className="flex items-center text-sm text-gray-600 mb-3">
                        <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span className="truncate">
                          {client.bairro && client.cidade 
                            ? `${client.bairro}, ${client.cidade}`
                            : client.cidade || client.bairro || "Localização não informada"
                          }
                        </span>
                      </div>
                    )}

                    {/* Stats - simplified for mobile */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-gray-600">Total: </span>
                          <span className="font-semibold text-blue-600">
                            {formatCurrency(totalValue)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Pendente: </span>
                          <span className="font-semibold text-red-600">
                            {formatCurrency(pendingValue)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Alert for unassigned - more compact */}
                    {isWithoutCollector && (
                      <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                        <div className="flex items-center text-amber-700">
                          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="text-xs font-medium">
                            Cliente sem cobrador atribuído
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredClients.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum cliente encontrado
          </h3>
          <p className="text-gray-600">
            {hasActiveFilters
              ? "Tente ajustar os filtros de busca."
              : "Não há clientes cadastrados no sistema."}
          </p>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col gap-4">
            {/* Mobile-first: Info and items per page on top */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-sm text-gray-600 text-center sm:text-left">
                Mostrando {startItem} a {endItem} de {filteredClients.length}{" "}
                clientes
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">
                  Mostrar:
                </label>
                <select
                  value={itemsPerPage}
                  onChange={(e) =>
                    handleItemsPerPageChange(Number(e.target.value))
                  }
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Navigation controls */}
            <div className="flex items-center justify-center gap-1 overflow-x-auto">
              {/* First and Previous buttons - show text on larger screens, icons on mobile */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 sm:px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <span className="hidden sm:inline">Primeira</span>
                <span className="sm:hidden">1</span>
              </button>

              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-2 sm:px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* Page numbers - show fewer on mobile */}
              <div className="flex items-center gap-1">
                {Array.from(
                  {
                    length: Math.min(
                      totalPages,
                      window.innerWidth < 640 ? 3 : 5
                    ),
                  },
                  (_, i) => {
                    let pageNumber;
                    const maxButtons = window.innerWidth < 640 ? 3 : 5;

                    if (totalPages <= maxButtons) {
                      pageNumber = i + 1;
                    } else if (currentPage <= Math.ceil(maxButtons / 2)) {
                      pageNumber = i + 1;
                    } else if (
                      currentPage >=
                      totalPages - Math.floor(maxButtons / 2)
                    ) {
                      pageNumber = totalPages - maxButtons + 1 + i;
                    } else {
                      pageNumber = currentPage - Math.floor(maxButtons / 2) + i;
                    }

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`px-2 sm:px-3 py-2 text-sm font-medium rounded-lg min-w-[40px] ${
                          currentPage === pageNumber
                            ? "bg-blue-600 text-white"
                            : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  }
                )}
              </div>

              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="px-2 sm:px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 sm:px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <span className="hidden sm:inline">Última</span>
                <span className="sm:hidden">{totalPages}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação - Atribuir Cobrador */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Confirmar Atribuição"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-green-600" />
            </div>
          </div>
          
          <div className="text-center">
            <p className="text-gray-700">
              Você está prestes a atribuir <span className="font-semibold">{selectedClients.size} cliente{selectedClients.size !== 1 ? 's' : ''}</span> ao cobrador:
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-2">
              {collectors.find(c => c.id === selectedCollector)?.name}
            </p>
          </div>

          {selectedClients.size > MAX_BATCH_SIZE && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center text-amber-700">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="text-sm">
                  A operação será processada em {Math.ceil(selectedClients.size / MAX_BATCH_SIZE)} lotes de {MAX_BATCH_SIZE} clientes
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowAssignModal(false)}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssignCollector}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Confirmar Atribuição
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmação - Remover Cobrador */}
      <Modal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        title="Confirmar Remoção"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <UserMinus className="h-6 w-6 text-red-600" />
            </div>
          </div>
          
          <div className="text-center space-y-3">
            <p className="text-gray-700">
              Confirma a remoção de cobradores de <span className="font-semibold">{modalData.totalClients} cliente{modalData.totalClients !== 1 ? 's' : ''}</span>?
            </p>
            
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span className="font-medium text-green-600">{modalData.clientsWithCollectors}</span> cliente{modalData.clientsWithCollectors !== 1 ? 's têm' : ' tem'} cobradores atribuídos
              </p>
              <p>
                <span className="font-medium text-gray-500">
                  {(modalData.totalClients || 0) - (modalData.clientsWithCollectors || 0)}
                </span> cliente{((modalData.totalClients || 0) - (modalData.clientsWithCollectors || 0)) !== 1 ? 's' : ''} já não {((modalData.totalClients || 0) - (modalData.clientsWithCollectors || 0)) !== 1 ? 'possuem' : 'possui'} cobrador
              </p>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mt-4">
              <p className="text-sm text-red-700 font-medium">
                Esta ação não pode ser desfeita
              </p>
            </div>
          </div>

          {(modalData.totalClients || 0) > MAX_BATCH_SIZE && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center text-amber-700">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="text-sm">
                  A operação será processada em {Math.ceil((modalData.totalClients || 0) / MAX_BATCH_SIZE)} lotes de {MAX_BATCH_SIZE} clientes
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowRemoveModal(false)}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleRemoveCollector}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <UserMinus className="h-4 w-4 mr-2" />
                  Confirmar Remoção
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}