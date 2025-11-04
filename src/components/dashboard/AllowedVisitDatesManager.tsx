import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCollection } from '../../contexts/CollectionContext';
import { supabase } from '../../lib/supabase';
import { AllowedVisitDate } from '../../types';

const AllowedVisitDatesManager: React.FC = () => {
  const { collections } = useCollection();
  const [allowedDates, setAllowedDates] = useState<AllowedVisitDate[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] = useState(false);
  const [showDayDropdown, setShowDayDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dayDropdownRef = useRef<HTMLDivElement>(null);
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<string | null>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNeighborhoodDropdown(false);
      }
      if (dayDropdownRef.current && !dayDropdownRef.current.contains(event.target as Node)) {
        setShowDayDropdown(false);
      }
    };

    if (showNeighborhoodDropdown || showDayDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNeighborhoodDropdown, showDayDropdown]);

  // Resetar bairros quando mudar a cidade
  useEffect(() => {
    setSelectedNeighborhoods([]);
    setShowNeighborhoodDropdown(false);
    setSelectedDays([]);
    setShowDayDropdown(false);
  }, [selectedCity]);

  useEffect(() => {
    const fetchAllowedDates = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('allowed_visit_dates').select('*');
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
      const uniqueCities = [...new Set(collections.map(c => c.cidade).filter(Boolean))] as string[];
      setCities(uniqueCities);
    }
  }, [collections]);

  const filteredNeighborhoods = useMemo(() => {
    if (selectedCity) {
      return [...new Set(collections.filter(c => c.cidade === selectedCity).map(c => c.bairro).filter(Boolean))] as string[];
    }
    return [];
  }, [selectedCity, collections]);

  const handleToggleNeighborhood = (neighborhood: string) => {
    setSelectedNeighborhoods(prev => {
      if (prev.includes(neighborhood)) {
        return prev.filter(n => n !== neighborhood);
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
    setSelectedDays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
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

  const isAllNeighborhoodsSelected = selectedNeighborhoods.length === filteredNeighborhoods.length && filteredNeighborhoods.length > 0;
  const isAllDaysSelected = selectedDays.length === 31;

  // Filtrar datas permitidas pela cidade selecionada
  const filteredAllowedDates = useMemo(() => {
    if (!selectedCity) {
      return allowedDates;
    }
    return allowedDates.filter(date => date.city === selectedCity);
  }, [allowedDates, selectedCity]);

  // Agrupar datas por cidade
  const groupedByCity = useMemo(() => {
    const groups = new Map<string, AllowedVisitDate[]>();
    filteredAllowedDates.forEach(date => {
      if (!groups.has(date.city)) {
        groups.set(date.city, []);
      }
      groups.get(date.city)!.push(date);
    });
    // Ordenar as datas dentro de cada grupo
    groups.forEach(dates => {
      dates.sort((a, b) => {
        if (a.neighborhood !== b.neighborhood) return a.neighborhood.localeCompare(b.neighborhood);
        return Number(a.allowed_date) - Number(b.allowed_date);
      });
    });
    return groups;
  }, [filteredAllowedDates]);

  const toggleCity = (city: string) => {
    setExpandedCities(prev => {
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
    if (!selectedCity || selectedNeighborhoods.length === 0 || selectedDays.length === 0) {
      setError('Por favor, selecione cidade, ao menos um bairro e ao menos um dia do mês.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Inserir uma entrada para cada combinação de bairro e dia
      const insertData = selectedNeighborhoods.flatMap(neighborhood =>
        selectedDays.map(day => ({
          city: selectedCity,
          neighborhood: neighborhood,
          allowed_date: parseInt(day)
        }))
      );

      const { data, error } = await supabase
        .from('allowed_visit_dates')
        .insert(insertData)
        .select();

      if (error) {
        setError(error.message);
      } else if (data) {
        setAllowedDates([...allowedDates, ...data]);
        // Limpar seleção após adicionar
        setSelectedCity('');
        setSelectedNeighborhoods([]);
        setSelectedDays([]);
        setShowNeighborhoodDropdown(false);
        setShowDayDropdown(false);
      }
    } catch (err) {
      setError('Erro ao adicionar datas permitidas');
    }

    setLoading(false);
  };

  const handleDeleteAllowedDate = async (id: string) => {
    setLoading(true);
    setError(null);

    const { error } = await supabase.from('allowed_visit_dates').delete().match({ id });

    if (error) {
      setError(error.message);
    } else {
      setAllowedDates(allowedDates.filter(d => d.id !== id));
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
        .from('allowed_visit_dates')
        .delete()
        .eq('city', cityToDelete);

      if (error) {
        setError(error.message);
      } else {
        setAllowedDates(allowedDates.filter(d => d.city !== cityToDelete));
        // Fechar o accordion da cidade após deletar
        setExpandedCities(prev => {
          const newSet = new Set(prev);
          newSet.delete(cityToDelete);
          return newSet;
        });
      }
    } catch (err) {
      setError('Erro ao excluir configurações da cidade');
    }

    setLoading(false);
    setShowDeleteModal(false);
    setCityToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setCityToDelete(null);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Gerenciar Datas de Visita Permitidas</h3>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">{error}</div>}

      <div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-1">
            <label htmlFor="city-select" className="block text-sm font-medium text-gray-700 mb-2">Cidade</label>
            <select
              id="city-select"
              value={selectedCity}
              onChange={e => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors appearance-none cursor-pointer text-gray-900 text-sm"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em',
                paddingRight: '2.5rem'
              }}
            >
              <option value="">Selecione a cidade</option>
              {cities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label htmlFor="neighborhood-select" className="block text-sm font-medium text-gray-700 mb-2">Bairros</label>
          <div className="relative" ref={dropdownRef}>
            <button
              id="neighborhood-select"
              type="button"
              onClick={() => setShowNeighborhoodDropdown(!showNeighborhoodDropdown)}
              disabled={!selectedCity}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-left transition-colors appearance-none cursor-pointer text-gray-900 text-sm"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em',
                paddingRight: '2.5rem'
              }}
            >
              <span className="truncate block text-gray-900 text-sm">
                {selectedNeighborhoods.length === 0
                  ? 'Selecione os bairros'
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
                  {filteredNeighborhoods.map(neighborhood => (
                    <label
                      key={neighborhood}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={selectedNeighborhoods.includes(neighborhood)}
                        onChange={() => handleToggleNeighborhood(neighborhood)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{neighborhood}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-1">
          <label htmlFor="day-select" className="block text-sm font-medium text-gray-700 mb-2">Dia do Mês</label>
          <div className="relative" ref={dayDropdownRef}>
            <button
              id="day-select"
              type="button"
              onClick={() => setShowDayDropdown(!showDayDropdown)}
              disabled={!selectedCity}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-left transition-colors appearance-none cursor-pointer text-gray-900 text-sm"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em',
                paddingRight: '2.5rem'
              }}
            >
              <span className="truncate block text-gray-900 text-sm">
                {selectedDays.length === 0
                  ? 'Selecione os dias'
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
                  {Array.from({ length: 31 }, (_, i) => (i + 1).toString()).map(day => (
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
            {loading ? 'Adicionando...' : 'Adicionar Data'}
          </button>
        </div>
      </div>
      </div>

      <div className="space-y-2">
        {groupedByCity.size === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
            {selectedCity 
              ? `Nenhuma data permitida cadastrada para ${selectedCity}.`
              : 'Nenhuma data permitida cadastrada. Configure as datas de visita para cada cidade/bairro.'}
          </div>
        ) : (
          Array.from(groupedByCity.entries()).map(([city, dates]) => {
            const isExpanded = expandedCities.has(city);
            return (
              <div key={city} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => toggleCity(city)}
                    className="flex items-center space-x-3 flex-1"
                  >
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <h4 className="text-base font-semibold text-gray-900">{city}</h4>
                    <span className="text-sm text-gray-500">
                      ({dates.length} {dates.length === 1 ? 'configuração' : 'configurações'})
                    </span>
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAllCityDates(city);
                    }}
                    disabled={loading}
                    className="ml-4 p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={`Excluir todas as configurações de ${city}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bairro</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dia do Mês</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dates.map(date => (
                          <tr key={date.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{date.neighborhood}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              Dia {date.allowed_date} de cada mês
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                              <button
                                onClick={() => handleDeleteAllowedDate(date.id)}
                                disabled={loading}
                                className="text-red-600 hover:text-red-900 disabled:opacity-50"
                              >
                                Excluir
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
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
                Tem certeza que deseja excluir <strong>TODAS</strong> as configurações de <strong>{cityToDelete}</strong>?
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
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Excluindo...
                    </>
                  ) : (
                    'Excluir Tudo'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllowedVisitDatesManager;