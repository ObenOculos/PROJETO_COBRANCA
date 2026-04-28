import React from "react";
import { Search, Filter, X } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { getAllStatuses } from "../../utils/formatters";

import { FilterOptions, UserType } from "../../types";

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  userType: UserType;
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
  const [searchTerm, setSearchTerm] = React.useState(filters.search || "");

  // Debounce for search term
  React.useEffect(() => {
    const handler = setTimeout(() => {
      onFilterChange({ ...filters, search: searchTerm || undefined });
    }, 300); // 300ms delay

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  // Sync local search term if filters are cleared externally
  React.useEffect(() => {
    if (filters.search !== searchTerm) {
      setSearchTerm(filters.search || "");
    }
  }, [filters.search]);

  const availableStores = getAvailableStores();
  const collectors = users.filter(
    (u) => u.type === "collector" || u.type === "internal_collector",
  );

  // Para cobradores, buscar apenas as lojas dos seus clientes
  const getCollectorStores = () => {
    if (userType === "manager" || !user) return availableStores;
    const myCollections = getCollectorCollections(user.id);
    const stores = Array.from(
      new Set(myCollections.map((c) => c.nome_da_loja).filter(Boolean)),
    );
    return stores.sort();
  };

  const collectorStores = React.useMemo(
    () => getCollectorStores(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userType, user, getCollectorCollections, availableStores],
  );

  // Para cobradores, buscar apenas as cidades e bairros dos seus clientes
  const getCollectorCities = React.useCallback(() => {
    if (userType === "manager" || !user) return [];
    const myCollections = getCollectorCollections(user.id);
    const cities = Array.from(
      new Set(myCollections.map((c) => c.cidade).filter(Boolean)),
    );
    return cities.sort();
  }, [userType, user, getCollectorCollections]);

  const getCollectorNeighborhoods = React.useCallback(() => {
    if (userType === "manager" || !user) return [];
    const myCollections = getCollectorCollections(user.id);
    const neighborhoods = Array.from(
      new Set(myCollections.map((c) => c.bairro).filter(Boolean)),
    );
    return neighborhoods.sort();
  }, [userType, user, getCollectorCollections]);

  const collectorCities = React.useMemo(
    () => getCollectorCities(),
    [getCollectorCities],
  );
  const collectorNeighborhoods = React.useMemo(
    () => getCollectorNeighborhoods(),
    [getCollectorNeighborhoods],
  );

  const handleFilterChange = <K extends keyof FilterOptions>(
    field: K,
    value: FilterOptions[K],
  ) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const handleStatusChange = (status: string) => {
    handleFilterChange("status", status === "all" ? undefined : status);
  };

  const handleLocationChange = (
    field: "city" | "neighborhood",
    value: string,
  ) => {
    handleFilterChange(field, value === "all" ? undefined : value);
  };

  const clearFilters = () => {
    onFilterChange({});
    setIsExpanded(false);
  };

  const hasActiveFilters = React.useMemo(
    () => Object.values(filters).some(Boolean),
    [filters],
  );

  return (
    <div className="bg-gray-50 rounded-2xl shadow-sm border border-gray-200 mb-4">
      {/* Search Bar */}
      <div className="p-4">
        <div className="relative">
          <label htmlFor="search-input" className="sr-only">
            Buscar
          </label>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            id="search-input"
            name="search"
            type="text"
            placeholder="Buscar cliente, apelido, documento, título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
          className="w-full flex items-center justify-between py-2 px-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors border border-gray-200"
        >
          <div className="flex items-center">
            <Filter className="h-4 w-4 text-gray-600 mr-2" />
            <span className="text-sm font-medium text-gray-700">
              Filtros avançados
              {hasActiveFilters && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
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
            <h3 className="col-span-full text-sm font-semibold text-gray-800 mb-2 mt-4">
              Filtros de Cobrança
            </h3>
            {/* Status Filter */}
            <div>
              <label
                htmlFor="status-select"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Status
              </label>
              <select
                id="status-select"
                name="status"
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
            <div
              className="sm:col-span-2 lg:col-span-1"
              role="group"
              aria-labelledby="date-range-label"
            >
              <label
                id="date-range-label"
                htmlFor="date-from-input"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Período de Vencimento
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="date-from-input"
                  name="dateFrom"
                  type="date"
                  aria-label="Data de início"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  defaultValue={filters.dateFrom || ""}
                  onBlur={(e) =>
                    onFilterChange({
                      ...filters,
                      dateFrom: e.target.value || undefined,
                    })
                  }
                  placeholder="De"
                />
                <input
                  id="date-to-input"
                  name="dateTo"
                  type="date"
                  aria-label="Data de término"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  defaultValue={filters.dateTo || ""}
                  onBlur={(e) =>
                    onFilterChange({
                      ...filters,
                      dateTo: e.target.value || undefined,
                    })
                  }
                  placeholder="Até"
                />
              </div>
            </div>

            <div
              className="sm:col-span-2 lg:col-span-1"
              role="group"
              aria-labelledby="launch-date-range-label"
            >
              <label
                id="launch-date-range-label"
                htmlFor="launch-date-from-input"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Período de Lançamento
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="launch-date-from-input"
                  name="launchDateFrom"
                  type="date"
                  aria-label="Data de início do lançamento"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  defaultValue={filters.launchDateFrom || ""}
                  onBlur={(e) =>
                    onFilterChange({
                      ...filters,
                      launchDateFrom: e.target.value || undefined,
                    })
                  }
                  placeholder="De"
                />
                <input
                  id="launch-date-to-input"
                  name="launchDateTo"
                  type="date"
                  aria-label="Data de término do lançamento"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  defaultValue={filters.launchDateTo || ""}
                  onBlur={(e) =>
                    onFilterChange({
                      ...filters,
                      launchDateTo: e.target.value || undefined,
                    })
                  }
                  placeholder="Até"
                />
              </div>
            </div>

            {/* Amount Range Filter */}
            <div
              className="sm:col-span-2 lg:col-span-1"
              role="group"
              aria-labelledby="amount-range-label"
            >
              <label
                id="amount-range-label"
                htmlFor="min-amount-input"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Valor
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="min-amount-input"
                  name="minAmount"
                  type="number"
                  aria-label="Valor mínimo"
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
                  id="max-amount-input"
                  name="maxAmount"
                  type="number"
                  aria-label="Valor máximo"
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

            <h3 className="col-span-full text-sm font-semibold text-gray-800 mb-2 mt-4">
              Filtros de Atribuição
            </h3>
            {/* Store Filter */}
            <div>
              <label
                htmlFor="store-select"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Loja
              </label>
              <select
                id="store-select"
                name="store"
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
                <label
                  htmlFor="collector-select"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Cobrador
                </label>
                <select
                  id="collector-select"
                  name="collector"
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
            {(userType === "collector" || userType === "internal_collector") && (
              <>
                <div
                  className="sm:col-span-2 lg:col-span-1"
                  role="group"
                  aria-labelledby="location-label"
                >
                  <label
                    id="location-label"
                    htmlFor="city-select"
                    className="block text-xs font-medium text-gray-700 mb-1"
                  >
                    Localização
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      id="city-select"
                      name="city"
                      aria-label="Cidade"
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      value={filters.city || "all"}
                      onChange={(e) =>
                        handleLocationChange("city", e.target.value)
                      }
                    >
                      <option value="all">Cidade</option>
                      {collectorCities
                        .filter((city) => city !== null)
                        .map((city) => (
                          <option key={city} value={city!}>
                            {city}
                          </option>
                        ))}
                    </select>
                    <select
                      id="neighborhood-select"
                      name="neighborhood"
                      aria-label="Bairro"
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      value={filters.neighborhood || "all"}
                      onChange={(e) =>
                        handleLocationChange("neighborhood", e.target.value)
                      }
                    >
                      <option value="all">Bairro</option>
                      {collectorNeighborhoods
                        .filter((neighborhood) => neighborhood !== null)
                        .map((neighborhood) => (
                          <option key={neighborhood} value={neighborhood!}>
                            {neighborhood}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            <h3 className="col-span-full text-sm font-semibold text-gray-800 mb-2 mt-4">
              Filtros Específicos
            </h3>
            {/* Visits Only Filter - Only show for collectors */}
            {(userType === "collector" || userType === "internal_collector") && (
              <div
                className="sm:col-span-2 lg:col-span-3"
                role="group"
                aria-labelledby="visits-filter-label"
              >
                <span
                  id="visits-filter-label"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Filtro de Visitas
                </span>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() =>
                      onFilterChange({
                        ...filters,
                        visitsOnly: !filters.visitsOnly,
                      })
                    }
                    className={`px-3 py-2 text-sm font-medium rounded-2xl border transition-colors ${
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

          {/* Botão Fechar para mobile */}
          <div className="mt-4">
            <button
              onClick={() => setIsExpanded(false)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors text-sm font-medium sm:hidden"
            >
              Fechar
            </button>
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="mt-4 p-3 bg-gray-50 rounded-2xl border border-gray-200">
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
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
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
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
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
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
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
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
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
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
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
