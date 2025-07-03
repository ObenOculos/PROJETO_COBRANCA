import React, { useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  Calendar,
  Award,
  Target,
  DollarSign,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/mockData";

interface EnhancedCollectorPerformance {
  collectorId: string;
  collectorName: string;
  totalSales: number;
  completedSales: number;
  partialSales: number;
  pendingSales: number;
  totalAmount: number;
  receivedAmount: number;
  conversionRate: number;
  averageTicket: number;
  efficiency: number;
  clientsCount: number;
}

const EnhancedPerformanceChart: React.FC = () => {
  const { collections, users } = useCollection();
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [sortBy, setSortBy] = useState<
    "conversionRate" | "receivedAmount" | "totalSales"
  >("conversionRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterMinRate, setFilterMinRate] = useState<string>("");

  // Calculate enhanced performance data
  const enhancedPerformance = useMemo((): EnhancedCollectorPerformance[] => {
    const collectors = users.filter((u) => u.type === "collector");

    return collectors.map((collector) => {
      const collectorCollections = collections.filter(
        (c) => c.user_id === collector.id,
      );

      // Group by sale to count correctly
      const salesMap = new Map<
        string,
        {
          totalValue: number;
          receivedValue: number;
          status: "pago" | "parcial" | "pendente";
          clientDocument: string;
        }
      >();

      collectorCollections.forEach((collection) => {
        const saleKey = `${collection.venda_n}-${collection.documento}`;
        if (!salesMap.has(saleKey)) {
          salesMap.set(saleKey, {
            totalValue: 0,
            receivedValue: 0,
            status: "pendente",
            clientDocument: collection.documento || "",
          });
        }

        const sale = salesMap.get(saleKey)!;
        sale.totalValue += collection.valor_original;
        sale.receivedValue += collection.valor_recebido;
      });

      // Determine sale status
      salesMap.forEach((sale) => {
        const pendingValue = sale.totalValue - sale.receivedValue;
        if (sale.receivedValue > 0 && pendingValue > 0) {
          sale.status = "parcial";
        } else if (pendingValue <= 0.01 && sale.receivedValue > 0) {
          sale.status = "pago";
        } else {
          sale.status = "pendente";
        }
      });

      const salesArray = Array.from(salesMap.values());
      const totalSales = salesArray.length;
      const completedSales = salesArray.filter(
        (s) => s.status === "pago",
      ).length;
      const partialSales = salesArray.filter(
        (s) => s.status === "parcial",
      ).length;
      const pendingSales = salesArray.filter(
        (s) => s.status === "pendente",
      ).length;
      const totalAmount = salesArray.reduce((sum, s) => sum + s.totalValue, 0);
      const receivedAmount = salesArray.reduce(
        (sum, s) => sum + s.receivedValue,
        0,
      );
      const conversionRate =
        totalSales > 0 ? (completedSales / totalSales) * 100 : 0;
      const averageTicket = totalSales > 0 ? totalAmount / totalSales : 0;
      const efficiency =
        totalAmount > 0 ? (receivedAmount / totalAmount) * 100 : 0;
      const clientsCount = new Set(salesArray.map((s) => s.clientDocument))
        .size;

      return {
        collectorId: collector.id,
        collectorName: collector.name,
        totalSales,
        completedSales,
        partialSales,
        pendingSales,
        totalAmount,
        receivedAmount,
        conversionRate,
        averageTicket,
        efficiency,
        clientsCount,
      };
    });
  }, [collections, users]);

  // Filter and sort performance data
  const filteredAndSortedPerformance = useMemo(() => {
    let filtered = enhancedPerformance;

    // Apply filter
    if (filterMinRate) {
      const minRate = parseFloat(filterMinRate);
      filtered = filtered.filter((p) => p.conversionRate >= minRate);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
    });

    return filtered;
  }, [enhancedPerformance, sortBy, sortOrder, filterMinRate]);

  // Calculate team statistics
  const teamStats = useMemo(() => {
    const totalSales = enhancedPerformance.reduce(
      (sum, p) => sum + p.totalSales,
      0,
    );
    const totalReceived = enhancedPerformance.reduce(
      (sum, p) => sum + p.receivedAmount,
      0,
    );
    const totalAmount = enhancedPerformance.reduce(
      (sum, p) => sum + p.totalAmount,
      0,
    );
    const avgConversionRate =
      enhancedPerformance.length > 0
        ? enhancedPerformance.reduce((sum, p) => sum + p.conversionRate, 0) /
          enhancedPerformance.length
        : 0;
    const topPerformer =
      enhancedPerformance.length > 0
        ? enhancedPerformance.reduce((top, current) =>
            current.conversionRate > top.conversionRate ? current : top,
          )
        : null;

    return {
      totalSales,
      totalReceived,
      totalAmount,
      avgConversionRate,
      topPerformer,
      teamEfficiency: totalAmount > 0 ? (totalReceived / totalAmount) * 100 : 0,
    };
  }, [enhancedPerformance]);

  const toggleCardExpansion = (collectorId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(collectorId)) {
      newExpanded.delete(collectorId);
    } else {
      newExpanded.add(collectorId);
    }
    setExpandedCards(newExpanded);
  };

  const exportPerformanceData = () => {
    const csvContent = [
      "Cobrador,Vendas Totais,Vendas Pagas,Taxa de Conversão,Valor Total,Valor Recebido,Eficiência,Clientes",
      ...filteredAndSortedPerformance.map(
        (p) =>
          `"${p.collectorName}",${p.totalSales},${p.completedSales},${p.conversionRate.toFixed(1)}%,${p.totalAmount},${p.receivedAmount},${p.efficiency.toFixed(1)}%,${p.clientsCount}`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `desempenho-cobradores-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 lg:p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                <BarChart3 className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
                <span className="truncate">Análise de Desempenho</span>
              </h2>
              <p className="text-gray-600 mt-1 text-sm lg:text-base">
                Desempenho detalhado dos cobradores por vendas
              </p>
            </div>

            <button
              onClick={exportPerformanceData}
              className="flex items-center justify-center px-3 lg:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
            >
              <Download className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Exportar Dados</span>
              <span className="sm:hidden">Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Team Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 lg:p-6 rounded-xl border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-700">
                Total de Vendas
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-blue-900 truncate">
                {teamStats.totalSales}
              </p>
            </div>
            <Target className="h-8 w-8 lg:h-10 lg:w-10 text-blue-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 lg:p-6 rounded-xl border border-green-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-700">
                Valor Recebido
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-green-900 truncate">
                {formatCurrency(teamStats.totalReceived)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 lg:h-10 lg:w-10 text-green-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 lg:p-6 rounded-xl border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-purple-700">Taxa Média</p>
              <p className="text-2xl lg:text-3xl font-bold text-purple-900">
                {teamStats.avgConversionRate.toFixed(1)}%
              </p>
            </div>
            <TrendingUp className="h-8 w-8 lg:h-10 lg:w-10 text-purple-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 lg:p-6 rounded-xl border border-orange-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-orange-700">
                Eficiência do Time
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-orange-900">
                {teamStats.teamEfficiency.toFixed(1)}%
              </p>
            </div>
            <Award className="h-8 w-8 lg:h-10 lg:w-10 text-orange-600 flex-shrink-0 ml-2" />
          </div>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="p-4 lg:p-6 border-b border-gray-200 bg-white rounded-xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período
            </label>
            <div className="flex items-center">
              <Calendar className="h-4 w-4 text-gray-500 mr-2" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="week">Esta Semana</option>
                <option value="month">Este Mês</option>
                <option value="quarter">Este Trimestre</option>
                <option value="year">Este Ano</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ordenar Por
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="conversionRate">Taxa de Conversão</option>
                <option value="receivedAmount">Valor Recebido</option>
                <option value="totalSales">Número de Vendas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Taxa Mínima (%)
              </label>
              <div className="flex items-center">
                <Filter className="h-4 w-4 text-gray-500 mr-2" />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={filterMinRate}
                  onChange={(e) => setFilterMinRate(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ordem
              </label>
              <button
                onClick={() =>
                  setSortOrder(sortOrder === "desc" ? "asc" : "desc")
                }
                className="w-full flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {sortOrder === "desc" ? (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Maior para Menor</span>
                    <span className="sm:hidden">↓</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Menor para Maior</span>
                    <span className="sm:hidden">↑</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Cards */}
      <div className="space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900">
            Desempenho Individual ({filteredAndSortedPerformance.length}{" "}
            cobradores)
          </h3>
          {teamStats.topPerformer && (
            <div className="flex items-center text-sm text-green-600">
              <Award className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="truncate">
                <span className="hidden sm:inline">Destaque: </span>
                {teamStats.topPerformer.collectorName} (
                {teamStats.topPerformer.conversionRate.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {filteredAndSortedPerformance.map((collector, index) => {
          const isExpanded = expandedCards.has(collector.collectorId);
          const isTopPerformer =
            index === 0 && sortBy === "conversionRate" && sortOrder === "desc";

          return (
            <div
              key={collector.collectorId}
              className={`bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md ${
                isTopPerformer
                  ? "border-green-300 bg-green-50"
                  : "border-gray-200"
              }`}
            >
              <div className="p-4 lg:p-6">
                <div className="flex flex-col gap-4">
                  {/* Mobile: Stack vertically for better readability */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 lg:h-12 lg:w-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isTopPerformer ? "bg-green-100" : "bg-blue-100"
                      }`}
                    >
                      {isTopPerformer ? (
                        <Award
                          className={`h-5 w-5 lg:h-6 lg:w-6 ${isTopPerformer ? "text-green-600" : "text-blue-600"}`}
                        />
                      ) : (
                        <Users
                          className={`h-5 w-5 lg:h-6 lg:w-6 ${isTopPerformer ? "text-green-600" : "text-blue-600"}`}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base lg:text-lg font-semibold text-gray-900 flex items-center flex-wrap gap-2">
                        <span className="truncate">
                          {collector.collectorName}
                        </span>
                        {isTopPerformer && (
                          <Award className="h-4 w-4 text-green-600 flex-shrink-0" />
                        )}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {collector.totalSales} vendas • {collector.clientsCount}{" "}
                        clientes
                      </p>

                      {/* Mobile: Show conversion rate below collector info */}
                      <div className="mt-2 flex items-center justify-between">
                        <div>
                          <div className="text-xl lg:text-2xl font-bold text-gray-900">
                            {collector.conversionRate.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-600">
                            Taxa de Conversão
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            toggleCardExpansion(collector.collectorId)
                          }
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Progresso das Vendas</span>
                      <span>
                        {collector.completedSales} de {collector.totalSales}{" "}
                        completas
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          collector.conversionRate >= 70
                            ? "bg-green-500"
                            : collector.conversionRate >= 40
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                        style={{
                          width: `${Math.min(collector.conversionRate, 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Basic Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-green-600 truncate">
                        {formatCurrency(collector.receivedAmount)}
                      </div>
                      <div className="text-xs text-gray-600">
                        Valor Recebido
                      </div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-blue-600 truncate">
                        {formatCurrency(collector.averageTicket)}
                      </div>
                      <div className="text-xs text-gray-600">Ticket Médio</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-purple-600">
                        {collector.efficiency.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-600">Eficiência</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-orange-600">
                        {collector.clientsCount}
                      </div>
                      <div className="text-xs text-gray-600">Clientes</div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 lg:mt-6 pt-4 lg:pt-6 border-t border-gray-200">
                      <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-6">
                        <div>
                          <h5 className="font-medium text-gray-900 mb-3">
                            Status das Vendas
                          </h5>
                          <div className="space-y-2">
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Pagas Completamente
                              </span>
                              <span className="text-sm font-medium text-green-600">
                                {collector.completedSales}
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Pagamento Parcial
                              </span>
                              <span className="text-sm font-medium text-yellow-600">
                                {collector.partialSales}
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Pendentes
                              </span>
                              <span className="text-sm font-medium text-red-600">
                                {collector.pendingSales}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h5 className="font-medium text-gray-900 mb-3">
                            Valores Financeiros
                          </h5>
                          <div className="space-y-2">
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Total Atribuído
                              </span>
                              <span className="text-sm font-medium text-gray-900 truncate ml-2">
                                {formatCurrency(collector.totalAmount)}
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Valor Pendente
                              </span>
                              <span className="text-sm font-medium text-red-600 truncate ml-2">
                                {formatCurrency(
                                  collector.totalAmount -
                                    collector.receivedAmount,
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                % do Total Recebido
                              </span>
                              <span className="text-sm font-medium text-green-600">
                                {collector.efficiency.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h5 className="font-medium text-gray-900 mb-3">
                            Ranking
                          </h5>
                          <div className="space-y-2">
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Taxa de Conversão
                              </span>
                              <span className="text-sm font-medium text-blue-600">
                                #
                                {enhancedPerformance
                                  .sort(
                                    (a, b) =>
                                      b.conversionRate - a.conversionRate,
                                  )
                                  .findIndex(
                                    (p) =>
                                      p.collectorId === collector.collectorId,
                                  ) + 1}
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Valor Recebido
                              </span>
                              <span className="text-sm font-medium text-blue-600">
                                #
                                {enhancedPerformance
                                  .sort(
                                    (a, b) =>
                                      b.receivedAmount - a.receivedAmount,
                                  )
                                  .findIndex(
                                    (p) =>
                                      p.collectorId === collector.collectorId,
                                  ) + 1}
                              </span>
                            </div>
                            <div className="flex justify-between p-2 bg-gray-50 rounded">
                              <span className="text-sm text-gray-600">
                                Número de Vendas
                              </span>
                              <span className="text-sm font-medium text-blue-600">
                                #
                                {enhancedPerformance
                                  .sort((a, b) => b.totalSales - a.totalSales)
                                  .findIndex(
                                    (p) =>
                                      p.collectorId === collector.collectorId,
                                  ) + 1}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAndSortedPerformance.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum cobrador encontrado
          </h3>
          <p className="text-gray-600">
            Não há cobradores que atendam aos filtros selecionados.
          </p>
        </div>
      )}
    </div>
  );
};

export default EnhancedPerformanceChart;
