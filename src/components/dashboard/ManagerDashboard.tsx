import React, { useState, useRef, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  Users,
  FileText,
  BarChart3,
  Download,
  Store,
  UserCheck,
  AlertTriangle,
  Calendar,
  Target,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import StatsCard from "../common/StatsCard";
import FilterBar from "../common/FilterBar";
import CollectionTable from "./CollectionTable";
import EnhancedPerformanceChart from "./EnhancedPerformanceChart";
import UserManagement from "./UserManagement";
import EnhancedStoreManagement from "./EnhancedStoreManagement";
import DatabaseUpload from "./DatabaseUpload";
import { ClientAssignment } from "../ClientAssignment";
import VisitTracking from "./VisitTracking";
import DailyCashReport from "./DailyCashReport";
import AuthorizationManager from "./AuthorizationManager";
import { useCollection } from "../../contexts/CollectionContext";
import { FilterOptions } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";

// Export tabs for use in Header
export const getManagerTabs = (_pendingCancellations: number = 0) => [
  { id: "overview", name: "Visão Geral", icon: BarChart3 },
  { id: "collections", name: "Cobranças", icon: FileText },
  { id: "performance", name: "Desempenho", icon: TrendingUp },
  { id: "stores", name: "Lojas", icon: Store },
  { id: "clients", name: "Clientes", icon: UserCheck },
  { id: "visit-tracking", name: "Acompanhamento", icon: AlertTriangle },
  { id: "authorization", name: "Autorizações", icon: UserCheck },
  { id: "users", name: "Usuários", icon: Users },
  { id: "database-upload", name: "Upload de Dados", icon: Download },
];

interface ManagerDashboardProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ 
  activeTab: externalActiveTab, 
  onTabChange 
}) => {
  const {
    getDashboardStats,
    getCollectorPerformance,
    getFilteredCollections,
    getPendingCancellationRequests,
    collections,
  } = useCollection();

  // Recupera a aba ativa do localStorage ou usa 'overview' como padrão
  const [internalActiveTab, setInternalActiveTab] = useState<
    | "overview"
    | "collections"
    | "performance"
    | "users"
    | "stores"
    | "clients"
    | "visit-tracking"
    | "authorization"
    | "database-upload"
  >(() => {
    const savedTab = localStorage.getItem("managerActiveTab");
    return (savedTab as any) || "overview";
  });

  // Use external activeTab if provided, otherwise use internal state
  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = (tabId: string) => {
    if (onTabChange) {
      onTabChange(tabId);
    } else {
      setInternalActiveTab(tabId as any);
    }
  };

  const [filters, setFilters] = useState<FilterOptions>({});
  const [collectionsView, setCollectionsView] = useState<
    "table" | "cash-report"
  >(() => {
    const saved = localStorage.getItem("managerCollectionsView");
    return (saved as "table" | "cash-report") || "table";
  });
  const [overviewFilter, setOverviewFilter] = useState<"all" | "with-collector">("all");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [pendingAuthorizations, setPendingAuthorizations] = useState(0);

  // Salva a aba ativa no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem("managerActiveTab", activeTab);
  }, [activeTab]);

  // Salva a visualização de cobranças no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem("managerCollectionsView", collectionsView);
  }, [collectionsView]);

  // Busca autorizações pendentes
  useEffect(() => {
    const fetchPendingAuthorizations = async () => {
      try {
        const pendingRequests = await AuthorizationHistoryService.getPendingRequests();
        setPendingAuthorizations(pendingRequests.length);
      } catch (error) {
        console.error("Erro ao buscar autorizações pendentes:", error);
      }
    };

    fetchPendingAuthorizations();
    
    // Atualiza a cada 30 segundos
    const interval = setInterval(fetchPendingAuthorizations, 30000);

    return () => clearInterval(interval);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(0); // Reset touchEnd
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentSlide < 2) {
      setCurrentSlide(currentSlide + 1);
    }
    if (isRightSwipe && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
    
    // Reset touch values
    setTouchStart(0);
    setTouchEnd(0);
  };

  const nextSlide = () => {
    setCurrentSlide(currentSlide < 2 ? currentSlide + 1 : 0);
  };

  const prevSlide = () => {
    setCurrentSlide(currentSlide > 0 ? currentSlide - 1 : 2);
  };

  const stats = getDashboardStats();
  const performance = getCollectorPerformance();
  const baseFilteredCollections = getFilteredCollections(filters, "manager");
  
  // Apply collector filter for collections view
  const filteredCollections = baseFilteredCollections;
  
  // Apply overview filter for overview calculations
  const overviewCollections = overviewFilter === "with-collector" 
    ? collections.filter(collection => collection.user_id && collection.user_id.trim() !== "")
    : collections;
  
  // Calculate metrics based on overview filter
  const totalAmount = overviewCollections.reduce((sum, c) => sum + c.valor_original, 0);
  const receivedAmount = overviewCollections.reduce((sum, c) => sum + c.valor_recebido, 0);
  const totalReceived = overviewCollections.filter(c => c.status?.toLowerCase() === "recebido" || c.valor_recebido > 0).length;
  const totalCollections = overviewCollections.length;
  
  const overviewStats = {
    totalAmount,
    receivedAmount,
    totalReceived,
    totalCollections,
    pendingAmount: totalAmount - receivedAmount,
    conversionRate: totalCollections > 0 ? (totalReceived / totalCollections) * 100 : 0
  };
  
  const pendingCancellations = getPendingCancellationRequests();
  const tabs = getManagerTabs(pendingCancellations.length);

  const renderTabContent = () => {
    switch (activeTab) {
      case "database-upload":
        return <DatabaseUpload />;
      case "overview":
        // Simplified metrics - pending vs completed sales and clients
        // Group by sale to count correctly
        const salesMap = new Map<string, { isPending: boolean; clientDocument: string; totalValue: number; receivedValue: number }>();
        overviewCollections.forEach((collection) => {
          const saleKey = `${collection.venda_n}-${collection.documento}`;
          if (!salesMap.has(saleKey)) {
            salesMap.set(saleKey, {
              isPending: false,
              clientDocument: collection.documento || "",
              totalValue: 0,
              receivedValue: 0
            });
          }
          const sale = salesMap.get(saleKey)!;
          sale.totalValue += collection.valor_original;
          sale.receivedValue += collection.valor_recebido;
        });

        // Determine if each sale is pending (has any amount left to receive)
        salesMap.forEach((sale) => {
          const pendingAmount = sale.totalValue - sale.receivedValue;
          sale.isPending = pendingAmount > 0.01; // Consider amounts > 1 cent as pending
        });

        const pendingSalesCount = Array.from(salesMap.values()).filter(s => s.isPending).length;
        const completedSalesCount = Array.from(salesMap.values()).filter(s => !s.isPending).length;
        const clientsWithPendingCount = new Set(
          Array.from(salesMap.values())
            .filter(s => s.isPending)
            .map(s => s.clientDocument)
            .filter(Boolean)
        ).size;
        const todayCollections = overviewCollections.filter(c => {
          const today = new Date().toISOString().split('T')[0];
          return c.data_vencimento === today;
        });
        const todayAmount = todayCollections.reduce((sum, c) => sum + c.valor_original, 0);
        const storesWithCollections = new Set(overviewCollections.map(c => c.nome_da_loja).filter(Boolean)).size;

        return (
          <div className="space-y-4 sm:space-y-6">
            {/* Overview Filter */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow-sm p-3 sm:p-4 border border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">
                  Visão Geral
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">
                    Filtrar por cobrador:
                  </label>
                  <div className="flex bg-gray-100 rounded-md p-0.5">
                    <button
                      onClick={() => setOverviewFilter("all")}
                      className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                        overviewFilter === "all"
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Tudo
                    </button>
                    <button
                      onClick={() => setOverviewFilter("with-collector")}
                      className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                        overviewFilter === "with-collector"
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Apenas com cobrador
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Métricas Slider */}
            <div className="space-y-4">
              {/* Header with responsive controls */}
              <div className="flex items-center justify-end">
                {/* Desktop controls - only arrows */}
                <div className="hidden sm:flex items-center gap-1">
                  <button
                    onClick={prevSlide}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4 text-gray-600" />
                  </button>
                  <button
                    onClick={nextSlide}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4 text-gray-600" />
                  </button>
                </div>
              </div>
              
              {/* Slider container with touch support */}
              <div 
                ref={sliderRef}
                className="relative overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{ touchAction: 'pan-y pinch-zoom' }}
              >
                <div 
                  className="flex transition-transform duration-300 ease-in-out"
                  style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                >
                  {/* Slide 1: Métricas Financeiras */}
                  <div className="w-full flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <DollarSign className="h-4 w-4 text-blue-600" />
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base">Métricas Financeiras</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-4">
                      <StatsCard
                        title="Valor Total"
                        value={formatCurrency(overviewStats.totalAmount)}
                        change={`${overviewStats.totalCollections} cobranças`}
                        changeType="neutral"
                        icon={DollarSign}
                        iconColor="bg-blue-500"
                        onClick={() => setActiveTab("collections")}
                      />
                      <StatsCard
                        title="Total em Aberto"
                        value={formatCurrency(overviewStats.pendingAmount)}
                        change="+12% vs mês anterior"
                        changeType="positive"
                        icon={DollarSign}
                        iconColor="bg-red-500"
                        onClick={() => setActiveTab("collections")}
                      />
                      <StatsCard
                        title="Total Recebido"
                        value={formatCurrency(overviewStats.receivedAmount)}
                        change="+8% vs mês anterior"
                        changeType="positive"
                        icon={TrendingUp}
                        iconColor="bg-green-500"
                        onClick={() => setActiveTab("collections")}
                      />
                      <StatsCard
                        title="Taxa de Conversão"
                        value={`${overviewStats.conversionRate.toFixed(1)}%`}
                        change="+2.1% vs mês anterior"
                        changeType="positive"
                        icon={BarChart3}
                        iconColor="bg-blue-500"
                        onClick={() => setActiveTab("performance")}
                      />
                    </div>
                  </div>

                  {/* Slide 2: Métricas Operacionais */}
                  <div className="w-full flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <Target className="h-4 w-4 text-green-600" />
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base">Métricas Operacionais</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
                      <StatsCard
                        title="Vendas Finalizadas"
                        value={completedSalesCount.toString()}
                        change={`${((completedSalesCount / (completedSalesCount + pendingSalesCount)) * 100).toFixed(1)}% concluídas`}
                        changeType="positive"
                        icon={CheckCircle}
                        iconColor="bg-green-500"
                        onClick={() => setActiveTab("collections")}
                      />
                      <StatsCard
                        title="Clientes com Pendências"
                        value={clientsWithPendingCount.toString()}
                        change={`${pendingSalesCount} vendas pendentes`}
                        changeType="negative"
                        icon={Users}
                        iconColor="bg-orange-600"
                        onClick={() => setActiveTab("collections")}
                      />
                      <StatsCard
                        title="Vencimentos Hoje"
                        value={formatCurrency(todayAmount)}
                        change={`${todayCollections.length} títulos`}
                        changeType="neutral"
                        icon={Calendar}
                        iconColor="bg-orange-500"
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setFilters({ ...filters, dueDate: today });
                          setActiveTab("collections");
                        }}
                      />
                    </div>
                  </div>

                  {/* Slide 3: Ecossistema de Cobrança */}
                  <div className="w-full flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <Target className="h-4 w-4 text-indigo-600" />
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base">Ecossistema de Cobrança</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
                      <StatsCard
                        title="Time Ativo"
                        value={stats.collectorsCount.toString()}
                        change="cobradores em campo"
                        changeType="neutral"
                        icon={Users}
                        iconColor="bg-purple-500"
                        onClick={() => setActiveTab("users")}
                      />
                      <StatsCard
                        title="Cobertura da Rede"
                        value={storesWithCollections.toString()}
                        change="pontos ativos"
                        changeType="neutral"
                        icon={Store}
                        iconColor="bg-indigo-500"
                        onClick={() => setActiveTab("stores")}
                      />
                      <StatsCard
                        title="Eficiência Média"
                        value={`${performance.length > 0 ? (performance.reduce((acc, p) => acc + p.conversionRate, 0) / performance.length).toFixed(1) : '0.0'}%`}
                        change="conversão da equipe"
                        changeType="positive"
                        icon={TrendingUp}
                        iconColor="bg-green-500"
                        onClick={() => setActiveTab("performance")}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile slide indicators */}
              <div className="flex sm:hidden justify-center gap-1.5 mt-4">
                {[0, 1, 2].map((index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`w-2 h-2 rounded-full transition-colors touch-manipulation ${
                      currentSlide === index ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Foco do Dia */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base lg:text-lg font-semibold text-gray-900">Foco do Dia</h3>
                <Target className="h-5 w-5 text-blue-500" />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Vencimentos hoje</span>
                  <span className="font-semibold text-gray-900">{todayCollections.length} títulos</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Meta de recuperação</span>
                  <span className="font-semibold text-green-600">85%</span>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Valor a receber hoje</span>
                    <span className="text-lg font-bold text-blue-600">{formatCurrency(todayAmount)}</span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFilters({ ...filters, dueDate: today });
                    setActiveTab("collections");
                  }}
                  className="w-full mt-4 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium flex items-center justify-center"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Ver Vencimentos de Hoje
                </button>
              </div>
            </div>

            {/* Pending Cancellations Alert */}
            {pendingCancellations.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg sm:rounded-xl p-4 lg:p-6">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 mb-1">
                      {pendingCancellations.length} Solicitações de Cancelamento Pendentes
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Existem cancelamentos de visitas aguardando sua aprovação.
                    </p>
                    <button
                      onClick={() => setActiveTab("visit-tracking")}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                    >
                      Revisar Solicitações
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Performance Overview - Enhanced Mobile Optimization */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200">
              <div className="p-3 sm:p-4 lg:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4 lg:mb-6">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 truncate">
                      Desempenho dos Cobradores
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">
                      Acompanhamento detalhado por cobrador
                    </p>
                  </div>
                  <button className="inline-flex items-center justify-center px-3 sm:px-3 lg:px-4 bg-blue-600 text-white rounded-md sm:rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm font-medium whitespace-nowrap touch-manipulation">
                    <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    <span className="hidden sm:inline">Exportar Dados</span>
                    <span className="sm:hidden">Exportar</span>
                  </button>
                </div>

                {/* Mobile-friendly performance cards */}
                <div className="space-y-3 lg:hidden">
                  {performance.map((collector) => (
                    <div
                      key={collector.collectorId}
                      className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-sm text-gray-900 truncate flex-1 mr-2">
                          {collector.collectorName}
                        </h3>
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${
                            collector.conversionRate >= 50
                              ? "bg-green-100 text-green-800"
                              : collector.conversionRate >= 25
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {collector.conversionRate.toFixed(1)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-white rounded-md p-2">
                          <div className="font-semibold text-sm text-gray-900">
                            {collector.totalAssigned}
                          </div>
                          <div className="text-xs text-gray-600">Vendas</div>
                        </div>
                        <div className="bg-white rounded-md p-2">
                          <div className="font-semibold text-sm text-green-600">
                            {collector.totalReceived}
                          </div>
                          <div className="text-xs text-gray-600">Pagas</div>
                        </div>
                        <div className="bg-white rounded-md p-2">
                          <div className="font-semibold text-sm text-blue-600">
                            {collector.clientCount}
                          </div>
                          <div className="text-xs text-gray-600">Clientes</div>
                        </div>
                        <div className="bg-white rounded-md p-2">
                          <div className="font-semibold text-xs text-blue-600 truncate">
                            {formatCurrency(collector.receivedAmount)}
                          </div>
                          <div className="text-xs text-gray-600">Valor</div>
                        </div>
                      </div>

                      {/* Additional mobile info */}
                      <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span>Tempo médio: <span className="font-medium text-gray-900">{collector.averageTime.toFixed(0)} dias</span></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">
                          Cobrador
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">
                          Clientes
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">
                          Vendas Atribuídas
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">
                          Vendas Pagas
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">
                          Taxa
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">
                          Valor Total
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">
                          Tempo Médio
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-gray-500">
                            Nenhum cobrador encontrado
                          </td>
                        </tr>
                      ) : (
                        performance.map((collector) => (
                        <tr
                          key={collector.collectorId}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900">
                              {collector.collectorName}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {collector.clientCount}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {collector.totalAssigned}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {collector.totalReceived}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                collector.conversionRate >= 50
                                  ? "bg-green-100 text-green-800"
                                  : collector.conversionRate >= 25
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
                              }`}
                            >
                              {collector.conversionRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {formatCurrency(collector.receivedAmount)}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {collector.averageTime.toFixed(0)} dias
                          </td>
                        </tr>
                      ))
                    )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );

      case "collections":
        return (
          <div className="space-y-3 sm:space-y-4">
            {/* View Toggle Buttons - Enhanced Mobile */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                <FileText className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
                Cobranças
              </h2>
              <div className="flex bg-gray-100 rounded-md p-0.5 w-full sm:w-auto">
                <button
                  onClick={() => setCollectionsView("table")}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                    collectionsView === "table"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2 inline" />
                  <span className="hidden sm:inline">Todas as Cobranças</span>
                  <span className="sm:hidden">Cobranças</span>
                </button>
                <button
                  onClick={() => setCollectionsView("cash-report")}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                    collectionsView === "cash-report"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2 inline" />
                  <span className="hidden sm:inline">Relatório do Caixa</span>
                  <span className="sm:hidden">Caixa</span>
                </button>
              </div>
            </div>

            {/* Content based on selected view */}
            {collectionsView === "table" ? (
              <div>
                <FilterBar
                  filters={filters}
                  onFilterChange={setFilters}
                  userType="manager"
                />
                <CollectionTable
                  collections={filteredCollections}
                  userType="manager"
                  showGrouped={false}
                />
              </div>
            ) : (
              <DailyCashReport collections={collections} />
            )}
          </div>
        );

      case "performance":
        return <EnhancedPerformanceChart />;

      case "stores":
        return <EnhancedStoreManagement />;

      case "clients":
        return <ClientAssignment />;

      case "visit-tracking":
        return <VisitTracking />;

      case "authorization":
        return <AuthorizationManager />;

      case "users":
        return <UserManagement />;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <div className="p-6 w-full md:max-w-[90%] mx-auto">
        {/* Desktop Tab Navigation */}
        <div className="hidden lg:block mb-4 sm:mb-6 lg:mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center py-3 px-4 border-b-2 font-medium text-sm whitespace-nowrap relative transition-colors ${
                      activeTab === tab.id
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{tab.name}</span>
                    {tab.id === "visit-tracking" &&
                      pendingCancellations.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                          {pendingCancellations.length}
                        </span>
                      )}
                    {tab.id === "authorization" && pendingAuthorizations > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {pendingAuthorizations}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-fadeIn">{renderTabContent()}</div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
