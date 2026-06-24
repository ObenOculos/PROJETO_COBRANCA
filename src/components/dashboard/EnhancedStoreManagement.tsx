import React, { useState, useMemo } from "react";
import {
  Store,
  AlertCircle,
  CheckCircle,
  Download,
  BarChart3,
  Building,
  ChevronDown,
  ChevronUp,
  FileText,
  DollarSign,
  Award,
  MapPin,
  X,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import FilterBar from "../common/FilterBar";
import { FilterOptions, isCollectorType } from "../../types";

interface StoreStats {
  storeName: string;
  city: string;
  assignedCollector: string;
  collectorName: string;
  isFormalAssignment: boolean;
  totalCollections: number;
  totalSales: number;
  completedSales: number;
  pendingSales: number;
  clientsWithPending: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  conversionRate: number;
  efficiency: number;
  averageTicket: number;
  clientsCount: number;
}

const EnhancedStoreManagement: React.FC = () => {
  const { users, collections, getAvailableStores, getFilteredCollections, loading } =
    useCollection();

  // Filtros compartilhados (status, cidade, vencimento, lancamento, valor) que
  // refinam a fonte de dados das lojas.
  const [filters, setFilters] = useState<FilterOptions>({});
  const sourceCollections = useMemo(
    () => getFilteredCollections(filters, "manager"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, collections],
  );

  const [sortBy, setSortBy] = useState<
    "storeName" | "conversionRate" | "totalAmount"
  >("storeName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedStoreForModal, setSelectedStoreForModal] =
    useState<StoreStats | null>(null);

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const collectors = users.filter((u) => isCollectorType(u.type));
  const availableStores = getAvailableStores();

  // Calculate store statistics
  const storeStats = useMemo((): StoreStats[] => {
    const stats: StoreStats[] = [];

    availableStores.forEach((storeName) => {
      const periodCollections = sourceCollections.filter(c => c.nome_da_loja === storeName);

      if (periodCollections.length === 0) return;

      const salesMap = new Map<string, {
        totalValue: number;
        paidValue: number;
        discountValue: number;
        clientDocument: string;
      }>();

      periodCollections.forEach(c => {
        const key = `${c.venda_n}:::${c.documento}`;
        if (!salesMap.has(key)) {
          salesMap.set(key, { totalValue: 0, paidValue: 0, discountValue: 0, clientDocument: c.documento || "" });
        }
        const s = salesMap.get(key)!;
        s.totalValue += Number(c.valor_original || 0);
        s.paidValue += Number(c.valor_recebido || 0);
        s.discountValue += Number(c.desconto || 0);
      });

      const salesArray = Array.from(salesMap.values());

      // TOTAL: soma original das fichas do período
      const totalAmount = salesArray.reduce((sum, s) => sum + s.totalValue, 0);
      const totalDiscount = salesArray.reduce((sum, s) => sum + s.discountValue, 0);

      // PENDENTE: saldo devedor atual das fichas do período
      const pendingAmount = Math.max(0, salesArray.reduce((sum, s) => sum + (s.totalValue - s.paidValue - s.discountValue), 0));

      // PAGO: derivado de Total - Pendente - Desconto → garante Total = Pago + Pendente + Desconto
      const receivedAmount = Math.max(0, totalAmount - pendingAmount - totalDiscount);

      const completedSales = salesArray.filter(s => (s.totalValue - s.paidValue - s.discountValue) <= 0.01).length;
      const conversionRate = salesArray.length > 0 ? (completedSales / salesArray.length) * 100 : 0;

      const allStoreCollections = sourceCollections.filter(c => c.nome_da_loja === storeName);
      const cityCounts = new Map<string, number>();
      allStoreCollections.forEach(c => { if (c.cidade) cityCounts.set(c.cidade, (cityCounts.get(c.cidade) || 0) + 1); });
      const storeCity = Array.from(cityCounts.entries()).sort((a,b) => b[1]-a[1])[0]?.[0] || "Não informada";

      let assignedCollector = "";
      const workingCollectors = new Map<string, number>();
      allStoreCollections.forEach(c => { if (c.user_id) workingCollectors.set(c.user_id, (workingCollectors.get(c.user_id) || 0) + 1); });
      const sortedCollectors = Array.from(workingCollectors.entries()).sort((a, b) => b[1] - a[1]);
      if (sortedCollectors.length > 0) assignedCollector = sortedCollectors[0][0];

      const collectorName = collectors.find((c) => c.id === assignedCollector)?.name || "Não atribuído";

      stats.push({
        storeName,
        city: storeCity,
        assignedCollector,
        collectorName,
        isFormalAssignment: false,
        totalCollections: salesArray.length,
        totalSales: salesArray.length,
        completedSales,
        pendingSales: salesArray.length - completedSales,
        clientsWithPending: salesArray.filter(s => (s.totalValue - s.paidValue - s.discountValue) > 0.01).length,
        totalAmount,
        receivedAmount,
        pendingAmount,
        conversionRate,
        efficiency: totalAmount > 0 ? (receivedAmount / totalAmount) * 100 : 0,
        averageTicket: salesArray.length > 0 ? totalAmount / salesArray.length : 0,
        clientsCount: new Set(salesArray.map((s) => s.clientDocument)).size,
      });
    });

    return stats;
  }, [availableStores, collectors, sourceCollections]);

  // Ordena as lojas (busca/cobrador/status sao aplicados na fonte via FilterBar).
  const filteredAndSortedStores = useMemo(() => {
    const filtered = [...storeStats]; // Create a copy to avoid mutating the original array

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortOrder === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortOrder === "asc"
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

    return filtered;
  }, [storeStats, sortBy, sortOrder]);

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    const totalStores = storeStats.length;
    const assignedStores = storeStats.filter((s) => s.assignedCollector).length;
    const unassignedStores = totalStores - assignedStores;
    const totalSales = storeStats.reduce(
      (sum, s) => sum + s.totalCollections,
      0,
    );
    const totalRevenue = storeStats.reduce(
      (sum, s) => sum + s.receivedAmount,
      0,
    );
    const avgConversionRate =
      storeStats.length > 0
        ? storeStats.reduce((sum, s) => sum + s.conversionRate, 0) /
          storeStats.length
        : 0;

    return {
      totalStores,
      assignedStores,
      unassignedStores,
      totalSales,
      totalRevenue,
      avgConversionRate,
    };
  }, [storeStats]);

  const exportStoreData = () => {
    // Headers with better formatting
    const headers = [
      "Loja",
      "Cobrador",
      "Status Atribuição",
      "Total de Vendas",
      "Vendas Finalizadas",
      "Vendas Pendentes",
      "Clientes com Pendências",
      "Taxa de Conversão (%)",
      "Valor Total (R$)",
      "Valor Recebido (R$)",
      "Valor Pendente (R$)",
      "Total de Clientes",
      "Eficiência (%)",
      "Ticket Médio (R$)",
    ];

    // Data rows with proper formatting
    const rows = filteredAndSortedStores.map((s) => [
      s.storeName,
      s.collectorName,
      s.isFormalAssignment
        ? "Formal"
        : s.assignedCollector
          ? "Informal"
          : "Não Atribuído",
      s.totalSales.toString(),
      s.completedSales.toString(),
      s.pendingSales.toString(),
      s.clientsWithPending.toString(),
      s.conversionRate.toFixed(1),
      s.totalAmount.toFixed(2),
      s.receivedAmount.toFixed(2),
      s.pendingAmount.toFixed(2),
      s.clientsCount.toString(),
      s.totalAmount > 0
        ? ((s.receivedAmount / s.totalAmount) * 100).toFixed(1)
        : "0",
      s.totalSales > 0 ? (s.totalAmount / s.totalSales).toFixed(2) : "0",
    ]);

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
    link.download = `relatorio-lojas-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
        <div className="h-16 bg-gray-200 rounded-2xl" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-gray-700 dark:text-dark-text">
      {/* Header */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 sm:p-5 transition-all duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl shrink-0">
              <Building className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
                Acompanhamento de Lojas
              </h2>
              <p className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary mt-1 tracking-wide">
                Performance e status de {overviewStats.totalStores} lojas cadastradas
              </p>
            </div>
          </div>

          {/* Ações Principais */}
          <div className="flex items-center gap-3">
            {overviewStats.unassignedStores > 0 && (
              <div className="flex items-center text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full font-semibold border border-amber-100 dark:border-amber-900/35">
                <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                {overviewStats.unassignedStores} sem atribuição
              </div>
            )}

            <button
              onClick={exportStoreData}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-dark-text bg-white dark:bg-dark-bg hover:text-blue-600 hover:dark:text-blue-400 border border-gray-200 dark:border-dark-border rounded-xl transition-all duration-200 text-sm font-medium shadow-sm"
              title="Exportar dados para CSV"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid de Cards Executivos — Scroll horizontal em mobile com padding vertical para evitar corte de sombras */}
      <div className="flex overflow-x-auto pt-3 pb-5 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 custom-scrollbar snap-x">
        {/* Card: Total de Lojas */}
        <div className="min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow snap-start">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Store className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            {overviewStats.unassignedStores > 0 ? (
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md tracking-wide border border-amber-150 dark:border-amber-900/30">
                {overviewStats.unassignedStores} Pendentes
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-md tracking-wide border border-green-150 dark:border-green-900/30">
                100% Atribuídas
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Total de Lojas</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{overviewStats.totalStores}</p>
          </div>
        </div>

        {/* Card: Taxa de Conversão */}
        <div className="min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow snap-start">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
              <Award className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Conversão Média</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">{overviewStats.avgConversionRate.toFixed(1)}%</p>
          </div>
        </div>

        {/* Card: Receita Total */}
        <div className="min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow snap-start">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Receita Total</p>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 tracking-tight">
              {formatCurrency(overviewStats.totalRevenue)}
            </div>
          </div>
        </div>

        {/* Card: Vendas Concluídas */}
        <div className="min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow snap-start">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
              <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Fichas / Vendas</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{overviewStats.totalSales}</p>
          </div>
        </div>
      </div>

      {/* Barra de filtros unificada (busca por loja/cliente/cidade + status,
          cobrador, vencimento, lançamento, valor — refina a fonte das lojas) */}
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        userType="manager"
        context="stores"
        searchPlaceholder="Buscar loja, cliente ou cidade..."
      />

      {/* Controles de lista: contagem + ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <span className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">
          {filteredAndSortedStores.length}{" "}
          {filteredAndSortedStores.length === 1 ? "loja" : "lojas"}
        </span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="pl-10 pr-9 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium text-gray-700 dark:text-dark-text appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 transition-all"
            >
              <option value="storeName">Nome</option>
              <option value="conversionRate">Taxa</option>
              <option value="totalAmount">Valor</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
              sortOrder === "desc"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white dark:bg-dark-bg text-gray-600 dark:text-dark-text border border-gray-100 dark:border-dark-border hover:border-blue-200 hover:text-blue-500"
            }`}
            title={sortOrder === "desc" ? "Ordem decrescente" : "Ordem crescente"}
          >
            {sortOrder === "desc" ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Lista de Lojas com Cards Aprimorados */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-1">
        {filteredAndSortedStores.map((store) => {
          const isUnassigned = !store.assignedCollector;
          
          const statusBgColor = isUnassigned
            ? "bg-amber-500"
            : store.conversionRate >= 70
              ? "bg-green-500"
              : store.conversionRate >= 40
                ? "bg-blue-500"
                : "bg-red-500";

          const statusTextColor = isUnassigned
            ? "text-amber-600 dark:text-amber-400"
            : store.conversionRate >= 70
              ? "text-green-600 dark:text-green-400"
              : store.conversionRate >= 40
                ? "text-blue-600 dark:text-blue-400"
                : "text-red-600 dark:text-red-400";

          const statusBgLight = isUnassigned
            ? "bg-amber-50 dark:bg-amber-900/20"
            : store.conversionRate >= 70
              ? "bg-green-50 dark:bg-green-900/20"
              : store.conversionRate >= 40
                ? "bg-blue-50 dark:bg-blue-900/20"
                : "bg-red-50 dark:bg-red-900/20";

          const statusBorderColor = isUnassigned
            ? "border-amber-500/10 dark:border-amber-500/20"
            : store.conversionRate >= 70
              ? "border-green-500/10 dark:border-green-500/20"
              : store.conversionRate >= 40
                ? "border-blue-500/10 dark:border-blue-500/20"
                : "border-red-500/10 dark:border-red-500/20";

          return (
            <div
              key={store.storeName}
              onClick={() => setSelectedStoreForModal(store)}
              className="group bg-white dark:bg-dark-bg-secondary rounded-2xl border border-gray-100 dark:border-dark-border p-5 hover:-translate-y-1 hover:shadow-lg hover:shadow-gray-250/20 dark:hover:shadow-black/20 transition-all duration-300 cursor-pointer flex flex-col justify-between"
            >
              <div>
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl ${statusBgLight} border ${statusBorderColor} transition-colors shrink-0`}>
                      <Store className={`h-5 w-5 ${statusTextColor}`} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm sm:text-base font-bold text-gray-900 dark:text-dark-text truncate leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {store.storeName}
                      </h4>
                      <p className="text-xs text-gray-400 dark:text-dark-text-secondary mt-1 flex items-center">
                        <MapPin className="h-3.5 w-3.5 mr-1 shrink-0 text-gray-400 dark:text-dark-text-secondary" />
                        {store.city}
                      </p>
                    </div>
                  </div>

                  {/* Destaque de Conversão como Pill Tag */}
                  <div className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold ${statusTextColor} ${statusBgLight} border ${statusBorderColor} shrink-0`}>
                    {store.conversionRate.toFixed(1)}%
                  </div>
                </div>

                {/* Info do Cobrador */}
                <div className="flex items-center justify-between mb-4 bg-gray-50/50 dark:bg-dark-bg/25 px-3 py-2 rounded-xl border border-gray-100/50 dark:border-dark-border/40">
                  <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                    Cobrador: <span className="font-semibold text-gray-700 dark:text-dark-text">{store.collectorName}</span>
                  </span>
                  {store.isFormalAssignment && !isUnassigned && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      Formal
                    </span>
                  )}
                </div>

                {!isUnassigned ? (
                  <>
                    {/* Grid de Métricas Principais - Limpo e sem bordas excessivas */}
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-4">
                      <div>
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wider block mb-0.5">Vendas</span>
                        <div className="text-sm font-bold text-gray-900 dark:text-dark-text">
                          {store.totalSales} <span className="text-xs font-normal text-gray-555 dark:text-dark-text-secondary">fichas</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wider block mb-0.5">Clientes</span>
                        <div className="text-sm font-bold text-gray-900 dark:text-dark-text">
                          {store.clientsCount} <span className="text-xs font-normal text-gray-555 dark:text-dark-text-secondary">base</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wider block mb-0.5">Recebido</span>
                        <div className="text-sm font-bold text-green-600 dark:text-green-455">
                          {formatCurrency(store.receivedAmount)}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wider block mb-0.5">Pendente</span>
                        <div className={`text-sm font-bold ${store.pendingAmount > 0.01 ? 'text-red-600 dark:text-red-400' : 'text-gray-405 dark:text-dark-text-secondary'}`}>
                          {formatCurrency(store.pendingAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Barra de Progresso Fina e Elegante */}
                    <div className="mt-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-semibold tracking-wide text-gray-400 dark:text-dark-text-secondary">Eficiência</span>
                        <span className={`text-xs font-bold ${statusTextColor}`}>{store.conversionRate.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-dark-bg rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${statusBgColor} transition-all duration-1000 ease-out`}
                          style={{
                            width: `${Math.min(store.conversionRate, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* Unassigned Store State - Compacto e elegante */
                  <div className="bg-amber-50/50 dark:bg-amber-900/10 rounded-xl p-4 border border-dashed border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-xs tracking-wide mb-0.5 text-amber-800 dark:text-amber-400">Pendente</div>
                        <div className="text-xs text-gray-500 dark:text-dark-text-secondary">Sem cobrador atribuído à unidade.</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State Customizado */}
      {filteredAndSortedStores.length === 0 && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-20 text-center transition-all">
          <div className="h-24 w-24 bg-gray-50 dark:bg-dark-bg rounded-full flex items-center justify-center mx-auto mb-6">
            <Store className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-3 tracking-tight">
            Nenhuma loja foi encontrada
          </h3>
          <p className="text-sm font-semibold text-gray-400 dark:text-dark-text-secondary max-w-md mx-auto leading-relaxed">
            {hasActiveFilters
              ? "Nenhuma loja corresponde aos filtros aplicados."
              : "A base de dados de lojas está vazia ou ainda está sendo carregada."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={() => setFilters({})}
              className="mt-8 px-6 py-3 bg-gray-900 text-white rounded-2xl text-sm font-bold hover:bg-gray-800 transition-all active:scale-95 shadow-md"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Modal de Detalhes da Loja */}
      {selectedStoreForModal && (
        <StoreDetailModal
          store={selectedStoreForModal}
          onClose={() => setSelectedStoreForModal(null)}
        />
      )}
    </div>
  );
};

interface StoreDetailModalProps {
  store: StoreStats;
  onClose: () => void;
}

const StoreDetailModal: React.FC<StoreDetailModalProps> = ({
  store,
  onClose,
}) => {
  const { collections } = useCollection();

  const cityBreakdown = useMemo(() => {
    const breakdown: Record<
      string,
      {
        city: string;
        clients: Set<string>;
        sales: Set<string>;
        totalAmount: number;
        receivedAmount: number;
      }
    > = {};

    collections
      .filter((c) => c.nome_da_loja === store.storeName)
      .forEach((c) => {
        const city = c.cidade || "Não informada";
        if (!breakdown[city]) {
          breakdown[city] = {
            city,
            clients: new Set(),
            sales: new Set(),
            totalAmount: 0,
            receivedAmount: 0,
          };
        }

        if (c.documento) breakdown[city].clients.add(c.documento);
        if (c.venda_n)
          breakdown[city].sales.add(`${c.venda_n}-${c.documento}`);

        breakdown[city].totalAmount += Number(c.valor_original || 0);
        breakdown[city].receivedAmount += Number(c.valor_recebido || 0);
      });

    return Object.values(breakdown).sort((a, b) =>
      a.city.localeCompare(b.city)
    );
  }, [collections, store.storeName]);

  const statusColor = !store.assignedCollector
    ? "amber"
    : store.conversionRate >= 70
      ? "green"
      : store.conversionRate >= 40
        ? "blue"
        : "red";

  const statusBgLight = statusColor === "amber" ? "bg-amber-50 dark:bg-amber-900/20" :
                        statusColor === "green" ? "bg-green-50 dark:bg-green-900/20" :
                        statusColor === "blue" ? "bg-blue-50 dark:bg-blue-900/20" :
                        "bg-red-50 dark:bg-red-900/20";

  const statusTextColor = statusColor === "amber" ? "text-amber-600 dark:text-amber-400" :
                          statusColor === "green" ? "text-green-600 dark:text-green-400" :
                          statusColor === "blue" ? "text-blue-600 dark:text-blue-400" :
                          "text-red-600 dark:text-red-400";

  return (
    <div className="fixed inset-0 bg-gray-900/60 dark:bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-dark-border">
        {/* Header Elegante */}
        <div className="p-6 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-xl ${statusBgLight} flex items-center justify-center`}>
              <Store className={`h-7 w-7 ${statusTextColor}`} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
                {store.storeName}
              </h3>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">
                  <MapPin className="h-3.5 w-3.5 mr-1" />
                  {store.city}
                </span>
                <div className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                <span className="text-xs font-semibold text-gray-600 dark:text-dark-text-secondary">
                  Operado por: <span className="text-blue-600 dark:text-blue-400 font-semibold">{store.collectorName}</span>
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center bg-gray-100 hover:bg-red-50 hover:text-red-500 dark:bg-dark-bg dark:hover:bg-red-950/20 dark:hover:text-red-400 text-gray-500 dark:text-dark-text-secondary rounded-xl transition-all active:scale-95 group"
          >
            <X className="h-5 w-5 transition-transform group-hover:rotate-90" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 minimal-scrollbar bg-white dark:bg-dark-bg-secondary">
          {/* Dashboard de Performance no Modal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            <div className="p-5 bg-gradient-to-br from-blue-50/40 to-blue-50/10 dark:from-blue-950/20 dark:to-blue-950/5 rounded-2xl border border-blue-100/40 dark:border-blue-900/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-blue-100/80 dark:bg-blue-900/50 rounded-xl text-blue-600 dark:text-blue-400">
                  <Award className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 tracking-wider">Taxa</span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-blue-950 dark:text-blue-200">
                {store.conversionRate.toFixed(1)}%
              </p>
              <p className="text-xs text-blue-650/70 dark:text-blue-400/70 mt-1">Eficiência de Conversão</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-green-50/40 to-green-50/10 dark:from-green-950/20 dark:to-green-950/5 rounded-2xl border border-green-100/40 dark:border-green-900/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-green-100/80 dark:bg-green-900/50 rounded-xl text-green-600 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-green-500 dark:text-green-400 tracking-wider">Pago</span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-green-950 dark:text-green-200 truncate">
                {formatCurrency(store.receivedAmount)}
              </p>
              <p className="text-xs text-green-650/70 dark:text-green-400/70 mt-1">Valor Recebido</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-red-50/40 to-red-50/10 dark:from-red-950/20 dark:to-red-950/5 rounded-2xl border border-red-100/40 dark:border-red-900/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-red-100/80 dark:bg-red-900/50 rounded-xl text-red-600 dark:text-red-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-red-500 dark:text-red-400 tracking-wider">Aberto</span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-red-950 dark:text-red-200 truncate">
                {formatCurrency(store.pendingAmount)}
              </p>
              <p className="text-xs text-red-650/70 dark:text-red-400/70 mt-1">Valor Pendente</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-purple-50/40 to-purple-50/10 dark:from-purple-950/20 dark:to-purple-950/5 rounded-2xl border border-purple-100/40 dark:border-purple-900/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-purple-100/80 dark:bg-purple-900/50 rounded-xl text-purple-600 dark:text-purple-400">
                  <DollarSign className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-purple-505 dark:text-purple-400 tracking-wider">Média</span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-purple-950 dark:text-purple-200 truncate">
                {formatCurrency(store.averageTicket)}
              </p>
              <p className="text-xs text-purple-650/70 dark:text-purple-400/70 mt-1">Ticket Médio</p>
            </div>
          </div>

          {/* Tabela de Cidades Modernizada */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2 tracking-wide">
                <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Distribuição Geográfica Detalhada
              </h4>
              <span className="self-start sm:self-auto text-xs font-semibold text-gray-400 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg px-3 py-1 rounded-full border border-gray-100 dark:border-dark-border">
                {cityBreakdown.length} {cityBreakdown.length === 1 ? "Cidade Identificada" : "Cidades Identificadas"}
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-bg border-b border-gray-100 dark:border-dark-border">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">Cidade</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide text-center">Clientes</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide text-center">Fichas</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide text-right">Valor Bruto</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide text-right">Valor Pago</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide text-right">Pendente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                  {cityBreakdown.map((item) => {
                    const pending = item.totalAmount - item.receivedAmount;
                    
                    return (
                      <tr key={item.city} className="group hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white dark:bg-dark-bg border border-gray-100 dark:border-dark-border flex items-center justify-center text-xs shadow-sm group-hover:border-blue-200">
                              📍
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-dark-text group-hover:text-blue-700 dark:group-hover:text-blue-400">{item.city}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text border border-gray-200 dark:border-dark-border group-hover:bg-white dark:group-hover:bg-dark-bg-secondary">
                            {item.clients.size}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-medium text-gray-500 dark:text-dark-text-secondary">
                          {item.sales.size}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-dark-text text-right">
                          {formatCurrency(item.totalAmount)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-green-600 dark:text-green-400 text-right">
                          {formatCurrency(item.receivedAmount)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-sm font-semibold ${pending > 0.01 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-dark-text-secondary"}`}>
                            {formatCurrency(pending)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Moderno */}
        <div className="p-6 border-t border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gray-950 hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl transition-all font-semibold text-sm active:scale-95 shadow-sm"
          >
            Concluir Análise
          </button>
        </div>
      </div>
    </div>
  );
};
export default EnhancedStoreManagement;
