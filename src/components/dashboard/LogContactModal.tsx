import React, { useState } from "react";
import { X, Save, Calendar, MessageSquare, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useCollection } from "../../contexts/CollectionContext";

interface LogContactModalProps {
  client: any;
  onClose: () => void;
  onSuccess: () => void;
}

const LogContactModal: React.FC<LogContactModalProps> = ({
  client,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { refreshCollections } = useCollection();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("promessa_pagamento");
  const [notes, setNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [error, setError] = useState("");

  if (!client) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      setError("Por favor, adicione uma observação sobre o contato.");
      return;
    }

    if (!user?.id) {
      setError("Usuário não autenticado.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const finalNotes =
        status === "promessa_pagamento" && promiseDate
          ? `[PROMESSA PARA ${new Date(promiseDate).toLocaleDateString("pt-BR")}] - ${notes}`
          : `[${status.replace("_", " ").toUpperCase()}] - ${notes}`;

      const { error: insertError } = await supabase
        .from("scheduled_visits")
        .insert([
          {
            collector_id: user.id,
            client_document: client.document,
            client_name: client.client,
            scheduled_date: new Date().toISOString().split("T")[0],
            status: "realizada", // Marcamos como realizada para entrar no histórico
            notes: finalNotes,
            client_address: client.address || "",
            client_city: client.city || "",
            total_pending_value: client.pendingValue,
            data_visita_realizada: new Date().toISOString().split("T")[0],
          },
        ]);

      if (insertError) throw insertError;

      await refreshCollections();
      onSuccess();
    } catch (err: any) {
      console.error("Erro ao registrar contato:", err);
      setError("Falha ao salvar contato: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Registrar Interação
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
            <label className="text-xs font-bold text-gray-400">
              Resultado do Contato
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
            >
              <option value="promessa_pagamento">Promessa de Pagamento</option>
              <option value="contato_realizado">
                Contato Realizado (Sem acordo)
              </option>
              <option value="nao_atende">Telefone não atende / Ocupado</option>
              <option value="telefone_errado">
                Telefone Errado / Inexistente
              </option>
              <option value="recusou_pagar">Recusou Pagar / Contestação</option>
              <option value="mensagem_enviada">
                Mensagem Enviada (WhatsApp/SMS)
              </option>
            </select>
          </div>

          {status === "promessa_pagamento" && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400">
                Data da Promessa
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400">
              Observações da Conversa
            </label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Cliente disse que pagará via PIX na sexta-feira após o almoço..."
                rows={4}
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
                  Salvar Registro
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LogContactModal;
