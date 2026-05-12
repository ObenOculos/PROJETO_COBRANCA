import React, { useState, useMemo, useTransition } from "react";
import {
  Users,
  Filter,
  Download,
  Eye,
  Target,
  Calendar,
  Trophy,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  ShoppingCart,
  Clock,
  Search,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import CollectorPerformanceModal from "./CollectorPerformanceModal";
import MonthlyGoalEditModal from "./MonthlyGoalEditModal";
import { User } from "../../types";

interface EnhancedCollectorPerformance {
  collectorId: string;
  collectorName: string;
  totalSales: number;
  pendingSales: number;
  clientsWithPending: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  pendingAmountScheduled: number;
  pendingAmountTotal: number;
  clientsCount: number;
  visitsPerformance: number;
  paymentsPerformance: number;
  currentMonthVisitsActual: number;
  currentMonthVisitsGoal: number;
  currentMonthPaymentsActual: number;
  currentMonthPaymentsGoal: number;
  totalAssignedClients: number;
  visitedClientsInSelectedMonths: number;
  pendingVisits: number;
  visitsRealizadas: number;
  visitsNaoEncontrado: number;
  visitsAgendadas: number;
  visitsCancelamentoSolicitado: number;
  visitsCanceladas: number;
  visitsAtrasadas: number;
  visitsReagendadas: number;
}

const EnhancedPerformanceChart: React.FC = () => {
  const {
    collections,
    users,
    monthlyGoals,
    salePayments,
    scheduledVisits,
    refreshData,
  } = useCollection();
  
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const [showFilters, setShowFilters] = useState(false);
    const [, startTransition] = useTransition();
  const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonth]);
  const [selectedYears, setSelectedYears] = useState<number[]>([currentYear]);
  const [sortBy, setSortBy] = useState<"receivedAmount" | "totalSales" | "clientsCount" | "pendingSales">("receivedAmount");
    const [sortOrder] = useState<"asc" | "desc">("desc");
  const [selectedCollector, setSelectedCollector] = useState<EnhancedCollectorPerformance | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [selectedCollectorForGoals, setSelectedCollectorForGoals] = useState<User | null>(null);

  const monthsDisplay = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const enhancedPerformance = useMemo((): EnhancedCollectorPerformance[] => {
    const collectors = users.filter((u) => u.type === "collector");

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

    const isDateInSelectedMonths = (date: Date | null) => {
      if (!date) return false;
      const dateMonth = date.getMonth();
      const dateYear = date.getFullYear();
      const monthMatches = selectedMonths.length === 0 || selectedMonths.includes(dateMonth);
      const yearMatches = selectedYears.length === 0 || selectedYears.includes(dateYear);
      return monthMatches && yearMatches;
    };

    return collectors.map((collector) => {
      const filteredCollections = collections.filter((c) => {
        if (c.user_id !== collector.id) return false;
        const dateVenc = parseDateSafely(c.data_vencimento);
        const dateLanc = parseDateSafely(c.data_lancamento);
        return isDateInSelectedMonths(dateVenc) || isDateInSelectedMonths(dateLanc);
      });

      const receivedAmount = salePayments
        .filter((p) => {
          if (p.collectorId !== collector.id || !p.paymentDate) return false;
          const paymentDate = parseDateSafely(p.paymentDate);
          return isDateInSelectedMonths(paymentDate);
        })
        .reduce((sum, p) => sum + p.paymentAmount, 0);

      const totalAmount = filteredCollections.reduce((sum, c) => sum + Number(c.valor_original || 0), 0);
      const pendingAmount = Math.max(0, totalAmount - receivedAmount);

      // A receber total: toda a carteira, sem filtro de período
      const allCollectorCollections = collections.filter((c) => c.user_id === collector.id);
      const pendingAmountTotal = allCollectorCollections.reduce((sum, c) => {
        const diff = Number(c.valor_original || 0) - Number(c.valor_recebido || 0);
        return sum + (diff > 0.01 ? diff : 0);
      }, 0);

      // A receber (agendados): clientes com visita agendada, sem filtro de período
      const scheduledClientDocs = new Set(
        scheduledVisits
          .filter((v) => v.collectorId === collector.id && v.status === "agendada")
          .map((v) => v.clientDocument)
          .filter(Boolean)
      );
      const pendingAmountScheduled = allCollectorCollections
        .filter((c) => c.documento && scheduledClientDocs.has(c.documento))
        .reduce((sum, c) => {
          const diff = Number(c.valor_original || 0) - Number(c.valor_recebido || 0);
          return sum + (diff > 0.01 ? diff : 0);
        }, 0);

      const salesMap = new Map<string, { clientDocument: string; isPending: boolean }>();
      filteredCollections.forEach((collection) => {
        const saleKey = `${collection.venda_n}-${collection.documento}`;
        if (!salesMap.has(saleKey)) {
          salesMap.set(saleKey, { clientDocument: collection.documento || "", isPending: false });
        }
        const isPending = Number(collection.valor_original) - Number(collection.valor_recebido) > 0.01;
        if (isPending) salesMap.get(saleKey)!.isPending = true;
      });
      const salesArray = Array.from(salesMap.values());
      const pendingSales = salesArray.filter((s) => s.isPending).length;

      // Total de títulos sem filtro de período
      const allSalesSet = new Set(
        allCollectorCollections.map((c) => `${c.venda_n}-${c.documento}`)
      );
      const totalSales = allSalesSet.size;
      const clientsWithPending = new Set(salesArray.filter((s) => s.isPending).map((s) => s.clientDocument).filter(Boolean)).size;
      const clientsCount = new Set(salesArray.map((s) => s.clientDocument)).size;

      const currentMonthGoals = monthlyGoals.filter((g) => {
        const goalDate = parseDateSafely(g.month + "-01");
        return isDateInSelectedMonths(goalDate) && g.user_id === collector.id;
      });

      const currentMonthVisitsGoal = currentMonthGoals.reduce((sum, goal) => sum + (goal.visits_goal ?? 0), 0);
      const currentMonthPaymentsGoal = currentMonthGoals.reduce((sum, goal) => sum + (goal.payments_goal ?? 0), 0);

      const collectorVisits = scheduledVisits.filter((v) => v.collectorId === collector.id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let visitsRealizadas = 0;
      let visitsNaoEncontrado = 0;
      let visitsAgendadas = 0;
      let visitsCancelamentoSolicitado = 0;
      let visitsCanceladas = 0;
      let visitsAtrasadas = 0;
      let visitsReagendadas = 0;

      collectorVisits.forEach((v) => {
        const visitDate = parseDateSafely(v.dataVisitaRealizada || v.scheduledDate);
        if (!isDateInSelectedMonths(visitDate)) return;

        if (v.status === "realizada") visitsRealizadas++;
        if (v.status === "nao_encontrado") visitsNaoEncontrado++;
        if (v.status === "cancelada") visitsCanceladas++;
        if (v.status === "agendada") visitsAgendadas++;
        if (v.status === "cancelamento_solicitado") visitsCancelamentoSolicitado++;
        if (v.status === "reagendada" || (v.rescheduleCount && v.rescheduleCount > 0)) visitsReagendadas++;

        if ((v.status === "agendada" || v.status === "cancelamento_solicitado" || v.status === "pending_sync") && visitDate && visitDate < today) {
          visitsAtrasadas++;
        }
      });

      const currentMonthVisitsActual = visitsRealizadas;
      const pendingVisits = visitsAgendadas + visitsCancelamentoSolicitado;

      const visitsPerformance = currentMonthVisitsGoal > 0 ? (currentMonthVisitsActual / currentMonthVisitsGoal) * 100 : 0;
      const paymentsPerformance = currentMonthPaymentsGoal > 0 ? (receivedAmount / currentMonthPaymentsGoal) * 100 : 0;

      const allAssignedClients = new Set(collections.filter((c) => c.user_id === collector.id).map((c) => c.documento).filter(Boolean)).size;
      const visitedClients = new Set(scheduledVisits.filter(v => v.collectorId === collector.id && v.status === "realizada" && isDateInSelectedMonths(parseDateSafely(v.dataVisitaRealizada || v.scheduledDate))).map(v => v.clientDocument).filter(Boolean)).size;

      return {
        collectorId: collector.id,
        collectorName: collector.name,
        totalSales,
        pendingSales,
        clientsWithPending,
        totalAmount,
        receivedAmount,
        pendingAmount,
        pendingAmountScheduled,
        pendingAmountTotal,
        clientsCount,
        visitsPerformance,
        paymentsPerformance,
        currentMonthVisitsActual,
        currentMonthVisitsGoal,
        currentMonthPaymentsActual: receivedAmount,
        currentMonthPaymentsGoal,
        totalAssignedClients: allAssignedClients,
        visitedClientsInSelectedMonths: visitedClients,
        pendingVisits,
        visitsRealizadas,
        visitsNaoEncontrado,
        visitsAgendadas,
        visitsCancelamentoSolicitado,
        visitsCanceladas,
        visitsAtrasadas,
        visitsReagendadas,
      };
    });
  }, [collections, users, monthlyGoals, salePayments, scheduledVisits, selectedMonths, selectedYears]);

  const filteredAndSortedPerformance = useMemo(() => {
    let filtered = [...enhancedPerformance];
    filtered.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
    });
    return filtered;
  }, [enhancedPerformance, sortBy, sortOrder]);

  const teamStats = useMemo(() => {
    const totalReceived = enhancedPerformance.reduce((sum, p) => sum + p.receivedAmount, 0);
    const totalVisitsActual = enhancedPerformance.reduce((sum, p) => sum + p.currentMonthVisitsActual, 0);
    const totalVisitsGoal = enhancedPerformance.reduce((sum, p) => sum + p.currentMonthVisitsGoal, 0);
    const totalPendingVisits = enhancedPerformance.reduce((sum, p) => sum + p.pendingVisits, 0);
    const totalVisitsNaoEncontrado = enhancedPerformance.reduce((sum, p) => sum + p.visitsNaoEncontrado, 0);
    const totalVisitsAtrasadas = enhancedPerformance.reduce((sum, p) => sum + p.visitsAtrasadas, 0);

    return { totalReceived, totalVisitsActual, totalVisitsGoal, totalPendingVisits, totalVisitsNaoEncontrado, totalVisitsAtrasadas };
  }, [enhancedPerformance]);

  const exportPerformanceData = () => {
    const headers = ["Cobrador", "Vendas", "Clientes", "Total (R$)", "Recebido (R$)", "Pendente (R$)", "Visitas OK", "Visitas Pend"];
    const rows = filteredAndSortedPerformance.map((p) => [
      p.collectorName, p.totalSales.toString(), p.clientsCount.toString(), p.totalAmount.toFixed(2),
      p.receivedAmount.toFixed(2), p.pendingAmount.toFixed(2), p.currentMonthVisitsActual.toString(), p.pendingVisits.toString()
    ]);
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(","))].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" }));
    link.download = `ranking-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const hasActiveFilters = selectedMonths.length > 0 || selectedYears.length > 0;

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-dark-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-dark-text tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              Ranking de Performance
            </h2>
            <p className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary mt-1 uppercase tracking-wider">
              Análise detalhada por cobrador e período
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-all border ${
                showFilters || hasActiveFilters
                  ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100 dark:shadow-none"
                  : "bg-white dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/50"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros {hasActiveFilters && `(${selectedMonths.length + selectedYears.length})`}
            </button>
            <button
              onClick={exportPerformanceData}
              className="p-2.5 bg-gray-50 dark:bg-dark-bg text-gray-500 dark:text-dark-text border border-gray-200 dark:border-dark-border rounded-xl hover:bg-gray-100 dark:hover:bg-dark-bg/50 transition-all"
              title="Exportar CSV"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Section */}
        {showFilters && (
          <div className="mt-6 p-6 bg-gray-50 dark:bg-dark-bg rounded-2xl border border-gray-100 dark:border-dark-border animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Month Select */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em]">Meses</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {monthsDisplay.map((month, idx) => (
                    <button
                      key={month}
                      onClick={() => startTransition(() => {
                        setSelectedMonths(prev => prev.includes(idx) ? prev.filter(m => m !== idx) : [...prev, idx]);
                      })}
                      className={`py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        selectedMonths.includes(idx)
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-white dark:bg-dark-bg-secondary text-gray-500 dark:text-dark-text border border-gray-100 dark:border-dark-border hover:border-blue-400"
                      }`}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year Select */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em]">Anos</label>
                <div className="flex flex-wrap gap-2">
                  {years.map(year => (
                    <button
                      key={year}
                      onClick={() => startTransition(() => {
                        setSelectedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
                      })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        selectedYears.includes(year)
                          ? "bg-green-600 text-white shadow-md"
                          : "bg-white dark:bg-dark-bg-secondary text-gray-500 dark:text-dark-text border border-gray-100 dark:border-dark-border hover:border-green-400"
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sorting */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em]">Ordenação</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl text-sm font-bold dark:text-dark-text focus:ring-2 focus:ring-blue-500"
                >
                  <option value="receivedAmount">VALOR RECEBIDO</option>
                  <option value="totalSales">TOTAL DE VENDAS</option>
                  <option value="clientsCount">TOTAL DE CLIENTES</option>
                  <option value="pendingSales">TOTAL DE PENDÊNCIAS</option>
                </select>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border flex justify-end gap-3">
              <button
                onClick={() => startTransition(() => { setSelectedMonths([]); setSelectedYears([]); setShowFilters(false); })}
                className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600 dark:hover:text-dark-text"
              >
                Limpar Todos
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="px-6 py-2 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 dark:shadow-none transition-all"
              >
                Aplicar Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary Card: Visitas do Período */}
      <div className="relative overflow-hidden bg-white dark:bg-dark-bg-secondary rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-dark-border">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-500/5 dark:bg-blue-400/5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-800 dark:text-dark-text uppercase tracking-wider">Visitas do Período</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">Visão consolidada da equipe</p>
            </div>
          </div>
          {teamStats.totalVisitsGoal > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-blue-600">
                {((teamStats.totalVisitsActual / teamStats.totalVisitsGoal) * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">da Meta</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50/50 dark:bg-dark-bg/30 rounded-2xl border border-gray-100 dark:border-dark-border group hover:border-green-200 dark:hover:border-green-900/30 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Realizadas</label>
            </div>
            <p className="text-2xl font-black text-gray-800 dark:text-dark-text group-hover:text-green-600 transition-colors">{teamStats.totalVisitsActual}</p>
          </div>
          <div className="p-4 bg-gray-50/50 dark:bg-dark-bg/30 rounded-2xl border border-gray-100 dark:border-dark-border group hover:border-amber-200 dark:hover:border-amber-900/30 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-3.5 h-3.5 text-amber-500" />
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Não Loc.</label>
            </div>
            <p className="text-2xl font-black text-gray-800 dark:text-dark-text group-hover:text-amber-600 transition-colors">{teamStats.totalVisitsNaoEncontrado}</p>
          </div>
          <div className="p-4 bg-gray-50/50 dark:bg-dark-bg/30 rounded-2xl border border-gray-100 dark:border-dark-border group hover:border-blue-200 dark:hover:border-blue-900/30 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Agendadas</label>
            </div>
            <p className="text-2xl font-black text-gray-800 dark:text-dark-text group-hover:text-blue-600 transition-colors">{teamStats.totalPendingVisits}</p>
          </div>
          <div className="p-4 bg-gray-50/50 dark:bg-dark-bg/30 rounded-2xl border border-gray-100 dark:border-dark-border group hover:border-rose-200 dark:hover:border-rose-900/30 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Atrasadas</label>
            </div>
            <p className="text-2xl font-black text-gray-800 dark:text-dark-text group-hover:text-rose-600 transition-colors">{teamStats.totalVisitsAtrasadas}</p>
          </div>
        </div>

        {teamStats.totalVisitsGoal > 0 && (
          <div className="mt-6">
            <div className="w-full bg-gray-100 dark:bg-dark-bg h-2 rounded-full overflow-hidden border border-gray-50 dark:border-dark-border">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-1000 ease-out shadow-lg shadow-blue-200"
                style={{ width: `${Math.min(100, (teamStats.totalVisitsActual / teamStats.totalVisitsGoal) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Collector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAndSortedPerformance.map((collector, index) => {
          const isTop3 = index < 3 && sortOrder === "desc";
          const rank = index + 1;
          
          return (
            <div 
              key={collector.collectorId}
              className="group relative bg-white dark:bg-dark-bg-secondary rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-dark-border hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`relative w-12 h-12 flex items-center justify-center rounded-2xl text-lg font-black transition-all ${
                    isTop3 
                      ? rank === 1 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" 
                      : rank === 2 ? "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400"
                      : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                    : "bg-gray-50 text-gray-400 dark:bg-dark-bg dark:text-dark-text-secondary"
                  }`}>
                    {rank}
                    {isTop3 && <Trophy className="absolute -top-1 -right-1 w-3.5 h-3.5 animate-bounce-slow" />}
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-gray-800 dark:text-dark-text group-hover:text-blue-600 transition-colors uppercase tracking-tight">
                      {collector.collectorName}
                    </h4>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="flex items-center gap-1.5">
                        <ShoppingCart className="w-3 h-3 text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-500 dark:text-dark-text-secondary uppercase">{collector.totalSales} Títulos</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-blue-400" />
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">{collector.totalAssignedClients} na Carteira</span>
                      </div>
                    </div>
                  </div>
                </div>
                {collector.pendingSales > 0 && (
                  <div className="px-2 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-100 dark:border-rose-900/30">
                    {collector.pendingSales} Pendências
                  </div>
                )}
              </div>

              {/* Metric Groups */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gray-50/50 dark:bg-dark-bg/30 rounded-xl border border-gray-100 dark:border-dark-border">
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Volume Financeiro</label>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-bold text-green-600 uppercase">Recebido</span>
                      <span className="text-base font-black text-gray-800 dark:text-dark-text">{formatCurrency(collector.receivedAmount)}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="flex flex-col leading-tight">
                        <span className="text-[10px] font-bold text-amber-500 uppercase">A Receber</span>
                        <span className="text-[8px] font-normal text-gray-400 uppercase tracking-wider">Agendados</span>
                      </span>
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(collector.pendingAmountScheduled)}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="flex flex-col leading-tight">
                        <span className="text-[10px] font-bold text-rose-500 uppercase">A Receber</span>
                        <span className="text-[8px] font-normal text-gray-400 uppercase tracking-wider">Total</span>
                      </span>
                      <span className="text-sm font-bold text-rose-600 dark:text-rose-400">{formatCurrency(collector.pendingAmountTotal)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50/50 dark:bg-dark-bg/30 rounded-xl border border-gray-100 dark:border-dark-border">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Visitas no Período</label>
                    {collector.currentMonthVisitsGoal > 0 && (
                      <span className="text-[9px] font-bold text-gray-400 uppercase">
                        Meta: {collector.currentMonthVisitsGoal}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-blue-600 uppercase">Feitas</span>
                      <span className="text-base font-black text-gray-800 dark:text-dark-text">{collector.visitsRealizadas}</span>
                    </div>
                    <div className="flex flex-col text-center">
                      <span className="text-[9px] font-bold text-amber-500 uppercase">Agendadas</span>
                      <span className={`text-base font-black ${collector.visitsAgendadas > 0 ? "text-amber-500" : "text-gray-300 dark:text-gray-700"}`}>
                        {collector.visitsAgendadas}
                      </span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[9px] font-bold text-rose-500 uppercase">Atrasadas</span>
                      <span className={`text-base font-black ${collector.visitsAtrasadas > 0 ? "text-rose-500" : "text-gray-300 dark:text-gray-700"}`}>
                        {collector.visitsAtrasadas}
                      </span>
                    </div>
                  </div>
                  {collector.currentMonthVisitsGoal > 0 && (
                    <div className="mt-2 w-full bg-gray-200 dark:bg-dark-bg-secondary h-1 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-500" style={{ width: `${Math.min(100, (collector.visitsRealizadas / collector.currentMonthVisitsGoal) * 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setSelectedCollector(collector); setIsModalOpen(true); }}
                  className="flex items-center justify-center gap-2 py-3 bg-gray-900 dark:bg-dark-bg text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black dark:hover:bg-dark-bg/50 transition-all group/btn"
                >
                  <Eye className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                  Detalhes
                </button>
                <button
                  onClick={() => {
                    const user = users.find(u => u.id === collector.collectorId);
                    if (user) { setSelectedCollectorForGoals(user); setIsGoalModalOpen(true); }
                  }}
                  className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 dark:shadow-none transition-all group/btn"
                >
                  <Target className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                  Metas
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAndSortedPerformance.length === 0 && (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-white dark:bg-dark-bg-secondary rounded-3xl border-2 border-dashed border-gray-100 dark:border-dark-border">
          <div className="p-6 bg-gray-50 dark:bg-dark-bg rounded-full mb-4">
            <Users className="w-12 h-12 text-gray-300" />
          </div>
          <h3 className="text-lg font-black text-gray-800 dark:text-dark-text uppercase tracking-tight">Nenhum cobrador encontrado</h3>
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-2 max-w-xs">Ajuste os filtros de período acima para visualizar o ranking de desempenho.</p>
        </div>
      )}

      {/* Modals */}
      <CollectorPerformanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        collector={selectedCollector}
        selectedMonths={selectedMonths}
        selectedYears={selectedYears}
      />
      <MonthlyGoalEditModal
        isOpen={isGoalModalOpen}
        onClose={() => { setIsGoalModalOpen(false); refreshData(); }}
        collector={selectedCollectorForGoals}
      />
    </div>
  );
};

export default EnhancedPerformanceChart;