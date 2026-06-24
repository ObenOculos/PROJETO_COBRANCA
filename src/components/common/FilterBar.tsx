import React from "react";
import { Search, Filter } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import FilterPanel from "../filters/FilterPanel";
import FilterPills from "../filters/FilterPills";
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
    setSearchTerm("");
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
    aging: filters.aging,
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
    if ("aging" in patch) next.aging = patch.aging || undefined;
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

  // Chips de filtros ativos (mesmo padrao visual da Atribuicao).
  const activeFilterChips: { label: string; onClear: () => void }[] = [];
  if (filters.search)
    activeFilterChips.push({
      label: `Busca: "${filters.search}"`,
      onClear: () => {
        setSearchTerm("");
        onFilterChange({ ...filters, search: undefined });
      },
    });
  if (filters.status)
    activeFilterChips.push({
      label: `Status: ${filters.status}`,
      onClear: () => onFilterChange({ ...filters, status: undefined }),
    });
  if (filters.store)
    activeFilterChips.push({
      label: `Loja: ${filters.store}`,
      onClear: () => onFilterChange({ ...filters, store: undefined }),
    });
  if (filters.collector)
    activeFilterChips.push({
      label: `Cobrador: ${collectors.find((c) => c.id === filters.collector)?.name ?? ""}`,
      onClear: () => onFilterChange({ ...filters, collector: undefined }),
    });
  if (filters.city)
    activeFilterChips.push({
      label: `Cidade: ${filters.city}`,
      onClear: () => onFilterChange({ ...filters, city: undefined }),
    });
  if (filters.neighborhood)
    activeFilterChips.push({
      label: `Bairro: ${filters.neighborhood}`,
      onClear: () => onFilterChange({ ...filters, neighborhood: undefined }),
    });
  if (filters.visitsOnly)
    activeFilterChips.push({
      label: "Apenas com visitas",
      onClear: () => onFilterChange({ ...filters, visitsOnly: undefined }),
    });
  if (filters.aging)
    activeFilterChips.push({
      label: `Atraso: +${filters.aging} dias`,
      onClear: () => onFilterChange({ ...filters, aging: undefined }),
    });

  return (
    <div className="space-y-3 mb-4">
      {/* Barra de Filtros Unificada */}
      <div className="bg-white dark:bg-dark-bg-secondary p-3 rounded-2xl border border-gray-150/80 dark:border-dark-border shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              id="search-input"
              name="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente, apelido, documento, título..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-gray-450"
            />
          </div>

          {/* Botão Filtros Avançados */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
              isExpanded || hasActiveFilters
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>
              Filtros
              {hasActiveFilters &&
                ` (${Object.values(filters).filter(Boolean).length})`}
            </span>
          </button>
        </div>

        {/* Atalhos rápidos: status + faixa de atraso (componente compartilhado) */}
        <FilterPills
          values={panelValues}
          onChange={handlePanelChange}
          showPaymentStatus
          showAging
        />

        {/* Painel avançado compartilhado */}
        {isExpanded && (
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
        )}
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50/50 dark:bg-dark-bg/25 rounded-xl border border-gray-150/40 dark:border-dark-border/40">
          <span className="text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary pl-1.5 mr-1">
            Filtros ativos:
          </span>
          {activeFilterChips.map((chip, index) => (
            <div
              key={index}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text border border-gray-200 dark:border-dark-border rounded-lg shadow-sm"
            >
              <span>{chip.label}</span>
              <button
                onClick={chip.onClear}
                className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-dark-bg transition-all ml-1"
                title="Remover filtro"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            onClick={clearFilters}
            className="ml-auto text-[10px] font-bold text-red-500 hover:text-red-600 hover:underline px-2 transition-colors"
          >
            Limpar Todos
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterBar;
