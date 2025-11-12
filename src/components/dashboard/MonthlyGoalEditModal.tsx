import React, { useState, FormEvent, useEffect } from "react";
import { X, DollarSign, Calendar, Save, Target } from "lucide-react";
import { User } from "../../types";
import { supabase } from "../../lib/supabase";

interface MonthlyGoalEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  collector: User | null;
}

interface MonthlyGoal {
  id?: string;
  user_id: string;
  month: string;
  visits_goal: number;
  payments_goal: number;
}

const MonthlyGoalEditModal: React.FC<MonthlyGoalEditModalProps> = ({
  isOpen,
  onClose,
  collector,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [visitsGoal, setVisitsGoal] = useState(0);
  const [paymentsGoal, setPaymentsGoal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [currentGoal, setCurrentGoal] = useState<MonthlyGoal | null>(null);

  useEffect(() => {
    const fetchGoal = async () => {
      if (!collector) return;

      const monthPadded = (selectedMonth + 1).toString().padStart(2, "0");
      const dateString = `${selectedYear}-${monthPadded}-01`;

      const { data, error } = await supabase
        .from("monthly_goals")
        .select("*")
        .eq("user_id", collector.id)
        .eq("month", dateString);

      if (error) {
        console.error("Error fetching monthly goal:", error);
        setCurrentGoal(null);
        setVisitsGoal(0); // Default if error
        setPaymentsGoal(0); // Default if error
        return;
      }

      if (data && data.length > 0) {
        const goal = data[0];
        setCurrentGoal(goal);
        setVisitsGoal(goal.visits_goal);
        setPaymentsGoal(goal.payments_goal);
      } else {
        setCurrentGoal(null);
        setVisitsGoal(0); // Default if no goal found
        setPaymentsGoal(0); // Default if no goal found
      }
    };

    fetchGoal();
  }, [selectedMonth, selectedYear, collector]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto"; // Ensure it's reset when component unmounts
    };
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);

    if (!collector) return;

    const monthPadded = (selectedMonth + 1).toString().padStart(2, "0");
    const dateString = `${selectedYear}-${monthPadded}-01`;

    const goalData = {
      user_id: collector.id,
      month: dateString,
      visits_goal: visitsGoal,
      payments_goal: paymentsGoal,
    };

    let error = null;

    if (currentGoal) {
      // Update existing goal
      const { error: updateError } = await supabase
        .from("monthly_goals")
        .update(goalData)
        .eq("id", currentGoal.id);
      error = updateError;
    } else {
      // Insert new goal
      const { error: insertError } = await supabase
        .from("monthly_goals")
        .insert(goalData);
      error = insertError;
    }

    if (error) {
      console.error("Error saving monthly goal:", error);
      // Optionally, show an error message to the user
    } else {
      // Optionally, show a success message to the user
      onClose(); // Close modal on success
    }

    setIsSaving(false);
  };

  const months = [
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

  const years = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - 2 + i,
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (!isOpen || !collector) {
    return null;
  }

  return (
    <div
      className="!mt-0 fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm grid place-items-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-auto transform transition-all duration-300 ease-in-out max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Static Header */}
          <div className="relative flex-shrink-0 p-6 border-b border-gray-200">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-800">
                Editar Metas Mensais
              </h3>
              <p className="text-lg text-gray-600 mt-1">
                para {collector.name}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-6">
            {/* Período */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                Período
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="month"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Mês
                  </label>
                  <select
                    id="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 font-medium shadow-sm"
                  >
                    {months.map((month, index) => (
                      <option key={index} value={index}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="year"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Ano
                  </label>
                  <select
                    id="year"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 font-medium shadow-sm"
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Metas */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-green-500" />
                Objetivos
              </h4>
              <div className="space-y-4">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 transition-all hover:shadow-md">
                  <label
                    htmlFor="visits_goal"
                    className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2"
                  >
                    <Calendar size={16} className="text-blue-600" />
                    Meta de Visitas
                  </label>
                  <input
                    type="number"
                    id="visits_goal"
                    value={visitsGoal}
                    onChange={(e) => setVisitsGoal(Number(e.target.value))}
                    className="w-full px-4 py-3 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold text-blue-900 bg-white shadow-sm"
                    min="0"
                    placeholder="200"
                  />
                  <p className="text-xs text-blue-600 mt-2 font-medium">
                    Número de visitas planejadas para o mês
                  </p>
                </div>

                <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 transition-all hover:shadow-md">
                  <label
                    htmlFor="payments_goal"
                    className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2"
                  >
                    <DollarSign size={16} className="text-green-600" />
                    Meta de Pagamentos
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      id="payments_goal"
                      value={paymentsGoal}
                      onChange={(e) => setPaymentsGoal(Number(e.target.value))}
                      className="w-full px-4 py-3 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-lg font-bold text-green-900 bg-white shadow-sm"
                      min="0"
                      placeholder="100000"
                    />
                  </div>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Valor: {formatCurrency(paymentsGoal || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Static Footer */}
          <div className="relative flex-shrink-0 bg-gray-50 px-8 py-6 border-t border-gray-100 rounded-b-3xl">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl"
              >
                <Save size={18} />
                {isSaving ? "Salvando..." : "Salvar Metas"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MonthlyGoalEditModal;
