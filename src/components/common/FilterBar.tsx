import React from "react";
import { Search, Filter, ChevronDown } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import FilterPanel from "../filters/FilterPanel";
import FilterPills from "../filters/FilterPills";
import {
  FilterValues,
  FilterContext,
  agingRangeToDueRange,
  dueToAgingSet,
  agingLabel,
  periodLabel,
  PAYMENT_STATUS_PILLS,
} from "../../filters/filterConfig";
import type { PillPatch } from "../filters/FilterPills";

import { FilterOptions, UserType, isCollectorType } from "../../types";

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  userType: UserType;
  /** Contexto do FilterPanel; default deriva do userType. */
  context?: FilterContext;
  /** Exibe a barra de busca (telas de agregacao tem busca propria). */
  showSearch?: boolean;
  /** Placeholder da busca (default: clientes/titulos). */
  searchPlaceholder?: string;
  /** Exibe as pills de status de pagamento (default true). */
  showStatusPills?: boolean;
  /** Exibe as pills de faixa de atraso (default true). */
  showAgingPills?: boolean;
  /** Conteúdo extra (ex.: pills próprias da tela) renderizado DENTRO do card. */
  children?: React.ReactNode;
}

const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  userType,
  context,
  showSearch = true,
  searchPlaceholder = "Buscar cliente, apelido, documento, título...",
  showStatusPills = true,
  showAgingPills = true,
  children,
}) => {
  const { getAvailableStores, users, getCollectorCollections, collections } =
    useCollection();
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = React.useState(false);
  // Mobile: recolhe pills/children atrás de um chevron (no desktop ficam sempre visíveis).
  const [mobileOpen, setMobileOpen] = React.useState(false);
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
  const collectors = users.filter((u) => isCollectorType(u.type));

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

  // Cidades para o gerente: derivadas de todas as collections (getCollectorCities
  // retorna [] para manager). Usado pelos contextos de agregacao (Performance/Lojas).
  const managerCities = React.useMemo(() => {
    if (userType !== "manager") return [];
    return Array.from(
      new Set(collections.map((c) => c.cidade).filter(Boolean)),
    ).sort() as string[];
  }, [userType, collections]);

  const collectorCities = React.useMemo(
    () => (userType === "manager" ? managerCities : getCollectorCities()),
    [userType, managerCities, getCollectorCities],
  );
  const collectorNeighborhoods = React.useMemo(
    () => getCollectorNeighborhoods(),
    [getCollectorNeighborhoods],
  );

  const clearFilters = () => {
    onFilterChange({});
    setSearchTerm("");
    setIsExpanded(false);
    setMobileOpen(false);
  };

  const activeFilterCount = React.useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  const hasActiveFilters = React.useMemo(
    () => Object.values(filters).some(Boolean),
    [filters],
  );

  // Adaptacao entre o modelo FilterOptions (legado desta tela) e o modelo
  // unificado FilterValues consumido pelo FilterPanel compartilhado.
  // Valores do painel avancado (sem status/atraso — esses ficam nas pills).
  const panelValues: FilterValues = {
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
    months: filters.months,
    years: filters.years,
  };

  // Pills (status de pagamento + faixa de atraso) sao multi-select. O status vira
  // lista em filters.status; o atraso vira a envoltoria de datas de vencimento.
  const handlePillsChange = (patch: PillPatch) => {
    const next: FilterOptions = { ...filters };
    if ("paymentStatus" in patch) {
      const v = patch.paymentStatus;
      const arr = Array.isArray(v) ? v : v ? [v] : [];
      next.status = arr.length ? arr : undefined;
    }
    if ("aging" in patch) {
      const v = patch.aging;
      const bands = Array.isArray(v) ? v : v ? [v] : [];
      const { dueFrom, dueTo } = agingRangeToDueRange(bands);
      next.dateFrom = dueFrom || undefined;
      next.dateTo = dueTo || undefined;
    }
    onFilterChange(next);
  };

  const selectedStatuses = Array.isArray(filters.status)
    ? filters.status
    : filters.status
      ? [filters.status]
      : [];

  const handlePanelChange = (patch: Partial<FilterValues>) => {
    const next: FilterOptions = { ...filters };
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
    // Periodo: arrays vazios viram undefined (= sem filtro), para nao contarem
    // como filtro ativo.
    if ("months" in patch)
      next.months =
        patch.months && patch.months.length ? patch.months : undefined;
    if ("years" in patch)
      next.years = patch.years && patch.years.length ? patch.years : undefined;
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
  selectedStatuses.forEach((st) => {
    const stLabel =
      PAYMENT_STATUS_PILLS.find((p) => p.value === st)?.label ?? st;
    activeFilterChips.push({
      label: `Status: ${stLabel}`,
      onClear: () => {
        const next = selectedStatuses.filter((s) => s !== st);
        onFilterChange({ ...filters, status: next.length ? next : undefined });
      },
    });
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
  if (filters.months?.length || filters.years?.length)
    activeFilterChips.push({
      label: `Período: ${periodLabel(filters.months, filters.years)}`,
      onClear: () =>
        onFilterChange({ ...filters, months: undefined, years: undefined }),
    });
  const derivedAgings = dueToAgingSet(filters.dateFrom, filters.dateTo);
  if (derivedAgings.length > 0) {
    derivedAgings.forEach((band) => {
      activeFilterChips.push({
        label: `Atraso: ${agingLabel(band)}`,
        onClear: () => {
          const next = derivedAgings.filter((b) => b !== band);
          const { dueFrom, dueTo } = agingRangeToDueRange(next);
          onFilterChange({
            ...filters,
            dateFrom: dueFrom || undefined,
            dateTo: dueTo || undefined,
          });
        },
      });
    });
  } else {
    if (filters.dateFrom)
      activeFilterChips.push({
        label: `Vencimento de: ${filters.dateFrom}`,
        onClear: () => onFilterChange({ ...filters, dateFrom: undefined }),
      });
    if (filters.dateTo)
      activeFilterChips.push({
        label: `Vencimento até: ${filters.dateTo}`,
        onClear: () => onFilterChange({ ...filters, dateTo: undefined }),
      });
  }

  return (
    <div className="space-y-3 mb-4">
      {/* Barra de Filtros Unificada */}
      <div className="bg-white dark:bg-dark-bg-secondary p-3 rounded-2xl border border-gray-150/80 dark:border-dark-border shadow-sm space-y-3">
        <div className="flex flex-row items-center gap-3">
          {/* Busca */}
          {showSearch && (
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                id="search-input"
                name="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-gray-450"
              />
            </div>
          )}
          {!showSearch && <div className="flex-1" />}

          {/* Mobile: chevron que recolhe/expande os demais filtros */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="filterbar-secondary"
            aria-label={mobileOpen ? "Recolher filtros" : "Expandir filtros"}
            className={`md:hidden px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 shrink-0 transition-all ${
              mobileOpen || hasActiveFilters
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border"
            }`}
          >
            {hasActiveFilters && (
              <span className="text-xs font-semibold leading-none">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${mobileOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Desktop: botão Filtros Avançados */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`hidden md:flex px-4 py-2 rounded-xl text-sm font-medium transition-all border items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
              isExpanded || hasActiveFilters
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>
              Filtros
              {hasActiveFilters && ` (${activeFilterCount})`}
            </span>
          </button>
        </div>

        {/* Demais filtros: no mobile ficam ocultos até expandir; no desktop sempre visíveis */}
        <div
          id="filterbar-secondary"
          className={`${mobileOpen ? "block" : "hidden"} md:block space-y-3`}
        >
          {/* Mobile: acesso ao painel avançado (no desktop usa-se o botão do topo) */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`md:hidden w-full px-4 py-2 rounded-xl text-sm font-medium transition-all border flex items-center justify-center gap-1.5 ${
              isExpanded
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Filtros avançados</span>
          </button>

          {/* Atalhos rápidos: status + faixa de atraso (componente compartilhado) */}
          {(showStatusPills || showAgingPills) && (
            <FilterPills
              paymentStatus={selectedStatuses}
              aging={dueToAgingSet(filters.dateFrom, filters.dateTo)}
              onChange={handlePillsChange}
              showPaymentStatus={showStatusPills}
              showAging={showAgingPills}
              multiPaymentStatus
              multiAging
            />
          )}

          {/* Slot para pills/conteúdo próprio da tela (dentro do card) */}
          {children}

          {/* Painel avançado compartilhado */}
          {isExpanded && (
            <FilterPanel
              context={
                context ??
                (userType === "manager"
                  ? "collections"
                  : "collectionsCollector")
              }
              values={panelValues}
              onChange={handlePanelChange}
              onClear={clearFilters}
              onClose={() => setIsExpanded(false)}
              options={panelOptions}
            />
          )}
        </div>
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
