import React, { useState, useMemo, useTransition } from "react";
import {
  Users,
  Download,
  Eye,
  Target,
  Calendar,
  Trophy,
  BarChart3,
  AlertTriangle,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import CollectorPerformanceModal from "./CollectorPerformanceModal";
import MonthlyGoalEditModal from "./MonthlyGoalEditModal";
import FilterBar from "../common/FilterBar";
import { User, UserType, FilterOptions, isCollectorType } from "../../types";

interface EnhancedCollectorPerformance {
  collectorId: string;
  collectorName: string;
  collectorType: UserType;
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
    getFilteredCollections,
  } = useCollection();
  
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const [, startTransition] = useTransition();
  const [sortBy] = useState<"receivedAmount" | "totalSales" | "clientsCount" | "pendingSales">("receivedAmount");
    const [sortOrder] = useState<"asc" | "desc">("desc");
  // Filtro por tipo de cobrador (Todos / Interno / Externo / Terceirizado).
  const [typeFilter, setTypeFilter] = useState<UserType | "all">("all");
  const [selectedCollector, setSelectedCollector] = useState<EnhancedCollectorPerformance | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [selectedCollectorForGoals, setSelectedCollectorForGoals] = useState<User | null>(null);

  // Fonte unica: todos os filtros (incl. Periodo mes/ano) vivem em `filters`.
  // Default = mes/ano atual, mesmo comportamento de antes.
  const [filters, setFilters] = useState<FilterOptions>({
    months: [currentMonth],
    years: [currentYear],
  });
  const handleFiltersChange = (next: FilterOptions) =>
    startTransition(() => setFilters(next));
  const selectedMonths = useMemo(() => filters.months ?? [], [filters.months]);
  const selectedYears = useMemo(() => filters.years ?? [], [filters.years]);

  // Segmento de meta (lente de desempenho sobre o ranking, nao sobre a carteira).
  const [goalSegment, setGoalSegment] = useState<"above" | "below" | null>(null);

  // Atalhos rapidos de periodo (escrevem em months/years — mesma fonte de verdade).
  const periodPresets = useMemo(() => {
    const prev = new Date(currentYear, currentMonth - 1, 1);
    return [
      { id: "thisMonth", label: "Este mês", months: [currentMonth], years: [currentYear] },
      { id: "lastMonth", label: "Mês passado", months: [prev.getMonth()], years: [prev.getFullYear()] },
      { id: "thisYear", label: "Este ano", months: [] as number[], years: [currentYear] },
      { id: "all", label: "Tudo", months: [] as number[], years: [] as number[] },
    ];
  }, [currentMonth, currentYear]);

  const sameSet = (a: number[], b: number[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const activePreset = periodPresets.find(
    (p) => sameSet(selectedMonths, p.months) && sameSet(selectedYears, p.years),
  )?.id;
  const applyPeriodPreset = (p: { months: number[]; years: number[] }) =>
    handleFiltersChange({
      ...filters,
      months: p.months.length ? p.months : undefined,
      years: p.years.length ? p.years : undefined,
    });

  // Filtros de dados (sem o Periodo) ativos -> usado para restringir pagamentos.
  const hasSourceFilter = Object.entries(filters).some(
    ([k, v]) => k !== "months" && k !== "years" && Boolean(v),
  );
  const sourceCollections = useMemo(
    () => getFilteredCollections(filters, "manager"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, collections],
  );
  const allowedDocs = useMemo(
    () => new Set(sourceCollections.map((c) => c.documento).filter(Boolean)),
    [sourceCollections],
  );

  const enhancedPerformance = useMemo((): EnhancedCollectorPerformance[] => {
    const collectors = users.filter((u) => isCollectorType(u.type));

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
      const filteredCollections = sourceCollections.filter((c) => {
        if (c.user_id !== collector.id) return false;
        const dateVenc = parseDateSafely(c.data_vencimento);
        const dateLanc = parseDateSafely(c.data_lancamento);
        return isDateInSelectedMonths(dateVenc) || isDateInSelectedMonths(dateLanc);
      });

      const receivedAmount = salePayments
        .filter((p) => {
          if (p.collectorId !== collector.id || !p.paymentDate) return false;
          // Quando ha filtro ativo, conta apenas pagamentos de clientes no subconjunto filtrado.
          if (hasSourceFilter && !allowedDocs.has(p.clientDocument)) return false;
          const paymentDate = parseDateSafely(p.paymentDate);
          return isDateInSelectedMonths(paymentDate);
        })
        .reduce((sum, p) => sum + p.paymentAmount, 0);

      const totalAmount = filteredCollections.reduce((sum, c) => sum + Number(c.valor_original || 0), 0);
      const pendingAmount = Math.max(0, totalAmount - receivedAmount);

      // A receber total: toda a carteira (do subconjunto filtrado), sem filtro de período
      const allCollectorCollections = sourceCollections.filter((c) => c.user_id === collector.id);
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

      const allAssignedClients = new Set(sourceCollections.filter((c) => c.user_id === collector.id).map((c) => c.documento).filter(Boolean)).size;
      const visitedClients = new Set(scheduledVisits.filter(v => v.collectorId === collector.id && v.status === "realizada" && isDateInSelectedMonths(parseDateSafely(v.dataVisitaRealizada || v.scheduledDate))).map(v => v.clientDocument).filter(Boolean)).size;

      return {
        collectorId: collector.id,
        collectorName: collector.name,
        collectorType: collector.type,
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
  }, [sourceCollections, allowedDocs, hasSourceFilter, users, monthlyGoals, salePayments, scheduledVisits, selectedMonths, selectedYears]);

  // Cobrador isola um cobrador; segmento de meta filtra por atingimento da meta
  // de recebimento. Ambos refletem no ranking e nos KPIs (fonte: rankedPerformance).
  const rankedPerformance = useMemo(() => {
    let list = enhancedPerformance;
    if (typeFilter !== "all") {
      list = list.filter((p) => p.collectorType === typeFilter);
    }
    if (filters.collector) {
      list = list.filter((p) => p.collectorId === filters.collector);
    }
    if (goalSegment) {
      list = list.filter((p) => {
        if (p.currentMonthPaymentsGoal <= 0) return false; // sem meta nao entra no segmento
        const atingiu = p.receivedAmount >= p.currentMonthPaymentsGoal;
        return goalSegment === "above" ? atingiu : !atingiu;
      });
    }
    return list;
  }, [enhancedPerformance, typeFilter, filters.collector, goalSegment]);

  const filteredAndSortedPerformance = useMemo(() => {
    const filtered = [...rankedPerformance];
    filtered.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
    });
    return filtered;
  }, [rankedPerformance, sortBy, sortOrder]);

  const teamStats = useMemo(() => {
    const sum = (f: (p: EnhancedCollectorPerformance) => number) =>
      rankedPerformance.reduce((acc, p) => acc + f(p), 0);

    const totalReceived = sum((p) => p.receivedAmount);
    const totalPending = sum((p) => p.pendingAmountTotal); // a receber (carteira)
    const totalPaymentsGoal = sum((p) => p.currentMonthPaymentsGoal);
    const totalClientsWithPending = sum((p) => p.clientsWithPending);
    const totalAssignedClients = sum((p) => p.totalAssignedClients);
    const totalVisitsActual = sum((p) => p.currentMonthVisitsActual);
    const totalVisitsGoal = sum((p) => p.currentMonthVisitsGoal);
    const totalVisitsAtrasadas = sum((p) => p.visitsAtrasadas);
    const collectorsCount = rankedPerformance.length;

    const paymentGoalPct =
      totalPaymentsGoal > 0 ? (totalReceived / totalPaymentsGoal) * 100 : 0;
    const visitsGoalPct =
      totalVisitsGoal > 0 ? (totalVisitsActual / totalVisitsGoal) * 100 : 0;

    return {
      totalReceived,
      totalPending,
      totalPaymentsGoal,
      totalClientsWithPending,
      totalAssignedClients,
      totalVisitsActual,
      totalVisitsGoal,
      totalVisitsAtrasadas,
      collectorsCount,
      paymentGoalPct,
      visitsGoalPct,
    };
  }, [rankedPerformance]);

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

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 dark:border-dark-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              Ranking de Performance
            </h2>
            <p className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary mt-1 tracking-wide">
              Análise detalhada por cobrador e período
            </p>
          </div>
          <button
            onClick={exportPerformanceData}
            className="p-2.5 bg-white dark:bg-dark-bg text-gray-500 dark:text-dark-text border border-gray-200 dark:border-dark-border rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg/50 transition-all shadow-sm"
            title="Exportar CSV"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Resumo executivo (acima dos filtros): visão geral antes de refinar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Recuperado no período */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
              Recuperado no período
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
            {formatCurrency(teamStats.totalReceived)}
          </p>
          {teamStats.totalPaymentsGoal > 0 && (
            <>
              <div className="mt-3 flex justify-between text-[11px] font-medium">
                <span className="text-gray-400 dark:text-dark-text-secondary">
                  Meta: {formatCurrency(teamStats.totalPaymentsGoal)}
                </span>
                <span className="text-green-600 dark:text-green-400">
                  {teamStats.paymentGoalPct.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-dark-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, teamStats.paymentGoalPct)}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* A receber (carteira em aberto) */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <Wallet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
              A receber (carteira)
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
            {formatCurrency(teamStats.totalPending)}
          </p>
          <p className="mt-3 text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary">
            {teamStats.totalClientsWithPending} clientes em aberto
          </p>
        </div>

        {/* Visitas realizadas */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
              Visitas realizadas
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
            {teamStats.totalVisitsActual}
          </p>
          {teamStats.totalVisitsGoal > 0 ? (
            <>
              <div className="mt-3 flex justify-between text-[11px] font-medium">
                <span className="text-gray-400 dark:text-dark-text-secondary">
                  Meta: {teamStats.totalVisitsGoal}
                </span>
                <span className="text-blue-600 dark:text-blue-400">
                  {teamStats.visitsGoalPct.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-dark-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, teamStats.visitsGoalPct)}%` }}
                />
              </div>
            </>
          ) : (
            teamStats.totalVisitsAtrasadas > 0 && (
              <p className="mt-3 text-[11px] font-medium text-rose-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {teamStats.totalVisitsAtrasadas} atrasadas
              </p>
            )
          )}
        </div>

        {/* Cobradores */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
              Cobradores
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
            {teamStats.collectorsCount}
          </p>
          <p className="mt-3 text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary">
            {teamStats.totalAssignedClients} clientes na carteira
          </p>
        </div>
      </div>

      {/* Barra de filtros unificada (inclui Período) */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFiltersChange}
        userType="manager"
        context="performance"
        searchPlaceholder="Buscar cliente, cidade ou loja..."
        showStatusPills={false}
        showAgingPills={false}
      >
      {/* Atalhos: Período (escopo de tempo) + Segmento de meta (lente de desempenho) */}
      <div className="flex flex-wrap items-center gap-2">
        {periodPresets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPeriodPreset(p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              activePreset === p.id
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
            }`}
          >
            {p.label}
          </button>
        ))}

        <span className="w-px h-5 bg-gray-200 dark:bg-dark-border mx-1 hidden sm:block" />

        <button
          type="button"
          onClick={() =>
            setGoalSegment((s) => (s === "below" ? null : "below"))
          }
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            goalSegment === "below"
              ? "bg-rose-600 border-rose-600 text-white shadow-sm"
              : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
          }`}
        >
          Abaixo da meta
        </button>
        <button
          type="button"
          onClick={() =>
            setGoalSegment((s) => (s === "above" ? null : "above"))
          }
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            goalSegment === "above"
              ? "bg-green-600 border-green-600 text-white shadow-sm"
              : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
          }`}
        >
          Acima da meta
        </button>
      </div>
      </FilterBar>

      {/* Controles de lista: contagem + tipo de cobrador */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <span className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">
          {filteredAndSortedPerformance.length}{" "}
          {filteredAndSortedPerformance.length === 1 ? "cobrador" : "cobradores"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
            Tipo de cobrador
          </span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as UserType | "all")}
            className="px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium text-gray-700 dark:text-dark-text appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">Todos</option>
            <option value="internal_collector">Interno</option>
            <option value="collector">Externo</option>
            <option value="third_party_collector">Terceirizado</option>
          </select>
        </div>
      </div>

      {/* Collector Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 p-0.5">
        {filteredAndSortedPerformance.map((collector, index) => {
          const isTop3 = index < 3 && sortOrder === "desc";
          const rank = index + 1;
          
          const getSortMetricDisplay = () => {
            switch (sortBy) {
              case "receivedAmount":
                return {
                  value: formatCurrency(collector.receivedAmount),
                  label: "Valor Recebido",
                  color: "text-green-600 dark:text-green-400"
                };
              case "totalSales":
                return {
                  value: `${collector.totalSales}`,
                  label: "Títulos Vendidos",
                  color: "text-blue-600 dark:text-blue-400"
                };
              case "clientsCount":
                return {
                  value: `${collector.clientsCount}`,
                  label: "Total de Clientes",
                  color: "text-purple-600 dark:text-purple-400"
                };
              case "pendingSales":
                return {
                  value: `${collector.pendingSales}`,
                  label: "Fichas Pendentes",
                  color: "text-rose-600 dark:text-rose-400"
                };
              default:
                return {
                  value: formatCurrency(collector.receivedAmount),
                  label: "Valor Recebido",
                  color: "text-green-600 dark:text-green-400"
                };
            }
          };

          const scoreDisplay = getSortMetricDisplay();

          return (
            <div 
              key={collector.collectorId}
              className="group bg-white dark:bg-dark-bg-secondary rounded-2xl p-5 border border-gray-100 dark:border-dark-border hover:-translate-y-1 hover:shadow-lg hover:shadow-gray-250/20 dark:hover:shadow-black/20 transition-all duration-300 cursor-pointer flex flex-col justify-between"
            >
              <div>
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Rank Badge Gamificado */}
                    <div className={`relative w-10 h-10 flex items-center justify-center rounded-xl text-sm font-bold shrink-0 transition-all ${
                      isTop3 
                        ? rank === 1 
                          ? "bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-700 dark:from-amber-950/40 dark:to-yellow-950/20 dark:text-amber-300 border border-amber-200/50" 
                          : rank === 2 
                            ? "bg-gradient-to-r from-slate-100 to-gray-50 text-slate-700 dark:from-slate-800/40 dark:to-gray-800/20 dark:text-slate-300 border border-slate-200/50"
                            : "bg-gradient-to-r from-orange-100 to-orange-50 text-orange-700 dark:from-orange-950/40 dark:to-orange-900/20 dark:text-orange-300 border border-orange-200/50"
                        : "bg-gray-50 dark:bg-dark-bg text-gray-500 dark:text-dark-text-secondary border border-gray-150 dark:border-dark-border"
                    }`}>
                      {rank}
                      {isTop3 && <Trophy className="absolute -top-1 -right-1 w-3.5 h-3.5 text-amber-500" />}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-sm sm:text-base font-bold text-gray-900 dark:text-dark-text truncate leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {collector.collectorName}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary">
                        <span className="flex items-center gap-1">
                          <ShoppingCart className="w-3 h-3 text-gray-400" />
                          {collector.totalSales} títulos
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-gray-400" />
                          {collector.totalAssignedClients} carteira
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Score de Ordenação Principal */}
                  <div className="text-right shrink-0">
                    <div className={`text-base sm:text-lg font-bold tracking-tight leading-none mb-0.5 ${scoreDisplay.color}`}>
                      {scoreDisplay.value}
                    </div>
                    <span className="text-[9px] font-semibold tracking-wide text-gray-400 dark:text-dark-text-secondary block">
                      {scoreDisplay.label}
                    </span>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-dark-border/50 my-4" />

                {/* Grid de Informações - Sem bordas excessivas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-5">
                  {/* Volume Financeiro */}
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wider block mb-2">Volume Financeiro</span>
                    <div className="space-y-1.5">
                      {sortBy !== "receivedAmount" && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500 dark:text-dark-text-secondary">Recebido</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(collector.receivedAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 dark:text-dark-text-secondary font-medium">Agendados</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(collector.pendingAmountScheduled)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 dark:text-dark-text-secondary font-medium">Total Aberto</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(collector.pendingAmountTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Visitas no Período */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wider">Visitas</span>
                      {collector.currentMonthVisitsGoal > 0 && (
                        <span className="text-[9px] font-bold text-gray-400 dark:text-dark-text-secondary">Meta: {collector.currentMonthVisitsGoal}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                      <div className="text-left">
                        <span className="text-[9px] font-bold text-blue-500 block leading-none">Feitas</span>
                        <span className="text-xs font-bold text-gray-800 dark:text-dark-text">{collector.visitsRealizadas}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-amber-500 block leading-none">Agend.</span>
                        <span className={`text-xs font-bold ${collector.visitsAgendadas > 0 ? "text-amber-500" : "text-gray-300 dark:text-gray-700"}`}>{collector.visitsAgendadas}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-rose-500 block leading-none">Atras.</span>
                        <span className={`text-xs font-bold ${collector.visitsAtrasadas > 0 ? "text-rose-500" : "text-gray-300 dark:text-gray-700"}`}>{collector.visitsAtrasadas}</span>
                      </div>
                    </div>
                    {collector.currentMonthVisitsGoal > 0 && (
                      <div className="w-full bg-gray-100 dark:bg-dark-bg h-1 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-600 h-full transition-all duration-500" 
                          style={{ width: `${Math.min(100, (collector.visitsRealizadas / collector.currentMonthVisitsGoal) * 100)}%` }} 
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Botões de Ação Modernizados */}
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  onClick={() => { setSelectedCollector(collector); setIsModalOpen(true); }}
                  className="flex items-center justify-center gap-2 py-2.5 bg-gray-950 hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95 group/btn"
                >
                  <Eye className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                  Detalhes
                </button>
                <button
                  onClick={() => {
                    const user = users.find(u => u.id === collector.collectorId);
                    if (user) { setSelectedCollectorForGoals(user); setIsGoalModalOpen(true); }
                  }}
                  className="flex items-center justify-center gap-2 py-2.5 bg-white hover:bg-gray-50 dark:bg-dark-bg text-gray-755 dark:text-dark-text border border-gray-200 dark:border-dark-border rounded-xl text-xs font-semibold tracking-wide transition-all active:scale-95 group/btn"
                >
                  <Target className="w-3.5 h-3.5 text-blue-500 group-hover/btn:scale-110 transition-transform" />
                  Metas
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAndSortedPerformance.length === 0 && (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-white dark:bg-dark-bg-secondary rounded-2xl border border-gray-100 dark:border-dark-border">
          <div className="p-6 bg-gray-50 dark:bg-dark-bg rounded-full mb-4">
            <Users className="w-12 h-12 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-dark-text tracking-tight">Nenhum cobrador encontrado</h3>
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