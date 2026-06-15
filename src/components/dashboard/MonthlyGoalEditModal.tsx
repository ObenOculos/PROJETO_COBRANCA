import React, { useState, FormEvent, useEffect } from "react";
import { DollarSign, Calendar, Save, Target, ChevronDown, Bell } from "lucide-react";
import { User } from "../../types";
import { supabase } from "../../lib/supabase";
import { useCollection } from "../../contexts/CollectionContext";
import { Modal } from "../Modal";

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
  const { scheduledVisits, salePayments } = useCollection();

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["period", "goals"])
  );
  const [sendNotification, setSendNotification] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const [suggestVisits3, setSuggestVisits3] = useState<number | null>(null);
  const [suggestVisits6, setSuggestVisits6] = useState<number | null>(null);
  const [suggestPayments3, setSuggestPayments3] = useState<number | null>(null);
  const [suggestPayments6, setSuggestPayments6] = useState<number | null>(null);

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  useEffect(() => {
    const fetchGoal = async () => {
      if (!collector || !isOpen) return;

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
        setVisitsGoal(0);
        setPaymentsGoal(0);
        return;
      }

      if (data && data.length > 0) {
        const goal = data[0];
        setCurrentGoal(goal);
        setVisitsGoal(goal.visits_goal);
        setPaymentsGoal(goal.payments_goal);
      } else {
        setCurrentGoal(null);
        setVisitsGoal(0);
        setPaymentsGoal(0);
      }
    };

    fetchGoal();
  }, [selectedMonth, selectedYear, collector, isOpen]);

  // Helpers
  const safeParseDate = (d: string | null | undefined) => {
    if (!d) return null;
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  };

  const monthYearKey = (y: number, m: number) => `${y}-${m}`;

  useEffect(() => {
    if (!collector || !isOpen) return;

    const collectorVisits = scheduledVisits.filter((v) => v.collectorId === collector.id);
    const collectorPayments = salePayments.filter((p) => p.collectorId === collector.id);

    const buildWindow = (monthsBack: number) => {
      const keys: string[] = [];
      let y = selectedYear;
      let m = selectedMonth;
      for (let i = 0; i < monthsBack; i++) {
        keys.push(monthYearKey(y, m));
        m--;
        if (m < 0) {
          m = 11;
          y -= 1;
        }
      }
      return keys.reverse();
    };

    const calcVisitsAvg = (monthsBack: number) => {
      const window = buildWindow(monthsBack);
      const countsByKey: Record<string, number> = {};
      window.forEach((k) => (countsByKey[k] = 0));

      collectorVisits.forEach((v) => {
        const d = safeParseDate(v.dataVisitaRealizada || v.scheduledDate);
        if (!d) return;
        const key = monthYearKey(d.getFullYear(), d.getMonth());
        if (key in countsByKey) {
          if (v.status === "realizada") countsByKey[key]++;
        }
      });

      const sum = Object.values(countsByKey).reduce((s, n) => s + n, 0);
      return Math.round(sum / monthsBack);
    };

    const calcPaymentsAvg = (monthsBack: number) => {
      const window = buildWindow(monthsBack);
      const sumsByKey: Record<string, number> = {};
      window.forEach((k) => (sumsByKey[k] = 0));

      collectorPayments.forEach((p) => {
        const d = safeParseDate(p.paymentDate);
        if (!d) return;
        const key = monthYearKey(d.getFullYear(), d.getMonth());
        if (key in sumsByKey) {
          sumsByKey[key] += Number(p.paymentAmount || 0);
        }
      });

      const sum = Object.values(sumsByKey).reduce((s, n) => s + n, 0);
      return Math.round(sum / monthsBack);
    };

    try {
      setSuggestVisits3(calcVisitsAvg(3));
      setSuggestVisits6(calcVisitsAvg(6));
      setSuggestPayments3(calcPaymentsAvg(3));
      setSuggestPayments6(calcPaymentsAvg(6));
    } catch (err) {
      setSuggestVisits3(null);
      setSuggestVisits6(null);
      setSuggestPayments3(null);
      setSuggestPayments6(null);
    }
  }, [collector, scheduledVisits, salePayments, selectedMonth, selectedYear, isOpen]);

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

    if (currentGoal?.id) {
      const { error: updateError } = await supabase
        .from("monthly_goals")
        .update(goalData)
        .eq("id", currentGoal.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("monthly_goals")
        .insert(goalData);
      error = insertError;
    }

    if (error) {
      console.error("Error saving monthly goal:", error);
    } else {
      onClose();
    }

    setIsSaving(false);
  };

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
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

  if (!collector) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Metas Mensais: ${collector.name}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
          {/* Período Section */}
          <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("period")}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-gray-800 dark:text-dark-text text-sm uppercase tracking-wider">Período</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedSections.has("period") ? "" : "-rotate-90"}`} />
            </button>

            {expandedSections.has("period") && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-dark-border bg-gray-50/30 dark:bg-dark-bg/30">
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-dark-text-secondary mb-1.5 uppercase tracking-wide">Mês</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg transition-all"
                  >
                    {months.map((month, index) => (
                      <option key={index} value={index}>{month}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-dark-text-secondary mb-1.5 uppercase tracking-wide">Ano</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg transition-all"
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Goals Section */}
          <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("goals")}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-green-500" />
                <span className="font-semibold text-gray-800 dark:text-dark-text text-sm uppercase tracking-wider">Objetivos</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedSections.has("goals") ? "" : "-rotate-90"}`} />
            </button>

            {expandedSections.has("goals") && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-dark-border bg-gray-50/30 dark:bg-dark-bg/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-dark-text-secondary mb-1.5 uppercase tracking-wide">Meta de Visitas</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={visitsGoal}
                        onChange={(e) => setVisitsGoal(Number(e.target.value))}
                        className="w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-dark-text-secondary mb-1.5 uppercase tracking-wide">Meta de Pagamentos</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={paymentsGoal}
                        onChange={(e) => setPaymentsGoal(Number(e.target.value))}
                        className="w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm font-bold text-green-600 focus:ring-2 focus:ring-green-500 dark:bg-dark-bg"
                        placeholder="0"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 font-medium">{formatCurrency(paymentsGoal)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Insights Section */}
          <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("insights")}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-gray-800 dark:text-dark-text text-sm uppercase tracking-wider">Sugestões e Insights</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedSections.has("insights") ? "" : "-rotate-90"}`} />
            </button>

            {expandedSections.has("insights") && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-dark-border bg-gray-50/30 dark:bg-dark-bg/30">
                <div className="mt-4 overflow-hidden border border-gray-200 dark:border-dark-border rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 dark:bg-dark-bg text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 font-bold">Métrica</th>
                        <th className="px-3 py-2 font-bold text-center">3 Meses</th>
                        <th className="px-3 py-2 font-bold text-center">6 Meses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-border dark:text-dark-text">
                      <tr>
                        <td className="px-3 py-2 font-medium">Média Visitas</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setVisitsGoal(suggestVisits3 || 0)}
                            className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                          >
                            {suggestVisits3 ?? "—"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setVisitsGoal(suggestVisits6 || 0)}
                            className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                          >
                            {suggestVisits6 ?? "—"}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Média Receb.</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setPaymentsGoal(suggestPayments3 || 0)}
                            className="text-green-600 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                          >
                            {suggestPayments3 ? formatCurrency(suggestPayments3) : "—"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setPaymentsGoal(suggestPayments6 || 0)}
                            className="text-green-600 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                          >
                            {suggestPayments6 ? formatCurrency(suggestPayments6) : "—"}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (suggestVisits3) setVisitsGoal(Math.round(suggestVisits3 * 1.1));
                      if (suggestPayments3) setPaymentsGoal(Math.round(suggestPayments3 * 1.1));
                    }}
                    className="w-full py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors"
                  >
                    Aplicar +10% sobre média de 3 meses
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Section */}
          <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("advanced")}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-500" />
                <span className="font-semibold text-gray-800 dark:text-dark-text text-sm uppercase tracking-wider">Configurações Extras</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedSections.has("advanced") ? "" : "-rotate-90"}`} />
            </button>

            {expandedSections.has("advanced") && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-dark-border bg-gray-50/30 dark:bg-dark-bg/30">
                <label className="flex items-center gap-3 cursor-pointer mt-4 p-2 hover:bg-white dark:hover:bg-dark-bg rounded-lg transition-colors">
                  <input
                    type="checkbox"
                    checked={sendNotification}
                    onChange={(e) => setSendNotification(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-dark-text">Notificar cobrador ao salvar</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white dark:hover:bg-dark-bg rounded-lg transition-colors">
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-dark-text">Salvar como modelo reutilizável</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-dark-border mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-500 uppercase tracking-wider hover:bg-gray-50 dark:hover:bg-dark-bg rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-bold uppercase tracking-wider shadow-lg shadow-blue-200 dark:shadow-none transition-all"
          >
            {isSaving ? (
              <span className="animate-pulse">Salvando...</span>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Metas
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default MonthlyGoalEditModal;
