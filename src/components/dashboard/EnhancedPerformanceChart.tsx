import React, { useState, useMemo } from "react";
import { Users, Award, Filter, Download, FileText } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";

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
}

const EnhancedPerformanceChart: React.FC = () => {
  const { collections, users } = useCollection();
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [sortBy, setSortBy] = useState<
    "conversionRate" | "receivedAmount" | "totalSales"
  >("conversionRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [] = useState<Set<string>>(new Set());
  const [filterMinRate, setFilterMinRate] = useState<string>("");

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
        sale.totalValue += collection.valor_original;
        sale.receivedValue += collection.valor_recebido;
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

  // Estado para controlar filtros no mobile
  const [showFilters, setShowFilters] = useState(false);

  // Contador de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedPeriod !== "month") count++;
    if (filterMinRate) count++;
    return count;
  }, [selectedPeriod, filterMinRate]);

  return (
    <div className="space-y-4">
      {/* Header Simplificado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
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
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors relative"
            >
              <Filter className="h-5 w-5" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            <button
              onClick={exportPerformanceData}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-in slide-in-from-top-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Período
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="week">Última Semana</option>
                <option value="month">Último Mês</option>
                <option value="quarter">Último Trimestre</option>
                <option value="year">Último Ano</option>
                <option value="all">Todo Período</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Taxa Mínima (%)
              </label>
              <input
                type="number"
                value={filterMinRate}
                onChange={(e) => setFilterMinRate(e.target.value)}
                placeholder="Ex: 50"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
                max="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ordenar Por
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="conversionRate">Taxa de Conversão</option>
                <option value="receivedAmount">Valor Recebido</option>
                <option value="totalSales">Total de Vendas</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setSelectedPeriod("month");
                  setFilterMinRate("");
                  setSortBy("conversionRate");
                  setSortOrder("desc");
                }}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Limpar Filtros
              </button>
            </div>
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
                className={`bg-white rounded-lg border p-4 hover:shadow-md transition-shadow ${
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

                {/* Métricas Principais */}
                <div className="space-y-3">
                  {/* Taxa de Conversão com Barra de Progresso */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600">
                        Taxa de Conversão
                      </span>
                      <span className="text-lg font-bold text-gray-900">
                        {collector.conversionRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          collector.conversionRate >= 70
                            ? "bg-green-500"
                            : collector.conversionRate >= 40
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                        style={{
                          width: `${Math.min(collector.conversionRate, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Valor Recebido */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Valor Recebido
                    </span>
                    <span className="text-lg font-bold text-green-600 sm:block hidden">
                      {formatCurrency(collector.receivedAmount)}
                    </span>
                    <div className="text-lg font-bold text-green-600 sm:hidden">
                      {collector.receivedAmount < 10000
                        ? formatCurrency(
                            collector.receivedAmount,
                            false,
                          ).replace(/,\d{2}$/, "")
                        : `R$ ${Math.floor(collector.receivedAmount / 1000)}k`}
                    </div>
                  </div>

                  {/* Estatísticas Resumidas */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
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
              </div>
            );
          })}
        </div>
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
