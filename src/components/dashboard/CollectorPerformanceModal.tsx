import React, { useMemo, useState, useEffect } from "react";
import {
  X,
  TrendingDown,
  DollarSign,
  Hash,
  BarChart2,
  Users,
  PieChart,
  ChevronDown,
  ChevronUp,
  Calendar,
  Filter,
  BarChart3,
} from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";

interface CollectorPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  collector: any;
}

type ViewMode = "list" | "chart";
type SortOrder = "desc" | "asc";

const CollectorPerformanceModal: React.FC<CollectorPerformanceModalProps> = ({
  isOpen,
  onClose,
  collector,
}) => {
  const { monthlyGoals, salePayments, scheduledVisits } = useCollection();
  const [showHistory, setShowHistory] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(
    new Date().getFullYear(),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [itemsToShow, setItemsToShow] = useState<number>(6);

  const performanceHistory = useMemo(() => {
    if (!collector) return [];

    const collectorGoals = monthlyGoals
      .filter((g) => g.user_id === collector.collectorId)
      .sort((a, b) => {
        const dateA = new Date(a.month + "T00:00:00").getTime();
        const dateB = new Date(b.month + "T00:00:00").getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      });

    return collectorGoals.map((goal) => {
      const goalDate = new Date(goal.month + "T00:00:00");
      const goalMonth = goalDate.getUTCMonth();
      const goalYear = goalDate.getUTCFullYear();

      const visitsInMonth = scheduledVisits.filter((v) => {
        if (!v.dataVisitaRealizada && !v.scheduledDate) return false;
        const visitDate = new Date(
          (v.dataVisitaRealizada || v.scheduledDate) + "T00:00:00",
        );
        return (
          v.collectorId === collector.collectorId &&
          v.status === "realizada" &&
          visitDate.getUTCMonth() === goalMonth &&
          visitDate.getUTCFullYear() === goalYear
        );
      }).length;

      const paymentsInMonth = salePayments
        .filter((p) => {
          if (!p.paymentDate) return false;
          const paymentDate = new Date(p.paymentDate + "T00:00:00");
          return (
            p.collectorId === collector.collectorId &&
            paymentDate.getUTCMonth() === goalMonth &&
            paymentDate.getUTCFullYear() === goalYear
          );
        })
        .reduce((sum, p) => sum + p.paymentAmount, 0);

      const visitsPerformance =
        goal.visits_goal > 0 ? (visitsInMonth / goal.visits_goal) * 100 : 0;
      const paymentsPerformance =
        goal.payments_goal > 0
          ? (paymentsInMonth / goal.payments_goal) * 100
          : 0;

      return {
        month: goalDate.toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
        monthShort: goalDate.toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
        year: goalYear,
        date: goalDate,
        visitsGoal: goal.visits_goal,
        visitsActual: visitsInMonth,
        visitsPerformance,
        paymentsGoal: goal.payments_goal,
        paymentsActual: paymentsInMonth,
        paymentsPerformance,
        overallPerformance: (visitsPerformance + paymentsPerformance) / 2,
      };
    });
  }, [collector, monthlyGoals, salePayments, scheduledVisits, sortOrder]);

  const availableYears = useMemo(() => {
    const years = new Set(performanceHistory.map((h) => h.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [performanceHistory]);

  const filteredHistory = useMemo(() => {
    if (!selectedYear) return performanceHistory;
    return performanceHistory.filter((h) => h.year === selectedYear);
  }, [performanceHistory, selectedYear]);

  const displayedHistory = useMemo(() => {
    return filteredHistory.slice(0, itemsToShow);
  }, [filteredHistory, itemsToShow]);

  const summaryStats = useMemo(() => {
    if (filteredHistory.length === 0) return null;

    const avgVisitsPerformance =
      filteredHistory.reduce((sum, h) => sum + h.visitsPerformance, 0) /
      filteredHistory.length;
    const avgPaymentsPerformance =
      filteredHistory.reduce((sum, h) => sum + h.paymentsPerformance, 0) /
      filteredHistory.length;
    const totalMonths = filteredHistory.length;
    const achievedMonths = filteredHistory.filter(
      (h) => h.overallPerformance >= 100,
    ).length;

    return {
      avgVisitsPerformance,
      avgPaymentsPerformance,
      achievementRate:
        totalMonths > 0 ? (achievedMonths / totalMonths) * 100 : 0,
      totalMonths,
      achievedMonths,
    };
  }, [filteredHistory]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }

    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [isOpen]);

  if (!isOpen || !collector) {
    return null;
  }

  const pendingAmount = collector.totalAmount - collector.receivedAmount;

  const stats = [
    {
      icon: BarChart2,
      label: "Vendas Finalizadas",
      value: `${collector.completedSales}/${collector.totalSales}`,
      color: "text-green-600",
    },
    {
      icon: TrendingDown,
      label: "Vendas Pendentes",
      value: collector.pendingSales,
      color: "text-red-600",
    },
    {
      icon: Users,
      label: "Clientes com Pendências",
      value: collector.clientsWithPending,
      color: "text-yellow-600",
    },
    {
      icon: DollarSign,
      label: "Valor Pendente",
      value: formatCurrency(pendingAmount),
      color: "text-red-700",
    },
    {
      icon: PieChart,
      label: "Eficiência",
      value: `${collector.efficiency.toFixed(1)}%`,
      color: "text-blue-600",
    },
    {
      icon: Hash,
      label: "Total de Clientes",
      value: collector.clientsCount,
      color: "text-indigo-600",
    },
    {
      icon: Users,
      label: "Aproveitamento de Visitas",
      value: `${collector.clientVisitEfficiency.toFixed(1)}% (${
        collector.visitedClientsInSelectedMonths
      }/${collector.totalAssignedClients})`,
      color: "text-purple-600",
    },
  ];

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 100) return "text-green-600 bg-green-50";
    if (percentage >= 80) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 100) return "bg-green-500";
    if (percentage >= 80) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div
      id="teste_teste"
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full lg:max-w-[80%] mx-auto transform transition-all duration-300 ease-in-out max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>

          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900">
              Desempenho do Cobrador
            </h3>
            <p className="text-lg text-gray-600 mt-1">
              {collector.collectorName}
            </p>
          </div>

          {/* Métricas Principais */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <p className="text-sm text-green-700 font-medium">
                Valor Recebido
              </p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(collector.receivedAmount)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
              <p className="text-sm text-blue-700 font-medium">
                Taxa de Conversão
              </p>
              <p className="text-3xl font-bold text-blue-600">
                {collector.conversionRate.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Detalhes Adicionais */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-800 mb-2">
              Estatísticas Gerais
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className="bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center text-center"
                >
                  <stat.icon className={`h-6 w-6 mb-2 ${stat.color}`} />
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-lg font-semibold text-gray-800">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Goal History Section */}
          {performanceHistory.length > 0 && (
            <div className="mt-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-semibold text-gray-800">
                    Histórico de Metas
                  </h4>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {showHistory ? (
                      <ChevronUp size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </button>
                </div>

                {showHistory && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Year Filter */}
                    {availableYears.length > 1 && (
                      <div className="flex items-center gap-1">
                        <Calendar size={16} className="text-gray-500" />
                        <select
                          value={selectedYear || ""}
                          onChange={(e) =>
                            setSelectedYear(
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                          className="text-sm bg-white border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Todos os anos</option>
                          {availableYears.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Sort Order */}
                    <button
                      onClick={() =>
                        setSortOrder(sortOrder === "desc" ? "asc" : "desc")
                      }
                      className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Filter size={14} />
                      {sortOrder === "desc" ? "Mais recente" : "Mais antigo"}
                    </button>

                    {/* View Mode Toggle */}
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode("list")}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          viewMode === "list"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-600 hover:text-gray-800"
                        }`}
                      >
                        <BarChart2 size={12} />
                        Lista
                      </button>
                      <button
                        onClick={() => setViewMode("chart")}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          viewMode === "chart"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-600 hover:text-gray-800"
                        }`}
                      >
                        <BarChart3 size={12} />
                        Gráfico
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {showHistory && (
                <>
                  {/* Summary Stats */}
                  {summaryStats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-blue-700 font-medium">
                          Média Visitas
                        </p>
                        <p className="text-lg font-bold text-blue-600">
                          {summaryStats.avgVisitsPerformance.toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-green-700 font-medium">
                          Média Pagamentos
                        </p>
                        <p className="text-lg font-bold text-green-600">
                          {summaryStats.avgPaymentsPerformance.toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-purple-700 font-medium">
                          Taxa de Sucesso
                        </p>
                        <p className="text-lg font-bold text-purple-600">
                          {summaryStats.achievementRate.toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-700 font-medium">
                          Metas Atingidas
                        </p>
                        <p className="text-lg font-bold text-gray-600">
                          {summaryStats.achievedMonths}/
                          {summaryStats.totalMonths}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* History Content */}
                  {viewMode === "list" ? (
                    <div className="space-y-3">
                      {displayedHistory.map((history, index) => (
                        <div
                          key={index}
                          className="bg-gray-50 rounded-xl p-4 border border-gray-200"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-semibold text-gray-700 capitalize">
                                {history.month}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span
                                  className={`text-xs px-2 py-1 rounded-full ${getPerformanceColor(history.overallPerformance)}`}
                                >
                                  {history.overallPerformance.toFixed(1)}% geral
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {/* Visits */}
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600">Visitas</span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs px-1.5 py-0.5 rounded ${getPerformanceColor(history.visitsPerformance)}`}
                                  >
                                    {history.visitsPerformance.toFixed(1)}%
                                  </span>
                                  <span className="font-medium">
                                    {history.visitsActual} /{" "}
                                    {history.visitsGoal}
                                  </span>
                                </div>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(history.visitsPerformance)}`}
                                  style={{
                                    width: `${Math.min(100, history.visitsPerformance)}%`,
                                  }}
                                ></div>
                              </div>
                            </div>

                            {/* Payments */}
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600">
                                  Pagamentos
                                </span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs px-1.5 py-0.5 rounded ${getPerformanceColor(history.paymentsPerformance)}`}
                                  >
                                    {history.paymentsPerformance.toFixed(1)}%
                                  </span>
                                  <span className="font-medium">
                                    {formatCurrency(history.paymentsActual)} /{" "}
                                    {formatCurrency(history.paymentsGoal)}
                                  </span>
                                </div>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(history.paymentsPerformance)}`}
                                  style={{
                                    width: `${Math.min(100, history.paymentsPerformance)}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Visits Chart */}
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">
                              Performance de Visitas
                            </h5>
                            <div className="space-y-2">
                              {displayedHistory.map((history, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-xs text-gray-500 w-16 truncate">
                                    {history.monthShort}
                                  </span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                                    <div
                                      className={`h-3 rounded-full transition-all duration-300 ${getProgressBarColor(history.visitsPerformance)}`}
                                      style={{
                                        width: `${Math.min(100, history.visitsPerformance)}%`,
                                      }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-medium w-12 text-right">
                                    {history.visitsPerformance.toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Payments Chart */}
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">
                              Performance de Pagamentos
                            </h5>
                            <div className="space-y-2">
                              {displayedHistory.map((history, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-xs text-gray-500 w-16 truncate">
                                    {history.monthShort}
                                  </span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                                    <div
                                      className={`h-3 rounded-full transition-all duration-300 ${getProgressBarColor(history.paymentsPerformance)}`}
                                      style={{
                                        width: `${Math.min(100, history.paymentsPerformance)}%`,
                                      }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-medium w-12 text-right">
                                    {history.paymentsPerformance.toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Load More Button */}
                  {itemsToShow < filteredHistory.length && (
                    <div className="text-center mt-4">
                      <button
                        onClick={() => setItemsToShow((prev) => prev + 6)}
                        className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        Mostrar mais ({filteredHistory.length - itemsToShow}{" "}
                        restantes)
                      </button>
                    </div>
                  )}

                  {/* Show Less Button */}
                  {itemsToShow > 6 && itemsToShow >= filteredHistory.length && (
                    <div className="text-center mt-2">
                      <button
                        onClick={() => setItemsToShow(6)}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        Mostrar menos
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollectorPerformanceModal;
