import React, { useState, useRef, useEffect } from "react";
import {
  Filter,
  Search,
  MapPin,
  DollarSign,
  Calendar,
  Clock,
  X,
  ChevronDown,
  Check,
  Star,
} from "lucide-react";

interface VisitFilters {
  searchName: string;
  searchDocument: string;
  neighborhoods: string[];
  cities: string[];
  minValue: string;
  maxValue: string;
  visitStatus: string;
  dueDateStart: string;
  dueDateEnd: string;
  onlyNew: boolean;
  overdueDays: string;
  hasVisits: boolean;
  noVisits: boolean;
}

interface VisitFiltersPanelProps {
  filters: VisitFilters;
  onFiltersChange: (filters: VisitFilters) => void;
  availableCities: string[];
  availableNeighborhoods: string[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

const VisitFiltersPanel: React.FC<VisitFiltersPanelProps> = ({
  filters,
  onFiltersChange,
  availableCities,
  availableNeighborhoods,
  isExpanded,
  onToggleExpanded,
  onClearFilters,
  hasActiveFilters,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] = useState(false);

  // Fechar dropdowns quando clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setShowCityDropdown(false);
        setShowNeighborhoodDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateFilter = <K extends keyof VisitFilters>(
    key: K,
    value: VisitFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (key: "cities" | "neighborhoods", value: string) => {
    const currentArray = filters[key];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateFilter(key, newArray);
  };

  const visitStatusOptions = [
    { value: "", label: "Todos os status" },
    { value: "recent", label: "Visitas recentes (até 30 dias)" },
    { value: "low", label: "Pouco tempo (30-60 dias)" },
    { value: "medium", label: "Tempo médio (60-90 dias)" },
    { value: "high", label: "Muito tempo (90-120 dias)" },
    { value: "critical", label: "Crítico (mais de 120 dias)" },
    { value: "never-visited", label: "Nunca visitado" },
  ];

  return (
    <div ref={panelRef} className="relative">
      {/* Botão do Filtro */}
      <button
        onClick={onToggleExpanded}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-200 ${
          hasActiveFilters
            ? "bg-blue-50 border-blue-300 text-blue-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filtros</span>
        {hasActiveFilters && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
            {Object.values(filters).filter(value =>
              Array.isArray(value) ? value.length > 0 : Boolean(value)
            ).length}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {/* Painel Expandido */}
      {isExpanded && (
        <div className="absolute top-full mt-2 right-0 z-50 w-96 bg-white rounded-xl shadow-xl border border-gray-200 p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Filtros Avançados</h3>
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                Limpar
              </button>
            )}
          </div>

          <div className="space-y-6">
            {/* Pesquisa por Nome/Documento */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Search className="h-4 w-4" />
                Pesquisa por Cliente
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nome do cliente..."
                  value={filters.searchName}
                  onChange={(e) => updateFilter("searchName", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="CPF/CNPJ..."
                  value={filters.searchDocument}
                  onChange={(e) => updateFilter("searchDocument", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Localização */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <MapPin className="h-4 w-4" />
                Localização
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Cidades */}
                <div className="relative">
                  <button
                    onClick={() => setShowCityDropdown(!showCityDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                  >
                    <span className="truncate">
                      {filters.cities.length === 0 ? "Cidades" :
                       filters.cities.length === 1 ? filters.cities[0] :
                       `${filters.cities.length} selecionadas`}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                  {showCityDropdown && (
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {availableCities.map((city) => (
                        <button
                          key={city}
                          onClick={() => toggleArrayFilter("cities", city)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span>{city}</span>
                          {filters.cities.includes(city) && (
                            <Check className="h-4 w-4 text-blue-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bairros */}
                <div className="relative">
                  <button
                    onClick={() => setShowNeighborhoodDropdown(!showNeighborhoodDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                  >
                    <span className="truncate">
                      {filters.neighborhoods.length === 0 ? "Bairros" :
                       filters.neighborhoods.length === 1 ? filters.neighborhoods[0] :
                       `${filters.neighborhoods.length} selecionados`}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                  {showNeighborhoodDropdown && (
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {availableNeighborhoods.map((neighborhood) => (
                        <button
                          key={neighborhood}
                          onClick={() => toggleArrayFilter("neighborhoods", neighborhood)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span>{neighborhood}</span>
                          {filters.neighborhoods.includes(neighborhood) && (
                            <Check className="h-4 w-4 text-blue-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Valores */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <DollarSign className="h-4 w-4" />
                Faixa de Valores
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Valor mínimo"
                  value={filters.minValue}
                  onChange={(e) => updateFilter("minValue", e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="number"
                  placeholder="Valor máximo"
                  value={filters.maxValue}
                  onChange={(e) => updateFilter("maxValue", e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status de Visitas */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Clock className="h-4 w-4" />
                Status de Visitas
              </div>
              <select
                value={filters.visitStatus}
                onChange={(e) => updateFilter("visitStatus", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {visitStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Datas de Vencimento */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calendar className="h-4 w-4" />
                Período de Vencimento
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filters.dueDateStart}
                  onChange={(e) => updateFilter("dueDateStart", e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="date"
                  value={filters.dueDateEnd}
                  onChange={(e) => updateFilter("dueDateEnd", e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Opções Especiais */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Star className="h-4 w-4" />
                Opções Especiais
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.onlyNew}
                    onChange={(e) => updateFilter("onlyNew", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Apenas clientes novos (últimos 30 dias)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.hasVisits}
                    onChange={(e) => updateFilter("hasVisits", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Com visitas agendadas</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.noVisits}
                    onChange={(e) => updateFilter("noVisits", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Sem visitas agendadas</span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onToggleExpanded}
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitFiltersPanel;