import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  Users,
  BarChart3,
  Store,
  AlertTriangle,
  Target,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import {
  Collection,
  CollectorPerformance,
  DashboardStats,
  FilterOptions,
} from "../../types";
import { useCollection } from "../../contexts/CollectionContext";

interface OverviewTabProps {
  collections: Collection[];
  performance: CollectorPerformance[];
  stats: DashboardStats;
  pendingCancellations: any[];
  setActiveTab: (tabId: string) => void;
  setFilters: (
    filters: FilterOptions | ((prev: FilterOptions) => FilterOptions),
  ) => void;
  filters: FilterOptions;
  scheduledVisits?: any[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  collections: overviewCollections,
  performance,
  stats,
  pendingCancellations,
  setActiveTab,
  setFilters,
  scheduledVisits,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedCollector, setSelectedCollector] = useState<string>("all");
  const { getClientGroups } = useCollection();
  const [schedulesPage, setSchedulesPage] = useState(1);
  const [clientsPage, setClientsPage] = useState(1);

  // Reset pagination when collector changes
  useEffect(() => {
    setSchedulesPage(1);
    setClientsPage(1);
  }, [selectedCollector]);

  useEffect(() => {
    if (isAutoPlaying) {
      autoPlayIntervalRef.current = setInterval(() => {
        setCurrentSlide((prevSlide) => (prevSlide + 1) % 3);
      }, 5000);
      return () => {
        if (autoPlayIntervalRef.current)
          clearInterval(autoPlayIntervalRef.current);
      };
    }
    return () => {
      if (autoPlayIntervalRef.current)
        clearInterval(autoPlayIntervalRef.current);
    };
  }, [isAutoPlaying]);

