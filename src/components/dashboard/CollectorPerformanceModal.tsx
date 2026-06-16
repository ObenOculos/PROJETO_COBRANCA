import React, { useMemo, useState, useEffect } from "react";
import {
  BarChart2,
  Calendar,
  Filter,
  BarChart3,
  AlertCircle,
  TrendingUp,
  History,
  Info,
  Users,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { Modal } from "../Modal";
import TabTransition from "../common/TabTransition";
import { supabase } from "../../lib/supabase";

interface CollectorPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  collector: any;
  selectedMonths: number[];
  selectedYears: number[];
}

type ViewMode = "list" | "chart";
type SortOrder = "desc" | "asc";

interface AssignmentRecord {
  id: string;
  documento: string;
  cliente_nome: string | null;
  nome_da_loja: string | null;
  cobrador_novo_id: string;
  cobrador_anterior_id: string | null;
  gerente_id: string;
  assigned_at: string;
}

const Pagination: React.FC<{ page: number; total: number; perPage: number; onChange: (p: number) => void }> = ({ page, total, perPage, onChange }) => {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-dark-border">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-gray-100 dark:border-dark-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-bg transition-all"
        >
          ←
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | "…")[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-2 text-[10px] text-gray-300">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p as number)}
                className={`w-7 h-7 text-[10px] font-bold rounded-lg transition-all ${
                  page === p
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-bg"
                }`}
              >
                {p}
              </button>
            )
          )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-gray-100 dark:border-dark-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-bg transition-all"
        >
          →
        </button>
      </div>
    </div>
  );
};

