import React, { useState } from "react";
import { X, Save, Calendar, Clock, AlertCircle, Phone } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useCollection } from "../../contexts/CollectionContext";
import { todayLocalStr } from "../../config/visitStatus";
import { ClientGroup, ScheduledVisitChannel } from "../../types";

interface ScheduleContactModalProps {
  client: ClientGroup;
  onClose: () => void;
  onSuccess: () => void;
}

// Equivalente, para o cobrador de carteira (interno/terceirizado/juridico),
// ao agendamento de visita do cobrador externo (VisitScheduler) -- mesma
// tabela (scheduled_visits), sem os campos de endereco/mapa que so fazem
// sentido pra visita presencial. Ver docs/PROGRESSO.md / plano salvo.
const ScheduleContactModal: React.FC<ScheduleContactModalProps> = ({
  client,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { scheduleVisit } = useCollection();
  const [channel, setChannel] = useState<ScheduledVisitChannel>("ligacao");
  const [date, setDate] = useState(todayLocalStr());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setError("Usuário não autenticado.");
      return;
    }
    if (!date) {
      setError("Escolha uma data.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await scheduleVisit({
        collectorId: user.id,
        clientDocument: client.document,
        clientName: client.client,
        scheduledDate: date,
        scheduledTime: time || undefined,
        status: "agendada",
        notes: notes.trim() || undefined,
        channel,
      });
      onSuccess();
    } catch (err) {
      console.error("Erro ao agendar contato:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes("duplicate key") || message.includes("unique")
          ? "Este cliente já tem um contato agendado em aberto."
          : "Falha ao agendar: " + message,
      );
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
              Agendar Contato
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {client.client}
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
            <label className="text-xs font-bold text-gray-400">Canal</label>
            <div className="flex gap-2">
              {(["ligacao", "whatsapp"] as ScheduledVisitChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`flex-1 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all ${
                    channel === c
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-dark-bg-secondary dark:border-dark-border"
                  }`}
                >
                  {c === "ligacao" ? "Ligação" : "WhatsApp"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400">Data</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={todayLocalStr()}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400">
                Horário (opcional)
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400">
              Observação (opcional)
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Ligar depois das 18h, cliente só atende nesse horário..."
                rows={3}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all resize-none dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
              />
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Agendar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduleContactModal;
