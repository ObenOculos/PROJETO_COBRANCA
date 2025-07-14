import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  UserPlus,
  UserMinus,
  Users,
  AlertCircle,
  Filter,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Award,
  Building,
} from "lucide-react";
import { useCollection } from "../contexts/CollectionContext";
import { Collection } from "../types";
import { formatCurrency } from "../utils/formatters";
import { Modal } from "./Modal";

interface ClientWithCollections {
  cliente: string;
  documento: string;
  uniqueKey: string; // Adicionado para identificar clientes de forma única (documento ou nome)
  collections: Collection[];
  collectorId?: string;
  collectorName?: string;
  cidade?: string;
  bairro?: string;
}

export const ClientAssignment = React.memo(() => {
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
    new Set(),
  );
  const [loading, setLoading] = useState(false);

  // Novos filtros
  const [filterCollector, setFilterCollector] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>(""); // 'with_collector', 'without_collector', ''
  const [filterCity, setFilterCity] = useState<string>("");
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>("");
  const [filterStore, setFilterStore] = useState<string>(""); // Novo filtro de loja
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [includeWithoutDate, setIncludeWithoutDate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [modalData, setModalData] = useState<{
    clientsWithCollectors?: number;
    totalClients?: number;
  }>({});

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Limite para operações em massa
  const MAX_BATCH_SIZE = 100;

  const collectors = users.filter((user) => user.type === "collector");

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

      if (collection.nome_da_loja) {
        const storeAssignment = collectorStores.find(
          (cs) => cs.storeName === collection.nome_da_loja,
        );
        if (storeAssignment) {
          const collector = users.find(
            (u) => u.id === storeAssignment.collectorId,
          );
          return {
            collectorId: storeAssignment.collectorId,
            collectorName: collector?.name,
          };
        }
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
      }

      clientsMap.get(key)!.collections.push(collection);
    });

    return Array.from(clientsMap.values());
  }, [collections, users, collectorStores]);

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
      chips.push({ label: `Busca: "${searchTerm}"`, onClear: () => setSearchTerm("") });
    }
    if (filterCollector) {
      const collector = collectors.find(c => c.id === filterCollector);
      chips.push({ label: `Cobrador: ${collector?.name || "Desconhecido"}`, onClear: () => setFilterCollector("") });
    }
    if (filterStatus) {
      const statusLabel = filterStatus === "with_collector" ? "Com Cobrador" : "Sem Cobrador";
      chips.push({ label: `Status: ${statusLabel}`, onClear: () => setFilterStatus("") });
    }
    if (filterCity) {
      chips.push({ label: `Cidade: ${filterCity}`, onClear: () => setFilterCity("") });
    }
    if (filterNeighborhood) {
      chips.push({ label: `Bairro: ${filterNeighborhood}`, onClear: () => setFilterNeighborhood("") });
    }
    if (filterStore) {
      chips.push({ label: `Loja: ${filterStore}`, onClear: () => setFilterStore("") });
    }
    if (filterDateFrom) {
      chips.push({ label: `De: ${filterDateFrom}`, onClear: () => setFilterDateFrom("") });
    }
    if (filterDateTo) {
      chips.push({ label: `Até: ${filterDateTo}`, onClear: () => setFilterDateTo("") });
    }
    if (includeWithoutDate && (filterDateFrom || filterDateTo)) {
      chips.push({ label: `Incluir sem data`, onClear: () => setIncludeWithoutDate(false) });
    }

    return chips;
  }, [
    searchTerm,
    filterCollector,
    filterStatus,
    filterCity,
    filterNeighborhood,
    filterStore,
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
    collectors,
  ]);

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

      const matchesStore =
        !filterStore ||
        client.collections.some((c) => c.nome_da_loja === filterStore);

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

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset para primeira página
  };

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
    const clientsToProcess = Array.from(selectedClients).map((key) => {
      const client = clientsData.find((c) => c.uniqueKey === key);
      return { document: client?.documento, clientName: client?.cliente };
    });

    const totalClients = clientsToProcess.length;
    let successCount = 0;
    let errorCount = 0;

    const showNotification = (
      message: string,
      type: "success" | "error" | "info",
    ) => {
      const notification = document.createElement("div");
      notification.className = `fixed top-4 right-4 ${type === "success" ? "bg-green-500" : type === "error" ? "bg-red-500" : "bg-blue-500"} text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center`;
      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        ${type === "success" ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>' : type === "error" ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>' : '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>'}
      </svg>
      ${message}
    `;
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 5000);
    };

    const processBatch = async (
      batch: { document?: string; clientName?: string }[],
    ) => {
      try {
        await assignCollectorToClients(selectedCollector, batch);
        successCount += batch.length;
      } catch (error) {
        console.error("Erro ao atribuir cobrador em lote:", error);
        errorCount += batch.length;
      }
    };

    try {
      if (totalClients > MAX_BATCH_SIZE) {
        // showNotification(`Iniciando atribuição em lotes. Total: ${totalClients} clientes.`, "info"); // Removed intermediate notification
        for (let i = 0; i < totalClients; i += MAX_BATCH_SIZE) {
          const batch = clientsToProcess.slice(i, i + MAX_BATCH_SIZE);
          await processBatch(batch);
          if (i + MAX_BATCH_SIZE < totalClients) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay de 1 segundo entre lotes
          }
        }
        if (errorCount === 0) {
          showNotification(
            `${successCount} cliente(s) atribuído(s) com sucesso em lotes!`,
            "success",
          );
        } else if (successCount === 0) {
          showNotification(
            `Erro ao atribuir cobrador a todos os ${errorCount} clientes.`,
            "error",
          );
        } else {
          showNotification(
            `${successCount} clientes atribuídos, ${errorCount} com erro.`,
            "error",
          );
        }
      } else {
        await assignCollectorToClients(selectedCollector, clientsToProcess);
        showNotification(
          `${totalClients} cliente(s) atribuído(s) com sucesso!`,
          "success",
        );
      }
      setSelectedClients(new Set());
    } catch (error) {
      console.error("Erro geral ao atribuir cobrador:", error);
      showNotification("Erro ao atribuir cobrador. Tente novamente.", "error");
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
      .map((uniqueKey) => clientsData.find((c) => c.uniqueKey === uniqueKey))
      .filter(Boolean);

    const clientsWithCollectors = selectedClientsData.filter(
      (c) => c?.collectorId,
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
      totalClients: selectedClients.size,
    });
    setShowRemoveModal(true);
  };

  const handleRemoveCollector = async () => {
    setShowRemoveModal(false);

    setLoading(true);
    const clientsToProcess = Array.from(selectedClients).map((key) => {
      const client = clientsData.find((c) => c.uniqueKey === key);
      return { document: client?.documento, clientName: client?.cliente };
    });

    const totalClients = clientsToProcess.length;
    let successCount = 0;
    let errorCount = 0;

    const showNotification = (
      message: string,
      type: "success" | "error" | "info",
    ) => {
      const notification = document.createElement("div");
      notification.className = `fixed top-4 right-4 ${type === "success" ? "bg-green-500" : type === "error" ? "bg-red-500" : "bg-blue-500"} text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center`;
      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        ${type === "success" ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>' : type === "error" ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>' : '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>'}
      </svg>
      ${message}
    `;
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 5000);
    };

    const processBatch = async (
      batch: { document?: string; clientName?: string }[],
    ) => {
      try {
        await removeCollectorFromClients(batch);
        successCount += batch.length;
      } catch (error) {
        console.error("Erro ao remover cobrador em lote:", error);
        errorCount += batch.length;
      }
    };

    try {
      if (totalClients > MAX_BATCH_SIZE) {
        // showNotification(`Iniciando remoção em lotes. Total: ${totalClients} clientes.`, "info"); // Removed intermediate notification
        for (let i = 0; i < totalClients; i += MAX_BATCH_SIZE) {
          const batch = clientsToProcess.slice(i, i + MAX_BATCH_SIZE);
          await processBatch(batch);
          if (i + MAX_BATCH_SIZE < totalClients) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay de 1 segundo entre lotes
          }
        }
        if (errorCount === 0) {
          showNotification(
            `Cobrador removido de ${successCount} cliente(s) com sucesso em lotes!`,
            "success",
          );
        } else if (successCount === 0) {
          showNotification(
            `Erro ao remover cobrador de todos os ${errorCount} clientes.`,
            "error",
          );
        } else {
          showNotification(
            `${successCount} clientes processados, ${errorCount} com erro na remoção.`,
            "error",
          );
        }
      } else {
        await removeCollectorFromClients(clientsToProcess);
        showNotification(
          `Cobrador removido de ${totalClients} cliente(s)!`,
          "success",
        );
      }
      setSelectedClients(new Set());
    } catch (error) {
      console.error("Erro geral ao remover cobrador:", error);
      showNotification("Erro ao remover cobrador. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  };

  const hasActiveFilters = activeFilterChips.length > 0;

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    const totalClients = clientsData.length;
    const assignedClients = clientsData.filter((c) => c.collectorId).length;
    const unassignedClients = totalClients - assignedClients;
    const totalCollections = clientsData.reduce(
      (sum, c) => sum + c.collections.length,
      0,
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
      (c) => c.collectorId,
    ).length;
    const unassignedFiltered = totalFiltered - assignedFiltered;
    const totalCollectionsFiltered = filteredClients.reduce(
      (sum, c) => sum + c.collections.length,
      0,
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
    const total = hasActiveFilters ? filteredStats.totalFiltered : overviewStats.totalClients;
    const assigned = hasActiveFilters ? filteredStats.assignedFiltered : overviewStats.assignedClients;
    const assignmentRate = total > 0 ? (assigned / total) * 100 : 0;
    
    return {
      total,
      assigned,
      assignmentRate
    };
  }, [hasActiveFilters, filteredStats, overviewStats]);

  return (
    <div className="space-y-4">
      {/* Header Simplificado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
              <Users className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
              Atribuição de Cobradores
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Gerencie a atribuição de {mainStats.total} clientes
            </p>
          </div>
          
          {/* Ações Principais */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Filtros"
            >
              <Filter className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Card Principal - Taxa de Atribuição */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm font-medium">Taxa de Atribuição</p>
            <p className="text-4xl font-bold mt-1">
              {mainStats.assignmentRate.toFixed(1)}%
            </p>
            <p className="text-blue-100 text-sm mt-2">
              {mainStats.total} clientes cadastrados
            </p>
          </div>
          <Award className="h-16 w-16 text-blue-200 opacity-50" />
        </div>
        
        {/* Métricas secundárias */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-blue-400">
          <div>
            <p className="text-blue-100 text-xs">Atribuídos</p>
            <p className="text-2xl font-semibold">{mainStats.assigned}</p>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Pendentes</p>
            <p className="text-2xl font-semibold">{mainStats.total - mainStats.assigned}</p>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Cobradores</p>
            <p className="text-2xl font-semibold">{collectors.length}</p>
          </div>
        </div>
      </div>

      {/* Filtros Colapsáveis */}
      {showFilters && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-in slide-in-from-top-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Search className="h-4 w-4 mr-1" />
                Buscar Cliente
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nome ou documento..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Users className="h-4 w-4 mr-1" />
                Cobrador
              </label>
              <select
                value={filterCollector}
                onChange={(e) => setFilterCollector(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os cobradores</option>
                {collectors.map((collector) => (
                  <option key={collector.id} value={collector.id}>
                    {collector.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <AlertCircle className="h-4 w-4 mr-1" />
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os status</option>
                <option value="with_collector">Com cobrador</option>
                <option value="without_collector">Sem cobrador</option>
              </select>
            </div>

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <MapPin className="h-4 w-4 mr-1" />
                Cidade
              </label>
              <select
                value={filterCity}
                onChange={(e) => {
                  setFilterCity(e.target.value);
                  setFilterNeighborhood("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas as cidades</option>
                {availableCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <MapPin className="h-4 w-4 mr-1" />
                Bairro
              </label>
              <select
                value={filterNeighborhood}
                onChange={(e) => setFilterNeighborhood(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!filterCity}
              >
                <option value="">Todos os bairros</option>
                {availableNeighborhoods.map((neighborhood) => (
                  <option key={neighborhood} value={neighborhood}>
                    {neighborhood}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Building className="h-4 w-4 mr-1" />
                Loja
              </label>
              <select
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas as lojas</option>
                {availableStores.map((store) => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-full">
              <button
                onClick={() => {
                  setSearchTerm("");
                  setFilterCollector("");
                  setFilterStatus("");
                  setFilterCity("");
                  setFilterNeighborhood("");
                  setFilterStore("");
                  setFilterDateFrom("");
                  setFilterDateTo("");
                  setIncludeWithoutDate(false);
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Limpar Filtros
              </button>
            </div>
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
                </div>

                
                  <div className="space-y-3">
                <select
                  id="selectedCollector"
                  name="selectedCollector"
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
                      <span className="hidden sm:inline">
                        Atribuir Cobrador
                      </span>
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
              

              {selectedClients.size > MAX_BATCH_SIZE && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center text-amber-700">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    <span className="text-sm">
                      Operação será processada em{" "}
                      {Math.ceil(selectedClients.size / MAX_BATCH_SIZE)} lotes
                      de {MAX_BATCH_SIZE} clientes
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Client Cards - Mobile Optimized */}
        {paginatedClients.map((client) => {
          const isWithoutCollector = !client.collectorId;
          const totalValue = client.collections.reduce(
            (sum, c) => sum + c.valor_original,
            0,
          );
          const pendingValue =
            totalValue -
            client.collections.reduce((sum, c) => sum + c.valor_recebido, 0);

          return (
            <div
              key={client.uniqueKey}
              className={`bg-white rounded-lg shadow-sm border transition-all duration-200 hover:shadow-md cursor-pointer ${
                isWithoutCollector
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-200"
              } ${
                selectedClients.has(client.uniqueKey)
                  ? "ring-2 ring-blue-500"
                  : ""
              }`}
              onClick={(e) => {
                // Previne o clique no card quando clicar no checkbox
                if ((e.target as HTMLElement).tagName !== "INPUT") {
                  handleSelectClient(client.uniqueKey);
                }
              }}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Larger checkbox for mobile */}
                  <input
                    id={`select-client-${client.uniqueKey}`}
                    name={`select-client-${client.uniqueKey}`}
                    type="checkbox"
                    checked={selectedClients.has(client.uniqueKey)}
                    onChange={() => handleSelectClient(client.uniqueKey)}
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
                          {client.documento} • {client.collections.length}{" "}
                          parcela{client.collections.length !== 1 ? "s" : ""}
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
                            : client.cidade ||
                              client.bairro ||
                              "Localização não informada"}
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
                <label htmlFor="itemsPerPage" className="text-sm text-gray-600 whitespace-nowrap">
                  Mostrar:
                </label>
                <select
                  id="itemsPerPage"
                  name="itemsPerPage"
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
                      window.innerWidth < 640 ? 3 : 5,
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
                  },
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
              Você está prestes a atribuir{" "}
              <span className="font-semibold">
                {selectedClients.size} cliente
                {selectedClients.size !== 1 ? "s" : ""}
              </span>{" "}
              ao cobrador:
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-2">
              {collectors.find((c) => c.id === selectedCollector)?.name}
            </p>
          </div>

          {selectedClients.size > MAX_BATCH_SIZE && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center text-amber-700">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="text-sm">
                  A operação será processada em{" "}
                  {Math.ceil(selectedClients.size / MAX_BATCH_SIZE)} lotes de{" "}
                  {MAX_BATCH_SIZE} clientes
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
              Confirma a remoção de cobradores de{" "}
              <span className="font-semibold">
                {modalData.totalClients} cliente
                {modalData.totalClients !== 1 ? "s" : ""}
              </span>
              ?
            </p>

            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span className="font-medium text-green-600">
                  {modalData.clientsWithCollectors}
                </span>{" "}
                cliente
                {modalData.clientsWithCollectors !== 1 ? "s têm" : " tem"}{" "}
                cobradores atribuídos
              </p>
              <p>
                <span className="font-medium text-gray-500">
                  {(modalData.totalClients || 0) -
                    (modalData.clientsWithCollectors || 0)}
                </span>{" "}
                cliente
                {(modalData.totalClients || 0) -
                  (modalData.clientsWithCollectors || 0) !==
                1
                  ? "s"
                  : ""}{" "}
                já não{" "}
                {(modalData.totalClients || 0) -
                  (modalData.clientsWithCollectors || 0) !==
                1
                  ? "possuem"
                  : "possui"}{" "}
                cobrador
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
                  A operação será processada em{" "}
                  {Math.ceil((modalData.totalClients || 0) / MAX_BATCH_SIZE)}{" "}
                  lotes de {MAX_BATCH_SIZE} clientes
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
});
