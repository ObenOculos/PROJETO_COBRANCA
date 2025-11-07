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
} from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import { Collection, CollectorPerformance, DashboardStats, FilterOptions } from "../../types";

interface OverviewTabProps {
  collections: Collection[];
  performance: CollectorPerformance[];
  stats: DashboardStats;
  pendingCancellations: any[];
  setActiveTab: (tabId: string) => void;
  setFilters: (filters: FilterOptions | ((prev: FilterOptions) => FilterOptions)) => void;
  filters: FilterOptions;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  collections: overviewCollections,
  performance,
  stats,
  pendingCancellations,
  setActiveTab,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isAutoPlaying) {
      autoPlayIntervalRef.current = setInterval(() => {
        setCurrentSlide((prevSlide) => (prevSlide + 1) % 3);
      }, 5000);
      return () => {
        if (autoPlayIntervalRef.current) clearInterval(autoPlayIntervalRef.current);
      };
    }
    return () => {
      if (autoPlayIntervalRef.current) clearInterval(autoPlayIntervalRef.current);
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
    const map = new Map<string, { isPending: boolean; clientDocument: string; totalValue: number; receivedValue: number; }>();
    overviewCollections.forEach((collection) => {
      const saleKey = `${collection.venda_n}-${collection.documento}`;
      if (!map.has(saleKey)) {
        map.set(saleKey, { isPending: false, clientDocument: collection.documento || "", totalValue: 0, receivedValue: 0 });
      }
      const sale = map.get(saleKey)!;
      sale.totalValue = Number(sale.totalValue) + Number(collection.valor_original);
      sale.receivedValue = Number(sale.receivedValue) + Number(collection.valor_recebido);
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
    const clientsWithPendingCount = new Set(pendingSales.map((s) => s.clientDocument).filter(Boolean)).size;
    const todayCollections = overviewCollections.filter((c) => {
      const today = new Date().toISOString().split("T")[0];
      return c.data_vencimento === today;
    });
    const todayAmount = todayCollections.reduce((sum, c) => sum + c.valor_original, 0);
    const storesWithCollections = new Set(overviewCollections.map((c) => c.nome_da_loja).filter(Boolean)).size;
    const averageEfficiency = performance.length > 0 ? (performance.reduce((acc, p) => acc + p.conversionRate, 0) / performance.length).toFixed(1) : "0.0";
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
    const totalAmount = overviewCollections.reduce((sum, c) => sum + c.valor_original, 0);
    const receivedAmount = overviewCollections.reduce((sum, c) => sum + c.valor_recebido, 0);
    const totalReceived = overviewCollections.filter((c) => c.status?.toLowerCase() === "recebido" || c.valor_recebido > 0).length;
    const totalCollections = overviewCollections.length;
    return {
      totalAmount,
      receivedAmount,
      totalReceived,
      totalCollections,
      pendingAmount: totalAmount - receivedAmount,
      conversionRate: totalCollections > 0 ? (totalReceived / totalCollections) * 100 : 0,
    };
  }, [overviewCollections]);

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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 lg:gap-6">
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
      {/* This part is not moved as it's a separate concern on the overview dashboard */}

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
};