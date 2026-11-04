import React, { useState } from "react";
import { X, Ban, AlertCircle } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { ScheduledVisit } from "../../types";

interface CancelContactModalProps {
  visit: ScheduledVisit;
  onClose: () => void;
  onSuccess: () => void;
}

// Cancelamento direto (sem aprovacao do gestor) de um contato agendado
// (ligacao/whatsapp) do cobrador de carteira -- diferente da visita
// presencial, que tem custo de deslocamento perdido e por isso exige
// aprovacao do gestor (ver requestVisitCancellation/VisitScheduler). Item
// 16, docs/PROGRESSO.md.
const CancelContactModal: React.FC<CancelContactModalProps> = ({
  visit,
  onClose,
  onSuccess,
}) => {
  const { cancelScheduledContact } = useCollection();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Informe o motivo do cancelamento.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await cancelScheduledContact(visit.id, reason.trim());
      onSuccess();
    } catch (err) {
      console.error("Erro ao cancelar contato:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Cancelar Contato
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {visit.clientName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400">
              Motivo do cancelamento *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo do cancelamento..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text resize-none"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 dark:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  Cancelar Contato
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CancelContactModal;
