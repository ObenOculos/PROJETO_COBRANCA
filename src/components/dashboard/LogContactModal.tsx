import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Save,
  Calendar,
  Clock,
  MessageSquare,
  AlertCircle,
  Info,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useCollection } from "../../contexts/CollectionContext";
import { addDaysLocalStr, todayLocalStr } from "../../config/visitStatus";
import {
  ATTEMPT_RESULT_LABELS,
  attemptReschedulesActiveContact,
  rescheduleReasonForAttemptResult,
} from "../../config/collectionAttempts";
import { releaseSituacaoForAttemptResult } from "../../config/visitOutcomes";
import {
  buildRescheduleNotes,
  rescheduleReasonLabel,
  rescheduleReasonsForChannel,
} from "../../config/rescheduleReasons";
import { hasInstallmentBalance } from "../../filters/clientStatus";
import {
  ClientGroup,
  CollectionAttempt,
  ScheduledVisit,
  ScheduledVisitChannel,
} from "../../types";

interface LogContactModalProps {
  client: ClientGroup;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Contato agendado ATIVO deste cliente, do proprio cobrador, se houver. O
   * registro decide o desfecho dele (concluir ou remarcar) na mesma
   * transacao -- ver RPC registrar_contato.
   */
  linkedVisit?: ScheduledVisit;
}

// Motivo do contato -> tipo/resultado de collection_attempts.
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

const formatDateBR = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
};

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text";

/**
 * Registrar contato do cobrador de carteira -- um botao so para o que antes
 * era "Registrar Interacao" + "Reagendar": grava a tentativa, decide o
 * desfecho do contato agendado e marca o proximo, numa transacao
 * (registrar_contato). Modo "so remarcar" cobre a remarcacao sem tentativa
 * (agenda cheia, cliente pediu outro horario por mensagem).
 */
