import React, { useMemo, useState } from "react";
import { X, Save, Calendar, MessageSquare, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useCollection } from "../../contexts/CollectionContext";
import { todayLocalStr } from "../../config/visitStatus";
import { ATTEMPT_RESULT_LABELS } from "../../config/collectionAttempts";
import { hasInstallmentBalance } from "../../filters/clientStatus";
import { ClientGroup, CollectionAttempt } from "../../types";

interface LogContactModalProps {
  client: ClientGroup;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Presente quando este contato veio de um agendamento ativo (ver
   * ScheduleContactModal/InternalCollectorWallet) -- ao registrar, fecha
   * esse agendamento como "realizada" em vez de deixa-lo em aberto.
   */
  linkedScheduledVisitId?: string;
}

// Motivo do contato -> tipo/resultado de collection_attempts. "Contato
// realizado" e "mensagem enviada" nao existiam no vocabulario original
// (criado pro CollectionModal, que so cobre ligacao/visita de titulo
// unico); estendidos em types/index.ts (CollectionAttempt) e no
// ATTEMPT_RESULT_LABELS do CollectionModal.
const STATUS_TO_ATTEMPT: Record<
  string,
  { type: CollectionAttempt["type"]; result: CollectionAttempt["result"] }
> = {
  promessa_pagamento: { type: "call", result: "promise" },
  contato_realizado: { type: "call", result: "contact_made" },
  nao_atende: { type: "call", result: "no_answer" },
  telefone_errado: { type: "call", result: "not_found" },
  recusou_pagar: { type: "call", result: "refusal" },
  mensagem_enviada: { type: "whatsapp", result: "message_sent" },
  contestou_divida: { type: "call", result: "disputed" },
};

// Situacao gravada ao liberar o cliente da carteira por contestacao (SPC) --
// mesmo destino do desfecho "spc" da visita presencial (ver
// config/visitOutcomes.VISIT_OUTCOMES), so que aqui o gatilho e o resultado
// do contato (ligacao/whatsapp) em vez da observacao da visita.
const SITUACAO_SPC = "Aguardando Jurídico";

const LogContactModal: React.FC<LogContactModalProps> = ({
  client,
  onClose,
  onSuccess,
  linkedScheduledVisitId,
}) => {
  const { user } = useAuth();
  const { refreshCollections, updateVisitStatus } = useCollection();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("promessa_pagamento");
  const [notes, setNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [error, setError] = useState("");

  // Um contato de carteira fala da divida do cliente como um todo, mas
  // collection_attempts e por titulo (collection_id) -- e assim que a aba
  // "Tentativas" de cada titulo no CollectionModal ja funciona. Grava uma
  // linha identica em cada titulo em aberto pra aparecer em todos eles.
  const titulosEmAberto = useMemo(() => {
    const ids: number[] = [];
    client?.sales?.forEach((sale) => {
      sale.installments?.forEach((inst) => {
        if (hasInstallmentBalance(inst)) ids.push(inst.id_parcela);
      });
    });
    return ids;
  }, [client]);

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

    if (titulosEmAberto.length === 0) {
      setError("Este cliente não tem título em aberto para registrar o contato.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { type, result } = STATUS_TO_ATTEMPT[status];
      const date = todayLocalStr();
      const rows = titulosEmAberto.map((collectionId) => ({
        collection_id: collectionId.toString(),
        date,
        type,
        result,
        notes,
        next_action:
          status === "promessa_pagamento" ? "Promessa de pagamento" : null,
        next_action_date:
          status === "promessa_pagamento" && promiseDate ? promiseDate : null,
        collector_id: user.id,
      }));

      const { error: insertError } = await supabase
        .from("collection_attempts")
        .insert(rows);

      if (insertError) throw insertError;

      if (linkedScheduledVisitId) {
        await updateVisitStatus(
          linkedScheduledVisitId,
          "realizada",
          ATTEMPT_RESULT_LABELS[result],
        );
      }

      // Contestacao da divida (SPC): mesma regra da visita presencial --
      // cobranca por telefone/WhatsApp nao resolve mais o caso, sai da
      // carteira e volta pra fila de Atribuicao marcado "Aguardando
      // Jurídico" pro gestor redistribuir.
      if (status === "contestou_divida") {
        const { error: releaseError } = await supabase.rpc(
          "liberar_cliente_da_carteira",
          {
            p_documento: client.document,
            p_situacao: SITUACAO_SPC,
            p_usuario_id: user.id,
          },
        );
        if (releaseError) {
          console.error("Erro ao liberar cliente da carteira (SPC):", releaseError);
        }
      }

      await refreshCollections();
      onSuccess();
    } catch (err) {
      console.error("Erro ao registrar contato:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError("Falha ao salvar contato: " + message);
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
              <option value="contestou_divida">
                Contestou a Dívida (SPC)
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
                  min={todayLocalStr()}
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
