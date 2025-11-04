import React, { useState, useEffect, useMemo } from 'react';
import { useCollection } from '../../contexts/CollectionContext';
import { supabase } from '../../lib/supabase';
import { AllowedVisitDate } from '../../types';

const AllowedVisitDatesManager: React.FC = () => {
  const { collections } = useCollection();
  const [allowedDates, setAllowedDates] = useState<AllowedVisitDate[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleAddAllowedDate = async () => {
    if (!selectedCity || !selectedNeighborhood || !selectedDay) {
      setError('Por favor, selecione cidade, bairro e dia do mês.');
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase.from('allowed_visit_dates').insert([
      { city: selectedCity, neighborhood: selectedNeighborhood, allowed_date: parseInt(selectedDay) },
    ]).select();

    if (error) {
      setError(error.message);
    } else if (data) {
      setAllowedDates([...allowedDates, ...data]);
      // Limpar seleção após adicionar
      setSelectedCity('');
      setSelectedNeighborhood('');
      setSelectedDay('');
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

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Gerenciar Datas de Visita Permitidas</h3>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border rounded-lg">
        <div className="md:col-span-1">
          <label htmlFor="city-select" className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
          <select
            id="city-select"
            value={selectedCity}
            onChange={e => setSelectedCity(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecione a cidade</option>
            {cities.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1">
          <label htmlFor="neighborhood-select" className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
          <select
            id="neighborhood-select"
            value={selectedNeighborhood}
            onChange={e => setSelectedNeighborhood(e.target.value)}
            disabled={!selectedCity}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="">Selecione o bairro</option>
            {filteredNeighborhoods.map(neighborhood => (
              <option key={neighborhood} value={neighborhood}>{neighborhood}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1">
          <label htmlFor="day-select" className="block text-sm font-medium text-gray-700 mb-1">Dia do Mês</label>
          <select
            id="day-select"
            value={selectedDay}
            onChange={e => setSelectedDay(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecione o dia</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
              <option key={day} value={day.toString()}>
                Dia {day}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1 flex items-end">
          <button
            onClick={handleAddAllowedDate}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Adicionando...' : 'Adicionar Data'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cidade</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bairro</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dia do Mês</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {allowedDates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                  Nenhuma data permitida cadastrada. Configure as datas de visita para cada cidade/bairro.
                </td>
              </tr>
            ) : (
              allowedDates
                .sort((a, b) => {
                  // Ordenar por cidade, depois bairro, depois dia
                  if (a.city !== b.city) return a.city.localeCompare(b.city);
                  if (a.neighborhood !== b.neighborhood) return a.neighborhood.localeCompare(b.neighborhood);
                  return Number(a.allowed_date) - Number(b.allowed_date);
                })
                .map(date => (
                  <tr key={date.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{date.city}</td>
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
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AllowedVisitDatesManager;