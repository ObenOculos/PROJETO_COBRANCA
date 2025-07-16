import React, { useState, useMemo } from "react";
import {
  MapPin,
  Navigation,
  Route,
  Clock,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Filter,
} from "lucide-react";
import { ClientGroup, FilterOptions } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import FilterBar from "../common/FilterBar";

interface RouteMapProps {
  clientGroups: ClientGroup[];
}

const RouteMap: React.FC<RouteMapProps> = ({ clientGroups }) => {
  const { getVisitsByCollector, getFilteredCollections } = useCollection();
  const { user } = useAuth();

  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [routeOptimized, setRouteOptimized] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [clientsPerPage, setClientsPerPage] = useState(100);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<{
    title: string;
    message: string;
    type: "success" | "error" | "info";
  }>({ title: "", message: "", type: "info" });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);

  // Obter visitas do cobrador
  const collectorVisits = useMemo(() => {
    if (!user || user.type !== "collector") return [];
    let visits = getVisitsByCollector(user.id).filter(
      (visit) => visit.status === "agendada",
    );

    // Aplicar filtro de período baseado na data de agendamento das visitas
    // Isso permite filtrar visitas por quando elas foram agendadas, não por vencimento de cobrança
    if (filters.dateFrom || filters.dateTo) {
      visits = visits.filter((visit) => {
        const visitDate = new Date(visit.scheduledDate);

        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          if (visitDate < fromDate) return false;
        }

        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          toDate.setHours(23, 59, 59, 999); // Fim do dia
          if (visitDate > toDate) return false;
        }

        return true;
      });
    }

    return visits;
  }, [user, getVisitsByCollector, filters.dateFrom, filters.dateTo]);

  // Obter coleções filtradas usando o sistema padrão de filtros (excluindo período)
  const filteredCollections = useMemo(() => {
    if (!user) return [];
    // Remover filtros de período para as coleções, pois agora aplicamos nas visitas
    const collectionsFilters = { ...filters };
    delete collectionsFilters.dateFrom;
    delete collectionsFilters.dateTo;
    return getFilteredCollections(collectionsFilters, "collector", user.id);
  }, [filters, user, getFilteredCollections]);

  // Agrupar coleções por cliente e aplicar filtros
  const filteredClients = useMemo(() => {
    // Criar map de clientes a partir das coleções filtradas
    const clientMap = new Map<string, ClientGroup>();

    filteredCollections.forEach((collection) => {
      const key = `${collection.documento}-${collection.cliente}`;

      if (!clientMap.has(key)) {
        // Encontrar dados completos do cliente nos clientGroups originais
        const originalClient = clientGroups.find(
          (c) => c.document === collection.documento,
        );

        if (originalClient && originalClient.pendingValue > 0) {
          clientMap.set(key, {
            ...originalClient,
            sales: [], // Será preenchido abaixo
            totalValue: 0,
            totalReceived: 0,
            pendingValue: 0,
          });
        }
      }
    });

    // Recalcular valores baseado nas coleções filtradas
    const clientsArray = Array.from(clientMap.values());

    clientsArray.forEach((client) => {
      const clientCollections = filteredCollections.filter(
        (c) => c.documento === client.document,
      );

      // Agrupar por número de venda para contar vendas únicas
      const salesMap = new Map();
      clientCollections.forEach((collection) => {
        const saleKey = collection.venda_n;
        if (!salesMap.has(saleKey)) {
          salesMap.set(saleKey, {
            saleNumber: collection.venda_n,
            installments: [],
            totalValue: 0,
            totalReceived: 0,
            pendingValue: 0,
          });
        }
        salesMap.get(saleKey).installments.push(collection);
      });

      // Calcular valores por venda
      salesMap.forEach((sale) => {
        sale.totalValue = sale.installments.reduce(
          (sum: number, inst: any) => sum + inst.valor_original,
          0,
        );
        sale.totalReceived = sale.installments.reduce(
          (sum: number, inst: any) => sum + inst.valor_recebido,
          0,
        );
        sale.pendingValue = Math.max(0, sale.totalValue - sale.totalReceived);
      });

      // Atualizar dados do cliente
      client.sales = Array.from(salesMap.values());
      client.totalValue = clientCollections.reduce(
        (sum: number, c: any) => sum + c.valor_original,
        0,
      );
      client.totalReceived = clientCollections.reduce(
        (sum: number, c: any) => sum + c.valor_recebido,
        0,
      );
      client.pendingValue = Math.max(
        0,
        client.totalValue - client.totalReceived,
      );
    });

    // Filtrar apenas clientes com saldo devedor
    let filtered = clientsArray.filter((client) => client.pendingValue > 0);

    // Filtro para mostrar apenas clientes com visitas agendadas
    if (filters.visitsOnly) {
      const clientsWithVisits = collectorVisits.map(
        (visit) => visit.clientDocument,
      );
      filtered = filtered.filter((client) =>
        clientsWithVisits.includes(client.document),
      );
    }

    return filtered;
  }, [filteredCollections, clientGroups, filters.visitsOnly, collectorVisits]);

  // Função para verificar se uma visita está atrasada
  const isVisitOverdue = (visitDate?: string, visitTime?: string) => {
    if (!visitDate) return false;

    const now = new Date();
    const visitDateTime = new Date(`${visitDate}T${visitTime || "23:59"}`);

    return visitDateTime < now;
  };

  // Função para verificar se uma visita foi reagendada
  const isVisitRescheduled = (visit: any) => {
    return visit.notes?.includes("Reagendado") || false;
  };

  // Função para contar quantas vezes foi reagendada
  const getRescheduleCount = (visit: any) => {
    if (!visit.notes) return 0;
    return (visit.notes.match(/Reagendado/g) || []).length;
  };

  // Dados dos clientes organizados por tipo
  const clientData = useMemo(() => {
    const withVisits = filteredClients
      .filter((client) =>
        collectorVisits.some(
          (visit) => visit.clientDocument === client.document,
        ),
      )
      .map((client) => {
        const visit = collectorVisits.find(
          (v) => v.clientDocument === client.document,
        );
        const isOverdue = isVisitOverdue(
          visit?.scheduledDate,
          visit?.scheduledTime,
        );
        const isRescheduled = isVisitRescheduled(visit);
        const rescheduleCount = getRescheduleCount(visit);
        return {
          ...client,
          hasVisit: true as const,
          visitDate: visit?.scheduledDate,
          visitTime: visit?.scheduledTime,
          visitId: visit?.id,
          isOverdue,
          isRescheduled,
          rescheduleCount,
        };
      });

    // Segmentação melhorada: Atrasadas, Agendadas, Reagendadas
    const overdueVisits = withVisits.filter((client) => client.isOverdue);
    const rescheduledVisits = withVisits.filter(
      (client) => client.isRescheduled && !client.isOverdue,
    );
    const scheduledVisits = withVisits.filter(
      (client) => !client.isOverdue && !client.isRescheduled,
    );

    const withoutVisits = filteredClients
      .filter(
        (client) =>
          !collectorVisits.some(
            (visit) => visit.clientDocument === client.document,
          ),
      )
      .map((client) => ({
        ...client,
        hasVisit: false as const,
      }));

    return {
      overdueVisits,
      scheduledVisits,
      rescheduledVisits,
      withoutVisits,
      // Manter compatibilidade com código existente
      withVisits: scheduledVisits,
    };
  }, [filteredClients, collectorVisits]);

  // Todos os clientes para paginação - ordem de prioridade: atrasadas, agendadas, reagendadas, sem agendamento
  const allClients = useMemo(() => {
    return [
      ...clientData.overdueVisits,
      ...clientData.scheduledVisits,
      ...clientData.rescheduledVisits,
      ...clientData.withoutVisits,
    ];
  }, [clientData]);

  // Paginação
  const totalPages = Math.ceil(allClients.length / clientsPerPage);
  const startIndex = (currentPage - 1) * clientsPerPage;
  const endIndex = startIndex + clientsPerPage;
  const paginatedClients = allClients.slice(startIndex, endIndex);

  // Separar clientes paginados por tipo
  const paginatedOverdueVisits = paginatedClients.filter(
    (c) => "hasVisit" in c && c.hasVisit && c.isOverdue,
  );
  const paginatedScheduledVisits = paginatedClients.filter(
    (c) => "hasVisit" in c && c.hasVisit && !c.isOverdue && !c.isRescheduled,
  );
  const paginatedRescheduledVisits = paginatedClients.filter(
    (c) => "hasVisit" in c && c.hasVisit && c.isRescheduled && !c.isOverdue,
  );
  const paginatedWithoutVisits = paginatedClients.filter(
    (c) => !("hasVisit" in c) || !c.hasVisit,
  );

  const handleToggleClient = (clientDocument: string) => {
    setSelectedClients((prev) =>
      prev.includes(clientDocument)
        ? prev.filter((doc) => doc !== clientDocument)
        : [...prev, clientDocument],
    );
  };

  const handleSelectAll = () => {
    const allClientsList = [
      ...clientData.overdueVisits,
      ...clientData.scheduledVisits,
      ...clientData.rescheduledVisits,
      ...clientData.withoutVisits,
    ];
    if (selectedClients.length === allClientsList.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(allClientsList.map((c) => c.document));
    }
  };

  const handleSelectVisitsOnly = () => {
    const allVisits = [
      ...clientData.overdueVisits,
      ...clientData.scheduledVisits,
      ...clientData.rescheduledVisits,
    ];
    if (
      selectedClients.length === allVisits.length &&
      allVisits.every((c) => selectedClients.includes(c.document))
    ) {
      setSelectedClients([]);
    } else {
      setSelectedClients(allVisits.map((c) => c.document));
    }
  };

  const handleOptimizeRoute = () => {
    if (selectedClients.length === 0) {
      setModalContent({
        title: "Selecione Clientes",
        message: "Selecione pelo menos um cliente para otimizar a rota.",
        type: "info",
      });
      setShowModal(true);
      return;
    }

    setIsOptimizing(true);

    // Simular tempo de processamento
    setTimeout(() => {
      if (userLocation) {
        // Usar otimização baseada em localização
        optimizeRoute();
      } else {
        // Fallback: otimização simples por prioridade e horário de visitas
        setRouteOptimized(true);
        const selectedOverdueVisits = clientData.overdueVisits.filter((c) =>
          selectedClients.includes(c.document),
        );
        const selectedScheduledVisits = clientData.scheduledVisits.filter((c) =>
          selectedClients.includes(c.document),
        );
        const selectedRescheduledVisits = clientData.rescheduledVisits.filter(
          (c) => selectedClients.includes(c.document),
        );
        const selectedWithoutVisits = clientData.withoutVisits.filter((c) =>
          selectedClients.includes(c.document),
        );

        const optimizedOrder = [
          // 1. Atrasadas primeiro (mais urgente)
          ...selectedOverdueVisits.sort((a, b) =>
            (a.visitTime || "").localeCompare(b.visitTime || ""),
          ),
          // 2. Agendadas no prazo
          ...selectedScheduledVisits.sort((a, b) =>
            (a.visitTime || "").localeCompare(b.visitTime || ""),
          ),
          // 3. Reagendadas
          ...selectedRescheduledVisits.sort((a, b) =>
            (a.visitTime || "").localeCompare(b.visitTime || ""),
          ),
          // 4. Sem agendamento por último
          ...selectedWithoutVisits,
        ];

        setSelectedClients(optimizedOrder.map((c) => c.document));
        const totalVisits =
          selectedOverdueVisits.length +
          selectedScheduledVisits.length +
          selectedRescheduledVisits.length;
        setModalContent({
          title: "Rota Otimizada por Prioridade!",
          message: `${totalVisits} visita${totalVisits !== 1 ? "s foram organizadas" : " foi organizada"} por prioridade: ${selectedOverdueVisits.length} atrasada${selectedOverdueVisits.length !== 1 ? "s" : ""}, ${selectedScheduledVisits.length} agendada${selectedScheduledVisits.length !== 1 ? "s" : ""}, ${selectedRescheduledVisits.length} reagendada${selectedRescheduledVisits.length !== 1 ? "s" : ""}.`,
          type: "success",
        });
        setShowModal(true);
      }
      setIsOptimizing(false);
    }, 1200);
  };

  const selectedClientData = allClients.filter((c) =>
    selectedClients.includes(c.document),
  );
  const totalValue = selectedClientData.reduce(
    (sum, c) => sum + c.pendingValue,
    0,
  );

  // Função para calcular distância usando fórmula Haversine
  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number => {
    const R = 6371; // Raio da Terra em km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Função para obter coordenadas aproximadas de um endereço (estimativa baseada em cidade)
  const getEstimatedCoordinates = (
    client: any,
  ): { lat: number; lng: number } => {
    // Coordenadas aproximadas baseadas na cidade (você pode expandir isso)
    const cityCoordinates: { [key: string]: { lat: number; lng: number } } = {
      fortaleza: { lat: -3.7319, lng: -38.5267 },
      brasília: { lat: -15.7939, lng: -47.8828 },
      "são paulo": { lat: -23.5505, lng: -46.6333 },
      "rio de janeiro": { lat: -22.9068, lng: -43.1729 },
      "belo horizonte": { lat: -19.9167, lng: -43.9345 },
      // Adicione mais cidades conforme necessário
    };

    const cityKey = client.city.toLowerCase();
    const baseCoords = cityCoordinates[cityKey] || cityCoordinates["fortaleza"]; // Fallback

    // Adicionar pequena variação baseada no bairro (simulação)
    const variation = 0.02; // ~2km de variação
    const hash = client.neighborhood.length + client.address.length;
    const latOffset = (((hash % 100) - 50) / 100) * variation;
    const lngOffset = ((((hash * 7) % 100) - 50) / 100) * variation;

    return {
      lat: baseCoords.lat + latOffset,
      lng: baseCoords.lng + lngOffset,
    };
  };

  // Obter localização do usuário
  const getUserLocation = () => {
    setIsGettingLocation(true);

    if (!navigator.geolocation) {
      setModalContent({
        title: "Geolocalização Não Suportada",
        message:
          "Seu navegador não suporta geolocalização. Tente usar um navegador mais recente.",
        type: "error",
      });
      setShowModal(true);
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsGettingLocation(false);
        setGeolocationError(null); // Limpar erro ao obter localização

        setModalContent({
          title: "Localização Obtida!",
          message:
            "Sua localização foi obtida com sucesso. Agora você pode otimizar rotas por proximidade.",
          type: "success",
        });
        setShowModal(true);
      },
      (error) => {
        console.error("Erro ao obter localização:", error);
        let errorMessage = "Não foi possível obter sua localização.";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage =
              "Você negou o acesso à localização. Para otimizar a rota, por favor, habilite a permissão e tente novamente.";
            setGeolocationError(errorMessage); // Definir a mensagem de erro
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage =
              "Localização indisponível. Verifique sua conexão e tente novamente.";
            break;
          case error.TIMEOUT:
            errorMessage =
              "Tempo esgotado. Tente novamente em alguns segundos.";
            break;
        }

        setModalContent({
          title: "Erro de Localização",
          message: errorMessage,
          type: "error",
        });
        setShowModal(true);
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutos
      },
    );
  };

  // Algoritmo de otimização de rota (Nearest Neighbor)
  const optimizeRoute = () => {
    if (!userLocation) {
      setModalContent({
        title: "Localização Necessária",
        message:
          'Para otimizar a rota por proximidade, primeiro permita o acesso à sua localização clicando em "Obter Localização".',
        type: "info",
      });
      setShowModal(true);
      setIsOptimizing(false);
      return;
    }

    const clientsData = allClients.filter((c) =>
      selectedClients.includes(c.document),
    );
    const clientsWithCoords = clientsData.map((client) => ({
      ...client,
      coords: getEstimatedCoordinates(client),
    }));

    // Algoritmo Nearest Neighbor
    const optimizedOrder: string[] = [];
    let currentLocation = userLocation;
    let remainingClients = [...clientsWithCoords];

    while (remainingClients.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      // Encontrar cliente mais próximo da posição atual
      remainingClients.forEach((client, index) => {
        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          client.coords.lat,
          client.coords.lng,
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      // Adicionar cliente mais próximo à rota
      const nearestClient = remainingClients[nearestIndex];
      optimizedOrder.push(nearestClient.document);
      currentLocation = nearestClient.coords;
      remainingClients.splice(nearestIndex, 1);
    }

    // Atualizar ordem dos clientes selecionados
    setSelectedClients(optimizedOrder);
    setRouteOptimized(true);

    setModalContent({
      title: "Rota Otimizada!",
      message: `${optimizedOrder.length} cliente${optimizedOrder.length !== 1 ? "s foram organizados" : " foi organizado"} por proximidade da sua localização.`,
      type: "success",
    });
    setShowModal(true);
  };

  // Função para tentar obter a localização novamente
  const handleRetryLocation = () => {
    setGeolocationError(null);
    getUserLocation();
  };

  // Função para gerar URL do Google Maps com rota entre múltiplos destinos
  const getGoogleMapsUrl = () => {
    if (selectedClients.length === 0) return "";

    const selectedData = allClients.filter((c) =>
      selectedClients.includes(c.document),
    );

    if (userLocation) {
      // Com localização: centrar o mapa na localização do usuário
      const userCoords = `${userLocation.lat},${userLocation.lng}`;
      return `https://maps.google.com/maps?q=${encodeURIComponent(userCoords)}&output=embed&z=12`;
    } else {
      // Sem localização: usar comportamento anterior
      if (selectedData.length === 1) {
        const client = selectedData[0];
        const query = `${client.address}, ${client.number}, ${client.neighborhood}, ${client.city}`;
        return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
      } else {
        const client = selectedData[0];
        const query = `${client.address}, ${client.number}, ${client.neighborhood}, ${client.city}`;
        return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed&z=13`;
      }
    }
  };

  // Função para abrir rota no Google Maps em nova aba
  const openGoogleMapsDirections = () => {
    if (selectedClients.length === 0) return;

    const selectedData = allClients.filter((c) =>
      selectedClients.includes(c.document),
    );
    const clientAddresses = selectedData.map(
      (client) =>
        `${client.address}, ${client.number}, ${client.neighborhood}, ${client.city}`,
    );

    let url;

    if (userLocation) {
      // Com localização do usuário: usar como ponto de partida
      const userCoords = `${userLocation.lat},${userLocation.lng}`;

      if (clientAddresses.length === 1) {
        // Uma única parada: direções da localização atual para o cliente
        url = `https://www.google.com/maps/dir/${encodeURIComponent(userCoords)}/${encodeURIComponent(clientAddresses[0])}`;
      } else {
        // Múltiplas paradas: rota completa começando da localização atual
        const encodedAddresses = clientAddresses.map((addr) =>
          encodeURIComponent(addr),
        );
        url = `https://www.google.com/maps/dir/${encodeURIComponent(userCoords)}/${encodedAddresses.join("/")}`;
      }
    } else {
      // Sem localização: usar primeira parada como origem (comportamento anterior)
      if (clientAddresses.length === 1) {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientAddresses[0])}`;
      } else {
        const encodedAddresses = clientAddresses.map((addr) =>
          encodeURIComponent(addr),
        );
        url = `https://www.google.com/maps/dir/${encodedAddresses.join("/")}`;
      }
    }

    window.open(url, "_blank");
  };

  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    setCurrentPage(1); // Resetar página ao filtrar
  };

  const handleClientsPerPageChange = (newClientsPerPage: number) => {
    setClientsPerPage(newClientsPerPage);
    setCurrentPage(1); // Resetar página ao alterar quantidade
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  // Função para formatar data do formato YYYY-MM-DD para DD/MM/YYYY
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Data não definida";

    try {
      const [year, month, day] = dateString.split("-");
      return `${day}/${month}/${year}`;
    } catch {
      return dateString; // Retorna original se não conseguir formatar
    }
  };

  return (
    <div className="space-y-4 mt-0">
      {/* Header Otimizado - Mobile First */}

        <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-200 mb-4">
          <div className="space-y-3">
            {/* Linha 2: Controles Principais */}
            <div className="flex items-center justify-between gap-3">
              {/* Seleção Rápida */}
              <div className="flex items-center space-x-2">
                <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                  <button
                    onClick={handleSelectAll}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedClients.length === allClients.length
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={handleSelectVisitsOnly}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedClients.length ===
                        clientData.overdueVisits.length +
                          clientData.scheduledVisits.length +
                          clientData.rescheduledVisits.length &&
                      [
                        ...clientData.overdueVisits,
                        ...clientData.scheduledVisits,
                        ...clientData.rescheduledVisits,
                      ].every((c) => selectedClients.includes(c.document))
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <Calendar className="h-4 w-4 inline sm:hidden" />
                    <span className="hidden sm:inline">Visitas</span>
                  </button>
                </div>
              </div>

              {/* Ações Principais */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 rounded-lg transition-colors ${
                    showFilters
                      ? "bg-blue-100 text-blue-700"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                  }`}
                  title="Filtros"
                >
                  <Filter className="h-4 w-4" />
                </button>

                <button
                  onClick={getUserLocation}
                  disabled={isGettingLocation}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    userLocation
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-orange-600 text-white hover:bg-orange-700"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <MapPin className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {isGettingLocation
                      ? "Obtendo..."
                      : userLocation
                        ? "GPS OK"
                        : "GPS"}
                  </span>
                </button>

                <button
                  onClick={handleOptimizeRoute}
                  disabled={selectedClients.length === 0 || isOptimizing}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    userLocation
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-600 text-white hover:bg-gray-700"
                  }`}
                >
                  {isOptimizing ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                  ) : (
                    <Route className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">
                    {isOptimizing
                      ? "Otimizando..."
                      : userLocation
                        ? "Otimizar"
                        : "Organizar"}
                  </span>
                </button>
              </div>
            </div>

            {/* Linha 3: Filtros Colapsáveis */}
            {showFilters && (
              <div className="animate-in slide-in-from-top-2 duration-200">
                <FilterBar
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  userType={user?.type || "collector"}
                />
              </div>
            )}

            {/* Linha 4: Resumo da Seleção */}
            {selectedClients.length > 0 && (
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <div className="flex items-center space-x-2">
                  <Navigation className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-gray-700">
                    {selectedClients.length} selecionado
                    {selectedClients.length !== 1 ? "s" : ""}
                  </span>
                  {routeOptimized && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                      Otimizada
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {formatCurrency(totalValue)}
                </div>
              </div>
            )}

            {/* Linha 5: Erro de Geolocalização */}
            {geolocationError && (
              <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg mt-3">
                <span className="text-sm text-red-700">{geolocationError}</span>
                <button
                  onClick={handleRetryLocation}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                >
                  Tentar Novamente
                </button>
              </div>
            )}
          </div>
        </div>
    

      {/* Google Maps */}
      {selectedClients.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <MapPin className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Maps</h3>
              </div>
              <div className="flex items-center space-x-2">
                {userLocation && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                    GPS ✓
                  </span>
                )}
                {routeOptimized && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                    Otimizada
                  </span>
                )}
                <button
                  onClick={openGoogleMapsDirections}
                  className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                  title="Abrir rota completa no Google Maps"
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Rota
                </button>
              </div>
            </div>
          </div>
          <div className="relative">
            <iframe
              key={selectedClients.join(",")}
              src={getGoogleMapsUrl()}
              width="100%"
              height="400"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-64 sm:h-96"
              title="Mapa dos clientes selecionados"
            />
          </div>
        </div>
      )}

      {/* Client List for Route */}
      <div className="rounded-lg shadow-sm overflow-hidden">
        <div className="bg-white mb-2 rounded-xl px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                Clientes
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs sm:text-sm">
                <span className="text-gray-600">{allClients.length} total</span>
                {clientData.overdueVisits.length > 0 && (
                  <span className="text-red-600 font-medium">
                    {clientData.overdueVisits.length} atrasada(s)
                  </span>
                )}
                <span className="text-green-600">
                  {clientData.scheduledVisits.length} agendada(s)
                </span>
                {clientData.rescheduledVisits.length > 0 && (
                  <span className="text-orange-600">
                    {clientData.rescheduledVisits.length} reagendada(s)
                  </span>
                )}
                {selectedClients.length > 0 && (
                  <span className="text-blue-600 font-medium">
                    {selectedClients.length} selecionada(s)
                  </span>
                )}
              </div>
            </div>
            {routeOptimized && selectedClients.length > 0 && (
              <div className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium flex items-center">
                <Route className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Rota Otimizada</span>
                <span className="sm:hidden">✓</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Clientes com visitas atrasadas - PRIORIDADE MÁXIMA */}
          {paginatedOverdueVisits.length > 0 && (
            <div className="mt-4 bg-white rounded-lg shadow-sm border-2 border-red-500 overflow-hidden">
              <div className="px-4 py-4 bg-gradient-to-r from-red-50 to-red-100 border-b border-red-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-semibold text-red-900 flex items-center">
                    <Clock className="h-5 w-5 text-red-700 mr-2" />
                    ⚠️ Visitas Atrasadas - URGENTE
                  </h4>
                  <span className="text-sm text-red-700 font-semibold bg-white/60 px-2 py-1 rounded-full animate-pulse">
                    {clientData.overdueVisits.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {paginatedOverdueVisits.map((client) => (
                  <div
                    key={client.document}
                    className="p-3 sm:p-4 hover:bg-red-50 transition-colors border-l-4 border-red-500 bg-red-50 cursor-pointer"
                    onClick={() => handleToggleClient(client.document)}
                  >
                    <div className="flex gap-2 sm:gap-3">
                      <div className="flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={selectedClients.includes(client.document)}
                          onChange={() => handleToggleClient(client.document)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                        />
                      </div>

                      {routeOptimized &&
                        selectedClients.includes(client.document) && (
                          <div className="bg-blue-600 text-white h-5 w-5 sm:h-6 sm:w-6 text-xs font-bold px-1 py-0.5 sm:px-2 sm:py-1 rounded-full flex-shrink-0 flex items-center justify-center">
                            {selectedClients.indexOf(client.document) + 1}
                          </div>
                        )}

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col space-y-2">
                          {/* Nome e documento */}
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900 text-sm sm:text-base truncate">
                                {client.client}
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 font-mono">
                                {client.document}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="font-semibold text-gray-900 text-sm sm:text-base">
                                {formatCurrency(client.pendingValue)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {client.sales.length} venda
                                {client.sales.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>

                          {/* Status e horário */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-xs">
                              <div className="h-2 w-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                              <span className="mr-2 sm:mr-4 font-bold text-red-600">
                                ⚠️ ATRASADA
                              </span>
                              <Clock className="h-3 w-3 text-gray-400 mr-1" />
                              <span className="text-red-600 font-medium">
                                {client.hasVisit
                                  ? formatDate(client.visitDate)
                                  : ""}{" "}
                                {client.hasVisit ? client.visitTime || "" : ""}
                              </span>
                            </div>
                            {client.phone && (
                              <button
                                className="inline-flex items-center px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                title="Ligar para cliente"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="h-3 w-3 mr-1" />
                                <span className="hidden sm:inline">Ligar</span>
                              </button>
                            )}
                          </div>

                          {/* Endereço */}
                          <div className="text-xs text-gray-600">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${client.address}, ${client.number}, ${client.neighborhood}, ${client.city}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">
                                {client.address}, {client.number} -{" "}
                                {client.neighborhood}, {client.city}
                              </span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clientes com visitas agendadas no prazo */}
          {paginatedScheduledVisits.length > 0 && (
            <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-4 bg-gradient-to-r from-green-50 to-green-100 border-b border-green-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-semibold text-green-900 flex items-center">
                    <Calendar className="h-5 w-5 text-green-700 mr-2" />
                    Visitas Agendadas no Prazo
                  </h4>
                  <span className="text-sm text-green-700 font-semibold bg-white/60 px-2 py-1 rounded-full">
                    {clientData.scheduledVisits.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {paginatedScheduledVisits.map((client) => (
                  <div
                    key={client.document}
                    className="p-3 sm:p-4 hover:bg-gray-50 transition-colors border-l-2 border-green-400 cursor-pointer"
                    onClick={() => handleToggleClient(client.document)}
                  >
                    <div className="flex gap-2 sm:gap-3">
                      <div className="flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={selectedClients.includes(client.document)}
                          onChange={() => handleToggleClient(client.document)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                      </div>

                      {routeOptimized &&
                        selectedClients.includes(client.document) && (
                          <div className="bg-blue-600 text-white h-5 w-5 sm:h-6 sm:w-6 text-xs font-bold px-1 py-0.5 sm:px-2 sm:py-1 rounded-full flex-shrink-0 flex items-center justify-center">
                            {selectedClients.indexOf(client.document) + 1}
                          </div>
                        )}

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col space-y-2">
                          {/* Nome e documento */}
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900 text-sm sm:text-base truncate">
                                {client.client}
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 font-mono">
                                {client.document}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="font-semibold text-gray-900 text-sm sm:text-base">
                                {formatCurrency(client.pendingValue)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {client.sales.length} venda
                                {client.sales.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>

                          {/* Status e horário */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-xs">
                              <div className="h-2 w-2 bg-green-400 rounded-full mr-2"></div>
                              <span className="mr-2 sm:mr-4 font-medium text-green-600">
                                Agendada
                              </span>
                              <Clock className="h-3 w-3 text-gray-400 mr-1" />
                              <span className="text-gray-600">
                                {client.hasVisit
                                  ? formatDate(client.visitDate)
                                  : ""}{" "}
                                {client.hasVisit ? client.visitTime || "" : ""}
                              </span>
                            </div>
                            {client.phone && (
                              <button
                                className="inline-flex items-center px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                title="Ligar para cliente"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="h-3 w-3 mr-1" />
                                <span className="hidden sm:inline">Ligar</span>
                              </button>
                            )}
                          </div>

                          {/* Endereço */}
                          <div className="text-xs text-gray-600">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${client.address}, ${client.number}, ${client.neighborhood}, ${client.city}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">
                                {client.address}, {client.number} -{" "}
                                {client.neighborhood}, {client.city}
                              </span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clientes com visitas reagendadas */}
          {paginatedRescheduledVisits.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-4 bg-gradient-to-r from-orange-50 to-orange-100 border-b border-orange-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-semibold text-orange-900 flex items-center">
                    <RefreshCw className="h-5 w-5 text-orange-700 mr-2" />
                    Visitas Reagendadas
                  </h4>
                  <span className="text-sm text-orange-700 font-semibold bg-white/60 px-2 py-1 rounded-full">
                    {clientData.rescheduledVisits.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {paginatedRescheduledVisits.map((client) => (
                  <div
                    key={client.document}
                    className="p-3 sm:p-4 hover:bg-gray-50 transition-colors border-l-2 border-orange-500 bg-orange-50 cursor-pointer"
                    onClick={() => handleToggleClient(client.document)}
                  >
                    <div className="flex gap-2 sm:gap-3">
                      <div className="flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={selectedClients.includes(client.document)}
                          onChange={() => handleToggleClient(client.document)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                      </div>

                      {routeOptimized &&
                        selectedClients.includes(client.document) && (
                          <div className="bg-blue-600 text-white h-5 w-5 sm:h-6 sm:w-6 text-xs font-bold px-1 py-0.5 sm:px-2 sm:py-1 rounded-full flex-shrink-0 flex items-center justify-center">
                            {selectedClients.indexOf(client.document) + 1}
                          </div>
                        )}

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col space-y-2">
                          {/* Nome e documento */}
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900 text-sm sm:text-base truncate">
                                {client.client}
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 font-mono">
                                {client.document}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="font-semibold text-gray-900 text-sm sm:text-base">
                                {formatCurrency(client.pendingValue)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {client.sales.length} venda
                                {client.sales.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>

                          {/* Status e horário */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-xs">
                              <div className="h-2 w-2 bg-orange-500 rounded-full mr-2"></div>
                              <span className="mr-2 sm:mr-4 font-medium text-orange-600">
                                Reagendada
                              </span>
                              <RefreshCw className="h-3 w-3 text-orange-600 mr-1" />
                              {client.hasVisit &&
                                client.rescheduleCount > 1 && (
                                  <span className="text-xs text-orange-600 font-medium mr-2 sm:mr-4">
                                    ({client.rescheduleCount}x)
                                  </span>
                                )}
                              <Clock className="h-3 w-3 text-gray-400 mr-1" />
                              <span className="text-orange-600">
                                {client.hasVisit
                                  ? formatDate(client.visitDate)
                                  : ""}{" "}
                                {client.hasVisit ? client.visitTime || "" : ""}
                              </span>
                            </div>
                            {client.phone && (
                              <button
                                className="inline-flex items-center px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                                title="Ligar para cliente"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="h-3 w-3 mr-1" />
                                <span className="hidden sm:inline">Ligar</span>
                              </button>
                            )}
                          </div>

                          {/* Endereço */}
                          <div className="text-xs text-gray-600">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${client.address}, ${client.number}, ${client.neighborhood}, ${client.city}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">
                                {client.address}, {client.number} -{" "}
                                {client.neighborhood}, {client.city}
                              </span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clientes sem visitas agendadas */}
          {paginatedWithoutVisits.length > 0 && !filters.visitsOnly && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-semibold text-gray-800 flex items-center">
                    <Route className="h-5 w-5 text-gray-600 mr-2" />
                    Sem Agendamento
                  </h4>
                  <span className="text-sm text-gray-600 font-semibold bg-white/60 px-2 py-1 rounded-full">
                    {clientData.withoutVisits.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {paginatedWithoutVisits.map((client) => (
                  <div
                    key={client.document}
                    className="p-3 sm:p-4 hover:bg-gray-50 transition-colors border-l-2 border-gray-300 cursor-pointer"
                    onClick={() => handleToggleClient(client.document)}
                  >
                    <div className="flex gap-2 sm:gap-3">
                      <div className="flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={selectedClients.includes(client.document)}
                          onChange={() => handleToggleClient(client.document)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </div>

                      {routeOptimized &&
                        selectedClients.includes(client.document) && (
                          <div className="bg-blue-600 text-white h-5 w-5 sm:h-6 sm:w-6 text-xs font-bold px-1 py-0.5 sm:px-2 sm:py-1 rounded-full flex-shrink-0 flex items-center justify-center">
                            {selectedClients.indexOf(client.document) + 1}
                          </div>
                        )}

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col space-y-2">
                          {/* Nome e documento */}
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900 text-sm sm:text-base truncate">
                                {client.client}
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 font-mono">
                                {client.document}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="font-semibold text-gray-900 text-sm sm:text-base">
                                {formatCurrency(client.pendingValue)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {client.sales.length} venda
                                {client.sales.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>

                          {/* Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-xs">
                              <div className="h-2 w-2 bg-red-400 rounded-full mr-2"></div>
                              <span className="text-red-600">
                                Sem agendamento
                              </span>
                            </div>
                            {client.phone && (
                              <button
                                className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                title="Ligar para cliente"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="h-3 w-3 mr-1" />
                                <span className="hidden sm:inline">Ligar</span>
                              </button>
                            )}
                          </div>

                          {/* Endereço */}
                          <div className="text-xs text-gray-600">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${client.address}, ${client.number}, ${client.neighborhood}, ${client.city}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">
                                {client.address}, {client.number} -{" "}
                                {client.neighborhood}, {client.city}
                              </span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {allClients.length === 0 && (
          <div className="py-12 text-center">
            <Route className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Nenhum cliente encontrado</p>
          </div>
        )}

        {/* Paginação */}
        {allClients.length > 0 && (
          <div className="px-3 sm:px-4 py-3 sm:py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
              {/* Informações da página */}
              <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
                <span className="font-medium">
                  {startIndex + 1}-{Math.min(endIndex, allClients.length)}
                </span>
                <span className="hidden sm:inline">
                  {" "}
                  de {allClients.length}
                </span>
                <span className="sm:hidden">/{allClients.length}</span>
                {selectedClients.length > 0 && (
                  <span className="ml-2 sm:ml-3 text-blue-600 font-medium">
                    <span className="hidden sm:inline">
                      {selectedClients.length} selecionados
                    </span>
                    <span className="sm:hidden">
                      {selectedClients.length} ✓
                    </span>
                  </span>
                )}
              </div>

              {/* Controle de itens por página */}
              <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                <span>Itens por página:</span>
                <select
                  value={clientsPerPage}
                  onChange={(e) =>
                    handleClientsPerPageChange(Number(e.target.value))
                  }
                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Controles de paginação */}
              {totalPages > 1 && (
                <div className="flex items-center space-x-1">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="p-1.5 sm:p-2 rounded text-gray-500 hover:text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>

                  {/* Números das páginas - mobile otimizado */}
                  <div className="flex space-x-1">
                    {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                      let pageNumber;

                      if (totalPages <= 3) {
                        pageNumber = i + 1;
                      } else if (currentPage <= 2) {
                        pageNumber = i + 1;
                      } else if (currentPage >= totalPages - 1) {
                        pageNumber = totalPages - 2 + i;
                      } else {
                        pageNumber = currentPage - 1 + i;
                      }

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => handlePageChange(pageNumber)}
                          className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-colors ${
                            currentPage === pageNumber
                              ? "bg-blue-600 text-white"
                              : "text-gray-600 hover:text-gray-900 hover:bg-white"
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="p-1.5 sm:p-2 rounded text-gray-500 hover:text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Simples */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-auto">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                    modalContent.type === "success"
                      ? "bg-green-100"
                      : modalContent.type === "error"
                        ? "bg-red-100"
                        : "bg-blue-100"
                  }`}
                >
                  {modalContent.type === "success" && (
                    <svg
                      className="w-6 h-6 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {modalContent.type === "error" && (
                    <svg
                      className="w-6 h-6 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                  {modalContent.type === "info" && (
                    <svg
                      className="w-6 h-6 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                </div>
                <h3
                  className={`text-lg font-semibold ${
                    modalContent.type === "success"
                      ? "text-green-900"
                      : modalContent.type === "error"
                        ? "text-red-900"
                        : "text-blue-900"
                  }`}
                >
                  {modalContent.title}
                </h3>
              </div>

              <p className="text-gray-700 mb-6 leading-relaxed">
                {modalContent.message}
              </p>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowModal(false)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    modalContent.type === "success"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : modalContent.type === "error"
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteMap;
