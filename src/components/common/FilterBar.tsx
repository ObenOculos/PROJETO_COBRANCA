import React from "react";
import { Search, Filter, X } from "lucide-react";
import { FilterOptions } from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { getAllStatuses } from "../../utils/formatters";

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  userType: "manager" | "collector";
}

const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  userType,
}) => {
  const { getAvailableStores, users, getCollectorCollections } =
    useCollection();
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const availableStores = getAvailableStores();
  const collectors = users.filter((u) => u.type === "collector");

  // Para cobradores, buscar apenas as lojas dos seus clientes
  const getCollectorStores = () => {
    if (userType !== "collector" || !user) return availableStores;
    const myCollections = getCollectorCollections(user.id);
    const stores = Array.from(
      new Set(myCollections.map((c) => c.nome_da_loja).filter(Boolean)),
    );
    return stores.sort();
  };

  const collectorStores = getCollectorStores();

  // Para cobradores, buscar apenas as cidades e bairros dos seus clientes
  const getCollectorCities = () => {
    if (userType !== "collector" || !user) return [];
    const myCollections = getCollectorCollections(user.id);
    const cities = Array.from(
      new Set(myCollections.map((c) => c.cidade).filter(Boolean)),
    );
    return cities.sort();
  };

  const getCollectorNeighborhoods = () => {
    if (userType !== "collector" || !user) return [];
    const myCollections = getCollectorCollections(user.id);
    const neighborhoods = Array.from(
      new Set(myCollections.map((c) => c.bairro).filter(Boolean)),
    );
    return neighborhoods.sort();
  };

  const collectorCities = getCollectorCities();
  const collectorNeighborhoods = getCollectorNeighborhoods();

  const handleStatusChange = (status: string) => {
    onFilterChange({
      ...filters,
      status: status === "all" ? undefined : status,
    });
  };

  const handleLocationChange = (
    field: "city" | "neighborhood",
    value: string,
  ) => {
    onFilterChange({
      ...filters,
      [field]: value === "all" ? undefined : value,
    });
  };

  const handleSearchChange = (search: string) => {
    onFilterChange({ ...filters, search: search || undefined });
  };

  const clearFilters = () => {
    onFilterChange({});
    setIsExpanded(false);
  };

  const hasActiveFilters =
    filters.status ||
    filters.dueDate ||
    filters.city ||
    filters.neighborhood ||
    filters.store ||
    filters.collector ||
    filters.search ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.minAmount ||
    filters.maxAmount ||
    filters.overdueOnly ||
    filters.highValueOnly ||
    filters.visitsOnly;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-4">
      {/* Search Bar */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente, documento, título..."
            value={filters.search || ""}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Quick Filter Pills */}
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              onFilterChange({
                ...filters,
                status: filters.status === "pendente" ? undefined : "pendente",
              })
            }
            className={`px-3 py-2 text-xs font-medium rounded-full transition-colors ${
              filters.status === "pendente"
                ? "bg-red-100 text-red-700 border border-red-300"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Pendente
          </button>
          <button
            onClick={() =>
              onFilterChange({
                ...filters,
                status: filters.status === "pago" ? undefined : "pago",
              })
            }
            className={`px-3 py-2 text-xs font-medium rounded-full transition-colors ${
              filters.status === "pago"
                ? "bg-green-100 text-green-700 border border-green-300"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Pago
          </button>
          <button
            onClick={() =>
              onFilterChange({
                ...filters,
                status: filters.status === "parcial" ? undefined : "parcial",
              })
            }
            className={`px-3 py-2 text-xs font-medium rounded-full transition-colors ${
              filters.status === "parcial"
                ? "bg-orange-100 text-orange-700 border border-orange-300"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Parcial
          </button>
        </div>
      </div>

      {/* Filter Toggle Button */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between py-2 px-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center">
            <Filter className="h-4 w-4 text-gray-600 mr-2" />
            <span className="text-sm font-medium text-gray-700">
              Filtros avançados
              {hasActiveFilters && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  {Object.values(filters).filter(Boolean).length} ativos
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center">
            {hasActiveFilters && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  clearFilters();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    clearFilters();
                  }
                }}
                className="mr-2 p-1 text-red-600 hover:text-red-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </div>
            )}
            <svg
              className={`w-4 h-4 text-gray-500 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="px-4 sm:px-4 pb-6 space-y-4 border-t border-gray-200 pt-4">
          {/* Grid de filtros responsivo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                value={filters.status || "all"}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="all">Todos</option>
                {getAllStatuses().map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Filter - Mobile Stacked, Desktop Side by Side */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Período
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  value={filters.dateFrom || ""}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      dateFrom: e.target.value || undefined,
                    })
                  }
                  placeholder="De"
                />
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  value={filters.dateTo || ""}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      dateTo: e.target.value || undefined,
                    })
                  }
                  placeholder="Até"
                />
              </div>
            </div>

            {/* Store Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Loja
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                value={filters.store || "all"}
                onChange={(e) =>
                  onFilterChange({
                    ...filters,
                    store:
                      e.target.value === "all" ? undefined : e.target.value,
                  })
                }
              >
                <option value="all">Todas</option>
                {collectorStores
                  .filter((store) => store !== null)
                  .map((store) => (
                    <option key={store} value={store!}>
                      {store}
                    </option>
                  ))}
              </select>
            </div>

            {/* Collector Filter for Managers */}
            {userType === "manager" && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Cobrador
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  value={filters.collector || "all"}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      collector:
                        e.target.value === "all" ? undefined : e.target.value,
                    })
                  }
                >
                  <option value="all">Todos</option>
                  {collectors.map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Location Filters for Collectors */}
            {userType === "collector" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cidade
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    value={filters.city || "all"}
                    onChange={(e) =>
                      handleLocationChange("city", e.target.value)
                    }
                  >
                    <option value="all">Todas</option>
                    {collectorCities
                      .filter((city) => city !== null)
                      .map((city) => (
                        <option key={city} value={city!}>
                          {city}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Bairro
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    value={filters.neighborhood || "all"}
                    onChange={(e) =>
                      handleLocationChange("neighborhood", e.target.value)
                    }
                  >
                    <option value="all">Todos</option>
                    {collectorNeighborhoods
                      .filter((neighborhood) => neighborhood !== null)
                      .map((neighborhood) => (
                        <option key={neighborhood} value={neighborhood!}>
                          {neighborhood}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}

            {/* Amount Range Filter */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Valor
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Mínimo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  value={filters.minAmount || ""}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      minAmount: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                />
                <input
                  type="number"
                  placeholder="Máximo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  value={filters.maxAmount || ""}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      maxAmount: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </div>

            {/* Visits Only Filter - Only show for collectors */}
            {userType === "collector" && (
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Filtro de Visitas
                </label>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() =>
                      onFilterChange({
                        ...filters,
                        visitsOnly: !filters.visitsOnly,
                      })
                    }
                    className={`px-3 py-2 text-sm rounded-2xl border transition-colors ${
                      filters.visitsOnly
                        ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {filters.visitsOnly ? "✓ " : ""}Mostrar apenas clientes com
                    visitas agendadas
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="mt-4 p-3 bg-gray-50 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-gray-600">
                  Filtros ativos:
                </h4>
                <button
                  onClick={clearFilters}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Limpar tudo
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {filters.status && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-700">
                    Status: {filters.status}
                    <button
                      onClick={() =>
                        onFilterChange({ ...filters, status: undefined })
                      }
                      className="ml-1 text-gray-500 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.store && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-700">
                    Loja: {filters.store}
                    <button
                      onClick={() =>
                        onFilterChange({ ...filters, store: undefined })
                      }
                      className="ml-1 text-gray-500 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.collector && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-700">
                    Cobrador:{" "}
                    {collectors.find((c) => c.id === filters.collector)?.name}
                    <button
                      onClick={() =>
                        onFilterChange({ ...filters, collector: undefined })
                      }
                      className="ml-1 text-gray-500 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.city && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-700">
                    Cidade: {filters.city}
                    <button
                      onClick={() =>
                        onFilterChange({ ...filters, city: undefined })
                      }
                      className="ml-1 text-gray-500 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.visitsOnly && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                    Apenas com visitas
                    <button
                      onClick={() =>
                        onFilterChange({ ...filters, visitsOnly: undefined })
                      }
                      className="ml-1 text-blue-500 hover:text-blue-700"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
