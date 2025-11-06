import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  Users,
  FileText,
  BarChart3,
  Store,
  AlertTriangle,
  Calendar,
  Target,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import FilterBar from "../common/FilterBar";
import { CollectionTable } from "./CollectionTable";
import EnhancedPerformanceChart from "./EnhancedPerformanceChart";
import UserManagement from "./UserManagement";
import EnhancedStoreManagement from "./EnhancedStoreManagement";
import DatabaseUpload from "../admin/DatabaseUpload";
import { ClientAssignment } from "../ClientAssignment";
import VisitTracking from "./VisitTracking";
import DailyCashReport from "./DailyCashReport";
import AuthorizationManager from "./AuthorizationManager";
import TabTransition from "../common/TabTransition";
import { useCollection } from "../../contexts/CollectionContext";
import { FilterOptions } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";

import { CollectionTableRef } from "./CollectionTable";
import { Notification } from "../../contexts/NotificationContext";

// Export tabs for use in Header

interface ManagerDashboardProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  activeTab: externalActiveTab,
  onTabChange,
}) => {
  const {
    getDashboardStats,
    getCollectorPerformance,
    getFilteredCollections,
    getPendingCancellationRequests,
    collections,
    scheduledVisits,
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
  const [overviewFilter] = useState<"all" | "with-collector">("all");

  // Estado para controlar visibilidade dos filtros no mobile
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // Estado para seleção de cobrador nos agendamentos
  const [selectedCollector, setSelectedCollector] = useState<string>("all");

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [, setPendingAuthorizations] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const collectionTableRef = useRef<CollectionTableRef>(null);

  const handleNotificationClick = (notification: Notification) => {
    if (notification.relatedId && notification.relatedId.startsWith("sale-")) {
      const parts = notification.relatedId.split("-");
      const saleNumber = parseInt(parts[1], 10);
      const clientDocument = parts[3];
      if (saleNumber && clientDocument && collectionTableRef.current) {
        setActiveTab("collections");
        setTimeout(() => {
          collectionTableRef.current?.openSaleDetails(
            saleNumber,
            clientDocument,
          );
        }, 100);
      }
    }
  };

  useEffect(() => {
    const listener = (e: Event) => {
      const customEvent = e as CustomEvent;
      handleNotificationClick(customEvent.detail);
    };
    window.addEventListener("notificationClick", listener);
    return () => {
      window.removeEventListener("notificationClick", listener);
    };
  }, []);

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
        const pendingRequests =
          await AuthorizationHistoryService.getPendingRequests();
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

  // Auto-play slider effect - loop infinito a cada 5 segundos
  useEffect(() => {
    if (activeTab === "overview" && isAutoPlaying) {
      autoPlayIntervalRef.current = setInterval(() => {
        setCurrentSlide((prevSlide) => (prevSlide + 1) % 3);
      }, 5000);

      return () => {
        if (autoPlayIntervalRef.current) {
          clearInterval(autoPlayIntervalRef.current);
        }
      };
    }

    return () => {
      if (autoPlayIntervalRef.current) {
        clearInterval(autoPlayIntervalRef.current);
      }
    };
  }, [activeTab, isAutoPlaying]);

  // Pausar autoplay quando o usuário interage com o slider
  const pauseAutoPlay = () => {
    setIsAutoPlaying(false);
    if (autoPlayIntervalRef.current) {
      clearInterval(autoPlayIntervalRef.current);
    }

    // Retomar autoplay após 10 segundos de inatividade
    setTimeout(() => {
      setIsAutoPlaying(true);
    }, 10000);
  };

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

    if (isLeftSwipe) {
      pauseAutoPlay();
      setCurrentSlide((prevSlide) => (prevSlide + 1) % 3);
    }
    if (isRightSwipe) {
      pauseAutoPlay();
      setCurrentSlide((prevSlide) => (prevSlide - 1 + 3) % 3);
    }

    // Reset touch values
    setTouchStart(0);
    setTouchEnd(0);
  };

  const nextSlide = () => {
    pauseAutoPlay();
    setCurrentSlide((prevSlide) => (prevSlide + 1) % 3);
  };

  const prevSlide = () => {
    pauseAutoPlay();
    setCurrentSlide((prevSlide) => (prevSlide - 1 + 3) % 3);
  };

  // Calculate scheduling metrics based on real data
  const calculateSchedulingMetrics = useMemo(() => {
    if (!scheduledVisits)
      return {
        today: {
          total: 0,
          completed: 0,
          pending: 0,
          cancelled: 0,
          completionRate: 0,
        },
        week: {
          total: 0,
          completed: 0,
          pending: 0,
          cancelled: 0,
          completionRate: 0,
        },
        month: {
          total: 0,
          completed: 0,
          pending: 0,
          cancelled: 0,
          completionRate: 0,
        },
      };

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Start of week (Monday)
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const filterVisitsByCollector = (visits: any[]) => {
      if (selectedCollector === "all") return visits;
      return visits.filter((visit) => visit.collectorId === selectedCollector);
    };

    const calculatePeriodMetrics = (filterFn: (visit: any) => boolean) => {
      const periodVisits = filterVisitsByCollector(
        scheduledVisits.filter(filterFn),
      );

      const total = periodVisits.length;
      const completed = periodVisits.filter(
        (v) => v.status === "completed",
      ).length;
      const cancelled = periodVisits.filter(
        (v) => v.status === "cancelled",
      ).length;
      const pending = periodVisits.filter(
        (v) => v.status === "scheduled" || v.status === "in_progress",
      ).length;
      const completionRate =
        total > 0 ? Math.round((completed / total) * 100) : 0;

      return { total, completed, pending, cancelled, completionRate };
    };

    // Today's visits
    const todayMetrics = calculatePeriodMetrics(
      (visit) => visit.scheduledDate === todayStr,
    );

    // This week's visits
    const weekMetrics = calculatePeriodMetrics((visit) => {
      const visitDate = new Date(visit.scheduledDate);
      return visitDate >= startOfWeek && visitDate <= today;
    });

    // This month's visits
    const monthMetrics = calculatePeriodMetrics((visit) => {
      const visitDate = new Date(visit.scheduledDate);
      return visitDate >= startOfMonth && visitDate <= today;
    });

    return {
      today: todayMetrics,
      week: weekMetrics,
      month: monthMetrics,
    };
  }, [scheduledVisits, selectedCollector]);

  const stats = useMemo(() => getDashboardStats(), [collections]);
  const performance = useMemo(() => getCollectorPerformance(), [collections]);
  const baseFilteredCollections = useMemo(
    () => getFilteredCollections(filters, "manager"),
    [filters, collections],
  );

  // Apply collector filter for collections view
  const filteredCollections = baseFilteredCollections;

  // Apply overview filter for overview calculations
  const overviewCollections = useMemo(
    () =>
      overviewFilter === "with-collector"
        ? collections.filter(
            (collection) =>
              collection.user_id && collection.user_id.trim() !== "",
          )
        : collections,
    [overviewFilter, collections],
  );

  // Calculate metrics based on overview filter
  const overviewStats = useMemo(() => {
    const totalAmount = overviewCollections.reduce(
      (sum, c) => sum + c.valor_original,
      0,
    );
    const receivedAmount = overviewCollections.reduce(
      (sum, c) => sum + c.valor_recebido,
      0,
    );
    const totalReceived = overviewCollections.filter(
      (c) => c.status?.toLowerCase() === "recebido" || c.valor_recebido > 0,
    ).length;
    const totalCollections = overviewCollections.length;

    return {
      totalAmount,
      receivedAmount,
      totalReceived,
      totalCollections,
      pendingAmount: totalAmount - receivedAmount,
      conversionRate:
        totalCollections > 0 ? (totalReceived / totalCollections) * 100 : 0,
    };
  }, [overviewCollections]);

  const pendingCancellations = getPendingCancellationRequests();

  // Sales map for overview tab - moved from renderTabContent to fix hooks violation
  const salesMap = useMemo(() => {
    if (activeTab !== "overview") return new Map();

    const map = new Map<
      string,
      {
        isPending: boolean;
        clientDocument: string;
        totalValue: number;
        receivedValue: number;
      }
    >();

    overviewCollections.forEach((collection) => {
      const saleKey = `${collection.venda_n}-${collection.documento}`;
      if (!map.has(saleKey)) {
        map.set(saleKey, {
          isPending: false,
          clientDocument: collection.documento || "",
          totalValue: 0,
          receivedValue: 0,
        });
      }
      const sale = map.get(saleKey)!;
      sale.totalValue =
        Number(sale.totalValue) + Number(collection.valor_original);
      sale.receivedValue =
        Number(sale.receivedValue) + Number(collection.valor_recebido);
    });

    // Determine if each sale is pending (has any amount left to receive)
    map.forEach((sale) => {
      const pendingAmount = sale.totalValue - sale.receivedValue;
      sale.isPending = pendingAmount > 0.01; // Consider amounts > 1 cent as pending
    });

    return map;
  }, [activeTab, overviewCollections]);

  // Overview metrics - moved from renderTabContent to fix hooks violation
  const overviewMetrics = useMemo(() => {
    if (activeTab !== "overview") {
      return {
        pendingSalesCount: 0,
        completedSalesCount: 0,
        clientsWithPendingCount: 0,
        todayCollections: [],
        todayAmount: 0,
        storesWithCollections: 0,
        averageEfficiency: "0.0",
      };
    }

    const salesArray = Array.from(salesMap.values());
    const pendingSales = salesArray.filter((s) => s.isPending);
    const completedSales = salesArray.filter((s) => !s.isPending);

    const clientsWithPendingCount = new Set(
      pendingSales.map((s) => s.clientDocument).filter(Boolean),
    ).size;

    const todayCollections = overviewCollections.filter((c) => {
      const today = new Date().toISOString().split("T")[0];
      return c.data_vencimento === today;
    });

    const todayAmount = todayCollections.reduce(
      (sum, c) => sum + c.valor_original,
      0,
    );

    const storesWithCollections = new Set(
      overviewCollections.map((c) => c.nome_da_loja).filter(Boolean),
    ).size;

    const averageEfficiency =
      performance.length > 0
        ? (
            performance.reduce((acc, p) => acc + p.conversionRate, 0) /
            performance.length
          ).toFixed(1)
        : "0.0";

    return {
      pendingSalesCount: pendingSales.length,
      completedSalesCount: completedSales.length,
      clientsWithPendingCount,
      todayCollections,
      todayAmount,
      storesWithCollections,
      averageEfficiency,
    };
  }, [activeTab, salesMap, overviewCollections, performance]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "database-upload":
        return <DatabaseUpload />;
      case "overview":
        return (
          <div className="space-y-4 sm:space-y-6">
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
                onMouseEnter={() => setIsAutoPlaying(false)}
                onMouseLeave={() => setIsAutoPlaying(true)}
                style={{ touchAction: "pan-y pinch-zoom" }}
              >
                <div
                  className="flex transition-transform duration-300 ease-in-out"
                  style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                >
                  {/* Slide 1: Métricas Financeiras */}
                  <div className="w-full flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <DollarSign className="h-4 w-4 text-gray-600" />
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base">
                        Métricas Financeiras
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-4">
                      <div
                        onClick={() => setActiveTab("collections")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Valor Total
                          </h5>
                          <DollarSign className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {formatCurrency(overviewStats.totalAmount)}
                        </div>
                        <div className="text-xs text-gray-600">
                          {overviewStats.totalCollections} cobranças
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab("collections")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Total em Aberto
                          </h5>
                          <DollarSign className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {formatCurrency(overviewStats.pendingAmount)}
                        </div>
                        <div className="text-xs text-gray-600">
                          +12% vs mês anterior
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab("collections")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Total Recebido
                          </h5>
                          <TrendingUp className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {formatCurrency(overviewStats.receivedAmount)}
                        </div>
                        <div className="text-xs text-gray-600">
                          +8% vs mês anterior
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab("performance")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Taxa de Conversão
                          </h5>
                          <BarChart3 className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {overviewStats.conversionRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-600">
                          +2.1% vs mês anterior
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Slide 2: Métricas Operacionais */}
                  <div className="w-full flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <Target className="h-4 w-4 text-gray-600" />
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base">
                        Métricas Operacionais
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
                      <div
                        onClick={() => setActiveTab("collections")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Vendas Finalizadas
                          </h5>
                          <CheckCircle className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {overviewMetrics.completedSalesCount}
                        </div>
                        <div className="text-xs text-gray-600">
                          {(
                            (overviewMetrics.completedSalesCount /
                              (overviewMetrics.completedSalesCount +
                                overviewMetrics.pendingSalesCount)) *
                            100
                          ).toFixed(1)}
                          % concluídas
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab("collections")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Clientes com Pendências
                          </h5>
                          <Users className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {overviewMetrics.clientsWithPendingCount}
                        </div>
                        <div className="text-xs text-gray-600">
                          {overviewMetrics.pendingSalesCount} vendas pendentes
                        </div>
                      </div>
                      <div
                        onClick={() => {
                          const today = new Date().toISOString().split("T")[0];
                          setFilters({ ...filters, dueDate: today });
                          setActiveTab("collections");
                        }}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Vencimentos Hoje
                          </h5>
                          <Calendar className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {formatCurrency(overviewMetrics.todayAmount)}
                        </div>
                        <div className="text-xs text-gray-600">
                          {overviewMetrics.todayCollections.length} títulos
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Slide 3: Ecossistema de Cobrança */}
                  <div className="w-full flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <Target className="h-4 w-4 text-gray-600" />
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base">
                        Ecossistema de Cobrança
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
                      <div
                        onClick={() => setActiveTab("users")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Time Ativo
                          </h5>
                          <Users className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {stats.collectorsCount}
                        </div>
                        <div className="text-xs text-gray-600">
                          cobradores em campo
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab("stores")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Cobertura da Rede
                          </h5>
                          <Store className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {overviewMetrics.storesWithCollections}
                        </div>
                        <div className="text-xs text-gray-600">
                          pontos ativos
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab("performance")}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-900">
                            Eficiência Média
                          </h5>
                          <TrendingUp className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">
                          {overviewMetrics.averageEfficiency}%
                        </div>
                        <div className="text-xs text-gray-600">
                          conversão da equipe
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile slide indicators */}
              <div className="flex sm:hidden justify-center gap-1.5 mt-4">
                {[0, 1, 2].map((index) => (
                  <button
                    key={index}
                    onClick={() => {
                      pauseAutoPlay();
                      setCurrentSlide(index);
                    }}
                    className={`w-2 h-2 rounded-full transition-colors touch-manipulation ${
                      currentSlide === index ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Agendamentos dos Cobradores */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Agendamentos dos Cobradores
                  </h3>
                  <p className="text-sm text-gray-600">
                    Métricas de visitas agendadas
                  </p>
                </div>

                {/* Seletor de Cobrador */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="collector-select"
                    className="text-sm font-medium text-gray-700 whitespace-nowrap"
                  >
                    Cobrador:
                  </label>
                  <select
                    id="collector-select"
                    value={selectedCollector}
                    onChange={(e) => setSelectedCollector(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-0 flex-1 sm:flex-none sm:min-w-[150px]"
                  >
                    <option value="all">Todos os Cobradores</option>
                    {performance.map((collector) => (
                      <option
                        key={collector.collectorId}
                        value={collector.collectorId}
                      >
                        {collector.collectorName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                {/* Agendamentos do Dia */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900">Hoje</h4>
                    <Calendar className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.today.total}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Concluídas</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.today.completed}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Pendentes</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.today.pending}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Canceladas</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.today.cancelled}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">
                          Taxa de Conclusão
                        </span>
                        <span className="font-bold text-gray-900">
                          {calculateSchedulingMetrics.today.completionRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Agendamentos da Semana */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900">Esta Semana</h4>
                    <Target className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.week.total}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Concluídas</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.week.completed}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Pendentes</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.week.pending}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Canceladas</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.week.cancelled}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">
                          Taxa de Conclusão
                        </span>
                        <span className="font-bold text-gray-900">
                          {calculateSchedulingMetrics.week.completionRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Agendamentos do Mês */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900">Este Mês</h4>
                    <BarChart3 className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.month.total}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Concluídas</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.month.completed}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Pendentes</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.month.pending}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Canceladas</span>
                      <span className="font-semibold text-gray-900">
                        {calculateSchedulingMetrics.month.cancelled}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">
                          Taxa de Conclusão
                        </span>
                        <span className="font-bold text-gray-900">
                          {calculateSchedulingMetrics.month.completionRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Informação do cobrador selecionado */}
              {selectedCollector !== "all" && (
                <div className="mt-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">
                      Exibindo dados de:{" "}
                      {
                        performance.find(
                          (p) => p.collectorId === selectedCollector,
                        )?.collectorName
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Ação para ver detalhes */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setActiveTab("visit-tracking")}
                  className="w-full px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium flex items-center justify-center border border-gray-200"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Ver Todos os Agendamentos
                  {selectedCollector !== "all" && (
                    <span className="ml-1">
                      -{" "}
                      {
                        performance.find(
                          (p) => p.collectorId === selectedCollector,
                        )?.collectorName
                      }
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Pending Cancellations Alert */}
            {pendingCancellations.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl sm:rounded-2xl p-4 lg:p-6">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 mb-1">
                      {pendingCancellations.length} Solicitações de Cancelamento
                      Pendentes
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Existem cancelamentos de visitas aguardando sua aprovação.
                    </p>
                    <button
                      onClick={() => setActiveTab("visit-tracking")}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-2xl hover:bg-yellow-700 transition-colors text-sm font-medium"
                    >
                      Revisar Solicitações
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Performance Overview - Design Minimalista */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Performance dos Cobradores
                </h2>
                <p className="text-sm text-gray-600">
                  Ranking de eficiência da equipe
                </p>
              </div>

              {/* Top 3 - Design Clean */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {performance.slice(0, 3).map((collector, index) => {
                  const borderColors = [
                    "border-blue-200",
                    "border-gray-200",
                    "border-orange-200",
                  ];
                  const bgColors = ["bg-blue-50", "bg-gray-50", "bg-orange-50"];

                  return (
                    <div
                      key={collector.collectorId}
                      className={`relative border-2 ${borderColors[index]} ${bgColors[index]} rounded-lg p-4 transition-all duration-200 hover:shadow-sm`}
                    >
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                        {index + 1}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <h3 className="font-medium text-gray-900 text-sm truncate">
                            {collector.collectorName}
                          </h3>
                          <p className="text-2xl font-bold text-gray-900 mt-1">
                            {collector.conversionRate.toFixed(1)}%
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="text-center p-2 bg-white rounded border">
                            <div className="font-semibold text-gray-900">
                              {collector.totalReceived}
                            </div>
                            <div className="text-gray-600">Pagas</div>
                          </div>
                          <div className="text-center p-2 bg-white rounded border">
                            <div className="font-semibold text-gray-900">
                              {collector.clientCount}
                            </div>
                            <div className="text-gray-600">Clientes</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Métricas da Equipe - Simples */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Tempo Médio</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {performance.length > 0
                      ? (
                          performance.reduce(
                            (acc, p) => acc + p.averageTime,
                            0,
                          ) / performance.length
                        ).toFixed(0)
                      : 0}{" "}
                    dias
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">
                    Total Recuperado
                  </div>
                  <div className="text-xl font-semibold text-gray-900">
                    {formatCurrency(
                      performance.reduce((acc, p) => acc + p.receivedAmount, 0),
                    )}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">
                    Eficiência Geral
                  </div>
                  <div className="text-xl font-semibold text-gray-900">
                    {performance.length > 0
                      ? (
                          performance.reduce(
                            (acc, p) => acc + p.conversionRate,
                            0,
                          ) / performance.length
                        ).toFixed(1)
                      : 0}
                    %
                  </div>
                </div>
              </div>

              {/* Lista Completa */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">
                  Todos os Cobradores
                </h3>

                {/* Mobile Cards - Minimalista */}
                <div className="space-y-3 lg:hidden">
                  {performance.map((collector, index) => (
                    <div
                      key={collector.collectorId}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                            {index + 1}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 text-sm">
                              {collector.collectorName}
                            </h4>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {collector.conversionRate.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3 text-center text-xs">
                        <div>
                          <div className="font-medium text-gray-900">
                            {collector.totalAssigned}
                          </div>
                          <div className="text-gray-600">Atribuídas</div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {collector.totalReceived}
                          </div>
                          <div className="text-gray-600">Pagas</div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {collector.clientCount}
                          </div>
                          <div className="text-gray-600">Clientes</div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {collector.averageTime.toFixed(0)}d
                          </div>
                          <div className="text-gray-600">Tempo</div>
                        </div>
                      </div>

                      {/* Barra de Progresso Simples */}
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-1">
                          <div
                            className="bg-gray-900 h-1 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min((collector.totalReceived / collector.totalAssigned) * 100, 100)}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table - Clean */}
                <div className="hidden lg:block">
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-3 px-4 font-medium text-gray-900 text-sm">
                            #
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-900 text-sm">
                            Cobrador
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-900 text-sm">
                            Eficiência
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-900 text-sm">
                            Vendas
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-900 text-sm">
                            Clientes
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-900 text-sm">
                            Valor Recebido
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-900 text-sm">
                            Tempo Médio
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {performance.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-8 text-center text-gray-500 text-sm"
                            >
                              Nenhum cobrador encontrado
                            </td>
                          </tr>
                        ) : (
                          performance.map((collector, index) => (
                            <tr
                              key={collector.collectorId}
                              className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                                  {index + 1}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-gray-900 text-sm">
                                  {collector.collectorName}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                    <div
                                      className="bg-gray-900 h-1.5 rounded-full"
                                      style={{
                                        width: `${Math.min(collector.conversionRate, 100)}%`,
                                      }}
                                    ></div>
                                  </div>
                                  <span className="text-sm font-medium text-gray-900 min-w-[40px]">
                                    {collector.conversionRate.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="text-sm text-gray-900">
                                  <span className="font-medium">
                                    {collector.totalReceived}
                                  </span>
                                  <span className="text-gray-500">
                                    {" "}
                                    / {collector.totalAssigned}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {collector.clientCount}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {formatCurrency(collector.receivedAmount)}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {collector.averageTime.toFixed(0)} dias
                                </div>
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
          </div>
        );

      case "collections":
        return (
          <div className="space-y-3 sm:space-y-4">
            {/* View Toggle Buttons - Enhanced Mobile */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 lg:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                  <FileText className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
                  Cobranças
                </h2>
                {/* Botão de filtro para mobile */}
                {collectionsView !== "cash-report" && (
                  <button
                    onClick={() => setIsFilterVisible(!isFilterVisible)}
                    className="md:hidden p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors"
                    title="Filtros"
                  >
                    <Filter className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="flex bg-gray-100 rounded-md p-0.5 w-full sm:w-auto">
                <button
                  onClick={() => setCollectionsView("table")}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
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
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
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
                <div
                  className={`${isFilterVisible ? "block" : "hidden"} md:block`}
                >
                  <FilterBar
                    filters={filters}
                    onFilterChange={setFilters}
                    userType="manager"
                  />
                </div>
                <CollectionTable
                  ref={collectionTableRef}
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
    <div className="p-4 sm:p-6 lg:p-16 pt-16 lg:pt-16">
      {/* Tab Content */}
      <TabTransition activeKey={activeTab} avoidTransformConflicts={true}>
        {renderTabContent()}
      </TabTransition>
    </div>
  );
};

export default ManagerDashboard;
