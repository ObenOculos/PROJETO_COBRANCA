import React, { useState, useMemo } from "react";
import { Users, Award, Filter, Download, FileText, Eye, Target, Calendar, X } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import CollectorPerformanceModal from "./CollectorPerformanceModal";
import MonthlyGoalEditModal from './MonthlyGoalEditModal';
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
}

const EnhancedPerformanceChart: React.FC = () => {
  const { collections, users, monthlyGoals, salePayments, scheduledVisits, refreshData } = useCollection();
    const [showFilters, setShowFilters] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]); // Initialized as empty
  const [selectedYears, setSelectedYears] = useState<number[]>([]); // Initialized as empty
  const [sortBy, setSortBy] = useState<
    "conversionRate" | "receivedAmount" | "totalSales"
  >("conversionRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterMinRate, setFilterMinRate] = useState<string>("");
  const [selectedCollector, setSelectedCollector] =
    useState<EnhancedCollectorPerformance | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [selectedCollectorForGoals, setSelectedCollectorForGoals] = useState<User | null>(null);

  const monthsDisplay = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  const currentYear = new Date().getFullYear();
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

      const monthMatches = selectedMonths.length === 0 || selectedMonths.includes(dateMonth);
      const yearMatches = selectedYears.length === 0 || selectedYears.includes(dateYear);

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
      const currentMonthGoals = monthlyGoals.filter(
        (g) => {
          const goalDate = new Date(g.month);
          const monthMatches = selectedMonths.length === 0 || selectedMonths.includes(goalDate.getMonth());
          const yearMatches = selectedYears.length === 0 || selectedYears.includes(goalDate.getFullYear());
          return monthMatches && yearMatches && g.user_id === collector.id;
        }
      );

      const currentMonthVisitsGoal = currentMonthGoals.reduce((sum, goal) => sum + (goal.visits_goal ?? 0), 0);
      const currentMonthPaymentsGoal = currentMonthGoals.reduce((sum, goal) => sum + (goal.payments_goal ?? 0), 0);

      const currentMonthVisitsActual = scheduledVisits.filter((v) => {
        if (v.collectorId !== collector.id || v.status !== "realizada") {
          return false;
        }
        const dateStr = v.dataVisitaRealizada || v.scheduledDate;
        if (!dateStr) return false;

        // Fix: Use UTC parsing to avoid timezone issues
        const visitDate = new Date(dateStr + 'T00:00:00');
        return isDateInSelectedMonths(visitDate);
      }).length; // Closing for scheduledVisits.filter

      const currentMonthPaymentsActual = salePayments
        .filter((p) => {
          if (p.collectorId !== collector.id || !p.paymentDate) {
            return false;
          }
          const paymentDate = new Date(p.paymentDate + 'T00:00:00');
          return isDateInSelectedMonths(paymentDate);
        }) // Closing for salePayments.filter
        .reduce((sum, p) => sum + p.paymentAmount, 0); // Closing for reduce

      const visitsPerformance = currentMonthVisitsGoal > 0 ? (currentMonthVisitsActual / currentMonthVisitsGoal) * 100 : 0;
      const paymentsPerformance = currentMonthPaymentsGoal > 0 ? (currentMonthPaymentsActual / currentMonthPaymentsGoal) * 100 : 0;

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
      };
    });
  }, [collections, users, monthlyGoals, salePayments, scheduledVisits, selectedMonths, selectedYears]);

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

  

  const activeFilterCount = selectedMonths.length + selectedYears.length + (filterMinRate ? 1 : 0);
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
                  Meses ({selectedMonths.length} selecionado{selectedMonths.length !== 1 ? 's' : ''})
                </label>
              </div>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                {monthsDisplay.map((month, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (selectedMonths.includes(index)) {
                        setSelectedMonths(selectedMonths.filter(m => m !== index));
                      } else {
                        setSelectedMonths([...selectedMonths, index]);
                      }
                    }}
                    className={`
                      px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-2
                      ${selectedMonths.includes(index)
                        ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
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
                Anos ({selectedYears.length} selecionado{selectedYears.length !== 1 ? 's' : ''})
              </label>
              <div className="flex flex-wrap gap-2">
                {years.map((year) => (
                  <button
                    key={year}
                    onClick={() => {
                      if (selectedYears.includes(year)) {
                        setSelectedYears(selectedYears.filter(y => y !== year));
                      } else {
                        setSelectedYears([...selectedYears, year]);
                      }
                    }}
                    className={`
                      px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-2
                      ${selectedYears.includes(year)
                        ? 'bg-green-500 text-white border-green-500 shadow-md transform scale-102'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
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
                  ${hasActiveFilters
                    ? 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
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

      {/* Resumo dos Filtros Ativos (quando colapsado) */}
      {!showFilters && hasActiveFilters && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filtros ativos:</span>
              <div className="flex gap-1">
                {selectedMonths.length > 0 && (
                  <span className="bg-blue-200 px-2 py-1 rounded-lg text-xs">
                    {selectedMonths.length} mês{selectedMonths.length !== 1 ? 'es' : ''}
                  </span>
                )}
                {selectedYears.length > 0 && (
                  <span className="bg-green-200 px-2 py-1 rounded-lg text-xs">
                    {selectedYears.length} ano{selectedYears.length !== 1 ? 's' : ''}
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

      {/* Ranking de Cobradores - Design Simplificado */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Ranking de Cobradores
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setSortOrder(sortOrder === "desc" ? "asc" : "desc")
              }
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {sortOrder === "desc" ? "↓ Maior primeiro" : "↑ Menor primeiro"}
            </button>
          </div>
        </div>

        {/* Cards Simplificados */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedPerformance.map((collector, index) => {
            const isTopPerformer = index === 0 && sortOrder === "desc";
            const rankingPosition = index + 1;

            return (
              <div
                key={collector.collectorId}
                className={`bg-white rounded-2xl border p-4 hover:shadow-md transition-shadow ${
                  isTopPerformer
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        rankingPosition <= 3
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {rankingPosition}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {collector.collectorName}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {collector.totalSales} vendas
                      </p>
                    </div>
                  </div>
                  {isTopPerformer && (
                    <Award className="h-5 w-5 text-blue-600" />
                  )}
                </div>

                {/* Métricas de Metas Mensais */}
                <div className="space-y-3">
                  {/* Meta de Visitas */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600">Meta de Visitas (Mês)</span>
                      <span className="text-sm font-bold text-gray-800">
                        {collector.currentMonthVisitsActual} / {collector.currentMonthVisitsGoal}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${Math.min(100, collector.visitsPerformance)}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta de Pagamentos */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600">Meta de Pagamentos (Mês)</span>
                      <span className="text-sm font-bold text-gray-800">
                        {formatCurrency(collector.currentMonthPaymentsActual)} / {formatCurrency(collector.currentMonthPaymentsGoal)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${Math.min(100, collector.paymentsPerformance)}%` }}
                      />
                    </div>
                  </div>

                  {/* Estatísticas Resumidas */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 mt-3">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Finalizadas</p>
                      <p className="text-sm font-semibold text-gray-700">
                        {collector.completedSales}/{collector.totalSales}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Ticket Médio</p>
                      <p className="text-sm font-semibold text-gray-700">
                        {formatCurrency(collector.averageTicket)}
                      </p>
                    </div>
                  </div>
                </div>


                {/* Botões de Ação */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setSelectedCollector(collector);
                      setIsModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors text-sm font-medium"
                  >
                    <Eye size={16} />
                    Detalhes
                  </button>
                  <button
                    onClick={() => {
                      const user = users.find(u => u.id === collector.collectorId);
                      if (user) {
                        setSelectedCollectorForGoals(user);
                        setIsGoalModalOpen(true);
                      }
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-200 transition-colors text-sm font-medium"
                  >
                    <Target size={16} />
                    Metas
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
