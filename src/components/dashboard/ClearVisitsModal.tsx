import React, { useState } from "react";
import { Trash2, CheckCircle, Loader2 } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { ScheduledVisit } from "../../types";

// Status "concluidos"/historicos — NUNCA removidos pela limpeza.
export const DONE_VISIT_STATUSES = [
  "realizada",
  "cancelada",
  "nao_encontrado",
  "reagendada",
];

const parseDateUTC = (dateString: string): Date | null => {
  if (!dateString) return null;
  try {
    const [y, m, d] = dateString.split("-");
    return new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
  } catch {
    return null;
  }
};

const isOverdue = (v: ScheduledVisit): boolean => {
  if (v.status !== "agendada") return false;
  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const vd = parseDateUTC(v.scheduledDate);
  return !!vd && vd < todayUTC;
};

/** Quantidade de visitas pendentes (nao concluidas) de um cobrador. */
export const pendingVisitsCount = (
  visits: ScheduledVisit[],
  collectorId: string,
): number =>
  visits.filter(
    (v) =>
      v.collectorId === collectorId && !DONE_VISIT_STATUSES.includes(v.status),
  ).length;

interface ClearVisitsModalProps {
  collectorId: string;
  collectorName: string;
  onClose: () => void;
}

/**
 * Modal para limpar visitas PENDENTES de um cobrador (ex.: cobrador desativado).
 * Nunca afeta concluidas/historico. Mostra a contagem por escopo e confirma.
 */
const ClearVisitsModal: React.FC<ClearVisitsModalProps> = ({
  collectorId,
  collectorName,
  onClose,
}) => {
  const { scheduledVisits, deleteScheduledVisits } = useCollection();
  const [scope, setScope] = useState<"overdue" | "scheduled" | "pending">(
    "pending",
  );
  const [clearing, setClearing] = useState(false);

  const visitsForScope = (
    s: "overdue" | "scheduled" | "pending",
  ): ScheduledVisit[] => {
    const cv = scheduledVisits.filter((v) => v.collectorId === collectorId);
    if (s === "overdue") return cv.filter(isOverdue);
    if (s === "scheduled") return cv.filter((v) => v.status === "agendada");
    return cv.filter((v) => !DONE_VISIT_STATUSES.includes(v.status));
  };

  const overdueCount = visitsForScope("overdue").length;
  const scheduledCount = visitsForScope("scheduled").length;
  const pendingCount = visitsForScope("pending").length;
  const selectedCount =
    scope === "overdue"
      ? overdueCount
      : scope === "scheduled"
      ? scheduledCount
      : pendingCount;

  const options: {
    value: "overdue" | "scheduled" | "pending";
    label: string;
    desc: string;
    count: number;
  }[] = [
    {
      value: "overdue",
      label: "Apenas atrasadas",
      desc: "Agendadas com data vencida",
      count: overdueCount,
    },
    {
      value: "scheduled",
      label: "Apenas agendadas",
      desc: "Todas com status agendada",
      count: scheduledCount,
    },
    {
      value: "pending",
      label: "Todas as pendentes",
      desc: "Tudo que não foi concluído",
      count: pendingCount,
    },
  ];

  const handleClear = async () => {
    const ids = visitsForScope(scope).map((v) => v.id);
    if (ids.length === 0) {
      onClose();
      return;
    }
    setClearing(true);
    try {
      await deleteScheduledVisits(ids);
      onClose();
    } catch {
      // erro tratado no contexto
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={() => !clearing && onClose()}
    >
      <div
        className="bg-white dark:bg-dark-bg-secondary rounded-2xl max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl">
            <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text">
              Limpar visitas
            </h3>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
              Cobrador:{" "}
              <span className="font-semibold text-gray-700 dark:text-dark-text">
                {collectorName}
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {options.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                scope === opt.value
                  ? "border-red-300 bg-red-50/50 dark:bg-red-900/10"
                  : "border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg"
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="clearScope"
                  checked={scope === opt.value}
                  onChange={() => setScope(opt.value)}
                  className="text-red-600 focus:ring-red-500"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-dark-text-secondary">
                    {opt.desc}
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-bold ${
                  opt.count > 0 ? "text-red-600" : "text-gray-300"
                }`}
              >
                {opt.count}
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg rounded-lg p-3 mb-5">
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          Visitas concluídas (realizadas, canceladas, etc.) não são afetadas.
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={clearing}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-dark-text disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || selectedCount === 0}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-dark-border text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-all"
          >
            {clearing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Limpando...
              </>
            ) : (
              <>
                Limpar {selectedCount}{" "}
                {selectedCount === 1 ? "visita" : "visitas"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClearVisitsModal;
