import React, { useState, useEffect, useMemo, useRef } from "react";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { AllowedVisitDate, isCollectorType } from "../../types";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  MapPin,
  Trash2,
  Plus,
  Info,
  Building2,
} from "lucide-react";
import { dataCache } from "../../utils/cache";
import { distinctSorted } from "../../filters/facets";

// Classes reaproveitadas do padrao visual do sistema (ver FilterPanel), com dark
// mode, para manter a tela consistente com o restante do app.
const labelClass =
  "block text-xs font-semibold text-gray-500 dark:text-dark-text-secondary mb-2 tracking-wide";
const controlClass =
  "w-full px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all";

const AllowedVisitDatesManager: React.FC = () => {
  const { collections, users, fetchAllowedVisitDates } = useCollection();

  // Estados de dados
  const [allowedDates, setAllowedDates] = useState<AllowedVisitDate[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  // Estados de seleção do formulário (consolidados). `neighborhoods` é opcional:
  // vazio = regra de nível cidade (cidade inteira). Só se aplica quando UMA cidade
  // está selecionada (bairros são específicos da cidade).
  const [formSelection, setFormSelection] = useState({
    cities: [] as string[],
    neighborhoods: [] as string[],
    days: [] as string[],
  });

  // Estados de UI dos dropdowns (consolidados)
  const [dropdownsOpen, setDropdownsOpen] = useState({
    city: false,
    neighborhood: false,
    day: false,
  });

  // Estados de filtros (consolidados)
  const [filters, setFilters] = useState({
    collector: "all" as string,
    calendarCity: "all" as string,
    calendarCollector: "all" as string,
  });

  // Estados de UI geral
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Estados de modais (consolidados)
  const [modals, setModals] = useState({
    deleteModal: false,
    calendar: false,
    cityToDelete: null as string | null,
  });

  // Refs
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const neighborhoodDropdownRef = useRef<HTMLDivElement>(null);
  const dayDropdownRef = useRef<HTMLDivElement>(null);
  const calendarModalRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown e modal ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownsOpen((prev) => ({ ...prev, city: false }));
      }
      if (
        neighborhoodDropdownRef.current &&
        !neighborhoodDropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownsOpen((prev) => ({ ...prev, neighborhood: false }));
      }
      if (
        dayDropdownRef.current &&
        !dayDropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownsOpen((prev) => ({ ...prev, day: false }));
      }
      if (
        modals.calendar &&
        calendarModalRef.current &&
        !calendarModalRef.current.contains(event.target as Node)
      ) {
        setModals({
          deleteModal: false,
          calendar: false,
          cityToDelete: null,
        });
        setFilters((prev) => ({
          ...prev,
          calendarCity: "all",
          calendarCollector: "all",
        }));
      }
    };

    if (
      dropdownsOpen.city ||
      dropdownsOpen.neighborhood ||
      dropdownsOpen.day ||
      modals.calendar
    ) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [
    dropdownsOpen.city,
    dropdownsOpen.neighborhood,
    dropdownsOpen.day,
    modals.calendar,
  ]);

  // Gerenciar scroll da página quando modal abre/fecha
  useEffect(() => {
    if (modals.calendar) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [modals.calendar]);

  // Resetar bairros/dias e paginação quando mudar a seleção de cidades (bairros
  // são específicos da cidade).
  useEffect(() => {
    setFormSelection((prev) => ({
      ...prev,
      neighborhoods: [],
      days: [],
    }));
    setDropdownsOpen((prev) => ({
      ...prev,
      neighborhood: false,
      day: false,
    }));
    setCurrentPage(1);
  }, [formSelection.cities]);

  // Resetar cidade quando mudar o filtro de cobrador
  useEffect(() => {
    setFormSelection((prev) => ({ ...prev, cities: [] }));
  }, [filters.collector]);

  useEffect(() => {
    const fetchAllowed = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("allowed_visit_dates")
          .select("*")
          .order("city", { ascending: true })
          .order("allowed_date", { ascending: true });

        if (error) {
          console.error("Erro ao buscar datas permitidas:", error);
          setError(error.message);
        } else {
          // allowed_date e nullable no banco mas sempre preenchido (dia 1-31);
          // o dominio o trata como number.
          setAllowedDates((data || []) as AllowedVisitDate[]);
        }
      } catch (err) {
        console.error("Erro ao buscar datas permitidas:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Erro ao buscar datas permitidas";
        setError(errorMessage);
      }
      setLoading(false);
    };

    fetchAllowed();
  }, []);

  useEffect(() => {
    if (collections) {
      // Cidades dos clientes
      const citiesFromCollections = collections
        .map((c) => c.cidade)
        .filter(Boolean) as string[];

      // Cidades das datas permitidas
      const citiesFromAllowedDates = allowedDates
        .map((d) => d.city)
        .filter(Boolean);

      // Combinar ambas as fontes e remover duplicatas
      const uniqueCities = [
        ...new Set([...citiesFromCollections, ...citiesFromAllowedDates]),
      ];

      // Ordenar cidades em ordem alfabética
      uniqueCities.sort((a, b) => a.localeCompare(b, "pt-BR"));
      setCities(uniqueCities);
    }
  }, [collections, allowedDates]);

  // Lista de cobradores
  const collectors = useMemo(() => {
    if (!users) return [];
    return users
      .filter((u) => isCollectorType(u.type))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [users]);

  const collectorName = (id?: string | null): string =>
    collectors.find((c) => c.id === id)?.name || "Sem cobrador";

  // Sincroniza a fonte compartilhada (contexto) apos mutacoes, para que o
  // VisitScheduler passe a sugerir as datas atualizadas sem recarregar a pagina.
  const refreshSharedDates = () => {
    dataCache.invalidatePrefix("allowed-visit-dates");
    fetchAllowedVisitDates();
  };

  // Filtrar cidades baseado no cobrador selecionado
  const filteredCities = useMemo(() => {
    if (filters.collector === "all") {
      return cities;
    }

    const collectorCities = new Set(
      collections
        .filter((c) => c.user_id === filters.collector)
        .map((c) => c.cidade)
        .filter(Boolean),
    );

    return cities.filter((city) => collectorCities.has(city));
  }, [filters.collector, cities, collections]);

  const handleToggleCity = (city: string) => {
    setFormSelection((prev) => {
      if (prev.cities.includes(city)) {
        return { ...prev, cities: prev.cities.filter((c) => c !== city) };
      } else {
        return { ...prev, cities: [...prev.cities, city] };
      }
    });
  };

  const handleToggleAllCities = () => {
    if (formSelection.cities.length === filteredCities.length) {
      setFormSelection((prev) => ({ ...prev, cities: [] }));
    } else {
      setFormSelection((prev) => ({ ...prev, cities: [...filteredCities] }));
    }
  };

  // Bairro só é aplicável quando UMA única cidade está selecionada (bairros são
  // específicos da cidade). Com várias cidades, cria-se sempre no nível cidade.
  const singleSelectedCity =
    formSelection.cities.length === 1 ? formSelection.cities[0] : null;

  // Bairros disponíveis: dos clientes do cobrador naquela cidade.
  const availableNeighborhoods = useMemo(() => {
    if (!singleSelectedCity || filters.collector === "all") return [];
    return distinctSorted(
      collections
        .filter(
          (c) =>
            c.cidade === singleSelectedCity &&
            c.user_id === filters.collector,
        )
        .map((c) => c.bairro),
    );
  }, [singleSelectedCity, filters.collector, collections]);

  const neighborhoodEnabled =
    !!singleSelectedCity && availableNeighborhoods.length > 0;

  const handleToggleNeighborhood = (neighborhood: string) => {
    setFormSelection((prev) => ({
      ...prev,
      neighborhoods: prev.neighborhoods.includes(neighborhood)
        ? prev.neighborhoods.filter((n) => n !== neighborhood)
        : [...prev.neighborhoods, neighborhood],
    }));
  };

  const handleToggleAllNeighborhoods = () => {
    setFormSelection((prev) => ({
      ...prev,
      neighborhoods:
        prev.neighborhoods.length === availableNeighborhoods.length
          ? []
          : [...availableNeighborhoods],
    }));
  };

  const handleToggleDay = (day: string) => {
    setFormSelection((prev) => {
      if (prev.days.includes(day)) {
        return { ...prev, days: prev.days.filter((d) => d !== day) };
      } else {
        return { ...prev, days: [...prev.days, day] };
      }
    });
  };

  const handleToggleAllDays = () => {
    const allDays = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
    if (formSelection.days.length === allDays.length) {
      setFormSelection((prev) => ({ ...prev, days: [] }));
    } else {
      setFormSelection((prev) => ({ ...prev, days: [...allDays] }));
    }
  };

  const isAllCitiesSelected =
    formSelection.cities.length === filteredCities.length &&
    filteredCities.length > 0;
  const isAllNeighborhoodsSelected =
    availableNeighborhoods.length > 0 &&
    formSelection.neighborhoods.length === availableNeighborhoods.length;
  const isAllDaysSelected = formSelection.days.length === 31;

  // Bairros efetivos ao adicionar: os selecionados (se houver uma única cidade)
  // ou [null] (regra de nível cidade). Fonte única usada pelo resumo e pelo insert.
  const effectiveNeighborhoods: (string | null)[] =
    singleSelectedCity && formSelection.neighborhoods.length > 0
      ? formSelection.neighborhoods
      : [null];

  // Nº de combinações (cidade × bairro × dia) que serão criadas — resumo.
  const combinationsToCreate =
    formSelection.cities.length *
    effectiveNeighborhoods.length *
    formSelection.days.length;

  // Filtrar datas permitidas baseado no cobrador selecionado
  const filteredAllowedDates = useMemo(() => {
    // Se nenhum cobrador selecionado, mostrar todas as datas
    if (filters.collector === "all") {
      return allowedDates;
    }

    return allowedDates.filter((d) => d.collector_id === filters.collector);
  }, [allowedDates, filters.collector]);

  // "Carga" por dia do mês: quantas OUTRAS localidades (cidade/bairro) do cobrador
  // já usam cada dia. Serve de alerta visual não-bloqueante no seletor de dias,
  // ajudando a distribuir as visitas ao longo do mês. Exclui a(s) localidade(s)
  // que estão sendo configuradas agora (essas já são cobertas pela checagem de
  // duplicata) — o foco é a sobreposição ENTRE localidades diferentes.
  const dayOccupancy = useMemo(() => {
    const nbList: (string | null)[] =
      singleSelectedCity && formSelection.neighborhoods.length > 0
        ? formSelection.neighborhoods
        : [null];
    const targetKeys = new Set<string>();
    formSelection.cities.forEach((city) => {
      nbList.forEach((nb) => targetKeys.add(`${city}|${nb ?? ""}`));
    });

    const map = new Map<number, Set<string>>();
    filteredAllowedDates.forEach((d) => {
      if (targetKeys.has(`${d.city}|${d.neighborhood ?? ""}`)) return;
      const label = d.neighborhood ? `${d.city} — ${d.neighborhood}` : d.city;
      if (!map.has(d.allowed_date)) map.set(d.allowed_date, new Set());
      map.get(d.allowed_date)!.add(label);
    });
    return map;
  }, [
    filteredAllowedDates,
    formSelection.cities,
    formSelection.neighborhoods,
    singleSelectedCity,
  ]);

  // Dias já selecionados que colidem com outras localidades (aviso suave).
  const overlappingSelectedDays = formSelection.days
    .map(Number)
    .filter((d) => (dayOccupancy.get(d)?.size ?? 0) > 0)
    .sort((a, b) => a - b);

  // Agrupar datas por cidade
  const groupedByCity = useMemo(() => {
    const groups = new Map<string, AllowedVisitDate[]>();
    filteredAllowedDates.forEach((date) => {
      if (!groups.has(date.city)) {
        groups.set(date.city, []);
      }
      groups.get(date.city)!.push(date);
    });
    // Ordenar as datas dentro de cada grupo
    groups.forEach((dates) => {
      dates.sort((a, b) => Number(a.allowed_date) - Number(b.allowed_date));
    });
    return groups;
  }, [filteredAllowedDates]);

  const toggleCity = (city: string) => {
    setExpandedCities((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(city)) {
        newSet.delete(city);
      } else {
        newSet.add(city);
      }
      return newSet;
    });
  };

  const handleAddAllowedDate = async () => {
    if (formSelection.cities.length === 0 || formSelection.days.length === 0) {
      setError("Por favor, selecione ao menos uma cidade e um dia do mês.");
      return;
    }

    // Validar se um cobrador foi selecionado
    if (filters.collector === "all") {
      setError(
        "Por favor, selecione um cobrador antes de adicionar as datas permitidas.",
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Combinações cidade × bairro × dia para o cobrador. `neighborhood` NULL =
      // regra de nível cidade; bairros só se aplicam quando há uma única cidade.
      const insertData = formSelection.cities.flatMap((city) =>
        effectiveNeighborhoods.flatMap((neighborhood) =>
          formSelection.days.map((day) => ({
            city: city,
            neighborhood: neighborhood,
            allowed_date: parseInt(day),
            collector_id: filters.collector,
          })),
        ),
      );

      if (insertData.length === 0) {
        setError("Nenhum dado para adicionar.");
        setLoading(false);
        return;
      }

      // --- Validação pré-inserção (evita duplicatas com o que já existe) ---
      // Chave inclui o bairro ("" = nível cidade), alinhada ao índice único
      // (collector_id, city, COALESCE(neighborhood,''), allowed_date).
      const label = (city: string, nb: string | null, day: number) =>
        `${city}${nb ? ` / ${nb}` : ""} / Dia ${day}`;
      const conflicts: string[] = [];
      const uniqueNewData: {
        city: string;
        neighborhood: string | null;
        allowed_date: number;
        collector_id: string;
      }[] = [];
      const existingEntries = new Set(
        allowedDates
          .filter((d) => d.collector_id === filters.collector)
          .map((d) => `${d.city}|${d.neighborhood ?? ""}|${d.allowed_date}`),
      );
      const newEntries = new Set<string>();

      for (const item of insertData) {
        const key = `${item.city}|${item.neighborhood ?? ""}|${item.allowed_date}`;
        if (existingEntries.has(key)) {
          const text = label(item.city, item.neighborhood, item.allowed_date);
          if (!conflicts.includes(text)) conflicts.push(text);
        } else if (!newEntries.has(key)) {
          uniqueNewData.push(item);
          newEntries.add(key);
        }
      }

      if (conflicts.length > 0) {
        setError(
          `Não é possível adicionar. As seguintes configurações já existem: ${conflicts.join(", ")}`,
        );
        setLoading(false);
        return;
      }

      if (uniqueNewData.length === 0) {
        setError(
          "Nenhuma nova data para adicionar (as selecionadas já existem).",
        );
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("allowed_visit_dates")
        .insert(uniqueNewData)
        .select();

      if (error) {
        setError(error.message);
      } else if (data) {
        setAllowedDates([...allowedDates, ...(data as AllowedVisitDate[])]);
        refreshSharedDates();
        // Limpar seleção após adicionar
        setFormSelection({ cities: [], neighborhoods: [], days: [] });
        setDropdownsOpen({ city: false, neighborhood: false, day: false });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Erro ao adicionar datas permitidas";
      setError(errorMessage);
    }

    setLoading(false);
  };

  // Exclui um conjunto específico de datas (por id). Usado tanto na linha por
  // cobrador quanto no "excluir cidade" (que passa todos os ids da cidade).
  const handleDeleteDates = async (ids: string[]) => {
    if (ids.length === 0) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .from("allowed_visit_dates")
      .delete()
      .in("id", ids);

    if (error) {
      setError(error.message);
    } else {
      setAllowedDates(allowedDates.filter((d) => !ids.includes(d.id)));
      refreshSharedDates();
    }

    setLoading(false);
  };

  const handleDeleteAllCityDates = (city: string) => {
    setModals({ deleteModal: true, calendar: false, cityToDelete: city });
  };

  const confirmDeleteCity = async () => {
    if (!modals.cityToDelete) return;

    // Exclui pelos ids do grupo da cidade no conjunto atualmente filtrado. Assim
    // funciona tanto por cobrador quanto em "Todos os cobradores" (antes usava
    // .eq collector_id = "all" e não apagava nada).
    const ids = (groupedByCity.get(modals.cityToDelete) || []).map((d) => d.id);
    const cityToClose = modals.cityToDelete;

    await handleDeleteDates(ids);

    // Fechar o accordion da cidade após deletar
    setExpandedCities((prev) => {
      const newSet = new Set(prev);
      newSet.delete(cityToClose);
      return newSet;
    });
    setModals({ deleteModal: false, calendar: false, cityToDelete: null });
  };

  const cancelDelete = () => {
    setModals({ deleteModal: false, calendar: false, cityToDelete: null });
  };

  // Funções do calendário
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const newMonth = new Date(currentMonth);
    if (direction === "prev") {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  const openCalendarModal = () => {
    setCurrentMonth(new Date());
    setFilters((prev) => ({
      ...prev,
      calendarCity: "all",
      calendarCollector: "all",
    }));
    setModals((prev) => ({ ...prev, calendar: true }));
  };

  const closeCalendarModal = () => {
    setModals((prev) => ({ ...prev, calendar: false }));
    setFilters((prev) => ({
      ...prev,
      calendarCity: "all",
      calendarCollector: "all",
    }));
  };

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // Filtrar cidades no modal do calendário baseado no cobrador selecionado
  const calendarCities = useMemo(() => {
    if (filters.calendarCollector === "all") {
      return cities;
    }

    const collectorCities = new Set(
      collections
        .filter((c) => c.user_id === filters.calendarCollector)
        .map((c) => c.cidade)
        .filter(Boolean),
    );

    const citiesWithAllowedDates = new Set(
      allowedDates
        .filter((d) => d.collector_id === filters.calendarCollector)
        .map((d) => d.city)
        .filter(Boolean),
    );

    const allRelevantCities = new Set([
      ...collectorCities,
      ...citiesWithAllowedDates,
    ]);

    return cities.filter((city) => allRelevantCities.has(city));
  }, [filters.calendarCollector, cities, collections, allowedDates]);

  // Obter dias permitidos considerando os filtros (dia -> conjunto de cidades)
  const allowedDaysForCalendar = useMemo(() => {
    let filtered = allowedDates;

    if (filters.calendarCollector !== "all") {
      filtered = filtered.filter(
        (d) => d.collector_id === filters.calendarCollector,
      );
    }

    if (filters.calendarCity !== "all") {
      filtered = filtered.filter((d) => d.city === filters.calendarCity);
    }

    const daysMap = new Map<number, Set<string>>();
    filtered.forEach((d) => {
      if (!daysMap.has(d.allowed_date)) {
        daysMap.set(d.allowed_date, new Set());
      }
      // Rótulo por área: "Cidade" ou "Cidade — Bairro" quando há bairro.
      const areaLabel = d.neighborhood
        ? `${d.city} — ${d.neighborhood}`
        : d.city;
      daysMap.get(d.allowed_date)!.add(areaLabel);
    });

    return daysMap;
  }, [filters.calendarCity, filters.calendarCollector, allowedDates]);

  const isAllView = filters.collector === "all";

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl shrink-0">
            <CalendarClock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text tracking-tight leading-none">
              Datas Programadas
            </h3>
            <p className="text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary mt-1">
              Dias de visita permitidos por cobrador e cidade
            </p>
          </div>
        </div>
        <button
          onClick={openCalendarModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 shadow-sm transition-colors shrink-0"
        >
          <CalendarIcon className="w-4 h-4" />
          <span>Ver calendário</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400 p-3 rounded-xl mb-4 text-sm flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Formulário de criação (Cobrador → Cidades → Bairro opcional → Dias → Adicionar) */}
      <div className="bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {/* Passo 1: Cobrador */}
          <div>
            <label htmlFor="collector-filter" className={labelClass}>
              1 · Cobrador
            </label>
            <select
              id="collector-filter"
              value={filters.collector}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, collector: e.target.value }))
              }
              className={`${controlClass} appearance-none cursor-pointer`}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: "right 0.5rem center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "1.5em 1.5em",
                paddingRight: "2.5rem",
              }}
            >
              <option value="all">Todos os cobradores</option>
              {collectors.map((collector) => (
                <option key={collector.id} value={collector.id}>
                  {collector.name}
                </option>
              ))}
            </select>
          </div>

          {/* Passo 2: Cidades */}
          <div>
            <label htmlFor="city-select" className={labelClass}>
              2 · Cidades
            </label>
            <div className="relative" ref={cityDropdownRef}>
              <button
                id="city-select"
                type="button"
                onClick={() =>
                  setDropdownsOpen((prev) => ({ ...prev, city: !prev.city }))
                }
                disabled={isAllView}
                className={`${controlClass} appearance-none cursor-pointer text-left disabled:opacity-60 disabled:cursor-not-allowed`}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 0.5rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "1.5em 1.5em",
                  paddingRight: "2.5rem",
                }}
              >
                <span className="truncate block">
                  {isAllView
                    ? "Selecione um cobrador"
                    : formSelection.cities.length === 0
                      ? "Selecione as cidades"
                      : formSelection.cities.length === 1
                        ? formSelection.cities[0]
                        : `${formSelection.cities.length} cidades selecionadas`}
                </span>
              </button>

              {dropdownsOpen.city && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-dark-bg-secondary border border-gray-100 dark:border-dark-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  <div className="sticky top-0 bg-gray-50 dark:bg-dark-bg border-b border-gray-100 dark:border-dark-border p-2">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={isAllCitiesSelected}
                        onChange={handleToggleAllCities}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
                        Selecionar todas ({filteredCities.length})
                      </span>
                    </label>
                  </div>
                  <div className="p-2 space-y-0.5">
                    {filteredCities.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-gray-400 dark:text-dark-text-secondary">
                        Nenhuma cidade para este cobrador.
                      </p>
                    ) : (
                      filteredCities.map((city) => {
                        // Cidade "configurada" = já possui dias programados para o
                        // cobrador selecionado (groupedByCity é filtrado por ele).
                        const configuredDays = groupedByCity.get(city);
                        const isConfigured = !!configuredDays?.length;
                        return (
                          <label
                            key={city}
                            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary rounded-lg px-2 py-1.5"
                          >
                            <input
                              type="checkbox"
                              checked={formSelection.cities.includes(city)}
                              onChange={() => handleToggleCity(city)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="flex-1 text-sm text-gray-700 dark:text-dark-text truncate">
                              {city}
                            </span>
                            {isConfigured && (
                              <span
                                className="w-2 h-2 rounded-full bg-blue-500 shrink-0"
                                title={`Já possui ${configuredDays!.length} ${
                                  configuredDays!.length === 1 ? "dia" : "dias"
                                } programado(s): ${configuredDays!
                                  .map((d) => d.allowed_date)
                                  .join(", ")}`}
                                aria-label="Cidade já configurada"
                              />
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                  {filteredCities.some((c) => groupedByCity.has(c)) && (
                    <div className="sticky bottom-0 bg-gray-50 dark:bg-dark-bg border-t border-gray-100 dark:border-dark-border px-3 py-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                        Já possui dias programados
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Passo 3: Bairro (opcional) — só quando UMA cidade está selecionada */}
          <div>
            <label htmlFor="neighborhood-select" className={labelClass}>
              3 · Bairro <span className="font-normal normal-case">(opcional)</span>
            </label>
            <div className="relative" ref={neighborhoodDropdownRef}>
              <button
                id="neighborhood-select"
                type="button"
                onClick={() =>
                  setDropdownsOpen((prev) => ({
                    ...prev,
                    neighborhood: !prev.neighborhood,
                  }))
                }
                disabled={!neighborhoodEnabled}
                title={
                  !singleSelectedCity
                    ? "Selecione uma única cidade para segmentar por bairro"
                    : undefined
                }
                className={`${controlClass} appearance-none cursor-pointer text-left disabled:opacity-60 disabled:cursor-not-allowed`}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 0.5rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "1.5em 1.5em",
                  paddingRight: "2.5rem",
                }}
              >
                <span className="truncate block">
                  {!neighborhoodEnabled
                    ? "Cidade inteira"
                    : formSelection.neighborhoods.length === 0
                      ? "Cidade inteira"
                      : formSelection.neighborhoods.length === 1
                        ? formSelection.neighborhoods[0]
                        : `${formSelection.neighborhoods.length} bairros selecionados`}
                </span>
              </button>

              {dropdownsOpen.neighborhood && neighborhoodEnabled && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-dark-bg-secondary border border-gray-100 dark:border-dark-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  <div className="sticky top-0 bg-gray-50 dark:bg-dark-bg border-b border-gray-100 dark:border-dark-border p-2">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={isAllNeighborhoodsSelected}
                        onChange={handleToggleAllNeighborhoods}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
                        Todos os bairros ({availableNeighborhoods.length})
                      </span>
                    </label>
                  </div>
                  <div className="p-2 space-y-0.5">
                    {availableNeighborhoods.map((neighborhood) => (
                      <label
                        key={neighborhood}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary rounded-lg px-2 py-1.5"
                      >
                        <input
                          type="checkbox"
                          checked={formSelection.neighborhoods.includes(
                            neighborhood,
                          )}
                          onChange={() => handleToggleNeighborhood(neighborhood)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="flex-1 text-sm text-gray-700 dark:text-dark-text truncate">
                          {neighborhood}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="sticky bottom-0 bg-gray-50 dark:bg-dark-bg border-t border-gray-100 dark:border-dark-border px-3 py-1.5">
                    <span className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                      Vazio = vale para a cidade inteira
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Passo 4: Dias do mês */}
          <div>
            <label htmlFor="day-select" className={labelClass}>
              4 · Dias do mês
            </label>
            <div className="relative" ref={dayDropdownRef}>
              <button
                id="day-select"
                type="button"
                onClick={() =>
                  setDropdownsOpen((prev) => ({ ...prev, day: !prev.day }))
                }
                disabled={isAllView || formSelection.cities.length === 0}
                className={`${controlClass} appearance-none cursor-pointer text-left disabled:opacity-60 disabled:cursor-not-allowed`}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 0.5rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "1.5em 1.5em",
                  paddingRight: "2.5rem",
                }}
              >
                <span className="truncate block">
                  {formSelection.days.length === 0
                    ? "Selecione os dias"
                    : formSelection.days.length === 1
                      ? `Dia ${formSelection.days[0]}`
                      : `${formSelection.days.length} dias selecionados`}
                </span>
              </button>

              {dropdownsOpen.day &&
                !isAllView &&
                formSelection.cities.length > 0 && (
                  <div className="absolute z-10 w-80 mt-1 bg-white dark:bg-dark-bg-secondary border border-gray-100 dark:border-dark-border rounded-xl shadow-lg">
                    <div className="sticky top-0 bg-white dark:bg-dark-bg-secondary border-b border-gray-100 dark:border-dark-border p-2">
                      <button
                        type="button"
                        onClick={handleToggleAllDays}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors w-full text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                      >
                        {isAllDaysSelected
                          ? "Limpar seleção"
                          : "Selecionar todos os 31 dias"}
                      </button>
                    </div>
                    <div className="p-3 pt-4 grid grid-cols-7 gap-x-1 gap-y-2.5">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(
                        (dayNum) => {
                          const day = dayNum.toString();
                          const isSelected = formSelection.days.includes(day);
                          const occupants = dayOccupancy.get(dayNum);
                          const occupiedCount = occupants?.size ?? 0;
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => handleToggleDay(day)}
                              title={
                                occupiedCount > 0
                                  ? `Dia ${day} já usado por: ${Array.from(
                                      occupants!,
                                    ).join(", ")}`
                                  : `Dia ${day} — livre`
                              }
                              className={`relative w-9 h-9 flex items-center justify-center rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-dark-bg-secondary ${
                                isSelected
                                  ? "bg-blue-600 text-white hover:bg-blue-700"
                                  : occupiedCount > 0
                                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700/60 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                    : "bg-gray-100 dark:bg-dark-bg text-gray-800 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary"
                              }`}
                            >
                              {day}
                              {occupiedCount > 0 && (
                                <span
                                  className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ring-1 ring-white dark:ring-dark-bg-secondary ${
                                    isSelected
                                      ? "bg-amber-400 text-amber-950"
                                      : "bg-amber-500 text-white"
                                  }`}
                                >
                                  {occupiedCount}
                                </span>
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                    <div className="px-3 pb-3 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-dark-text-secondary border-t border-gray-100 dark:border-dark-border pt-2">
                      <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                        N
                      </span>
                      N localidades já usam esse dia (não bloqueia)
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* Passo 5: Adicionar */}
          <div>
            <button
              onClick={handleAddAllowedDate}
              disabled={loading || combinationsToCreate === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              {loading ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </div>

        {/* Resumo do que será criado */}
        {combinationsToCreate > 0 && (
          <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-secondary flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            {combinationsToCreate}{" "}
            {combinationsToCreate === 1 ? "configuração" : "configurações"} para{" "}
            {collectorName(filters.collector)}
            {singleSelectedCity && formSelection.neighborhoods.length > 0
              ? ` — bairro(s): ${formSelection.neighborhoods.join(", ")}.`
              : " — cidade inteira."}
          </p>
        )}
        {isAllView && (
          <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-secondary flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Selecione um cobrador para cadastrar novas datas.
          </p>
        )}
        {/* Aviso suave (não bloqueia): dias escolhidos que outras localidades já usam */}
        {overlappingSelectedDays.length > 0 && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Atenção: o(s) dia(s){" "}
              <strong>{overlappingSelectedDays.join(", ")}</strong> já são usados
              por outras localidades deste cobrador. Você ainda pode prosseguir —
              é só um alerta para ajudar a distribuir as visitas.
            </span>
          </p>
        )}
      </div>

      {/* Lista de configurações por cidade */}
      <div className="space-y-2">
        {groupedByCity.size === 0 ? (
          <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-100 dark:border-dark-border rounded-2xl p-8 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
            {filters.collector !== "all"
              ? `Nenhuma data permitida cadastrada onde ${collectorName(filters.collector)} tem clientes.`
              : "Nenhuma data permitida cadastrada. Selecione um cobrador e configure os dias de visita por cidade."}
          </div>
        ) : (
          (() => {
            const CITIES_PER_PAGE = 10;
            let sortedCities = Array.from(groupedByCity.entries()).sort(
              ([cityA], [cityB]) => cityA.localeCompare(cityB, "pt-BR"),
            );

            if (formSelection.cities.length > 0) {
              sortedCities = sortedCities.filter(([city]) =>
                formSelection.cities.includes(city),
              );
            }

            const totalPages = Math.ceil(sortedCities.length / CITIES_PER_PAGE);
            const paginatedCities = sortedCities.slice(
              (currentPage - 1) * CITIES_PER_PAGE,
              currentPage * CITIES_PER_PAGE,
            );

            return (
              <>
                <div className="space-y-2">
                  {paginatedCities.map(([city, dates]) => {
                    const isExpanded = expandedCities.has(city);
                    // Dias únicos (agregados de todos os cobradores da cidade).
                    const uniqueDays = [
                      ...new Set(dates.map((d) => d.allowed_date)),
                    ].sort((a, b) => a - b);

                    let daysText = "";
                    if (uniqueDays.length === 1) {
                      daysText = `Dia ${uniqueDays[0]}`;
                    } else if (uniqueDays.length <= 10) {
                      const lastDay = uniqueDays[uniqueDays.length - 1];
                      const otherDays = uniqueDays.slice(0, -1);
                      daysText = `Dias ${otherDays.join(", ")} e ${lastDay}`;
                    } else {
                      const first10 = uniqueDays.slice(0, 10);
                      const lastDay = first10[first10.length - 1];
                      const otherDays = first10.slice(0, -1);
                      daysText = `Dias ${otherDays.join(", ")}, ${lastDay}...`;
                    }

                    // Subgrupos por cobrador + bairro (atribuição correta e
                    // distinção cidade-inteira vs bairro específico).
                    const subgroups = new Map<
                      string,
                      {
                        collectorId: string | null | undefined;
                        neighborhood: string | null | undefined;
                        dates: AllowedVisitDate[];
                      }
                    >();
                    dates.forEach((d) => {
                      const key = `${d.collector_id ?? "none"}|${d.neighborhood ?? ""}`;
                      if (!subgroups.has(key)) {
                        subgroups.set(key, {
                          collectorId: d.collector_id,
                          neighborhood: d.neighborhood,
                          dates: [],
                        });
                      }
                      subgroups.get(key)!.dates.push(d);
                    });
                    // Cidade inteira (sem bairro) primeiro; depois por bairro; e
                    // por cobrador.
                    const subgroupList = Array.from(subgroups.values()).sort(
                      (a, b) => {
                        const an = a.neighborhood ?? "";
                        const bn = b.neighborhood ?? "";
                        if (!an && bn) return -1;
                        if (an && !bn) return 1;
                        if (an !== bn) return an.localeCompare(bn, "pt-BR");
                        return collectorName(a.collectorId).localeCompare(
                          collectorName(b.collectorId),
                          "pt-BR",
                        );
                      },
                    );
                    const collectorCount = new Set(
                      dates.map((d) => d.collector_id),
                    ).size;
                    const hasNeighborhoodConfigs = dates.some(
                      (d) => d.neighborhood,
                    );

                    return (
                      <div
                        key={city}
                        className="bg-white dark:bg-dark-bg-tertiary border border-gray-100 dark:border-dark-border rounded-2xl overflow-hidden"
                      >
                        <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-bg/40 transition-colors">
                          <button
                            onClick={() => toggleCity(city)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          >
                            <ChevronRight
                              className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                            <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">
                              {city}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-dark-text-secondary truncate hidden sm:inline">
                              ({daysText})
                            </span>
                            {isAllView && collectorCount > 0 && (
                              <span className="ml-1 shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg px-1.5 py-0.5 rounded-md">
                                <Users className="w-3 h-3" />
                                {collectorCount}
                              </span>
                            )}
                            {hasNeighborhoodConfigs && (
                              <span
                                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md"
                                title="Possui configurações por bairro"
                              >
                                <Building2 className="w-3 h-3" />
                                bairros
                              </span>
                            )}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAllCityDates(city);
                            }}
                            disabled={loading}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            title={`Excluir todas as configurações de ${city}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-gray-100 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border">
                            {subgroupList.map((group) => {
                              const days = group.dates
                                .map((d) => d.allowed_date)
                                .sort((a, b) => a - b);
                              return (
                                <div
                                  key={`${group.collectorId ?? "none"}|${group.neighborhood ?? ""}`}
                                  className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                      {isAllView && (
                                        <span className="text-xs font-semibold text-gray-700 dark:text-dark-text flex items-center gap-1.5">
                                          <Users className="w-3.5 h-3.5 text-gray-400" />
                                          {collectorName(group.collectorId)}
                                        </span>
                                      )}
                                      {group.neighborhood ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md">
                                          <Building2 className="w-3 h-3" />
                                          {group.neighborhood}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary">
                                          Cidade inteira
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                                      Dias {days.join(", ")} de cada mês
                                    </p>
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleDeleteDates(
                                        group.dates.map((d) => d.id),
                                      )
                                    }
                                    disabled={loading}
                                    className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50 shrink-0"
                                  >
                                    Excluir
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4 p-2 bg-white dark:bg-dark-bg-tertiary border border-gray-100 dark:border-dark-border rounded-xl">
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Página anterior"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Próxima página"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>

      {/* Modal de Confirmação */}
      {modals.deleteModal && modals.cityToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl max-w-md w-full border border-gray-100 dark:border-dark-border">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text mb-3">
                Confirmar exclusão
              </h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-2">
                Excluir <strong>TODAS</strong> as configurações de{" "}
                <strong>{modals.cityToDelete}</strong>
                {filters.collector !== "all"
                  ? ` para ${collectorName(filters.collector)}?`
                  : " (todos os cobradores)?"}
              </p>
              <p className="text-xs text-gray-400 dark:text-dark-text-secondary mb-6">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelDelete}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteCity}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? "Excluindo..." : "Excluir tudo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Calendário */}
      {modals.calendar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div
            ref={calendarModalRef}
            className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl max-w-full md:max-w-4xl lg:max-w-6xl w-full max-h-[95vh] overflow-y-auto border border-gray-100 dark:border-dark-border"
          >
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-gray-100 dark:border-dark-border flex items-center justify-between sticky top-0 bg-white dark:bg-dark-bg-secondary rounded-t-2xl z-10">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-dark-text">
                  Calendário de datas permitidas
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
                  Visualize os dias configurados para visitas
                </p>
              </div>
              <button
                onClick={closeCalendarModal}
                className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-xl transition-colors"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 md:p-6">
              {/* Filtros */}
              <div className="bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl p-3 md:p-4 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label
                      htmlFor="calendar-collector-filter"
                      className={labelClass}
                    >
                      Filtrar por cobrador
                    </label>
                    <select
                      id="calendar-collector-filter"
                      value={filters.calendarCollector}
                      onChange={(e) => {
                        setFilters((prev) => ({
                          ...prev,
                          calendarCollector: e.target.value,
                          calendarCity: "all",
                        }));
                      }}
                      className={controlClass}
                    >
                      <option value="all">Todos os cobradores</option>
                      {collectors.map((collector) => (
                        <option key={collector.id} value={collector.id}>
                          {collector.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="calendar-city-filter"
                      className={labelClass}
                    >
                      Filtrar por cidade
                    </label>
                    <select
                      id="calendar-city-filter"
                      value={filters.calendarCity}
                      onChange={(e) => {
                        setFilters((prev) => ({
                          ...prev,
                          calendarCity: e.target.value,
                        }));
                      }}
                      className={controlClass}
                    >
                      <option value="all">Todas as cidades</option>
                      {calendarCities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Info sobre filtros ativos */}
                {(filters.calendarCollector !== "all" ||
                  filters.calendarCity !== "all") && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                    <CalendarIcon className="w-4 h-4" />
                    <span>
                      Mostrando:{" "}
                      {[
                        filters.calendarCollector !== "all"
                          ? collectorName(filters.calendarCollector)
                          : null,
                        filters.calendarCity !== "all"
                          ? filters.calendarCity
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Todas as configurações"}
                    </span>
                  </div>
                )}
              </div>

              {/* Navegação do calendário */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => navigateMonth("prev")}
                  className="p-2 text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-full transition-colors"
                  title="Mês anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h4 className="text-base md:text-lg font-semibold text-gray-900 dark:text-dark-text">
                  {monthNames[currentMonth.getMonth()]}{" "}
                  {currentMonth.getFullYear()}
                </h4>
                <button
                  onClick={() => navigateMonth("next")}
                  className="p-2 text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-full transition-colors"
                  title="Próximo mês"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* Grade do calendário */}
              <div className="space-y-2">
                <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 max-w-3xl mx-auto">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="text-center text-sm font-medium text-gray-500 dark:text-dark-text-secondary py-2 max-w-[45px] sm:max-w-[60px] md:max-w-[80px]"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 max-w-3xl mx-auto">
                  {(() => {
                    const { daysInMonth, startingDayOfWeek } =
                      getDaysInMonth(currentMonth);
                    const days = [];

                    for (let i = 0; i < startingDayOfWeek; i++) {
                      days.push(
                        <div
                          key={`empty-${i}`}
                          className="aspect-square max-w-[45px] sm:max-w-[60px] md:max-w-[80px]"
                        />,
                      );
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const dayInfo = allowedDaysForCalendar.get(day);
                      const isAllowed = dayInfo && dayInfo.size > 0;
                      const isToday =
                        currentMonth.getMonth() === new Date().getMonth() &&
                        currentMonth.getFullYear() ===
                          new Date().getFullYear() &&
                        day === new Date().getDate();

                      let tooltipText = `Dia ${day}`;
                      if (isAllowed && dayInfo) {
                        tooltipText = `Dia ${day}\n${Array.from(dayInfo).join("\n")}`;
                      }

                      days.push(
                        <div
                          key={day}
                          className={`aspect-square max-w-[45px] sm:max-w-[60px] md:max-w-[80px] flex items-center justify-center rounded-lg text-sm font-medium transition-all cursor-default relative group ${
                            isAllowed
                              ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                              : "bg-gray-50 dark:bg-dark-bg text-gray-400 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                          } ${
                            isToday && !isAllowed
                              ? "ring-2 ring-blue-400"
                              : ""
                          }`}
                          title={tooltipText}
                        >
                          {day}
                          {isAllowed && dayInfo && dayInfo.size > 1 && (
                            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center font-bold">
                              {dayInfo.size}
                            </span>
                          )}
                        </div>,
                      );
                    }

                    return days;
                  })()}
                </div>
              </div>

              {/* Legenda */}
              <div className="mt-6 pt-4 md:pt-6 border-t border-gray-100 dark:border-dark-border">
                <h5 className="text-sm font-medium text-gray-700 dark:text-dark-text mb-3">
                  Legenda:
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 rounded-lg"></div>
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      Visitas permitidas
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg"></div>
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      Sem configuração
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 rounded-lg relative">
                      <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        2
                      </span>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      Múltiplas áreas no dia
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllowedVisitDatesManager;