  const pauseAutoPlay = () => {
    setIsAutoPlaying(false);
    if (autoPlayIntervalRef.current) {
      clearInterval(autoPlayIntervalRef.current);
    }
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(0);
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

  const salesMap = useMemo(() => {
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
    map.forEach((sale) => {
      const pendingAmount = sale.totalValue - sale.receivedValue;
      sale.isPending = pendingAmount > 0.01;
    });
    return map;
  }, [overviewCollections]);

  const overviewMetrics = useMemo(() => {
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
  }, [salesMap, overviewCollections, performance]);

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
        (v) => v.status === "realizada",
      ).length;
      const cancelled = periodVisits.filter(
        (v) => v.status === "cancelada",
      ).length;
      const pending = periodVisits.filter(
        (v) => v.status === "agendada" || v.status === "in_progress",
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

  const schedulesByCity = useMemo(() => {
    const filteredVisits =
      selectedCollector === "all"
        ? scheduledVisits
        : scheduledVisits?.filter((v) => v.collectorId === selectedCollector);

    const scheduled = filteredVisits?.filter((v) => v.status === "agendada");

    return (scheduled || []).reduce(
      (acc, visit) => {
        const city = visit.clientCity || "Sem cidade";
        if (!acc[city]) {
          acc[city] = { count: 0, dates: new Set<string>() };
        }
        acc[city].count++;
        acc[city].dates.add(visit.scheduledDate);
        return acc;
      },
      {} as Record<string, { count: number; dates: Set<string> }>,
    );
  }, [scheduledVisits, selectedCollector]);

  const clientsByCity = useMemo(() => {
    const clientGroups = getClientGroups(
      selectedCollector === "all" ? undefined : selectedCollector,
    );
    return clientGroups.reduce(
      (acc, group) => {
        const city = group.city || "Sem cidade";
        acc[city] = (acc[city] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [getClientGroups, selectedCollector]);

  const SchedulesByCityCardContent = () => {
    const itemsPerPage = 10;
    const sortedSchedules = useMemo(() => {
      type ScheduleData = { count: number; dates: Set<string> };
      const entries = Object.entries(schedulesByCity) as [
        string,
        ScheduleData,
      ][];
      return entries.sort(([, dataA], [, dataB]) => dataA.count - dataB.count);
    }, [schedulesByCity]);

    const totalPages = Math.ceil(sortedSchedules.length / itemsPerPage);
    const paginatedSchedules = sortedSchedules.slice(
      (schedulesPage - 1) * itemsPerPage,
      schedulesPage * itemsPerPage,
    );

    return (
      <>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {paginatedSchedules.map(
            ([city, data]: [string, { count: number }]) => (
              <div
                key={city}
                className="bg-gray-50 dark:bg-dark-bg-secondary p-2 rounded-lg text-center border border-gray-200 dark:border-dark-border"
              >
                <div className="font-bold text-gray-800 dark:text-dark-text">
                  {data.count}
                </div>
                <div className="text-gray-600 dark:text-dark-text-secondary">
                  {city}
                </div>
              </div>
            ),
          )}
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center space-x-2">
            <button
              onClick={() => setSchedulesPage((p) => Math.max(1, p - 1))}
              disabled={schedulesPage === 1}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-700">
              {schedulesPage} / {totalPages}
            </span>
            <button
              onClick={() => setSchedulesPage((p) => Math.min(totalPages, p + 1))}
              disabled={schedulesPage === totalPages}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        )}
      </>
    );
  };

  const ClientsByCityCardContent = () => {
    const itemsPerPage = 10;

    const sortedCities = useMemo(() => {
      return Object.entries(clientsByCity).sort(
        ([, countA], [, countB]) => countB - countA,
      );
    }, [clientsByCity]);

    const totalPages = Math.ceil(sortedCities.length / itemsPerPage);
    const paginatedCities = sortedCities.slice(
      (clientsPage - 1) * itemsPerPage,
      clientsPage * itemsPerPage,
    );

    const handleCityClick = (city: string) => {
      setFilters((prevFilters) => ({ ...prevFilters, city: city }));
      setActiveTab("collections");
    };

    return (
      <>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {paginatedCities.map(([city, count]) => (
            <button
              key={city}
              onClick={() => handleCityClick(city)}
              className="bg-gray-50 dark:bg-dark-bg-secondary p-2 rounded-lg text-center border border-gray-200 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              <div className="font-bold text-gray-800 dark:text-dark-text">
                {count}
              </div>
              <div className="text-gray-600 dark:text-dark-text-secondary">
                {city}
              </div>
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center space-x-2">
            <button
              onClick={() => setClientsPage((p) => Math.max(1, p - 1))}
              disabled={clientsPage === 1}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-700">
              {clientsPage} / {totalPages}
            </span>
            <button
              onClick={() => setClientsPage((p) => Math.min(totalPages, p + 1))}
              disabled={clientsPage === totalPages}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        )}
      </>
    );
  };

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
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-dark-bg-secondary transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
            </button>
            <button
              onClick={nextSlide}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-dark-bg-secondary transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
            </button>
          </div>
        </div>

        {/* Slider container with touch support */}
        <div
          ref={sliderRef}
          className="relative overflow-hidden !mt-0"
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
                <DollarSign className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                <h4 className="font-medium text-gray-900 dark:text-dark-text text-sm sm:text-base">
                  Métricas Financeiras
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-4">
                <div
                  onClick={() => setActiveTab("collections")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Valor Total
                    </h5>
                    <DollarSign className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {formatCurrency(overviewStats.totalAmount)}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    {overviewStats.totalCollections} cobranças
                  </div>
                </div>
                <div
                  onClick={() => setActiveTab("collections")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Total em Aberto
                    </h5>
                    <DollarSign className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {formatCurrency(overviewStats.pendingAmount)}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    +12% vs mês anterior
                  </div>
                </div>
                <div
                  onClick={() => setActiveTab("collections")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Total Recebido
                    </h5>
                    <TrendingUp className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {formatCurrency(overviewStats.receivedAmount)}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    +8% vs mês anterior
                  </div>
                </div>
                <div
                  onClick={() => setActiveTab("performance")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Taxa de Conversão
                    </h5>
                    <BarChart3 className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {overviewStats.conversionRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    +2.1% vs mês anterior
                  </div>
                </div>
              </div>
            </div>

            {/* Slide 2: Métricas Operacionais */}
            <div className="w-full flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Target className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                <h4 className="font-medium text-gray-900 dark:text-dark-text text-sm sm:text-base">
                  Métricas Operacionais
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 lg:gap-6">
                <div
                  onClick={() => setActiveTab("collections")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Vendas Finalizadas
                    </h5>
                    <CheckCircle className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {overviewMetrics.completedSalesCount}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
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
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Clientes com Pendências
                    </h5>
                    <Users className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {overviewMetrics.clientsWithPendingCount}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    {overviewMetrics.pendingSalesCount} vendas pendentes
                  </div>
                </div>
              </div>
            </div>

            {/* Slide 3: Ecossistema de Cobrança */}
            <div className="w-full flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Target className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                <h4 className="font-medium text-gray-900 dark:text-dark-text text-sm sm:text-base">
                  Ecossistema de Cobrança
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
                <div
                  onClick={() => setActiveTab("users")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Time Ativo
                    </h5>
                    <Users className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {stats.collectorsCount}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    cobradores em campo
                  </div>
                </div>
                <div
                  onClick={() => setActiveTab("stores")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Cobertura da Rede
                    </h5>
                    <Store className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {overviewMetrics.storesWithCollections}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    pontos ativos
                  </div>
                </div>
                <div
                  onClick={() => setActiveTab("performance")}
                  className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      Eficiência Média
                    </h5>
                    <TrendingUp className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">
                    {overviewMetrics.averageEfficiency}%
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
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
                currentSlide === index
                  ? "bg-blue-600 dark:bg-blue-500"
                  : "bg-gray-300 dark:bg-dark-bg-tertiary hover:bg-gray-400 dark:hover:bg-dark-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Agendamentos dos Cobradores */}

      {/* Pending Cancellations Alert */}
      {pendingCancellations.length > 0 && (
        <div className="bg-yellow-50 dark:bg-dark-bg-secondary border border-yellow-200 dark:border-yellow-900 rounded-2xl sm:rounded-2xl p-4 lg:p-6">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text mb-1">
                {pendingCancellations.length} Solicitações de Cancelamento
                Pendentes
              </h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-3">
                Existem cancelamentos de visitas aguardando sua aprovação.
              </p>
              <button
                onClick={() => setActiveTab("visit-tracking")}
                className="px-4 py-2 bg-yellow-600 dark:bg-yellow-700 text-white rounded-2xl hover:bg-yellow-700 dark:hover:bg-yellow-800 transition-colors text-sm font-medium"
              >
                Revisar Solicitações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Overview - Design Minimalista */}
      <div className="bg-white dark:bg-dark-bg rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-1">
            Performance dos Cobradores
          </h2>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
            Ranking de eficiência da equipe
          </p>
        </div>

        {/* Top 3 - Design Clean */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {performance.slice(0, 3).map((collector, index) => {
            const borderColors = [
              "border-blue-200 dark:border-blue-900",
              "border-gray-200 dark:border-gray-600",
              "border-orange-200 dark:border-orange-900",
            ];
            const bgColors = [
              "bg-blue-50 dark:bg-dark-bg-secondary",
              "bg-gray-50 dark:bg-dark-bg-secondary",
              "bg-orange-50 dark:bg-dark-bg-secondary",
            ];

            return (
              <div
                key={collector.collectorId}
                className={`relative border-2 ${borderColors[index]} ${bgColors[index]} rounded-lg p-4 transition-all duration-200 hover:shadow-sm`}
              >
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-dark-text-secondary">
                  {index + 1}
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-dark-text text-sm truncate">
                      {collector.collectorName}
                    </h3>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text mt-1">
                      {collector.conversionRate.toFixed(1)}%
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-center p-2 bg-white dark:bg-dark-bg rounded border border-gray-200 dark:border-dark-border">
                      <div className="font-semibold text-gray-900 dark:text-dark-text">
                        {collector.totalReceived}
                      </div>
                      <div className="text-gray-600 dark:text-dark-text-secondary">
                        Pagas
                      </div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-dark-bg rounded border border-gray-200 dark:border-dark-border">
                      <div className="font-semibold text-gray-900 dark:text-dark-text">
                        {collector.clientCount}
                      </div>
                      <div className="text-gray-600 dark:text-dark-text-secondary">
                        Clientes
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Lista Completa */}
        <div className="space-y-4">
          <h3 className="font-medium text-gray-900 dark:text-dark-text">
            Todos os Cobradores
          </h3>

          {/* Mobile Cards - Minimalista */}
          <div className="space-y-3 lg:hidden">
            {performance.map((collector, index) => (
              <div
                key={collector.collectorId}
                className="border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-dark-bg-secondary transition-colors bg-white dark:bg-dark-bg"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-gray-100 dark:bg-dark-bg-secondary rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-dark-text-secondary">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-dark-text text-sm">
                        {collector.collectorName}
                      </h4>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-dark-text">
                      {collector.conversionRate.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-center text-xs">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-dark-text">
                      {collector.totalAssigned}
                    </div>
                    <div className="text-gray-600 dark:text-dark-text-secondary">
                      Atribuídas
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-dark-text">
                      {collector.totalReceived}
                    </div>
                    <div className="text-gray-600 dark:text-dark-text-secondary">
                      Pagas
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-dark-text">
                      {collector.clientCount}
                    </div>
                    <div className="text-gray-600 dark:text-dark-text-secondary">
                      Clientes
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-dark-text">
                      {collector.averageTime.toFixed(0)}d
                    </div>
                    <div className="text-gray-600 dark:text-dark-text-secondary">
                      Tempo
                    </div>
                  </div>
                </div>

                {/* Barra de Progresso Simples */}
                <div className="mt-3">
                  <div className="w-full bg-gray-200 dark:bg-dark-bg-tertiary rounded-full h-1">
                    <div
                      className="bg-gray-900 dark:bg-dark-text h-1 rounded-full transition-all duration-300"
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
            <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden bg-white dark:bg-dark-bg">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-secondary">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-dark-text text-sm">
                      #
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-dark-text text-sm">
                      Cobrador
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-dark-text text-sm">
                      Eficiência
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-dark-text text-sm">
                      Vendas
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-dark-text text-sm">
                      Clientes
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-dark-text text-sm">
                      Valor Recebido
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-dark-text text-sm">
                      Tempo Médio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {performance.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-gray-500 dark:text-dark-text-secondary text-sm"
                      >
                        Nenhum cobrador encontrado
                      </td>
                    </tr>
                  ) : (
                    performance.map((collector, index) => (
                      <tr
                        key={collector.collectorId}
                        className="border-t border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-secondary transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="w-6 h-6 bg-gray-100 dark:bg-dark-bg-secondary rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-dark-text-secondary">
                            {index + 1}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900 dark:text-dark-text text-sm">
                            {collector.collectorName}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-16 bg-gray-200 dark:bg-dark-bg-secondary rounded-full h-1.5">
                              <div
                                className="bg-gray-900 dark:bg-dark-text h-1.5 rounded-full"
                                style={{
                                  width: `${Math.min(collector.conversionRate, 100)}%`,
                                }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium text-gray-900 dark:text-dark-text min-w-[40px]">
                              {collector.conversionRate.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-900 dark:text-dark-text">
                            <span className="font-medium">
                              {collector.totalReceived}
                            </span>
                            <span className="text-gray-500 dark:text-dark-text-secondary">
                              {" "}
                              / {collector.totalAssigned}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text">
                            {collector.clientCount}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text">
                            {formatCurrency(collector.receivedAmount)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text">
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

      {/* Agendamentos dos Cobradores */}
      <div className="bg-white dark:bg-dark-bg rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
              Agendamentos dos Cobradores
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
              Métricas de visitas agendadas
            </p>
          </div>

          {/* Seletor de Cobrador */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="collector-select"
              className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary whitespace-nowrap transition-colors duration-300"
            >
              Cobrador:
            </label>
            <select
              id="collector-select"
              value={selectedCollector}
              onChange={(e) => setSelectedCollector(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-0 flex-1 sm:flex-none sm:min-w-[150px] transition-colors duration-300"
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
          <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4 transition-colors duration-300">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-900 dark:text-dark-text transition-colors duration-300">
                Hoje
              </h4>
              <Calendar className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary transition-colors duration-300" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Total
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.today.total}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Concluídas
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.today.completed}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Pendentes
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.today.pending}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Canceladas
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.today.cancelled}
                </span>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-dark-border transition-colors duration-300">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                    Taxa de Conclusão
                  </span>
                  <span className="font-bold text-gray-900 dark:text-dark-text transition-colors duration-300">
                    {calculateSchedulingMetrics.today.completionRate}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Agendamentos da Semana */}
          <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4 transition-colors duration-300">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-900 dark:text-dark-text transition-colors duration-300">
                Esta Semana
              </h4>
              <Target className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary transition-colors duration-300" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Total
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.week.total}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Concluídas
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.week.completed}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Pendentes
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.week.pending}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Canceladas
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.week.cancelled}
                </span>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-dark-border transition-colors duration-300">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                    Taxa de Conclusão
                  </span>
                  <span className="font-bold text-gray-900 dark:text-dark-text transition-colors duration-300">
                    {calculateSchedulingMetrics.week.completionRate}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Agendamentos do Mês */}
          <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4 transition-colors duration-300">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-900 dark:text-dark-text transition-colors duration-300">
                Este Mês
              </h4>
              <BarChart3 className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary transition-colors duration-300" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Total
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.month.total}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Concluídas
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.month.completed}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Pendentes
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.month.pending}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                  Canceladas
                </span>
                <span className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
                  {calculateSchedulingMetrics.month.cancelled}
                </span>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-dark-border transition-colors duration-300">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
                    Taxa de Conclusão
                  </span>
                  <span className="font-bold text-gray-900 dark:text-dark-text transition-colors duration-300">
                    {calculateSchedulingMetrics.month.completionRate}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Schedules and Clients by City */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mt-6">
          <div 
            className="border border-gray-200 dark:border-dark-border rounded-lg p-4 transition-colors duration-300"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <h4 className="font-medium text-gray-900 dark:text-dark-text transition-colors duration-300 mb-4">
              Agendamentos por Cidade
            </h4>
            <SchedulesByCityCardContent />
          </div>
          <div 
            className="border border-gray-200 dark:border-dark-border rounded-lg p-4 transition-colors duration-300"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <h4 className="font-medium text-gray-900 dark:text-dark-text transition-colors duration-300 mb-4">
              Clientes por Cidade
            </h4>
            <ClientsByCityCardContent />
          </div>
        </div>

        {/* Informação do cobrador selecionado */}
        {selectedCollector !== "all" && (
          <div className="mt-6 p-3 bg-gray-50 dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border transition-colors duration-300">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary transition-colors duration-300" />
              <span className="text-sm font-medium text-gray-900 dark:text-dark-text transition-colors duration-300">
                Exibindo dados de:{" "}
                {
                  performance.find((p) => p.collectorId === selectedCollector)
                    ?.collectorName
                }
              </span>
            </div>
          </div>
        )}

        {/* Ação para ver detalhes */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border transition-colors duration-300">
          <button
            onClick={() => setActiveTab("visit-tracking")}
            className="w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text rounded-lg hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors text-sm font-medium flex items-center justify-center border border-gray-200 dark:border-dark-border"
          >
            <Target className="h-4 w-4 mr-2" />
            Ver Todos os Agendamentos
            {selectedCollector !== "all" && (
              <span className="ml-1">
                -{" "}
                {
                  performance.find((p) => p.collectorId === selectedCollector)
                    ?.collectorName
                }
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
