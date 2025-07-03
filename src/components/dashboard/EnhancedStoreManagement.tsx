import React, { useState, useMemo } from "react";
import {
  Store,
  AlertCircle,
  CheckCircle,
  Search,
  Download,
  BarChart3,
  TrendingUp,
  Building,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/mockData";

interface StoreStats {
  storeName: string;
  assignedCollector: string;
  collectorName: string;
  isFormalAssignment: boolean;
  totalCollections: number;
  totalSales: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  conversionRate: number;
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

      // Group by sale
      const salesMap = new Map<
        string,
        {
          totalValue: number;
          receivedValue: number;
          clientDocument: string;
          clientName: string; // Adicionado clientName aqui
        }
      >();

      storeCollections.forEach((collection) => {
        const saleKey = `${collection.venda_n}-${collection.documento}`;
        if (!salesMap.has(saleKey)) {
          salesMap.set(saleKey, {
            totalValue: 0,
            receivedValue: 0,
            clientDocument: collection.documento || "",
            clientName: collection.cliente || "", // Atribuído clientName aqui
          });
        }

        const sale = salesMap.get(saleKey)!;
        sale.totalValue += collection.valor_original;
        sale.receivedValue += collection.valor_recebido;
      });

      const salesArray = Array.from(salesMap.values());
      const completedSales = salesArray.filter((s) => {
        const pending = s.totalValue - s.receivedValue;
        return pending <= 0.01 && s.receivedValue > 0;
      }).length;

      const totalCollections = salesArray.length;
      const totalAmount = salesArray.reduce((sum, s) => sum + s.totalValue, 0);
      const receivedAmount = salesArray.reduce(
        (sum, s) => sum + s.receivedValue,
        0,
      );
      const pendingAmount = totalAmount - receivedAmount;
      const conversionRate =
        salesArray.length > 0 ? (completedSales / salesArray.length) * 100 : 0;
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
        totalAmount,
        receivedAmount,
        pendingAmount,
        conversionRate,
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
    const csvContent = [
      "Loja,Cobrador,Vendas,Taxa de Conversão,Valor Total,Valor Recebido,Clientes",
      ...storeStats.map(
        (s) =>
          `"${s.storeName}","${s.collectorName}",${s.totalCollections},${s.conversionRate.toFixed(1)}%,${s.totalAmount},${s.receivedAmount},${s.clientsCount}`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 lg:p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                <Building className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
                <span className="truncate">Acompanhamento de Lojas</span>
              </h2>
              <p className="text-gray-600 mt-1 text-sm lg:text-base">
                Monitore performance e status das lojas
              </p>
            </div>

            <button
              onClick={exportStoreData}
              className="flex items-center justify-center px-3 lg:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
            >
              <Download className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Exportar Dados</span>
              <span className="sm:hidden">Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 lg:p-6 rounded-xl border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-700">
                Total de Lojas
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-blue-900 truncate">
                {overviewStats.totalStores}
              </p>
            </div>
            <Building className="h-8 w-8 lg:h-10 lg:w-10 text-blue-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 lg:p-6 rounded-xl border border-green-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-700">
                Lojas Atribuídas
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-green-900">
                {overviewStats.assignedStores}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 lg:h-10 lg:w-10 text-green-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 lg:p-6 rounded-xl border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-purple-700">Taxa Média</p>
              <p className="text-2xl lg:text-3xl font-bold text-purple-900 truncate">
                {overviewStats.avgConversionRate.toFixed(1)}%
              </p>
            </div>
            <TrendingUp className="h-8 w-8 lg:h-10 lg:w-10 text-purple-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 lg:p-6 rounded-xl border border-orange-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-orange-700">
                Receita Total
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-orange-900 truncate">
                {formatCurrency(overviewStats.totalRevenue)}
              </p>
            </div>
            <BarChart3 className="h-8 w-8 lg:h-10 lg:w-10 text-orange-600 flex-shrink-0 ml-2" />
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-4 lg:p-6 border-b border-gray-200 bg-white rounded-xl">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="store-search"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                id="store-search"
                name="storeSearch"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nome da loja ou cobrador..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="sort-by"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Ordenar Por
              </label>
              <select
                id="sort-by"
                name="sortBy"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="storeName">Nome da Loja</option>
                <option value="conversionRate">Taxa de Conversão</option>
                <option value="totalAmount">Valor Total</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ordem
              </label>
              <button
                onClick={() =>
                  setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                }
                className="w-full flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {sortOrder === "asc" ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Crescente</span>
                    <span className="sm:hidden">↑</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Decrescente</span>
                    <span className="sm:hidden">↓</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Store Cards */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900">
            Lojas ({filteredAndSortedStores.length})
          </h3>
          <div className="text-sm text-gray-600">
            {overviewStats.unassignedStores > 0 && (
              <span className="text-amber-600 whitespace-nowrap">
                {overviewStats.unassignedStores} loja
                {overviewStats.unassignedStores !== 1 ? "s" : ""} sem atribuição
              </span>
            )}
          </div>
        </div>

        {filteredAndSortedStores.map((store) => {
          const isExpanded = expandedCards.has(store.storeName);
          const isUnassigned = !store.assignedCollector;

          return (
            <div
              key={store.storeName}
              className={`bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md ${
                isUnassigned
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-200"
              }`}
            >
              <div className="p-4 lg:p-6">
                <div className="flex flex-col gap-4">
                  {/* Mobile: Stack vertically for better readability */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 lg:h-12 lg:w-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isUnassigned ? "bg-amber-100" : "bg-blue-100"
                      }`}
                    >
                      <Store
                        className={`h-5 w-5 lg:h-6 lg:w-6 ${isUnassigned ? "text-amber-600" : "text-blue-600"}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base lg:text-lg font-semibold text-gray-900 flex items-center flex-wrap gap-2">
                        <span className="truncate">{store.storeName}</span>
                        {isUnassigned && (
                          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        )}
                      </h4>

                      {/* Mobile: Show conversion rate below store name */}
                      <div className="mt-2 flex items-center justify-between">
                        <div>
                          <div className="text-xl lg:text-2xl font-bold text-gray-900">
                            {store.conversionRate.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-600">
                            Taxa de Conversão
                          </div>
                        </div>
                        <button
                          onClick={() => toggleCardExpansion(store.storeName)}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {!isUnassigned && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Performance da Loja</span>
                        <span>
                          {store.totalSales} vendas • {store.clientsCount}{" "}
                          clientes
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ${
                            store.conversionRate >= 70
                              ? "bg-green-500"
                              : store.conversionRate >= 40
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          style={{
                            width: `${Math.min(store.conversionRate, 100)}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Basic Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-blue-600">
                        {store.totalSales}
                      </div>
                      <div className="text-xs text-gray-600">Vendas</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-green-600 truncate">
                        {formatCurrency(store.receivedAmount)}
                      </div>
                      <div className="text-xs text-gray-600">Recebido</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-red-600 truncate">
                        {formatCurrency(store.pendingAmount)}
                      </div>
                      <div className="text-xs text-gray-600">Pendente</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-base lg:text-lg font-bold text-purple-600">
                        {store.clientsCount}
                      </div>
                      <div className="text-xs text-gray-600">Clientes</div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && !isUnassigned && (
                  <div className="mt-4 lg:mt-6 pt-4 lg:pt-6 border-t border-gray-200">
                    <div>
                      <h5 className="font-medium text-gray-900 mb-3">
                        Informações Financeiras
                      </h5>
                      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-4">
                        <div className="flex justify-between lg:flex-col lg:text-center p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-600 lg:mb-1">
                            Valor Total
                          </span>
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {formatCurrency(store.totalAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between lg:flex-col lg:text-center p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-600 lg:mb-1">
                            Eficiência
                          </span>
                          <span className="text-sm font-medium text-green-600">
                            {store.totalAmount > 0
                              ? (
                                  (store.receivedAmount / store.totalAmount) *
                                  100
                                ).toFixed(1)
                              : 0}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between lg:flex-col lg:text-center p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-600 lg:mb-1">
                            Ticket Médio
                          </span>
                          <span className="text-sm font-medium text-blue-600 truncate">
                            {formatCurrency(
                              store.totalSales > 0
                                ? store.totalAmount / store.totalSales
                                : 0,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Unassigned Store Info */}
                {isUnassigned && (
                  <div className="mt-4 p-3 lg:p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center text-amber-700">
                      <AlertCircle className="h-4 w-4 lg:h-5 lg:w-5 mr-2 flex-shrink-0" />
                      <span className="text-sm font-medium">
                        Esta loja não possui cobrador atribuído
                      </span>
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
