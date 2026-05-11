import React, { useState, useMemo } from "react";
import {
  Store,
  AlertCircle,
  CheckCircle,
  Search,
  Download,
  BarChart3,
  Building,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
  DollarSign,
  Award,
  MapPin,
  X,
  Calendar,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";

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
        <span className="text-xs text-blue-200 opacity-90">{extensoText}</span>
      )}
    </div>
  );
};

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
  const { users, collections, getAvailableStores, loading } = useCollection();

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<
    "storeName" | "conversionRate" | "totalAmount"
  >("storeName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [collectorFilter, setCollectorFilter] = useState<string>("all");
  const [selectedStoreForModal, setSelectedStoreForModal] =
    useState<StoreStats | null>(null);

  // Filtros de Data
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const formatDateToYYYYMMDD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [dateFrom, setDateFrom] = useState<string>(
    formatDateToYYYYMMDD(firstDayOfMonth),
  );
  const [dateTo, setDateTo] = useState<string>(
    formatDateToYYYYMMDD(lastDayOfMonth),
  );

  const collectors = users.filter((u) => u.type === "collector");
  const availableStores = getAvailableStores();

  // Calculate store statistics
  const storeStats = useMemo((): StoreStats[] => {
    const stats: StoreStats[] = [];

    availableStores.forEach((storeName) => {
      const toYYYYMMDD = (dateStr: string | null | undefined): string | null => {
        if (!dateStr) return null;
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.substring(0, 10);
        const parts = dateStr.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
        if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`;
        try {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
        } catch (_) { /* noop */ }
        return null;
      };

      // Fichas dessa loja no período — usa data_lancamento ou data_vencimento como fallback
      const periodCollections = collections.filter(c => {
        if (c.nome_da_loja !== storeName) return false;
        const raw = c.data_lancamento || c.data_vencimento;
        const recordDate = toYYYYMMDD(raw);
        if (!recordDate) return false;
        if (dateFrom && recordDate < dateFrom) return false;
        if (dateTo && recordDate > dateTo) return false;
        return true;
      });

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

      const allStoreCollections = collections.filter(c => c.nome_da_loja === storeName);
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
  }, [availableStores, collectors, collections, dateFrom, dateTo]);

  // Filter and sort stores
  const filteredAndSortedStores = useMemo(() => {
    let filtered = [...storeStats]; // Create a copy to avoid mutating the original array

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (store) =>
          store.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          store.collectorName.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Apply collector filter
    if (collectorFilter !== "all") {
      filtered = filtered.filter(
        (store) => store.assignedCollector === collectorFilter,
      );
    }

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
  }, [storeStats, searchTerm, sortBy, sortOrder, collectorFilter]);

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
    const rows = storeStats.map((s) => [
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
    <div className="space-y-6">
      {/* Header Simplificado */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 lg:p-6 transition-all duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
              <Building className="h-6 w-6 mr-2 text-blue-600 flex-shrink-0" />
              Acompanhamento de Lojas
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Performance e status de {overviewStats.totalStores} lojas cadastradas
            </p>
          </div>

          {/* Ações Principais */}
          <div className="flex items-center gap-3">
            {overviewStats.unassignedStores > 0 && (
              <div className="flex items-center text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full font-semibold border border-amber-100">
                <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                {overviewStats.unassignedStores} sem atribuição
              </div>
            )}

            <button
              onClick={exportStoreData}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 rounded-xl transition-all duration-200 text-sm font-medium"
              title="Exportar dados para CSV"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Card Principal - Taxa de Conversão Média */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl shadow-xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4">
          <Award className="h-48 w-48" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-blue-100 text-sm font-medium uppercase tracking-wider">
                Taxa de Conversão Média
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-5xl font-black">
                  {overviewStats.avgConversionRate.toFixed(1)}%
                </p>
                <div className="flex items-center px-2 py-1 bg-white/20 rounded-lg text-xs font-bold">
                  GERAL
                </div>
              </div>
            </div>
            <div className="hidden lg:flex items-center justify-center h-20 w-20 bg-white/10 rounded-3xl backdrop-blur-sm border border-white/20">
              <Award className="h-10 w-10 text-white" />
            </div>
          </div>

          {/* Métricas secundárias */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/20">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <p className="text-blue-100 text-xs font-medium">Receita Total</p>
                <div className="text-xl font-bold">
                  {formatMobileCurrency(overviewStats.totalRevenue)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center">
                <Store className="h-6 w-6" />
              </div>
              <div>
                <p className="text-blue-100 text-xs font-medium">Lojas Atribuídas</p>
                <p className="text-xl font-bold">{overviewStats.assignedStores}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <p className="text-blue-100 text-xs font-medium">Vendas Realizadas</p>
                <p className="text-xl font-bold">{overviewStats.totalSales}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros Modernizados */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 lg:p-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Busca com feedback visual */}
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome da loja ou cobrador..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all text-sm font-medium placeholder-gray-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 p-1">
            {/* Filtro de Período */}
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-transparent focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <div className="flex items-center gap-2 px-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider hidden sm:inline">Período</span>
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent border-none p-0 text-xs font-bold text-gray-700 focus:ring-0 w-[110px]"
              />
              <span className="text-gray-300">/</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent border-none p-0 text-xs font-bold text-gray-700 focus:ring-0 w-[110px]"
              />
            </div>

            <div className="h-8 w-px bg-gray-100 hidden xl:block mx-1" />

            {/* Filtro de Cobrador */}
            <div className="relative">
              <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10 pointer-events-none" />
              <select
                value={collectorFilter}
                onChange={(e) => setCollectorFilter(e.target.value)}
                className="pl-10 pr-10 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all text-sm font-semibold text-gray-700 appearance-none cursor-pointer min-w-[180px]"
              >
                <option value="all">Todos os Cobradores</option>
                {collectors.map((collector) => (
                  <option key={collector.id} value={collector.id}>
                    {collector.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="h-8 w-px bg-gray-100 hidden sm:block mx-1" />

            {/* Ordenação Modernizada */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <BarChart3 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10 pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="pl-10 pr-10 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all text-sm font-semibold text-gray-700 appearance-none cursor-pointer min-w-[140px]"
                >
                  <option value="storeName">Nome</option>
                  <option value="conversionRate">Taxa</option>
                  <option value="totalAmount">Valor</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className={`flex items-center justify-center w-11 h-11 rounded-2xl transition-all duration-300 ${
                  sortOrder === "desc"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                    : "bg-white text-gray-600 border border-gray-100 hover:border-blue-200 hover:text-blue-500"
                }`}
                title={sortOrder === "desc" ? "Ordem Decrescente" : "Ordem Crescente"}
              >
                {sortOrder === "desc" ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronUp className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Contador Dinâmico */}
            <div className="ml-2 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl">
              <span className="text-xs font-bold text-blue-600">
                {filteredAndSortedStores.length}
              </span>
              <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">
                Lojas
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Lojas com Cards Aprimorados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
        {filteredAndSortedStores.map((store) => {
          const isUnassigned = !store.assignedCollector;
          
          const statusColor = isUnassigned
            ? "amber"
            : store.conversionRate >= 70
              ? "green"
              : store.conversionRate >= 40
                ? "blue"
                : "red";

          return (
            <div
              key={store.storeName}
              onClick={() => setSelectedStoreForModal(store)}
              className={`group bg-white rounded-[2rem] shadow-sm border border-gray-100 transition-all duration-500 hover:shadow-2xl hover:shadow-gray-200/50 hover:-translate-y-1.5 cursor-pointer relative overflow-hidden`}
            >
              {/* Barra lateral de status */}
              <div className={`absolute top-0 left-0 w-2 h-full bg-${statusColor}-500 transition-all duration-500 group-hover:w-3`} />
              
              <div className="p-6 lg:p-8">
                {/* Header do Card */}
                <div className="flex items-start justify-between mb-8">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-2 rounded-xl bg-${statusColor}-50`}>
                        <Store className={`h-5 w-5 text-${statusColor}-600`} />
                      </div>
                      <h4 className="text-lg font-bold text-gray-900 truncate pr-2">
                        {store.storeName}
                      </h4>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center text-sm font-medium text-gray-400">
                        <MapPin className="h-3.5 w-3.5 mr-1.5" />
                        {store.city}
                      </div>
                      <div className="flex items-center text-sm">
                        <div className={`h-2 w-2 rounded-full bg-${statusColor}-400 mr-2`} />
                        <span className="font-bold text-gray-700">{store.collectorName}</span>
                        {store.isFormalAssignment && !isUnassigned && (
                          <span className={`ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-green-50 text-green-600 border border-green-100`}>
                            Formal
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Destaque de Conversão */}
                  <div className="flex flex-col items-end">
                    <div className={`text-3xl font-black tracking-tight text-${statusColor}-600 leading-none mb-1`}>
                      {store.conversionRate.toFixed(1)}<span className="text-sm font-bold opacity-70">%</span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Conversão</span>
                  </div>
                </div>

                {/* Métricas Operacionais */}
                {!isUnassigned && (
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-50/50 rounded-2xl p-4 border border-transparent hover:border-gray-200 transition-all group-hover:bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Vendas</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-gray-900">{store.totalSales}</span>
                        <span className="text-xs font-medium text-gray-500">fichas</span>
                      </div>
                    </div>
                    <div className="bg-gray-50/50 rounded-2xl p-4 border border-transparent hover:border-gray-200 transition-all group-hover:bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-purple-500" />
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Base</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-gray-900">{store.clientsCount}</span>
                        <span className="text-xs font-medium text-gray-500">clientes</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Barra de Progresso Customizada */}
                {!isUnassigned && (
                  <div className="mb-8">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Eficiência</span>
                      <span className={`text-xs font-bold text-${statusColor}-600`}>{store.conversionRate.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 p-1">
                      <div
                        className={`h-1 rounded-full bg-${statusColor}-500 transition-all duration-1000 ease-out shadow-sm shadow-${statusColor}-500/50`}
                        style={{
                          width: `${Math.min(store.conversionRate, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Resumo Financeiro com Melhor Contraste */}
                {!isUnassigned && (
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-2xl border border-gray-100 group-hover:border-blue-100 transition-colors">
                    <div className="flex-1 px-2">
                      <p className="text-[9px] font-black uppercase tracking-tighter text-gray-400 mb-0.5">Total</p>
                      <p className="text-sm font-bold text-gray-900 truncate">{formatCurrency(store.totalAmount, false)}</p>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div className="flex-1 px-2">
                      <p className="text-[9px] font-black uppercase tracking-tighter text-green-500 mb-0.5">Pago</p>
                      <p className="text-sm font-bold text-green-600 truncate">{formatCurrency(store.receivedAmount, false)}</p>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div className="flex-1 px-2">
                      <p className="text-[9px] font-black uppercase tracking-tighter text-red-500 mb-0.5">Pend.</p>
                      <p className="text-sm font-bold text-red-600 truncate">{formatCurrency(store.pendingAmount, false)}</p>
                    </div>
                    <div className="ml-1 p-2 bg-white rounded-xl text-blue-600 shadow-sm border border-gray-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                  </div>
                )}

                {/* Unassigned Store State com visual de Alerta */}
                {isUnassigned && (
                  <div className="bg-amber-50 rounded-2xl p-6 border-2 border-dashed border-amber-200 text-amber-800 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-amber-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="h-6 w-6 text-amber-700" />
                      </div>
                      <div>
                        <div className="font-black uppercase text-xs tracking-widest mb-1">Atenção Gerencial</div>
                        <div className="text-sm font-medium">Nenhum cobrador está operando nesta unidade no momento.</div>
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
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-20 text-center transition-all">
          <div className="h-24 w-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Store className="h-10 w-10 text-gray-300" />
          </div>
          <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">
            Nenhuma loja foi encontrada
          </h3>
          <p className="text-gray-500 max-w-md mx-auto leading-relaxed">
            {searchTerm
              ? `Não existem resultados que correspondam à sua busca por "${searchTerm}".`
              : "A base de dados de lojas está vazia ou ainda está sendo carregada."}
          </p>
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm("")}
              className="mt-8 px-6 py-3 bg-gray-900 text-white rounded-2xl text-sm font-bold hover:bg-gray-800 transition-all active:scale-95"
            >
              Limpar Pesquisa
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
      a.city.localeCompare(b.city),
    );
  }, [collections, store.storeName]);

  const statusColor = !store.assignedCollector
    ? "amber"
    : store.conversionRate >= 70
      ? "green"
      : store.conversionRate >= 40
        ? "blue"
        : "red";

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-white/20">
        {/* Header Elegante */}
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl bg-${statusColor}-50 flex items-center justify-center`}>
              <Store className={`h-7 w-7 text-${statusColor}-600`} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
                {store.storeName}
              </h3>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                  <MapPin className="h-3 w-3 mr-1" />
                  {store.city}
                </span>
                <div className="h-1 w-1 rounded-full bg-gray-300" />
                <span className="text-xs font-bold text-gray-600">
                  Operado por: <span className="text-blue-600">{store.collectorName}</span>
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-12 w-12 flex items-center justify-center bg-gray-100 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all active:scale-95 group"
          >
            <X className="h-6 w-6 transition-transform group-hover:rotate-90" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1 minimal-scrollbar bg-white">
          {/* Dashboard de Performance no Modal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <div className="p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100/50 group hover:bg-blue-600 transition-all duration-500">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-blue-100 rounded-xl group-hover:bg-blue-500">
                  <Award className="h-5 w-5 text-blue-600 group-hover:text-white" />
                </div>
                <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest group-hover:text-blue-200">Taxa</span>
              </div>
              <p className="text-3xl font-black text-blue-900 group-hover:text-white">
                {store.conversionRate.toFixed(1)}%
              </p>
              <p className="text-xs font-medium text-blue-600/60 mt-1 group-hover:text-blue-100">Eficiência de Conversão</p>
            </div>

            <div className="p-6 bg-green-50/50 rounded-[2rem] border border-green-100/50 group hover:bg-green-600 transition-all duration-500">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-green-100 rounded-xl group-hover:bg-green-500">
                  <CheckCircle className="h-5 w-5 text-green-600 group-hover:text-white" />
                </div>
                <span className="text-[10px] font-black uppercase text-green-400 tracking-widest group-hover:text-green-200">Pago</span>
              </div>
              <p className="text-2xl font-black text-green-900 group-hover:text-white truncate">
                {formatCurrency(store.receivedAmount)}
              </p>
              <p className="text-xs font-medium text-green-600/60 mt-1 group-hover:text-green-100">Valor Recebido</p>
            </div>

            <div className="p-6 bg-red-50/50 rounded-[2rem] border border-red-100/50 group hover:bg-red-600 transition-all duration-500">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-red-100 rounded-xl group-hover:bg-red-500">
                  <AlertCircle className="h-5 w-5 text-red-600 group-hover:text-white" />
                </div>
                <span className="text-[10px] font-black uppercase text-red-400 tracking-widest group-hover:text-red-200">Aberto</span>
              </div>
              <p className="text-2xl font-black text-red-900 group-hover:text-white truncate">
                {formatCurrency(store.pendingAmount)}
              </p>
              <p className="text-xs font-medium text-red-600/60 mt-1 group-hover:text-red-100">Valor Pendente</p>
            </div>

            <div className="p-6 bg-purple-50/50 rounded-[2rem] border border-purple-100/50 group hover:bg-purple-600 transition-all duration-500">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-purple-100 rounded-xl group-hover:bg-purple-500">
                  <DollarSign className="h-5 w-5 text-purple-600 group-hover:text-white" />
                </div>
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest group-hover:text-purple-200">Média</span>
              </div>
              <p className="text-2xl font-black text-purple-900 group-hover:text-white truncate">
                {formatCurrency(store.averageTicket)}
              </p>
              <p className="text-xs font-medium text-purple-600/60 mt-1 group-hover:text-purple-100">Ticket Médio</p>
            </div>
          </div>

          {/* Tabela de Cidades Modernizada */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-sm font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Distribuição Geográfica Detalhada
              </h4>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                {cityBreakdown.length} Cidades Identificadas
              </span>
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cidade</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Clientes</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Fichas</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Valor Bruto</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Valor Pago</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Pendente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cityBreakdown.map((item) => {
                    const pending = item.totalAmount - item.receivedAmount;
                    
                    return (
                      <tr key={item.city} className="group hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white border border-gray-100 flex items-center justify-center text-xs shadow-sm group-hover:border-blue-200">
                              📍
                            </div>
                            <span className="text-sm font-bold text-gray-900 group-hover:text-blue-700">{item.city}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200 group-hover:bg-white group-hover:border-blue-200">
                            {item.clients.size}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-semibold text-gray-500">
                          {item.sales.size}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                          {formatCurrency(item.totalAmount)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-green-600 text-right">
                          {formatCurrency(item.receivedAmount)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-sm font-black ${pending > 0 ? "text-red-600" : "text-gray-400"}`}>
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
        <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-10 py-4 bg-gray-900 text-white rounded-[1.5rem] hover:bg-gray-800 transition-all font-black text-sm uppercase tracking-widest shadow-xl shadow-gray-900/20 active:scale-95"
          >
            Concluir Análise
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedStoreManagement;
