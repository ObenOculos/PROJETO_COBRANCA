import React from "react";
import { Search, Filter, X } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import FilterPanel from "../filters/FilterPanel";
import { FilterValues } from "../../filters/filterConfig";

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

  const clearFilters = () => {
    onFilterChange({});
    setIsExpanded(false);
  };

  const hasActiveFilters = React.useMemo(
    () => Object.values(filters).some(Boolean),
    [filters],
  );

  // Adaptacao entre o modelo FilterOptions (legado desta tela) e o modelo
  // unificado FilterValues consumido pelo FilterPanel compartilhado.
  const panelValues: FilterValues = {
    paymentStatus: filters.status,
    dueFrom: filters.dateFrom,
    dueTo: filters.dateTo,
    launchFrom: filters.launchDateFrom,
    launchTo: filters.launchDateTo,
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
    store: filters.store,
    collector: filters.collector,
    city: filters.city,
    neighborhood: filters.neighborhood,
    visitsOnly: filters.visitsOnly,
  };

  const handlePanelChange = (patch: Partial<FilterValues>) => {
    const next: FilterOptions = { ...filters };
    if ("paymentStatus" in patch) next.status = patch.paymentStatus || undefined;
    if ("dueFrom" in patch) next.dateFrom = patch.dueFrom || undefined;
    if ("dueTo" in patch) next.dateTo = patch.dueTo || undefined;
    if ("launchFrom" in patch)
      next.launchDateFrom = patch.launchFrom || undefined;
    if ("launchTo" in patch) next.launchDateTo = patch.launchTo || undefined;
    if ("minAmount" in patch) next.minAmount = patch.minAmount;
    if ("maxAmount" in patch) next.maxAmount = patch.maxAmount;
    if ("store" in patch) next.store = patch.store || undefined;
    if ("collector" in patch) next.collector = patch.collector || undefined;
    if ("city" in patch) next.city = patch.city || undefined;
    if ("neighborhood" in patch)
      next.neighborhood = patch.neighborhood || undefined;
    if ("visitsOnly" in patch) next.visitsOnly = patch.visitsOnly || undefined;
    onFilterChange(next);
  };

  const panelOptions = {
    stores: collectorStores.filter((s): s is string => Boolean(s)),
    cities: collectorCities.filter((c): c is string => Boolean(c)),
    neighborhoods: collectorNeighborhoods.filter((n): n is string =>
      Boolean(n),
    ),
    collectors: collectors.map((c) => ({ value: c.id, label: c.name })),
  };

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
          <button
            onClick={() =>
              onFilterChange({
                ...filters,
                status:
                  filters.status === "cancelado" ? undefined : "cancelado",
              })
            }
            className={`px-3 py-2 text-xs font-medium rounded-full transition-colors ${
              filters.status === "cancelado"
                ? "bg-gray-300 text-gray-800 border border-gray-400"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Cancelado
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

      {/* Expanded Filters (painel compartilhado) */}
      {isExpanded && (
        <div className="px-4 sm:px-4 pb-6 space-y-4 border-t border-gray-200 pt-4">
          <FilterPanel
            context={
              userType === "manager" ? "collections" : "collectionsCollector"
            }
            values={panelValues}
            onChange={handlePanelChange}
            onClear={clearFilters}
            onClose={() => setIsExpanded(false)}
            options={panelOptions}
          />

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
