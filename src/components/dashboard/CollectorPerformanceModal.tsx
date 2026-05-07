import React, { useMemo, useState } from "react";
import {
  BarChart2,
  Calendar,
  Filter,
  BarChart3,
  AlertCircle,
  TrendingUp,
  History,
  Info,
} from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { Modal } from "../Modal";
import TabTransition from "../common/TabTransition";

interface CollectorPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  collector: any;
  selectedMonths: number[];
  selectedYears: number[];
}

type ViewMode = "list" | "chart";
type SortOrder = "desc" | "asc";

const CollectorPerformanceModal: React.FC<CollectorPerformanceModalProps> = ({
  isOpen,
  onClose,
  collector,
  selectedMonths,
  selectedYears,
}) => {
  const { monthlyGoals, salePayments, scheduledVisits, collections } = useCollection();
  
  const [activeTab, setActiveTab] = useState<"summary" | "history" | "pending">("summary");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [itemsToShow, setItemsToShow] = useState<number>(6);
  const [selectedYear, setSelectedYear] = useState<number | null>(new Date().getFullYear());

  // Function to parse dates consistently with the dashboard
  const parseDateSafely = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    try {
      const cleanDateStr = dateStr.toString().trim().split("T")[0].split(" ")[0];
      if (cleanDateStr.includes("-")) {
        const parts = cleanDateStr.split("-");
        if (parts.length === 3) {
          const [y, m, d] = parts.map(Number);
          return new Date(y, m - 1, d);
        }
      } else if (cleanDateStr.includes("/")) {
        const parts = cleanDateStr.split("/");
        if (parts.length === 3) {
          const [d, m, y] = parts.map(Number);
          return new Date(y, m - 1, d);
        }
      }
      const fallback = new Date(dateStr);
      return isNaN(fallback.getTime()) ? null : fallback;
    } catch (e) {
      return null;
    }
  };

  // Period filter consistent with dashboard
  const isDateInSelectedMonths = (date: Date | null): boolean => {
    if (!date) return false;
    const dateMonth = date.getMonth();
    const dateYear = date.getFullYear();
    const monthMatches = selectedMonths.length === 0 || selectedMonths.includes(dateMonth);
    const yearMatches = selectedYears.length === 0 || selectedYears.includes(dateYear);
    return monthMatches && yearMatches;
  };

  const pendingClients = useMemo(() => {
    if (!collector) return [];
    const filtered = collections.filter((c) => {
      if (c.user_id !== collector.collectorId || !c.documento) return false;
      const dateVenc = parseDateSafely(c.data_vencimento);
      const dateLanc = parseDateSafely(c.data_lancamento);
      const inPeriod = isDateInSelectedMonths(dateVenc) || isDateInSelectedMonths(dateLanc);
      return inPeriod && (c.valor_original - c.valor_recebido > 0.01);
    });
    
    const clientMap = new Map();
    filtered.forEach((c) => {
      if (!clientMap.has(c.documento)) {
        clientMap.set(c.documento, {
          documento: c.documento,
          cliente: c.cliente || c.apelido || '-',
          valorPendente: 0,
        });
      }
      const entry = clientMap.get(c.documento);
      entry.valorPendente += (c.valor_original - c.valor_recebido);
    });
    return Array.from(clientMap.values()).sort((a, b) => b.valorPendente - a.valorPendente);
  }, [collector, collections, selectedMonths, selectedYears]);

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
        const visitDate = new Date((v.dataVisitaRealizada || v.scheduledDate) + "T00:00:00");
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

      const visitsPerformance = goal.visits_goal > 0 ? (visitsInMonth / goal.visits_goal) * 100 : 0;
      const paymentsPerformance = goal.payments_goal > 0 ? (paymentsInMonth / goal.payments_goal) * 100 : 0;

      return {
        month: goalDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
        monthShort: goalDate.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }),
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

  const summaryStats = useMemo(() => {
    if (filteredHistory.length === 0) return null;
    const avgVisitsPerformance = filteredHistory.reduce((sum, h) => sum + h.visitsPerformance, 0) / filteredHistory.length;
    const avgPaymentsPerformance = filteredHistory.reduce((sum, h) => sum + h.paymentsPerformance, 0) / filteredHistory.length;
    const totalMonths = filteredHistory.length;
    const achievedMonths = filteredHistory.filter((h) => h.overallPerformance >= 100).length;

    return {
      avgVisitsPerformance,
      avgPaymentsPerformance,
      achievementRate: totalMonths > 0 ? (achievedMonths / totalMonths) * 100 : 0,
      totalMonths,
      achievedMonths,
    };
  }, [filteredHistory]);

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 100) return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
    if (percentage >= 80) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20";
    return "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20";
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 100) return "bg-green-500";
    if (percentage >= 80) return "bg-amber-500";
    return "bg-rose-500";
  };

  if (!collector) return null;

  const tabs = [
    { id: "summary", name: "Resumo", icon: TrendingUp },
    { id: "history", name: "Histórico", icon: History },
    { id: "pending", name: "Pendências", icon: AlertCircle },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Desempenho: ${collector.collectorName}`}
      size="2xl"
    >
      <div className="flex flex-col h-full -mt-2">
        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-dark-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-1">
          <TabTransition activeKey={activeTab}>
            {activeTab === "summary" && (
              <div className="space-y-6">
                {/* Score Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 border border-green-100 dark:border-green-900/30 rounded-2xl bg-green-50/50 dark:bg-green-900/10">
                    <label className="block text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-widest mb-1">Total Recebido</label>
                    <p className="text-3xl font-black text-green-600 dark:text-green-400">{formatCurrency(collector.receivedAmount)}</p>
                  </div>
                  <div className="p-5 border border-amber-100 dark:border-amber-900/30 rounded-2xl bg-amber-50/50 dark:bg-amber-900/10">
                    <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1">Total a Receber</label>
                    <p className="text-3xl font-black text-amber-600 dark:text-amber-400">{formatCurrency(collector.pendingAmount)}</p>
                  </div>
                </div>

                {summaryStats && (
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] border-b border-gray-100 dark:border-dark-border pb-2">Estatísticas do Período</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Visitas</p>
                        <p className="text-lg font-black text-blue-600">{summaryStats.avgVisitsPerformance.toFixed(1)}%</p>
                      </div>
                      <div className="bg-white dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Pagos</p>
                        <p className="text-lg font-black text-green-600">{summaryStats.avgPaymentsPerformance.toFixed(1)}%</p>
                      </div>
                      <div className="bg-white dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Sucesso</p>
                        <p className="text-lg font-black text-purple-600">{summaryStats.achievementRate.toFixed(1)}%</p>
                      </div>
                      <div className="bg-white dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Metas</p>
                        <p className="text-lg font-black text-gray-700 dark:text-dark-text">{summaryStats.achievedMonths}/{summaryStats.totalMonths}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "history" && (
              <div className="space-y-6 pb-4">
                {/* Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 dark:bg-dark-bg p-3 rounded-xl border border-gray-100 dark:border-dark-border">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <select
                      value={selectedYear || ""}
                      onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                      className="text-xs font-bold uppercase tracking-wider bg-transparent border-none focus:ring-0 p-0 pr-6"
                    >
                      <option value="">Anos</option>
                      {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                      className="text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-blue-600 flex items-center gap-1"
                    >
                      <Filter className="w-3 h-3" />
                      {sortOrder === "desc" ? "Recentes" : "Antigos"}
                    </button>
                    <div className="flex bg-white dark:bg-dark-bg-secondary rounded-lg p-0.5 shadow-sm border border-gray-100 dark:border-dark-border">
                      <button
                        onClick={() => setViewMode("list")}
                        className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-blue-600 text-white" : "text-gray-400"}`}
                      >
                        <BarChart2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setViewMode("chart")}
                        className={`p-1.5 rounded-md transition-all ${viewMode === "chart" ? "bg-blue-600 text-white" : "text-gray-400"}`}
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {viewMode === "list" ? (
                  <div className="space-y-3">
                    {filteredHistory.slice(0, itemsToShow).map((history, index) => (
                      <div key={index} className="p-4 border border-gray-100 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-bg shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <p className="text-xs font-black text-gray-800 dark:text-dark-text uppercase tracking-widest">{history.month}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tight ${getPerformanceColor(history.overallPerformance)}`}>
                            {history.overallPerformance.toFixed(1)}% Geral
                          </span>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1.5">
                              <span className="text-gray-400">Visitas</span>
                              <span className="text-gray-800 dark:text-dark-text">{history.visitsActual} / {history.visitsGoal}</span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-dark-bg-secondary rounded-full h-1.5 overflow-hidden">
                              <div className={`h-full transition-all duration-500 ${getProgressBarColor(history.visitsPerformance)}`} style={{ width: `${Math.min(100, history.visitsPerformance)}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1.5">
                              <span className="text-gray-400">Pagamentos</span>
                              <span className="text-gray-800 dark:text-dark-text">{formatCurrency(history.paymentsActual, false)} / {formatCurrency(history.paymentsGoal, false)}</span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-dark-bg-secondary rounded-full h-1.5 overflow-hidden">
                              <div className={`h-full transition-all duration-500 ${getProgressBarColor(history.paymentsPerformance)}`} style={{ width: `${Math.min(100, history.paymentsPerformance)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 border border-gray-100 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-bg shadow-sm overflow-hidden">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-4 text-center">Visitas (%)</label>
                        {filteredHistory.slice(0, itemsToShow).map((h, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-gray-400 w-12 truncate">{h.monthShort}</span>
                            <div className="flex-1 bg-gray-100 dark:bg-dark-bg-secondary rounded-full h-3 overflow-hidden">
                              <div className={`h-full ${getProgressBarColor(h.visitsPerformance)}`} style={{ width: `${Math.min(100, h.visitsPerformance)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-4 text-center">Pagamentos (%)</label>
                        {filteredHistory.slice(0, itemsToShow).map((h, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-gray-400 w-12 truncate">{h.monthShort}</span>
                            <div className="flex-1 bg-gray-100 dark:bg-dark-bg-secondary rounded-full h-3 overflow-hidden">
                              <div className={`h-full ${getProgressBarColor(h.paymentsPerformance)}`} style={{ width: `${Math.min(100, h.paymentsPerformance)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Pagination buttons logic kept */}
                <div className="flex justify-center gap-2 mt-4">
                  {itemsToShow < filteredHistory.length && (
                    <button
                      onClick={() => setItemsToShow((prev) => prev + 6)}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest py-2 px-4 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-xl transition-all"
                    >
                      Mostrar Mais
                    </button>
                  )}
                  {itemsToShow > 6 && (
                    <button
                      onClick={() => setItemsToShow(6)}
                      className="text-[10px] font-bold text-gray-400 uppercase tracking-widest py-2 px-4 hover:bg-gray-50 dark:hover:bg-dark-bg rounded-xl transition-all"
                    >
                      Mostrar Menos
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === "pending" && (
              <div className="space-y-6 pb-4">
                {pendingClients.length > 0 ? (
                  <div className="p-1">
                    <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3" />
                      Concentração de Pendências
                    </h4>
                    <div className="overflow-hidden border border-gray-100 dark:border-dark-border rounded-2xl shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-dark-bg/50">
                          <tr>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cliente</th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                          {pendingClients.map((c) => (
                            <tr key={c.documento} className="hover:bg-gray-50 dark:hover:bg-dark-bg/30 transition-colors">
                              <td className="px-4 py-3">
                                <p className="text-xs font-bold text-gray-800 dark:text-dark-text">{c.cliente}</p>
                                <p className="text-[9px] text-gray-400 font-mono mt-0.5">{c.documento}</p>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <p className="text-xs font-black text-amber-600 dark:text-amber-400">{formatCurrency(c.valorPendente)}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50 dark:bg-dark-bg/30 rounded-3xl border-2 border-dashed border-gray-100 dark:border-dark-border">
                    <Info className="w-10 h-10 text-gray-200 mb-4" />
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tudo em dia</h3>
                    <p className="text-[10px] text-gray-400 mt-2">Nenhuma pendência financeira encontrada para este cobrador no período.</p>
                  </div>
                )}
              </div>
            )}
          </TabTransition>
        </div>
      </div>
    </Modal>
  );
};

export default CollectorPerformanceModal;