// Busca TODAS as linhas de uma query do Supabase paginando de 1000 em 1000
// (o Supabase/PostgREST retorna no maximo ~1000 linhas por requisicao). Sem
// isso, cobradores com muito historico de atribuicao tinham os numeros da aba
// Carteira truncados nos primeiros 1000 registros.
async function fetchAllRows<T>(
  runPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: any }>,
  shouldCancel?: () => boolean,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;

  while (!shouldCancel?.()) {
    const { data, error } = await runPage(from, from + PAGE - 1);
    if (error) {
      console.error("Erro ao paginar dados do modal de performance:", error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

const CollectorPerformanceModal: React.FC<CollectorPerformanceModalProps> = ({
  isOpen,
  onClose,
  collector,
  selectedMonths,
  selectedYears,
}) => {
  const { monthlyGoals, salePayments, scheduledVisits, collections } = useCollection();
  
  const [activeTab, setActiveTab] = useState<"summary" | "history" | "pending" | "carteira">("summary");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [selectedYear, setSelectedYear] = useState<number | null>(new Date().getFullYear());
  const [assignmentRecords, setAssignmentRecords] = useState<AssignmentRecord[]>([]);
  const [carteiraYear, setCarteiraYear] = useState<number | "all">(new Date().getFullYear());
  // Documentos de clientes criados no sistema (clientes.created_at) no mes
  // passado -- mesma fonte de verdade do card "Novos Clientes" e do badge
  // "Novo". Usado para distinguir, dentro das entradas da carteira, quem e
  // cliente realmente novo no banco (vs. transferido de outro cobrador).
  const [newClientsLastMonthDocs, setNewClientsLastMonthDocs] = useState<
    Set<string>
  >(new Set());

  const HISTORY_PER_PAGE = 6;
  const PENDING_PER_PAGE = 12;

  useEffect(() => {
    if (!collector) return;
    let cancelled = false;

    (async () => {
      const records = await fetchAllRows<AssignmentRecord>(
        (from, to) =>
          supabase
            .from("atribuicoes_historico")
            .select("*")
            .or(
              `cobrador_novo_id.eq.${collector.collectorId},cobrador_anterior_id.eq.${collector.collectorId}`,
            )
            .order("assigned_at", { ascending: false })
            .range(from, to),
        () => cancelled,
      );
      if (!cancelled) setAssignmentRecords(records);
    })();

    return () => {
      cancelled = true;
    };
  }, [collector?.collectorId]);

  // Busca os documentos criados no sistema no mes passado (janela pequena).
  useEffect(() => {
    if (!collector) return;
    let cancelled = false;

    const loadNewClients = async () => {
      const now = new Date();
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );

      const rows = await fetchAllRows<{
        documento: string | null;
        created_at: string | null;
      }>(
        (from, to) =>
          supabase
            .from("clientes")
            .select("documento, created_at")
            .gte("created_at", prevMonthStart.toISOString())
            .lte("created_at", prevMonthEnd.toISOString())
            .range(from, to),
        () => cancelled,
      );

      if (cancelled) return;

      setNewClientsLastMonthDocs(
        new Set(
          rows
            .filter((r) => r.documento)
            .map((r) => r.documento as string),
        ),
      );
    };

    loadNewClients();
    return () => {
      cancelled = true;
    };
  }, [collector?.collectorId]);

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

  // Carteira atual: clientes únicos com user_id deste cobrador
  const currentPortfolio = useMemo(() => {
    if (!collector) return 0;
    return new Set(
      collections.filter((c) => c.user_id === collector.collectorId && c.documento).map((c) => c.documento)
    ).size;
  }, [collector, collections]);

  // Carteira por mês: tamanho cumulativo + entradas/saídas + títulos com vencimento
  const portfolioByMonth = useMemo(() => {
    if (!collector) return [];

    interface MonthEntry {
      key: string;
      label: string;
      year: number;
      month: number;
      additions: number;
      removals: number;
      portfolioSize: number;
      titlesCount: number;
    }

    const map = new Map<string, MonthEntry>();
    const addsByMonth = new Map<string, Set<string>>();
    const removesByMonth = new Map<string, Set<string>>();

    const ensureMonth = (key: string, d: Date) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
          year: d.getFullYear(),
          month: d.getMonth(),
          additions: 0,
          removals: 0,
          portfolioSize: 0,
          titlesCount: 0,
        });
      }
    };

    // Entradas/saidas contadas por DOCUMENTOS UNICOS por mes (nao por evento):
    // o mesmo cliente atribuido 2x no mesmo mes conta 1. Mantem coerencia com a
    // carteira atual (clientes unicos) e com a reconstrucao cumulativa.
    assignmentRecords.forEach((r) => {
      if (!r.documento) return;
      const d = new Date(r.assigned_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      ensureMonth(key, d);
      if (r.cobrador_novo_id === collector.collectorId) {
        if (!addsByMonth.has(key)) addsByMonth.set(key, new Set());
        addsByMonth.get(key)!.add(r.documento);
      }
      if (r.cobrador_anterior_id === collector.collectorId) {
        if (!removesByMonth.has(key)) removesByMonth.set(key, new Set());
        removesByMonth.get(key)!.add(r.documento);
      }
    });

    // Títulos únicos (venda_n + documento) pelo mês de lançamento da venda
    const titlesByMonth = new Map<string, Set<string>>();
    const seenTitles = new Set<string>();
    collections
      .filter((c) => c.user_id === collector.collectorId && c.data_lancamento)
      .forEach((c) => {
        const titleKey = `${c.venda_n}-${c.documento}`;
        if (seenTitles.has(titleKey)) return;
        seenTitles.add(titleKey);
        const d = parseDateSafely(c.data_lancamento);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!titlesByMonth.has(key)) titlesByMonth.set(key, new Set());
        titlesByMonth.get(key)!.add(titleKey);
        // Garante que o mês aparece na tabela mesmo sem atribuições
        ensureMonth(key, d);
      });

    // Sort newest first, then work backwards from currentPortfolio to fill sizes
    const sorted = Array.from(map.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );

    let running = currentPortfolio;
    sorted.forEach((entry) => {
      entry.additions = addsByMonth.get(entry.key)?.size ?? 0;
      entry.removals = removesByMonth.get(entry.key)?.size ?? 0;
      entry.portfolioSize = running;
      entry.titlesCount = titlesByMonth.get(entry.key)?.size ?? 0;
      running = running - entry.additions + entry.removals;
    });

    return sorted;
  }, [assignmentRecords, currentPortfolio, collector, collections]);

  // Clientes que entraram na carteira no mês passado (documentos únicos).
  const lastMonthCount = useMemo(() => {
    if (!collector) return 0;
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const docs = new Set<string>();
    assignmentRecords.forEach((r) => {
      if (r.cobrador_novo_id !== collector.collectorId || !r.documento) return;
      const d = new Date(r.assigned_at);
      if (
        d.getFullYear() === lastMonth.getFullYear() &&
        d.getMonth() === lastMonth.getMonth()
      ) {
        docs.add(r.documento);
      }
    });
    return docs.size;
  }, [assignmentRecords, collector]);

  const lastMonthLabel = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Entre os clientes da carteira atual deste cobrador, quantos sao realmente
  // novos no sistema (criados no mes passado). Diferente de "entraram na
  // carteira", que inclui clientes transferidos de outro cobrador.
  const newInSystemLastMonth = useMemo(() => {
    if (!collector || newClientsLastMonthDocs.size === 0) return 0;
    const portfolioDocs = new Set(
      collections
        .filter((c) => c.user_id === collector.collectorId && c.documento)
        .map((c) => c.documento),
    );
    let count = 0;
    newClientsLastMonthDocs.forEach((doc) => {
      if (portfolioDocs.has(doc)) count++;
    });
    return count;
  }, [collector, collections, newClientsLastMonthDocs]);

  const carteiraAvailableYears = useMemo(() => {
    const years = new Set(portfolioByMonth.map((e) => e.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [portfolioByMonth]);

  const filteredPortfolioByMonth = useMemo(() => {
    if (carteiraYear === "all") return portfolioByMonth;
    return portfolioByMonth.filter((e) => e.year === carteiraYear);
  }, [portfolioByMonth, carteiraYear]);

  // Totais = soma das contagens mensais (documentos únicos por mês), para
  // bater exatamente com a soma das colunas +Entradas/−Saídas da tabela.
  const carteiraTotals = useMemo(() => {
    const totalAdditions = portfolioByMonth.reduce((s, e) => s + e.additions, 0);
    const totalRemovals = portfolioByMonth.reduce((s, e) => s + e.removals, 0);
    return { totalAdditions, totalRemovals };
  }, [portfolioByMonth]);

  if (!collector) return null;

  const tabs = [
    { id: "summary", name: "Resumo", icon: TrendingUp },
    { id: "history", name: "Histórico", icon: History },
    { id: "pending", name: "Pendências", icon: AlertCircle },
    { id: "carteira", name: "Carteira", icon: Users },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Desempenho: ${collector.collectorName}`}
      size="4xl"
      tallHeight
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Tab Navigation — sticky */}
        <div className="flex gap-1 px-6 border-b border-gray-100 dark:border-dark-border shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setHistoryPage(1);
                  setPendingPage(1);
                }}
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

        {/* Tab Content — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5">
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
                    {filteredHistory.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE).map((history, index) => (
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
                        {filteredHistory.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE).map((h, i) => (
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
                        {filteredHistory.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE).map((h, i) => (
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

                {filteredHistory.length > HISTORY_PER_PAGE && (
                  <Pagination
                    page={historyPage}
                    total={filteredHistory.length}
                    perPage={HISTORY_PER_PAGE}
                    onChange={setHistoryPage}
                  />
                )}
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
                          {pendingClients.slice((pendingPage - 1) * PENDING_PER_PAGE, pendingPage * PENDING_PER_PAGE).map((c) => (
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
                  {pendingClients.length > PENDING_PER_PAGE && (
                    <Pagination
                      page={pendingPage}
                      total={pendingClients.length}
                      perPage={PENDING_PER_PAGE}
                      onChange={setPendingPage}
                    />
                  )}
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
            {activeTab === "carteira" && (
              <div className="space-y-5 pb-4">
                {/* Cards de resumo */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="p-4 border border-blue-100 dark:border-blue-900/30 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users className="w-3.5 h-3.5 text-blue-500" />
                      <label className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Carteira Atual</label>
                    </div>
                    <p className="text-3xl font-black text-blue-600 dark:text-blue-400">{currentPortfolio}</p>
                    <p className="text-[9px] text-blue-400 mt-0.5">clientes únicos</p>
                  </div>
                  <div className="p-4 border border-green-100 dark:border-green-900/30 rounded-2xl bg-green-50/50 dark:bg-green-900/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <UserPlus className="w-3.5 h-3.5 text-green-500" />
                      <label className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest">Entraram na Carteira</label>
                    </div>
                    <p className="text-3xl font-black text-green-600 dark:text-green-400">{lastMonthCount}</p>
                    <p className="text-[9px] text-green-400 mt-0.5 capitalize">{lastMonthLabel}</p>
                  </div>
                  <div className="p-4 border border-cyan-100 dark:border-cyan-900/30 rounded-2xl bg-cyan-50/50 dark:bg-cyan-900/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                      <label className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest">Novos no Sistema</label>
                    </div>
                    <p className="text-3xl font-black text-cyan-600 dark:text-cyan-400">{newInSystemLastMonth}</p>
                    <p className="text-[9px] text-cyan-400 mt-0.5 capitalize">{lastMonthLabel}</p>
                  </div>
                  <div className="p-4 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl bg-emerald-50/50 dark:bg-emerald-900/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <UserPlus className="w-3.5 h-3.5 text-emerald-500" />
                      <label className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Total Entradas</label>
                    </div>
                    <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{carteiraTotals.totalAdditions}</p>
                    <p className="text-[9px] text-emerald-400 mt-0.5">desde o início</p>
                  </div>
                  <div className="p-4 border border-rose-100 dark:border-rose-900/30 rounded-2xl bg-rose-50/50 dark:bg-rose-900/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users className="w-3.5 h-3.5 text-rose-400" />
                      <label className="text-[9px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-widest">Total Saídas</label>
                    </div>
                    <p className="text-3xl font-black text-rose-500 dark:text-rose-400">{carteiraTotals.totalRemovals}</p>
                    <p className="text-[9px] text-rose-300 mt-0.5">desde o início</p>
                  </div>
                </div>

                {/* Histórico mensal cumulativo */}
                {portfolioByMonth.length > 0 ? (
                  <div>
                    {/* Filtro de ano */}
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">
                        Evolução da carteira por mês
                      </h4>
                      <div className="flex items-center gap-1 bg-gray-100 dark:bg-dark-bg rounded-xl p-0.5">
                        <button
                          onClick={() => setCarteiraYear("all")}
                          className={`text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${carteiraYear === "all" ? "bg-white dark:bg-dark-bg-secondary text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                        >
                          Todos
                        </button>
                        {carteiraAvailableYears.map((y) => (
                          <button
                            key={y}
                            onClick={() => setCarteiraYear(y)}
                            className={`text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${carteiraYear === y ? "bg-white dark:bg-dark-bg-secondary text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-hidden border border-gray-100 dark:border-dark-border rounded-2xl shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-dark-bg/50">
                          <tr>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mês</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Evolução</th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">Clientes</th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold text-purple-500 uppercase tracking-widest">Títulos</th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold text-green-500 uppercase tracking-widest">+Entradas</th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold text-rose-400 uppercase tracking-widest">−Saídas</th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Líquido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                          {(() => {
                            const maxSize = Math.max(...filteredPortfolioByMonth.map((e) => e.portfolioSize), 1);
                            return filteredPortfolioByMonth.map((entry) => {
                              const net = entry.additions - entry.removals;
                              return (
                                <tr key={entry.key} className="hover:bg-gray-50 dark:hover:bg-dark-bg/30 transition-colors">
                                  <td className="px-4 py-3 text-xs font-bold text-gray-700 dark:text-dark-text capitalize whitespace-nowrap">{entry.label}</td>
                                  <td className="px-4 py-3 w-32">
                                    <div className="w-full bg-gray-100 dark:bg-dark-bg-secondary rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className="h-full bg-blue-400 rounded-full transition-all duration-500"
                                        style={{ width: `${(entry.portfolioSize / maxSize) * 100}%` }}
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm font-black text-blue-600 dark:text-blue-400">{entry.portfolioSize}</td>
                                  <td className="px-4 py-3 text-right text-sm font-black text-purple-600 dark:text-purple-400">{entry.titlesCount > 0 ? entry.titlesCount : "—"}</td>
                                  <td className="px-4 py-3 text-right text-xs font-bold text-green-600 dark:text-green-400">
                                    {entry.additions > 0 ? `+${entry.additions}` : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs font-bold text-rose-500 dark:text-rose-400">
                                    {entry.removals > 0 ? `−${entry.removals}` : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs font-bold">
                                    <span className={net > 0 ? "text-emerald-600" : net < 0 ? "text-rose-500" : "text-gray-400"}>
                                      {net > 0 ? `+${net}` : net < 0 ? `${net}` : "—"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50 dark:bg-dark-bg/30 rounded-3xl border-2 border-dashed border-gray-100 dark:border-dark-border">
                    <Users className="w-10 h-10 text-gray-200 mb-4" />
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sem histórico</h3>
                    <p className="text-[10px] text-gray-400 mt-2">Nenhuma atribuição registrada para este cobrador ainda.</p>
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
