import React, { useState, useEffect, useMemo, useRef } from "react";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { AllowedVisitDate } from "../../types";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

const AllowedVisitDatesManager: React.FC = () => {
  const { collections, users } = useCollection();
  const [allowedDates, setAllowedDates] = useState<AllowedVisitDate[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    [],
  );
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] =
    useState(false);
  const [showDayDropdown, setShowDayDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dayDropdownRef = useRef<HTMLDivElement>(null);
  const calendarModalRef = useRef<HTMLDivElement>(null);
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<string | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarFilterCity, setCalendarFilterCity] = useState<string>("all");
  const [calendarFilterNeighborhood, setCalendarFilterNeighborhood] =
    useState<string>("all");
  const [calendarFilterCollector, setCalendarFilterCollector] =
    useState<string>("all");
  const [filterCollector, setFilterCollector] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Fechar dropdown e modal ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowNeighborhoodDropdown(false);
      }
      if (
        dayDropdownRef.current &&
        !dayDropdownRef.current.contains(event.target as Node)
      ) {
        setShowDayDropdown(false);
      }
      if (
        showCalendarModal &&
        calendarModalRef.current &&
        !calendarModalRef.current.contains(event.target as Node)
      ) {
        setShowCalendarModal(false);
        setCalendarFilterCity("all");
        setCalendarFilterNeighborhood("all");
        setCalendarFilterCollector("all");
      }
    };

    if (showNeighborhoodDropdown || showDayDropdown || showCalendarModal) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNeighborhoodDropdown, showDayDropdown, showCalendarModal]);

  // Gerenciar scroll da página quando modal abre/fecha
  useEffect(() => {
    if (showCalendarModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showCalendarModal]);

  // Resetar bairros quando mudar a cidade
  useEffect(() => {
    setSelectedNeighborhoods([]);
    setShowNeighborhoodDropdown(false);
    setSelectedDays([]);
    setShowDayDropdown(false);
  }, [selectedCity]);

  // Resetar cidade quando mudar o filtro de cobrador
  useEffect(() => {
    setSelectedCity("");
  }, [filterCollector]);

  useEffect(() => {
    const fetchAllowedDates = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("allowed_visit_dates")
        .select("*");
      if (error) {
        setError(error.message);
      } else {
        setAllowedDates(data || []);
      }
      setLoading(false);
    };

    fetchAllowedDates();
  }, []);

  useEffect(() => {
    if (collections) {
      const uniqueCities = [
        ...new Set(collections.map((c) => c.cidade).filter(Boolean)),
      ] as string[];
      // Ordenar cidades em ordem alfabética
      uniqueCities.sort((a, b) => a.localeCompare(b, "pt-BR"));
      setCities(uniqueCities);
    }
  }, [collections]);

  // Lista de cobradores
  const collectors = useMemo(() => {
    if (!users) return [];
    return users
      .filter((u) => u.type === "collector")
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [users]);

  // Filtrar cidades baseado no cobrador selecionado
  const filteredCities = useMemo(() => {
    if (filterCollector === "all") {
      return cities;
    }

    const collectorCities = new Set(
      collections
        .filter((c) => c.user_id === filterCollector)
        .map((c) => c.cidade)
        .filter(Boolean),
    );

    return cities.filter((city) => collectorCities.has(city));
  }, [filterCollector, cities, collections]);

  const filteredNeighborhoods = useMemo(() => {
    if (selectedCity) {
      let filteredCollections = collections.filter(
        (c) => c.cidade === selectedCity,
      );

      // Aplicar filtro de cobrador se selecionado
      if (filterCollector !== "all") {
        filteredCollections = filteredCollections.filter(
          (c) => c.user_id === filterCollector,
        );
      }

      const neighborhoods = [
        ...new Set(filteredCollections.map((c) => c.bairro).filter(Boolean)),
      ] as string[];
      // Ordenar bairros em ordem alfabética
      neighborhoods.sort((a, b) => a.localeCompare(b, "pt-BR"));
      return neighborhoods;
    }
    return [];
  }, [selectedCity, collections, filterCollector]);

  const handleToggleNeighborhood = (neighborhood: string) => {
    setSelectedNeighborhoods((prev) => {
      if (prev.includes(neighborhood)) {
        return prev.filter((n) => n !== neighborhood);
      } else {
        return [...prev, neighborhood];
      }
    });
  };

  const handleToggleAllNeighborhoods = () => {
    if (selectedNeighborhoods.length === filteredNeighborhoods.length) {
      setSelectedNeighborhoods([]);
    } else {
      setSelectedNeighborhoods([...filteredNeighborhoods]);
    }
  };

  const handleToggleDay = (day: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      } else {
        return [...prev, day];
      }
    });
  };

  const handleToggleAllDays = () => {
    const allDays = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
    if (selectedDays.length === allDays.length) {
      setSelectedDays([]);
    } else {
      setSelectedDays([...allDays]);
    }
  };

  const isAllNeighborhoodsSelected =
    selectedNeighborhoods.length === filteredNeighborhoods.length &&
    filteredNeighborhoods.length > 0;
  const isAllDaysSelected = selectedDays.length === 31;

  // Filtrar datas permitidas pela cidade selecionada
  const filteredAllowedDates = useMemo(() => {
    let filtered = allowedDates;

    // Filtro por cidade
    if (selectedCity) {
      filtered = filtered.filter((date) => date.city === selectedCity);
    }

    // Filtro por cobrador - filtrar apenas cidades/bairros onde o cobrador tem clientes
    if (filterCollector !== "all") {
      const collectorCityNeighborhoods = new Set(
        collections
          .filter((c) => c.user_id === filterCollector)
          .map((c) => `${c.cidade}|${c.bairro}`),
      );

      filtered = filtered.filter((d) =>
        collectorCityNeighborhoods.has(`${d.city}|${d.neighborhood}`),
      );
    }

    return filtered;
  }, [allowedDates, selectedCity, filterCollector, collections]);

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
      dates.sort((a, b) => {
        if (a.neighborhood !== b.neighborhood)
          return a.neighborhood.localeCompare(b.neighborhood);
        return Number(a.allowed_date) - Number(b.allowed_date);
      });
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
    if (
      !selectedCity ||
      selectedNeighborhoods.length === 0 ||
      selectedDays.length === 0
    ) {
      setError(
        "Por favor, selecione cidade, ao menos um bairro e ao menos um dia do mês.",
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Inserir uma entrada para cada combinação de bairro e dia
      const insertData = selectedNeighborhoods.flatMap((neighborhood) =>
        selectedDays.map((day) => ({
          city: selectedCity,
          neighborhood: neighborhood,
          allowed_date: parseInt(day),
        })),
      );

      const { data, error } = await supabase
        .from("allowed_visit_dates")
        .insert(insertData)
        .select();

      if (error) {
        setError(error.message);
      } else if (data) {
        setAllowedDates([...allowedDates, ...data]);
        // Limpar seleção após adicionar
        setSelectedCity("");
        setSelectedNeighborhoods([]);
        setSelectedDays([]);
        setShowNeighborhoodDropdown(false);
        setShowDayDropdown(false);
      }
    } catch (err) {
      setError("Erro ao adicionar datas permitidas");
    }

    setLoading(false);
  };

  const handleDeleteNeighborhoodDates = async (ids: string[]) => {
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
    }

    setLoading(false);
  };

  const handleDeleteAllCityDates = async (city: string) => {
    setCityToDelete(city);
    setShowDeleteModal(true);
  };

  const confirmDeleteCity = async () => {
    if (!cityToDelete) return;

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase
        .from("allowed_visit_dates")
        .delete()
        .eq("city", cityToDelete);

      if (error) {
        setError(error.message);
      } else {
        setAllowedDates(allowedDates.filter((d) => d.city !== cityToDelete));
        // Fechar o accordion da cidade após deletar
        setExpandedCities((prev) => {
          const newSet = new Set(prev);
          newSet.delete(cityToDelete);
          return newSet;
        });
      }
    } catch (err) {
      setError("Erro ao excluir configurações da cidade");
    }

    setLoading(false);
    setShowDeleteModal(false);
    setCityToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setCityToDelete(null);
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
    setCalendarFilterCity("all");
    setCalendarFilterNeighborhood("all");
    setCalendarFilterCollector("all");
    setShowCalendarModal(true);
  };

  const closeCalendarModal = () => {
    setShowCalendarModal(false);
    setCalendarFilterCity("all");
    setCalendarFilterNeighborhood("all");
    setCalendarFilterCollector("all");
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
    if (calendarFilterCollector === "all") {
      return cities;
    }

    const collectorCities = new Set(
      collections
        .filter((c) => c.user_id === calendarFilterCollector)
        .map((c) => c.cidade)
        .filter(Boolean),
    );

    return cities.filter((city) => collectorCities.has(city));
  }, [calendarFilterCollector, cities, collections]);

  // Bairros disponíveis para a cidade selecionada no filtro do calendário
  const calendarNeighborhoods = useMemo(() => {
    if (calendarFilterCity === "all") return [];

    let filteredCollections = collections.filter(
      (c) => c.cidade === calendarFilterCity,
    );

    // Aplicar filtro de cobrador se selecionado
    if (calendarFilterCollector !== "all") {
      filteredCollections = filteredCollections.filter(
        (c) => c.user_id === calendarFilterCollector,
      );
    }

    const neighborhoods = [
      ...new Set(filteredCollections.map((c) => c.bairro).filter(Boolean)),
    ] as string[];
    neighborhoods.sort((a, b) => a.localeCompare(b, "pt-BR"));
    return neighborhoods;
  }, [calendarFilterCity, calendarFilterCollector, collections]);

  // Obter dias permitidos considerando os filtros
  const allowedDaysForCalendar = useMemo(() => {
    let filtered = allowedDates;

    if (calendarFilterCity !== "all") {
      filtered = filtered.filter((d) => d.city === calendarFilterCity);
    }

    if (calendarFilterNeighborhood !== "all") {
      filtered = filtered.filter(
        (d) => d.neighborhood === calendarFilterNeighborhood,
      );
    }

    // Se houver filtro de cobrador, filtrar apenas cidades/bairros onde o cobrador tem clientes
    if (calendarFilterCollector !== "all") {
      const collectorCityNeighborhoods = new Set(
        collections
          .filter((c) => c.user_id === calendarFilterCollector)
          .map((c) => `${c.cidade}|${c.bairro}`),
      );

      filtered = filtered.filter((d) =>
        collectorCityNeighborhoods.has(`${d.city}|${d.neighborhood}`),
      );
    }

    // Criar um mapa: dia -> array de cidades/bairros
    const daysMap = new Map<
      number,
      Array<{ city: string; neighborhood: string }>
    >();

    filtered.forEach((d) => {
      if (!daysMap.has(d.allowed_date)) {
        daysMap.set(d.allowed_date, []);
      }
      daysMap.get(d.allowed_date)!.push({
        city: d.city,
        neighborhood: d.neighborhood,
      });
    });

    return daysMap;
  }, [
    calendarFilterCity,
    calendarFilterNeighborhood,
    calendarFilterCollector,
    allowedDates,
    collections,
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Gerenciar Datas de Visita Permitidas
        </h3>
        <button
          onClick={openCalendarModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <CalendarIcon className="w-5 h-5" />
          <span>Ver Calendário</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-1">
            <label
              htmlFor="collector-filter"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Cobrador
            </label>
            <select
              id="collector-filter"
              value={filterCollector}
              onChange={(e) => setFilterCollector(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors appearance-none cursor-pointer text-gray-900 text-sm"
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
          <div className="md:col-span-1">
            <label
              htmlFor="city-select"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Cidade
            </label>
            <select
              id="city-select"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors appearance-none cursor-pointer text-gray-900 text-sm"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: "right 0.5rem center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "1.5em 1.5em",
                paddingRight: "2.5rem",
              }}
            >
              <option value="">Selecione a cidade</option>
              {filteredCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label
              htmlFor="neighborhood-select"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Bairros
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                id="neighborhood-select"
                type="button"
                onClick={() =>
                  setShowNeighborhoodDropdown(!showNeighborhoodDropdown)
                }
                disabled={!selectedCity}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-left transition-colors appearance-none cursor-pointer text-gray-900 text-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 0.5rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "1.5em 1.5em",
                  paddingRight: "2.5rem",
                }}
              >
                <span className="truncate block text-gray-900 text-sm">
                  {selectedNeighborhoods.length === 0
                    ? "Selecione os bairros"
                    : selectedNeighborhoods.length === 1
                      ? selectedNeighborhoods[0]
                      : `${selectedNeighborhoods.length} bairros selecionados`}
                </span>
              </button>

              {showNeighborhoodDropdown && selectedCity && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  <div className="sticky top-0 bg-gray-50 border-b border-gray-200 p-2">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={isAllNeighborhoodsSelected}
                        onChange={handleToggleAllNeighborhoods}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Selecionar Todos ({filteredNeighborhoods.length})
                      </span>
                    </label>
                  </div>
                  <div className="p-2 space-y-1">
                    {filteredNeighborhoods.map((neighborhood) => (
                      <label
                        key={neighborhood}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                      >
                        <input
                          type="checkbox"
                          checked={selectedNeighborhoods.includes(neighborhood)}
                          onChange={() =>
                            handleToggleNeighborhood(neighborhood)
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          {neighborhood}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-1">
            <label
              htmlFor="day-select"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Dia do Mês
            </label>
            <div className="relative" ref={dayDropdownRef}>
              <button
                id="day-select"
                type="button"
                onClick={() => setShowDayDropdown(!showDayDropdown)}
                disabled={!selectedCity}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-left transition-colors appearance-none cursor-pointer text-gray-900 text-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 0.5rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "1.5em 1.5em",
                  paddingRight: "2.5rem",
                }}
              >
                <span className="truncate block text-gray-900 text-sm">
                  {selectedDays.length === 0
                    ? "Selecione os dias"
                    : selectedDays.length === 1
                      ? `Dia ${selectedDays[0]}`
                      : `${selectedDays.length} dias selecionados`}
                </span>
              </button>

              {showDayDropdown && selectedCity && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  <div className="sticky top-0 bg-gray-50 border-b border-gray-200 p-2">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={isAllDaysSelected}
                        onChange={handleToggleAllDays}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Selecionar Todos (31)
                      </span>
                    </label>
                  </div>
                  <div className="p-2 grid grid-cols-4 gap-1">
                    {Array.from({ length: 31 }, (_, i) =>
                      (i + 1).toString(),
                    ).map((day) => (
                      <label
                        key={day}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDays.includes(day)}
                          onChange={() => handleToggleDay(day)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-1">
            <button
              onClick={handleAddAllowedDate}
              disabled={loading}
              className="w-full px-4 py-1.5 bg-blue-600 text-white font-medium rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Adicionando..." : "Adicionar Data"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {groupedByCity.size === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
            {filterCollector !== "all" && selectedCity
              ? `Nenhuma data permitida cadastrada para ${selectedCity} onde ${collectors.find((c) => c.id === filterCollector)?.name} tem clientes.`
              : filterCollector !== "all"
                ? `Nenhuma data permitida cadastrada onde ${collectors.find((c) => c.id === filterCollector)?.name} tem clientes.`
                : selectedCity
                  ? `Nenhuma data permitida cadastrada para ${selectedCity}.`
                  : "Nenhuma data permitida cadastrada. Configure as datas de visita para cada cidade/bairro."}
          </div>
        ) : (
          (() => {
            const CITIES_PER_PAGE = 10;
            const sortedCities = Array.from(groupedByCity.entries()).sort(
              ([cityA], [cityB]) => cityA.localeCompare(cityB, "pt-BR"),
            );
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
                    // Extrair dias únicos e ordenar numericamente
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

                    return (
                      <div
                        key={city}
                        className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                      >
                        <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                          <button
                            onClick={() => toggleCity(city)}
                            className="flex items-center space-x-3 flex-1"
                          >
                            <svg
                              className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? "transform rotate-90" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                            <h4 className="text-base font-semibold text-gray-900">
                              {city}
                            </h4>
                            <span className="text-sm text-gray-500">
                              ({daysText})
                            </span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAllCityDates(city);
                              }}
                              disabled={loading}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={`Excluir todas as configurações de ${city}`}
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Bairro
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Dia do Mês
                                  </th>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Ações
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {(() => {
                                  const groupedByNeighborhood = dates.reduce(
                                    (acc, date) => {
                                      if (!acc[date.neighborhood]) {
                                        acc[date.neighborhood] = {
                                          dates: [],
                                          ids: [],
                                        };
                                      }
                                      acc[date.neighborhood].dates.push(
                                        date.allowed_date,
                                      );
                                      acc[date.neighborhood].ids.push(date.id);
                                      return acc;
                                    },
                                    {} as Record<
                                      string,
                                      { dates: number[]; ids: string[] }
                                    >,
                                  );

                                  return Object.entries(groupedByNeighborhood)
                                    .sort(([neighborhoodA], [neighborhoodB]) =>
                                      neighborhoodA.localeCompare(
                                        neighborhoodB,
                                      ),
                                    )
                                    .map(([neighborhood, data]) => {
                                      data.dates.sort((a, b) => a - b);
                                      return (
                                        <tr
                                          key={neighborhood}
                                          className="hover:bg-gray-50"
                                        >
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {neighborhood}
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            Dias {data.dates.join(", ")} de cada
                                            mês
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                            <button
                                              onClick={() =>
                                                handleDeleteNeighborhoodDates(
                                                  data.ids,
                                                )
                                              }
                                              disabled={loading}
                                              className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                            >
                                              Excluir
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4 p-2 bg-white border border-gray-200 rounded-lg">
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                      className="p-2 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Página anterior"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
      {showDeleteModal && cityToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Confirmar Exclusão
              </h3>
              <p className="text-gray-600 mb-6">
                Tem certeza que deseja excluir <strong>TODAS</strong> as
                configurações de <strong>{cityToDelete}</strong>?
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelDelete}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteCity}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Excluindo...
                    </>
                  ) : (
                    "Excluir Tudo"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Calendário */}
      {showCalendarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div
            ref={calendarModalRef}
            className="bg-white rounded-2xl shadow-xl max-w-full md:max-w-4xl lg:max-w-6xl w-full max-h-[95vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h3 className="text-lg md:text-xl font-semibold text-gray-900">
                  Calendário de Datas Permitidas
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Visualize os dias configurados para visitas
                </p>
              </div>
              <button
                onClick={closeCalendarModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Filtros */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 md:p-4 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                  <div>
                    <label
                      htmlFor="calendar-collector-filter"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Filtrar por Cobrador
                    </label>
                    <select
                      id="calendar-collector-filter"
                      value={calendarFilterCollector}
                      onChange={(e) => {
                        setCalendarFilterCollector(e.target.value);
                        setCalendarFilterCity("all");
                        setCalendarFilterNeighborhood("all");
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Filtrar por Cidade
                    </label>
                    <select
                      id="calendar-city-filter"
                      value={calendarFilterCity}
                      onChange={(e) => {
                        setCalendarFilterCity(e.target.value);
                        setCalendarFilterNeighborhood("all");
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="all">Todas as cidades</option>
                      {calendarCities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="calendar-neighborhood-filter"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Filtrar por Bairro
                    </label>
                    <select
                      id="calendar-neighborhood-filter"
                      value={calendarFilterNeighborhood}
                      onChange={(e) =>
                        setCalendarFilterNeighborhood(e.target.value)
                      }
                      disabled={calendarFilterCity === "all"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="all">Todos os bairros</option>
                      {calendarNeighborhoods.map((neighborhood) => (
                        <option key={neighborhood} value={neighborhood}>
                          {neighborhood}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Info sobre filtros ativos */}
                {(calendarFilterCollector !== "all" ||
                  calendarFilterCity !== "all" ||
                  calendarFilterNeighborhood !== "all") && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-blue-600">
                    <CalendarIcon className="w-4 h-4" />
                    <span>
                      Mostrando:{" "}
                      {[
                        calendarFilterCollector !== "all"
                          ? collectors.find(
                              (c) => c.id === calendarFilterCollector,
                            )?.name
                          : null,
                        calendarFilterCity !== "all"
                          ? calendarFilterCity
                          : null,
                        calendarFilterNeighborhood !== "all"
                          ? calendarFilterNeighborhood
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" - ") || "Todas as configurações"}
                    </span>
                  </div>
                )}
              </div>

              {/* Calendar Navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => navigateMonth("prev")}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  title="Mês anterior"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-600" />
                </button>
                <h4 className="text-base md:text-lg font-semibold text-gray-900">
                  {monthNames[currentMonth.getMonth()]}{" "}
                  {currentMonth.getFullYear()}
                </h4>
                <button
                  onClick={() => navigateMonth("next")}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  title="Próximo mês"
                >
                  <ChevronRight className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="space-y-2">
                {/* Week days header */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 max-w-3xl mx-auto">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="text-center text-sm font-medium text-gray-600 py-2 max-w-[45px] sm:max-w-[60px] md:max-w-[80px]"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 max-w-3xl mx-auto">
                  {(() => {
                    const { daysInMonth, startingDayOfWeek } =
                      getDaysInMonth(currentMonth);
                    const days = [];

                    // Empty cells for days before month starts
                    for (let i = 0; i < startingDayOfWeek; i++) {
                      days.push(
                        <div
                          key={`empty-${i}`}
                          className="aspect-square max-w-[45px] sm:max-w-[60px] md:max-w-[80px]"
                        />,
                      );
                    }

                    // Days of the month
                    for (let day = 1; day <= daysInMonth; day++) {
                      const dayInfo = allowedDaysForCalendar.get(day);
                      const isAllowed = dayInfo && dayInfo.length > 0;
                      const isToday =
                        currentMonth.getMonth() === new Date().getMonth() &&
                        currentMonth.getFullYear() ===
                          new Date().getFullYear() &&
                        day === new Date().getDate();

                      // Criar tooltip com as cidades/bairros
                      let tooltipText = `Dia ${day}`;
                      if (isAllowed && dayInfo) {
                        const uniqueLocations = new Set(
                          dayInfo.map((d) => `${d.city} - ${d.neighborhood}`),
                        );
                        tooltipText = `Dia ${day}\n${Array.from(uniqueLocations).join("\n")}`;
                      }

                      days.push(
                        <div
                          key={day}
                          className={`aspect-square max-w-[45px] sm:max-w-[60px] md:max-w-[80px] flex items-center justify-center rounded-lg text-sm font-medium transition-all cursor-default relative group ${
                            isAllowed
                              ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                              : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                          } ${
                            isToday && !isAllowed ? "ring-2 ring-blue-400" : ""
                          }`}
                          title={tooltipText}
                        >
                          {day}
                          {isAllowed && dayInfo && dayInfo.length > 1 && (
                            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center font-bold">
                              {dayInfo.length}
                            </span>
                          )}
                        </div>,
                      );
                    }

                    return days;
                  })()}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-6 pt-4 md:pt-6 border-t border-gray-200">
                <h5 className="text-sm font-medium text-gray-700 mb-3">
                  Legenda:
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 rounded-lg"></div>
                    <span className="text-sm text-gray-600">
                      Visitas permitidas
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-50 border border-gray-200 rounded-lg"></div>
                    <span className="text-sm text-gray-600">
                      Sem configuração
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 rounded-lg relative">
                      <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        2
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">
                      Múltiplas configurações
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