const LogContactModal: React.FC<LogContactModalProps> = ({
  client,
  onClose,
  onSuccess,
  linkedVisit,
}) => {
  const { user } = useAuth();
  const { refreshCollections, fetchScheduledVisits, rescheduleVisit } =
    useCollection();
  const today = todayLocalStr();
  const linkedChannel: ScheduledVisitChannel =
    linkedVisit?.channel && linkedVisit.channel !== "presencial"
      ? linkedVisit.channel
      : "ligacao";

  const [mode, setMode] = useState<"contato" | "remarcar">("contato");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("promessa_pagamento");
  const [notes, setNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [error, setError] = useState("");

  const [nextDate, setNextDate] = useState("");
  const [nextDateTouched, setNextDateTouched] = useState(false);
  const [nextTime, setNextTime] = useState(linkedVisit?.scheduledTime ?? "");
  const [nextChannel, setNextChannel] =
    useState<ScheduledVisitChannel>(linkedChannel);
  const [nextChannelTouched, setNextChannelTouched] = useState(false);

  const remarcarReasons = rescheduleReasonsForChannel(linkedChannel);
  const [remarcarReason, setRemarcarReason] = useState(
    remarcarReasons[0]?.key ?? "outro",
  );
  const [remarcarDate, setRemarcarDate] = useState(addDaysLocalStr(today, 1));

  const { result } = STATUS_TO_ATTEMPT[status];
  const releaseSituacao = releaseSituacaoForAttemptResult(result);
  const reschedules = attemptReschedulesActiveContact(result);

  // Sugestao do proximo contato pelo resultado, enquanto o cobrador nao
  // mexeu no campo: nao atendeu/mensagem -> amanha; promessa -> dia seguinte
  // ao prometido (conferir se pagou).
  useEffect(() => {
    if (!nextDateTouched) {
      if (status === "nao_atende" || status === "mensagem_enviada") {
        setNextDate(addDaysLocalStr(today, 1));
      } else if (status === "promessa_pagamento" && promiseDate) {
        setNextDate(addDaysLocalStr(promiseDate, 1));
      } else {
        setNextDate("");
      }
    }
    if (!nextChannelTouched) {
      setNextChannel(status === "mensagem_enviada" ? "whatsapp" : linkedChannel);
    }
  }, [status, promiseDate, nextDateTouched, nextChannelTouched, today, linkedChannel]);

  // Um contato de carteira fala da divida do cliente como um todo, mas
  // collection_attempts e por titulo (collection_id). Grava uma linha em
  // cada titulo em aberto.
  const titulosEmAberto = useMemo(() => {
    const ids: string[] = [];
    client?.sales?.forEach((sale) => {
      sale.installments?.forEach((inst) => {
        if (hasInstallmentBalance(inst)) ids.push(inst.id_parcela.toString());
      });
    });
    return ids;
  }, [client]);

  if (!client) return null;

  const effectiveNext = releaseSituacao ? "" : nextDate;

  // O que vai acontecer ao salvar, em texto -- o cobrador ve antes.
  const preview: string[] = [];
  if (mode === "contato") {
    if (releaseSituacao) {
      preview.push(`O cliente sai da sua carteira (${releaseSituacao}).`);
    }
    if (linkedVisit) {
      const when = formatDateBR(linkedVisit.scheduledDate);
      if (effectiveNext && reschedules) {
        preview.push(
          `O contato agendado para ${when} será remarcado para ${formatDateBR(effectiveNext)} (motivo: ${rescheduleReasonLabel(rescheduleReasonForAttemptResult(result))}).`,
        );
      } else {
        preview.push(`O contato agendado para ${when} será concluído.`);
      }
    }
    if (effectiveNext && !(linkedVisit && reschedules)) {
      preview.push(
        `Próximo contato agendado para ${formatDateBR(effectiveNext)}.`,
      );
    }
    if (!effectiveNext && !releaseSituacao) {
      preview.push("Nenhum próximo contato será agendado.");
    }
  }

  const errorMessage = (err: unknown) =>
    err instanceof Error
      ? err.message
      : ((err as { message?: string })?.message ?? String(err));

  const reload = async () => {
    await Promise.all([refreshCollections(), fetchScheduledVisits(false)]);
  };

  const handleRemarcar = async () => {
    if (!linkedVisit) return;
    if (!remarcarDate || remarcarDate < today) {
      setError("Escolha uma data a partir de hoje.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await rescheduleVisit(
        linkedVisit.id,
        remarcarDate,
        nextTime || undefined,
        remarcarReason,
      );
      onSuccess();
    } catch (err) {
      console.error("Erro ao remarcar contato:", err);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "remarcar") {
      await handleRemarcar();
      return;
    }
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
    if (effectiveNext && effectiveNext < today) {
      setError("O próximo contato não pode ser em data passada.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { type } = STATUS_TO_ATTEMPT[status];
      const isPromise = status === "promessa_pagamento";
      const reagendar = !!linkedVisit && !!effectiveNext && reschedules;
      const motivo = reagendar
        ? rescheduleReasonForAttemptResult(result)
        : undefined;
      const rescheduleNotes =
        reagendar && linkedVisit
          ? buildRescheduleNotes(
              linkedVisit,
              effectiveNext,
              nextTime || undefined,
              motivo,
            )
          : undefined;
      const label = ATTEMPT_RESULT_LABELS[result];

      const { error: rpcError } = await supabase.rpc("registrar_contato", {
        p_documento: client.document,
        p_nome_cliente: client.client,
        p_titulos: titulosEmAberto,
        p_data: today,
        p_tipo: type,
        p_resultado: result,
        p_notas: notes,
        p_proxima_acao: isPromise ? "Promessa de pagamento" : undefined,
        p_data_promessa: isPromise && promiseDate ? promiseDate : undefined,
        p_visita_id: linkedVisit?.id,
        p_rotulo_resultado: label,
        p_reagendar: reagendar,
        p_motivo_reagendamento: motivo,
        p_notas_reagendamento_original: rescheduleNotes?.original,
        p_notas_reagendamento_nova: rescheduleNotes?.nova,
        p_proxima_data: effectiveNext || undefined,
        p_proximo_horario: effectiveNext && nextTime ? nextTime : undefined,
        p_proximo_canal: effectiveNext ? nextChannel : undefined,
        p_notas_proximo:
          effectiveNext && !reagendar
            ? `Acompanhamento: ${label}${isPromise && promiseDate ? ` (promessa para ${formatDateBR(promiseDate)})` : ""}`
            : undefined,
        p_situacao_liberacao: releaseSituacao ?? undefined,
      });

      if (rpcError) throw rpcError;

      await reload();
      onSuccess();
    } catch (err) {
      console.error("Erro ao registrar contato:", err);
      setError("Falha ao salvar contato: " + errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border animate-in fade-in zoom-in duration-200 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Registrar Contato
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {client.client}
              {linkedVisit &&
                ` · agendado para ${formatDateBR(linkedVisit.scheduledDate)}${linkedVisit.scheduledTime ? ` ${linkedVisit.scheduledTime.slice(0, 5)}` : ""}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto"
        >
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {linkedVisit && (
            <div className="flex gap-2">
              {(
                [
                  ["contato", "Fiz o contato"],
                  ["remarcar", "Só remarcar (sem contato)"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMode(key);
                    setError("");
                  }}
                  className={`flex-1 px-3 py-2 rounded-xl border font-bold text-xs transition-all ${
                    mode === key
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-dark-bg-secondary dark:border-dark-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "contato" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400">
                  Resultado do Contato
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="promessa_pagamento">
                    Promessa de Pagamento
                  </option>
                  <option value="contato_realizado">
                    Contato Realizado (Sem acordo)
                  </option>
                  <option value="nao_atende">
                    Telefone não atende / Ocupado
                  </option>
                  <option value="telefone_errado">
                    Telefone Errado / Inexistente
                  </option>
                  <option value="recusou_pagar">
                    Recusou Pagar / Contestação
                  </option>
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
                      className={`${inputClass} pl-10`}
                      min={today}
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
                    rows={3}
                    className={`${inputClass} pl-10 py-3 resize-none`}
                  />
                </div>
              </div>

              {!releaseSituacao && (
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-bold text-gray-400">
                    Próximo contato {nextDate ? "" : "(opcional)"}
                  </label>
                  <div className="flex gap-2">
                    {(["ligacao", "whatsapp"] as ScheduledVisitChannel[]).map(
                      (c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setNextChannel(c);
                            setNextChannelTouched(true);
                          }}
                          className={`flex-1 px-3 py-2 rounded-xl border font-bold text-xs transition-all ${
                            nextChannel === c
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-dark-bg-secondary dark:border-dark-border"
                          }`}
                        >
                          {c === "ligacao" ? "Ligação" : "WhatsApp"}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={nextDate}
                        onChange={(e) => {
                          setNextDate(e.target.value);
                          setNextDateTouched(true);
                        }}
                        min={today}
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="time"
                        value={nextTime}
                        onChange={(e) => setNextTime(e.target.value)}
                        disabled={!nextDate}
                        className={`${inputClass} pl-10 disabled:opacity-50`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {preview.length > 0 && (
                <div className="p-3 bg-indigo-50 dark:bg-dark-bg-secondary border border-indigo-100 dark:border-dark-border rounded-xl text-xs text-indigo-800 dark:text-dark-text-secondary flex gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {preview.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400">Motivo</label>
                <select
                  value={remarcarReason}
                  onChange={(e) => setRemarcarReason(e.target.value)}
                  className={inputClass}
                >
                  {remarcarReasons.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400">
                    Nova data
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={remarcarDate}
                      onChange={(e) => setRemarcarDate(e.target.value)}
                      min={today}
                      required
                      className={`${inputClass} pl-10`}
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
                      value={nextTime}
                      onChange={(e) => setNextTime(e.target.value)}
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                Nenhuma tentativa de contato é registrada — use quando não
                houve contato com o cliente.
              </p>
            </>
          )}

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
                  {mode === "remarcar" ? "Remarcar" : "Salvar Registro"}
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
