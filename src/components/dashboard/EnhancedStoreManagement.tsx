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
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";

// Função auxiliar para converter números em extenso
const numeroParaExtenso = (num: number): string => {
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const dezenasEspeciais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  
  if (num === 0) return 'zero';
  if (num === 100) return 'cem';
  if (num === 1000) return 'mil';
  
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
  
  return partes.join(' e ');
};

// Função para formatar valores grandes em mobile
const formatMobileCurrency = (value: number) => {
  const isMobile = window.innerWidth < 640; // Tailwind sm breakpoint
  
  if (!isMobile) {
    return formatCurrency(value, false);
  }
  
  const intValue = Math.floor(value);
  
  if (intValue === 0) {
    return 'R$ 0';
  }
  
  // Determinar a escala e formatar
  let mainValue = '';
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
        extensoParts.push('reais');
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
  
  const extensoText = extensoParts.join(' e ');
  
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
  const { users, collections, collectorStores, getAvailableStores, loading } =
    useCollection();

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<
    "storeName" | "conversionRate" | "totalAmount"
  >("storeName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const collectors = users.filter((u) => u.type === "collector");
  const availableStores = getAvailableStores();

  // Calculate store statistics
  const storeStats = useMemo((): StoreStats[] => {
    const stats: StoreStats[] = [];

    availableStores.forEach((storeName) => {
      // Get collections for this store first to see who's actually working on it
      const storeCollections = collections.filter(
        (c) => c.nome_da_loja === storeName,
      );

      // Find who is actually working on this store (from collections)
      const workingCollectors = new Set(
        storeCollections.map((c) => c.user_id).filter(Boolean),
      );

      // Find formal assignment (from collectorStores)
      const assignment = collectorStores.find(
        (cs) => cs.storeName === storeName,
      );

      // Determine the assigned collector (prefer formal assignment, fallback to actual worker)
      let assignedCollector = assignment?.collectorId || "";
      if (!assignedCollector && workingCollectors.size === 1) {
        assignedCollector = Array.from(workingCollectors)[0] || "";
      } else if (!assignedCollector && workingCollectors.size > 1) {
        // Multiple collectors working, show the one with most collections
        const collectorCounts = new Map<string, number>();
        storeCollections.forEach((c) => {
          if (c.user_id) {
            collectorCounts.set(
              c.user_id,
              (collectorCounts.get(c.user_id) || 0) + 1,
            );
          }
        });
        const mostActiveCollector = Array.from(collectorCounts.entries()).sort(
          (a, b) => b[1] - a[1],
        )[0];
        if (mostActiveCollector) {
          assignedCollector = mostActiveCollector[0];
        }
      }

      const collectorName =
        collectors.find((c) => c.id === assignedCollector)?.name ||
        "Não atribuído";
      const isFormalAssignment = !!assignment;

      // Simplified - Group by sale
      const salesMap = new Map<
        string,
        {
          totalValue: number;
          receivedValue: number;
          clientDocument: string;
          clientName: string;
          isPending: boolean;
        }
      >();

      storeCollections.forEach((collection) => {
        const saleKey = `${collection.venda_n}-${collection.documento}`;
        if (!salesMap.has(saleKey)) {
          salesMap.set(saleKey, {
            totalValue: 0,
            receivedValue: 0,
            clientDocument: collection.documento || "",
            clientName: collection.cliente || "",
            isPending: false,
          });
        }

        const sale = salesMap.get(saleKey)!;
        sale.totalValue += collection.valor_original;
        sale.receivedValue += collection.valor_recebido;
      });

      // Determine if each sale is pending
      salesMap.forEach((sale) => {
        const pendingAmount = sale.totalValue - sale.receivedValue;
        sale.isPending = pendingAmount > 0.01;
      });

      const salesArray = Array.from(salesMap.values());
      const completedSales = salesArray.filter((s) => !s.isPending).length;
      const pendingSales = salesArray.filter((s) => s.isPending).length;
      const clientsWithPending = new Set(
        salesArray
          .filter((s) => s.isPending)
          .map((s) => s.clientDocument || s.clientName)
          .filter(Boolean)
      ).size;

      const totalCollections = salesArray.length;
      const totalAmount = salesArray.reduce((sum, s) => sum + s.totalValue, 0);
      const receivedAmount = salesArray.reduce(
        (sum, s) => sum + s.receivedValue,
        0,
      );
      const pendingAmount = totalAmount - receivedAmount;
      const conversionRate =
        salesArray.length > 0 ? (completedSales / salesArray.length) * 100 : 0;
      const efficiency = totalAmount > 0 ? (receivedAmount / totalAmount) * 100 : 0;
      const averageTicket = salesArray.length > 0 ? totalAmount / salesArray.length : 0;
      const clientsCount = new Set(
        salesArray.map((s) => s.clientDocument || s.clientName).filter(Boolean),
      ).size;

      stats.push({
        storeName,
        assignedCollector,
        collectorName,
        isFormalAssignment,
        totalCollections,
        totalSales: salesArray.length,
        completedSales,
        pendingSales,
        clientsWithPending,
        totalAmount,
        receivedAmount,
        pendingAmount,
        conversionRate,
        efficiency,
        averageTicket,
        clientsCount,
      });
    });

    return stats;
  }, [availableStores, collectorStores, collectors, collections]);

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
  }, [storeStats, searchTerm, sortBy, sortOrder]);

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

  const toggleCardExpansion = (storeName: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(storeName)) {
      newExpanded.delete(storeName);
    } else {
      newExpanded.add(storeName);
    }
    setExpandedCards(newExpanded);
  };

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
      "Ticket Médio (R$)"
    ];

    // Data rows with proper formatting
    const rows = storeStats.map((s) => [
      s.storeName,
      s.collectorName,
      s.isFormalAssignment ? "Formal" : s.assignedCollector ? "Informal" : "Não Atribuído",
      s.totalSales.toString(),
      s.completedSales.toString(),
      s.pendingSales.toString(),
      s.clientsWithPending.toString(),
      s.conversionRate.toFixed(1),
      s.totalAmount.toFixed(2),
      s.receivedAmount.toFixed(2),
      s.pendingAmount.toFixed(2),
      s.clientsCount.toString(),
      s.totalAmount > 0 ? ((s.receivedAmount / s.totalAmount) * 100).toFixed(1) : "0",
      s.totalSales > 0 ? (s.totalAmount / s.totalSales).toFixed(2) : "0"
    ]);

    // Create CSV content with proper encoding
    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(cell => {
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          const escaped = cell.toString().replace(/"/g, '""');
          return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
        }).join(",")
      )
    ].join("\n");

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { 
      type: "text/csv;charset=utf-8;" 
    });
    
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-lojas-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Simplificado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
              <Building className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
              Acompanhamento de Lojas
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Performance e status das {overviewStats.totalStores} lojas
            </p>
          </div>
          
          {/* Ações Principais */}
          <div className="flex items-center gap-2">
            {overviewStats.unassignedStores > 0 && (
              <span className="flex items-center text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
                <AlertCircle className="h-3 w-3 mr-1" />
                {overviewStats.unassignedStores} sem atribuição
              </span>
            )}
            
            <button
              onClick={exportStoreData}
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
            <p className="text-blue-100 text-sm font-medium">Taxa de Conversão Média</p>
            <p className="text-4xl font-bold mt-1">
              {overviewStats.avgConversionRate.toFixed(1)}%
            </p>
            <p className="text-blue-100 text-sm mt-2">
              {overviewStats.totalStores} lojas cadastradas
            </p>
          </div>
          <Award className="h-16 w-16 text-blue-200 opacity-50" />
        </div>
        
        {/* Métricas secundárias */}
        <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-4 mt-6 pt-6 border-t border-blue-400">
          <div>
            <p className="text-blue-100 text-xs">Receita</p>
            <div className="text-2xl font-semibold">{formatMobileCurrency(overviewStats.totalRevenue)}</div>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Atribuídas</p>
            <p className="text-2xl font-semibold">{overviewStats.assignedStores}</p>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Vendas</p>
            <p className="text-2xl font-semibold">{overviewStats.totalSales}</p>
          </div>
        </div>
      </div>

      {/* Filtros Minimalistas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          {/* Busca */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar loja ou cobrador..."
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors text-sm"
            />
          </div>

          {/* Ordenação Minimalista */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="pl-3 pr-8 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors text-sm min-w-[120px]"
            >
              <option value="storeName">Nome</option>
              <option value="conversionRate">Taxa</option>
              <option value="totalAmount">Valor</option>
            </select>
            
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${
                sortOrder === "desc" 
                  ? "bg-blue-100 text-blue-600 hover:bg-blue-200" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              title={sortOrder === "desc" ? "Decrescente" : "Crescente"}
            >
              {sortOrder === "desc" ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Contador */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <BarChart3 className="h-4 w-4" />
            <span className="font-medium">{filteredAndSortedStores.length}</span>
            <span className="hidden sm:inline">lojas</span>
          </div>
        </div>
      </div>

      {/* Lista de Lojas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {filteredAndSortedStores.map((store) => {
          const isExpanded = expandedCards.has(store.storeName);
          const isUnassigned = !store.assignedCollector;

          return (
            <div
              key={store.storeName}
              className={`bg-white rounded-xl shadow-sm border-2 transition-all duration-200 hover:shadow-lg ${
                isUnassigned
                  ? "border-amber-200 hover:border-amber-300"
                  : store.conversionRate >= 70
                  ? "border-green-200 hover:border-green-300"
                  : store.conversionRate >= 40
                  ? "border-blue-200 hover:border-blue-300"
                  : "border-red-200 hover:border-red-300"
              }`}
            >
              <div className="p-5">
                {/* Header com Métrica Principal */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Store className={`h-5 w-5 ${
                        isUnassigned ? "text-amber-600" : 
                        store.conversionRate >= 70 ? "text-green-600" :
                        store.conversionRate >= 40 ? "text-blue-600" : "text-red-600"
                      }`} />
                      {store.storeName}
                      {isUnassigned && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
                          Sem atribuição
                        </span>
                      )}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {store.collectorName}
                      {store.isFormalAssignment && !isUnassigned && (
                        <span className="text-xs text-green-600 ml-1">(Formal)</span>
                      )}
                    </p>
                  </div>
                  
                  {/* Métrica Principal Destacada */}
                  <div className="text-right">
                    <div className={`text-3xl font-bold ${
                      store.conversionRate >= 70 ? "text-green-600" :
                      store.conversionRate >= 40 ? "text-blue-600" : "text-red-600"
                    }`}>
                      {store.conversionRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">conversão</div>
                  </div>
                </div>

                {/* Métricas Resumidas com Ícones */}
                {!isUnassigned && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                      <div className="bg-gray-100 rounded-full p-2 mr-3">
                        <FileText className="h-4 w-4 text-gray-600" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-gray-900">{store.totalSales}</div>
                        <div className="text-xs text-gray-600">vendas</div>
                      </div>
                    </div>
                    <div className="flex items-center p-3 bg-green-50 rounded-lg">
                      <div className="bg-green-100 rounded-full p-2 mr-3">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-700">{store.completedSales}</div>
                        <div className="text-xs text-green-600">finalizadas</div>
                      </div>
                    </div>
                    <div className="flex items-center p-3 bg-orange-50 rounded-lg">
                      <div className="bg-orange-100 rounded-full p-2 mr-3">
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-orange-700">{store.pendingSales}</div>
                        <div className="text-xs text-orange-600">pendentes</div>
                      </div>
                    </div>
                    <div className="flex items-center p-3 bg-purple-50 rounded-lg">
                      <div className="bg-purple-100 rounded-full p-2 mr-3">
                        <Users className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-purple-700">{store.clientsCount}</div>
                        <div className="text-xs text-purple-600">clientes</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Barra de Progresso Visual */}
                {!isUnassigned && (
                  <div className="mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          store.conversionRate >= 70
                            ? "bg-gradient-to-r from-green-500 to-green-600"
                            : store.conversionRate >= 40
                              ? "bg-gradient-to-r from-blue-500 to-blue-600"
                              : "bg-gradient-to-r from-red-500 to-red-600"
                        }`}
                        style={{
                          width: `${Math.min(store.conversionRate, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Valores Financeiros com Ícones */}
                {!isUnassigned && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <BarChart3 className="h-4 w-4 text-gray-500 mr-2 sm:block hidden" />
                      <div className="text-center">
                        <div className="text-xs text-gray-600">Total</div>
                        <div className="text-sm font-bold text-gray-900 sm:block hidden">{formatCurrency(store.totalAmount)}</div>
                        <div className="text-sm font-bold text-gray-900 sm:hidden">{formatCurrency(store.totalAmount, false).replace(/,\d{2}$/, '')}</div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 sm:block hidden" />
                      <div className="text-center">
                        <div className="text-xs text-green-600">Recebido</div>
                        <div className="text-sm font-bold text-green-700 sm:block hidden">{formatCurrency(store.receivedAmount)}</div>
                        <div className="text-sm font-bold text-green-700 sm:hidden">{formatCurrency(store.receivedAmount, false).replace(/,\d{2}$/, '')}</div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-red-500 mr-2 sm:block hidden" />
                      <div className="text-center">
                        <div className="text-xs text-red-600">Pendente</div>
                        <div className="text-sm font-bold text-red-700 sm:block hidden">{formatCurrency(store.pendingAmount)}</div>
                        <div className="text-sm font-bold text-red-700 sm:hidden">{formatCurrency(store.pendingAmount, false).replace(/,\d{2}$/, '')}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleCardExpansion(store.storeName)}
                      className={`p-2 rounded-lg transition-colors ${
                        isExpanded ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                      title={isExpanded ? "Ocultar detalhes" : "Ver mais detalhes"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
                
                {/* Detalhes Expandidos com Ícones */}
                {isExpanded && !isUnassigned && (
                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="flex items-center p-3 bg-amber-50 rounded-lg">
                        <div className="bg-amber-100 rounded-full p-2 mr-3">
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-amber-700">
                            {store.clientsWithPending}
                          </div>
                          <div className="text-xs text-amber-600">clientes inadimplentes</div>
                        </div>
                      </div>
                      <div className="flex items-center p-3 bg-green-50 rounded-lg">
                        <div className="bg-green-100 rounded-full p-2 mr-3">
                          <DollarSign className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-700">
                            {formatCurrency(store.averageTicket)}
                          </div>
                          <div className="text-xs text-green-600">ticket médio</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <div className="flex items-center">
                          <Award className="h-4 w-4 text-blue-600 mr-2" />
                          <span className="text-blue-700 font-medium">Eficiência de Recebimento</span>
                        </div>
                        <span className="font-bold text-blue-900">
                          {store.efficiency.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                          style={{ width: `${Math.min(store.efficiency, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Estado de Loja Não Atribuída */}
                {isUnassigned && (
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-amber-700">
                        <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                        <div>
                          <div className="font-medium">Loja sem atribuição</div>
                          <div className="text-sm">Necessário atribuir um cobrador responsável</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAndSortedStores.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Store className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhuma loja encontrada
          </h3>
          <p className="text-gray-600">
            {searchTerm
              ? "Tente ajustar os filtros de busca."
              : "Não há lojas cadastradas no sistema."}
          </p>
        </div>
      )}
    </div>
  );
};

export default EnhancedStoreManagement;
