import React, { useState, useMemo } from "react";
import {
  Users,
  Award,
  Filter,
  Download,
  FileText,
  Eye,
  Target,
  Calendar,
  X,
  ChevronUp,
  ChevronDown,
  Trophy,
  BarChart3,
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
  completedSales: number;
  pendingSales: number;
  clientsWithPending: number;
  totalAmount: number;
  receivedAmount: number;
  conversionRate: number;
  averageTicket: number;
  efficiency: number;
  clientsCount: number;
  visitsPerformance: number;
  paymentsPerformance: number;
  currentMonthVisitsActual: number;
  currentMonthVisitsGoal: number;
  currentMonthPaymentsActual: number;
  currentMonthPaymentsGoal: number;
  totalAssignedClients: number; // New
  visitedClientsInSelectedMonths: number; // New
  clientVisitEfficiency: number; // New
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
  const currentMonth = new Date().getMonth(); // 0-indexed
  const currentYear = new Date().getFullYear();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([
    currentMonth,
  ]);
  const [selectedYears, setSelectedYears] = useState<number[]>([currentYear]);
  const [sortBy, setSortBy] = useState<
    "conversionRate" | "receivedAmount" | "totalSales"
  >("conversionRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterMinRate, setFilterMinRate] = useState<string>("");
  const [selectedCollector, setSelectedCollector] =
    useState<EnhancedCollectorPerformance | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [selectedCollectorForGoals, setSelectedCollectorForGoals] =
    useState<User | null>(null);

  const monthsDisplay = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Função auxiliar para converter números em extenso
  const numeroParaExtenso = (num: number): string => {
    const unidades = [
      "",
      "um",
      "dois",
      "três",
      "quatro",
      "cinco",
      "seis",
      "sete",
      "oito",
      "nove",
    ];
    const dezenas = [
      "",
      "",
      "vinte",
      "trinta",
      "quarenta",
      "cinquenta",
      "sessenta",
      "setenta",
      "oitenta",
      "noventa",
    ];
    const dezenasEspeciais = [
      "dez",
      "onze",
      "doze",
      "treze",
      "quatorze",
      "quinze",
      "dezesseis",
      "dezessete",
      "dezoito",
      "dezenove",
    ];
    const centenas = [
      "",
      "cento",
      "duzentos",
      "trezentos",
      "quatrocentos",
      "quinhentos",
      "seiscentos",
      "setecentos",
      "oitocentos",
      "novecentos",
    ];

    if (num === 0) return "zero";
    if (num === 100) return "cem";
    if (num === 1000) return "mil";

    const partes = [];

    // Centenas
    const c = Math.floor(num / 100);
    if (c > 0) {
      partes.push(centenas[c]);
    }

    // Dezenas e unidades
    const resto = num % 100;
    if (resto >= 10 && resto <= 19) {
      partes.push(dezenasEspeciais[resto - 10]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d > 0) partes.push(dezenas[d]);
      if (u > 0) partes.push(unidades[u]);
    }

    return partes.join(" e ");
  };

  // Função para formatar valores grandes em mobile
  const formatMobileCurrency = (value: number) => {
    const isMobile = window.innerWidth < 640; // Tailwind sm breakpoint

    if (!isMobile) {
      return formatCurrency(value, false);
    }

    const intValue = Math.floor(value);

    if (intValue === 0) {
      return "R$ 0";
    }

    // Determinar a escala e formatar
    let mainValue = "";
    let extensoParts = [];

    if (intValue >= 1000000) {
      // Milhões
      const milhoes = Math.floor(intValue / 1000000);
      const resto = intValue % 1000000;
      mainValue = `R$ ${milhoes}M`;

      if (resto > 0) {
        const milRestantes = Math.floor(resto / 1000);
        const unidadesRestantes = resto % 1000;

        if (milRestantes > 0) {
          const milExtenso = numeroParaExtenso(milRestantes);
          extensoParts.push(`${milExtenso} mil`);
        }

        if (unidadesRestantes > 0) {
          const unidadesExtenso = numeroParaExtenso(unidadesRestantes);
          extensoParts.push(`${unidadesExtenso} reais`);
        } else if (extensoParts.length > 0) {
          extensoParts.push("reais");
        }
      }
    } else if (intValue >= 10000) {
      // Dezenas de milhares
      const mil = Math.floor(intValue / 1000);
      const resto = intValue % 1000;
      mainValue = `R$ ${mil} mil`;

      if (resto > 0) {
        const restoExtenso = numeroParaExtenso(resto);
        extensoParts.push(`${restoExtenso} reais`);
      }
    } else if (intValue >= 1000) {
      // Milhares
      const mil = Math.floor(intValue / 1000);
      const resto = intValue % 1000;
      mainValue = `R$ ${mil} mil`;

      if (resto > 0) {
        const restoExtenso = numeroParaExtenso(resto);
        extensoParts.push(`${restoExtenso} reais`);
      }
    } else {
      // Menos de mil
      return `R$ ${intValue}`;
    }

    const extensoText = extensoParts.join(" e ");

    return (
      <div className="flex flex-col items-start">
        <span className="text-2xl font-semibold">{mainValue}</span>
        {extensoText && (
          <span className="text-xs text-blue-200 opacity-90">
            {extensoText}
          </span>
        )}
      </div>
    );
  };

  // Calculate enhanced performance data
  const enhancedPerformance = useMemo((): EnhancedCollectorPerformance[] => {
    const collectors = users.filter((u) => u.type === "collector");

    const isDateInSelectedMonths = (date: Date) => {
      const dateMonth = date.getUTCMonth(); // 0-indexed
      const dateYear = date.getUTCFullYear();

      const monthMatches =
        selectedMonths.length === 0 || selectedMonths.includes(dateMonth);
      const yearMatches =
        selectedYears.length === 0 || selectedYears.includes(dateYear);

      return monthMatches && yearMatches;
    };

    return collectors.map((collector) => {
      const collectorCollections = collections.filter(
        (c) => c.user_id === collector.id,
      );

      // Simplified - Group by sale to count correctly
      const salesMap = new Map<
        string,
        {
          totalValue: number;
          receivedValue: number;
          isPending: boolean;
          clientDocument: string;
        }
      >();

      collectorCollections.forEach((collection) => {
        const saleKey = `${collection.venda_n}-${collection.documento}`;
        if (!salesMap.has(saleKey)) {
          salesMap.set(saleKey, {
            totalValue: 0,
            receivedValue: 0,
            isPending: false,
            clientDocument: collection.documento || "",
          });
        }

        const sale = salesMap.get(saleKey)!;
        sale.totalValue =
          Number(sale.totalValue) + Number(collection.valor_original);
        sale.receivedValue =
          Number(sale.receivedValue) + Number(collection.valor_recebido);
      });

      // Determine if each sale is pending
      salesMap.forEach((sale) => {
        const pendingValue = Math.max(0, sale.totalValue - sale.receivedValue);
        sale.isPending = pendingValue > 0.01;
      });

      const salesArray = Array.from(salesMap.values());
      const totalSales = salesArray.length;
      const completedSales = salesArray.filter((s) => !s.isPending).length;
      const pendingSales = salesArray.filter((s) => s.isPending).length;
      const clientsWithPending = new Set(
        salesArray
          .filter((s) => s.isPending)
          .map((s) => s.clientDocument)
          .filter(Boolean),
      ).size;
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

      // Goal performance calculation
      const currentMonthGoals = monthlyGoals.filter((g) => {
        const goalDate = new Date(g.month + "T00:00:00");
        return (
          selectedMonths.includes(goalDate.getUTCMonth()) &&
          selectedYears.includes(goalDate.getUTCFullYear()) &&
          g.user_id === collector.id
        );
      });

      const currentMonthVisitsGoal = currentMonthGoals.reduce(
        (sum, goal) => sum + (goal.visits_goal ?? 0),
        0,
      );
      const currentMonthPaymentsGoal = currentMonthGoals.reduce(
        (sum, goal) => sum + (goal.payments_goal ?? 0),
        0,
      );

      const currentMonthVisitsActual = scheduledVisits.filter((v) => {
        if (v.collectorId !== collector.id || v.status !== "realizada") {
          return false;
        }
        const dateStr = v.dataVisitaRealizada || v.scheduledDate;
        if (!dateStr) return false;

        // Fix: Use UTC parsing to avoid timezone issues
        const visitDate = new Date(dateStr + "T00:00:00");
        return isDateInSelectedMonths(visitDate);
      }).length; // Closing for scheduledVisits.filter

      const currentMonthPaymentsActual = salePayments
        .filter((p) => {
          if (p.collectorId !== collector.id || !p.paymentDate) {
            return false;
          }
          const paymentDate = new Date(p.paymentDate + "T00:00:00");
          return isDateInSelectedMonths(paymentDate);
        }) // Closing for salePayments.filter
        .reduce((sum, p) => sum + p.paymentAmount, 0); // Closing for reduce

      const visitsPerformance =
        currentMonthVisitsGoal > 0
          ? (currentMonthVisitsActual / currentMonthVisitsGoal) * 100
          : 0;
      const paymentsPerformance =
        currentMonthPaymentsGoal > 0
          ? (currentMonthPaymentsActual / currentMonthPaymentsGoal) * 100
          : 0;

      // New: Calculate client visit efficiency
      const allAssignedClients = new Set(
        collections
          .filter((c) => c.user_id === collector.id)
          .map((c) => c.documento)
          .filter(Boolean),
      ).size;

      const visitedClients = new Set(
        scheduledVisits
          .filter(
            (v) =>
              v.collectorId === collector.id &&
              v.status === "realizada" &&
              isDateInSelectedMonths(
                new Date(v.dataVisitaRealizada + "T00:00:00"),
              ),
          )
          .map((v) => v.clientDocument)
          .filter(Boolean),
      ).size;

      const clientVisitEfficiency =
        allAssignedClients > 0
          ? (visitedClients / allAssignedClients) * 100
          : 0;

      return {
        collectorId: collector.id,
        collectorName: collector.name,
        totalSales,
        completedSales,
        pendingSales,
        clientsWithPending,
        totalAmount,
        receivedAmount,
        conversionRate,
        averageTicket,
        efficiency,
        clientsCount,
        visitsPerformance,
        paymentsPerformance,
        currentMonthVisitsActual,
        currentMonthVisitsGoal,
        currentMonthPaymentsActual,
        currentMonthPaymentsGoal,
        totalAssignedClients: allAssignedClients, // New
        visitedClientsInSelectedMonths: visitedClients, // New
        clientVisitEfficiency, // New
      };
    });
  }, [
    collections,
    users,
    monthlyGoals,
    salePayments,
    scheduledVisits,
    selectedMonths,
    selectedYears,
  ]);

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

  const exportPerformanceData = () => {
    // Headers with better formatting
    const headers = [
      "Cobrador",
      "Total de Vendas",
      "Vendas Finalizadas",
      "Vendas Pendentes",
      "Clientes com Pendências",
      "Taxa de Conversão (%)",
      "Valor Total (R$)",
      "Valor Recebido (R$)",
      "Valor Pendente (R$)",
      "Eficiência (%)",
      "Ticket Médio (R$)",
      "Total de Clientes",
      "Ranking Taxa",
      "Ranking Valor",
    ];

    // Data rows with proper formatting
    const rows = filteredAndSortedPerformance.map((p) => {
      const pendingAmount = p.totalAmount - p.receivedAmount;
      const conversionRanking =
        enhancedPerformance
          .sort((a, b) => b.conversionRate - a.conversionRate)
          .findIndex((collector) => collector.collectorId === p.collectorId) +
        1;
      const valueRanking =
        enhancedPerformance
          .sort((a, b) => b.receivedAmount - a.receivedAmount)
          .findIndex((collector) => collector.collectorId === p.collectorId) +
        1;

      return [
        p.collectorName,
        p.totalSales.toString(),
        p.completedSales.toString(),
        p.pendingSales.toString(),
        p.clientsWithPending.toString(),
        p.conversionRate.toFixed(1),
        p.totalAmount.toFixed(2),
        p.receivedAmount.toFixed(2),
        pendingAmount.toFixed(2),
        p.efficiency.toFixed(1),
        p.averageTicket.toFixed(2),
        p.clientsCount.toString(),
        conversionRanking.toString(),
        valueRanking.toString(),
      ];
    });

    // Create CSV content with proper encoding
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            const escaped = cell.toString().replace(/"/g, '""');
            return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
          })
          .join(","),
      ),
    ].join("\n");

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `desempenho-cobradores-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const activeFilterCount =
    selectedMonths.length + selectedYears.length + (filterMinRate ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="space-y-4">
      {/* Header Simplificado */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
              <FileText className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
              Análise de Desempenho
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Ranking de vendas por cobrador
            </p>
          </div>

          {/* Ações Principais */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="relative flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <Filter className="w-4 h-4" />
              {hasActiveFilters && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white ring-2 ring-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              onClick={exportPerformanceData}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors"
              title="Exportar"
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Card Principal - Taxa de Conversão Média */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm font-medium">
              Taxa de Conversão Média
            </p>
            <p className="text-4xl font-bold mt-1">
              {teamStats.avgConversionRate.toFixed(1)}%
            </p>
            <p className="text-blue-100 text-sm mt-2">
              {enhancedPerformance.length} cobradores ativos
            </p>
          </div>
          <Award className="h-16 w-16 text-blue-200 opacity-50" />
        </div>

        {/* Métricas secundárias */}
        <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-4 mt-6 pt-6 border-t border-blue-400">
          <div>
            <p className="text-blue-100 text-xs">Vendas</p>
            <p className="text-2xl font-semibold">{teamStats.totalSales}</p>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Recebido</p>
            <div className="text-2xl font-semibold">
              {formatMobileCurrency(teamStats.totalReceived)}
            </div>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Eficiência</p>
            <p className="text-2xl font-semibold">
              {teamStats.teamEfficiency.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Filtros Colapsáveis */}
      {showFilters && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 animate-in slide-in-from-top-2">
          <div className="space-y-6">
            {/* Filtro de Meses */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-gray-500" />
                <label className="text-sm font-semibold text-gray-700">
                  Meses ({selectedMonths.length} selecionado
                  {selectedMonths.length !== 1 ? "s" : ""})
                </label>
              </div>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                {monthsDisplay.map((month, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (selectedMonths.includes(index)) {
                        setSelectedMonths(
                          selectedMonths.filter((m) => m !== index),
                        );
                      } else {
                        setSelectedMonths([...selectedMonths, index]);
                      }
                    }}
                    className={`
                      px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-2
                      ${
                        selectedMonths.includes(index)
                          ? "bg-blue-500 text-white border-blue-500 shadow-md"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                      }
                    `}
                  >
                    {month}
                  </button>
                ))}
              </div>
              {selectedMonths.length > 0 && (
                <button
                  onClick={() => setSelectedMonths([])}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-2"
                >
                  <X className="w-3 h-3" />
                  Limpar meses
                </button>
              )}
            </div>

            {/* Filtro de Anos */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Anos ({selectedYears.length} selecionado
                {selectedYears.length !== 1 ? "s" : ""})
              </label>
              <div className="flex flex-wrap gap-2">
                {years.map((year) => (
                  <button
                    key={year}
                    onClick={() => {
                      if (selectedYears.includes(year)) {
                        setSelectedYears(
                          selectedYears.filter((y) => y !== year),
                        );
                      } else {
                        setSelectedYears([...selectedYears, year]);
                      }
                    }}
                    className={`
                      px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-2
                      ${
                        selectedYears.includes(year)
                          ? "bg-green-500 text-white border-green-500 shadow-md transform scale-102"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                      }
                    `}
                  >
                    {year}
                  </button>
                ))}
              </div>
              {selectedYears.length > 0 && (
                <button
                  onClick={() => setSelectedYears([])}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Limpar anos
                </button>
              )}
            </div>

            {/* Linha divisória */}
            <div className="border-t border-gray-200"></div>

            {/* Controles de Ordenação e Taxa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Ordenar Por
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-gray-50"
                >
                  <option value="conversionRate">Taxa de Conversão</option>
                  <option value="receivedAmount">Valor Recebido</option>
                  <option value="totalSales">Total de Vendas</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Taxa Mínima (%)
                </label>
                <input
                  type="number"
                  value={filterMinRate}
                  onChange={(e) => setFilterMinRate(e.target.value)}
                  placeholder="Ex: 5.5"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-gray-50"
                />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => {
                  setSelectedMonths([]);
                  setSelectedYears([]);
                  setFilterMinRate("");
                  setSortBy("conversionRate");
                  setSortOrder("desc");
                }}
                disabled={!hasActiveFilters}
                className={`
                  flex-1 px-6 py-3 rounded-xl font-medium transition-all duration-200 border-2
                  ${
                    hasActiveFilters
                      ? "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                      : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                  }
                `}
              >
                Limpar Filtros
              </button>

              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 sm:hidden px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium border-2 border-blue-600"
              >
                Aplicar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* o nome exato */}
      {!showFilters && hasActiveFilters && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filtros ativos:</span>
              <div className="flex gap-1">
                {selectedMonths.length > 0 && (
                  <span className="bg-blue-200 px-2 py-1 rounded-lg text-xs">
                    {selectedMonths.map((m) => monthsDisplay[m]).join(", ")}
                  </span>
                )}
                {selectedYears.length > 0 && (
                  <span className="bg-green-200 px-2 py-1 rounded-lg text-xs">
                    {selectedYears.join(", ")}
                  </span>
                )}
                {filterMinRate && (
                  <span className="bg-purple-200 px-2 py-1 rounded-lg text-xs">
                    Taxa ≥ {filterMinRate}%
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedMonths([]);
                setSelectedYears([]);
                setFilterMinRate("");
                setSortBy("conversionRate");
                setSortOrder("desc");
              }}
              className="text-blue-600 hover:text-blue-800 transition-colors"
              title="Limpar todos os filtros"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Ranking de Cobradores - Design Responsivo com Melhor Affordance */}
      <div className="space-y-4 sm:space-y-6">
        {/* Header responsivo */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">
              Ranking de Cobradores
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Performance dos cobradores no período selecionado
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="text-xs text-gray-500 font-medium hidden sm:inline">
              ORDENAR POR:
            </span>
            <button
              onClick={() =>
                setSortOrder(sortOrder === "desc" ? "asc" : "desc")
              }
              className="flex items-center justify-center sm:justify-start gap-2 px-3 py-2.5 sm:py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 shadow-sm hover:shadow-md w-full sm:w-auto"
            >
              <span className="text-sm font-medium text-gray-700">
                {sortOrder === "desc"
                  ? "Maior Performance"
                  : "Menor Performance"}
              </span>
              <div className="flex flex-col">
                <ChevronUp
                  className={`h-3 w-3 ${sortOrder === "asc" ? "text-blue-600" : "text-gray-400"}`}
                />
                <ChevronDown
                  className={`h-3 w-3 ${sortOrder === "desc" ? "text-blue-600" : "text-gray-400"}`}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Grid responsivo - Mobile first */}
        <div className="space-y-4 sm:space-y-0 sm:grid sm:gap-4 md:gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2">
          {filteredAndSortedPerformance.map((collector, index) => {
            const isTopPerformer = index === 0 && sortOrder === "desc";
            const rankingPosition = index + 1;

            return (
              <div
                key={collector.collectorId}
                className={`group relative bg-white rounded-xl sm:rounded-2xl border-2 p-4 sm:p-6 transition-all duration-300 hover:shadow-lg sm:hover:-translate-y-1 cursor-pointer ${
                  isTopPerformer
                    ? "border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-md"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {/* Badge de Posição adaptado para mobile */}
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div
                      className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-base sm:text-lg font-bold shadow-sm ${
                        rankingPosition === 1
                          ? "bg-gradient-to-r from-yellow-400 to-orange-400 text-white"
                          : rankingPosition === 2
                            ? "bg-gradient-to-r from-gray-400 to-gray-500 text-white"
                            : rankingPosition === 3
                              ? "bg-gradient-to-r from-orange-400 to-red-400 text-white"
                              : "bg-gray-100 text-gray-600 border-2 border-gray-300"
                      }`}
                    >
                      {rankingPosition <= 3 && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                          <Trophy className="h-2.5 w-2.5 text-yellow-600" />
                        </div>
                      )}
                      {rankingPosition}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 text-base sm:text-lg truncate">
                        {collector.collectorName}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500 flex-shrink-0" />
                          <span className="text-xs sm:text-sm text-gray-600 font-medium">
                            {collector.totalSales} vendas
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {isTopPerformer && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                      <Award className="h-3 w-3 sm:h-5 sm:w-5 text-white" />
                    </div>
                  )}
                </div>

                {/* Métricas adaptadas para mobile */}
                <div className="space-y-3 sm:space-y-4">
                  {/* Meta de Visitas - Layout mobile otimizado */}
                  <div className="bg-white/80 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 truncate">
                          Visitas do Mês
                        </span>
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-md sm:rounded-lg whitespace-nowrap ml-2">
                        {collector.currentMonthVisitsActual} /{" "}
                        {collector.currentMonthVisitsGoal}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 shadow-inner">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 sm:h-3 rounded-full shadow-sm transition-all duration-500"
                        style={{
                          width: `${Math.min(100, collector.visitsPerformance)}%`,
                        }}
                      />
                    </div>
                    <div className="text-right mt-1">
                      <span className="text-xs font-medium text-gray-600">
                        {collector.visitsPerformance.toFixed(1)}% concluído
                      </span>
                    </div>
                  </div>

                  {/* Meta de Pagamentos - Layout mobile otimizado */}
                  <div className="bg-white/80 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 truncate">
                          Pagamentos do Mês
                        </span>
                      </div>
                    </div>
                    {/* Valores em linha separada no mobile */}
                    <div className="mb-2">
                      <span className="text-xs sm:text-sm font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-md sm:rounded-lg block sm:inline w-fit">
                        {formatCurrency(collector.currentMonthPaymentsActual)} /{" "}
                        {formatCurrency(collector.currentMonthPaymentsGoal)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 shadow-inner">
                      <div
                        className="bg-gradient-to-r from-green-500 to-green-600 h-2 sm:h-3 rounded-full shadow-sm transition-all duration-500"
                        style={{
                          width: `${Math.min(100, collector.paymentsPerformance)}%`,
                        }}
                      />
                    </div>
                    <div className="text-right mt-1">
                      <span className="text-xs font-medium text-gray-600">
                        {collector.paymentsPerformance.toFixed(1)}% da meta
                      </span>
                    </div>
                  </div>

                  {/* Estatísticas em grid responsivo */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-100">
                    <div className="text-center bg-gray-50 rounded-lg p-2 sm:p-3 flex flex-col justify-center">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                        Finalizadas
                      </p>
                      <p className="text-sm sm:text-lg font-bold text-gray-800 mt-1">
                        {collector.completedSales}
                        <span className="text-xs sm:text-sm text-gray-500 font-normal">
                          /{collector.totalSales}
                        </span>
                      </p>
                    </div>
                    <div className="text-center bg-gray-50 rounded-lg p-2 sm:p-3 flex flex-col justify-center">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                        Ticket Médio
                      </p>
                      <p
                        className="text-sm sm:text-lg font-bold text-gray-800 mt-1 truncate"
                        title={formatCurrency(collector.averageTicket)}
                      >
                        {formatCurrency(collector.averageTicket)}
                      </p>
                    </div>
                    {/* Aproveitamento simplificado */}
                    <div className="col-span-2 sm:col-span-1 text-center bg-gray-50 rounded-lg p-2 sm:p-3 flex flex-col justify-center">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                        <span className="hidden sm:inline">Aproveitamento</span>
                        <span className="inline sm:hidden" title="Aproveitamento">Aprov.</span>
                      </p>
                      <p className="text-sm sm:text-lg font-bold text-gray-800 mt-1">
                        {collector.clientVisitEfficiency.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {collector.visitedClientsInSelectedMonths} de{" "}
                        {collector.totalAssignedClients} clientes
                      </p>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação otimizados para mobile */}
                <div className="mt-4 sm:mt-6 flex flex-col sm:grid sm:grid-cols-2 gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      setSelectedCollector(collector);
                      setIsModalOpen(true);
                    }}
                    className="group flex items-center justify-center gap-2 px-4 py-3 sm:py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium text-sm transform active:scale-95 sm:hover:scale-105 w-full order-1"
                  >
                    <Eye
                      size={18}
                      className="group-hover:scale-110 transition-transform flex-shrink-0"
                    />
                    <span>Ver Detalhes</span>
                  </button>
                  <button
                    onClick={() => {
                      const user = users.find(
                        (u) => u.id === collector.collectorId,
                      );
                      if (user) {
                        setSelectedCollectorForGoals(user);
                        setIsGoalModalOpen(true);
                      }
                    }}
                    className="group flex items-center justify-center gap-2 px-4 py-3 sm:py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium text-sm transform active:scale-95 sm:hover:scale-105 w-full order-2"
                  >
                    <Target
                      size={18}
                      className="group-hover:scale-110 transition-transform flex-shrink-0"
                    />
                    <span>Definir Metas</span>
                  </button>
                </div>

                {/* Indicador de hover adaptado */}
                <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
              </div>
            );
          })}
        </div>

        {/* Estado vazio responsivo */}
        {filteredAndSortedPerformance.length === 0 && (
          <div className="text-center py-8 sm:py-12 px-4">
            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
            </div>
            <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2">
              Nenhum cobrador encontrado
            </h4>
            <p className="text-sm sm:text-base text-gray-500">
              Ajuste os filtros para visualizar os cobradores
            </p>
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredAndSortedPerformance.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum cobrador encontrado
          </h3>
          <p className="text-gray-600">
            Não há cobradores que atendam aos filtros selecionados.
          </p>
        </div>
      )}

      <CollectorPerformanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        collector={selectedCollector}
      />
      <MonthlyGoalEditModal
        isOpen={isGoalModalOpen}
        onClose={() => {
          setIsGoalModalOpen(false);
          refreshData(); // Trigger data refresh
        }}
        collector={selectedCollectorForGoals}
      />
    </div>
  );
};

export default EnhancedPerformanceChart;
