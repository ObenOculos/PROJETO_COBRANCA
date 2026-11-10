import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Save,
  Calendar,
  Clock,
  MessageSquare,
  AlertCircle,
  Info,
  ArrowLeft,
  ArrowRight,
  Phone,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useCollection } from "../../contexts/CollectionContext";
import { addDaysLocalStr, todayLocalStr } from "../../config/visitStatus";
import { formatCurrency, formatHorario } from "../../utils/formatters";
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
  /** Canal que o cobrador acabou de usar (Telefone/WhatsApp na carteira):
   * a tentativa e o proximo contato ja saem com ele. */
  canalUsado?: "ligacao" | "whatsapp";
  /** Cancelar o contato agendado (motivo no modal proprio). */
  onCancelarAgendamento?: (visit: ScheduledVisit) => void;
  /** Gestor atendendo pelo cobrador: o contato e o proximo agendamento
   * ficam em nome deste usuario (cobrador da carteira). Ausente = de quem
   * esta logado. */
  emNomeDe?: string | null;
  /** "Cliente diz que ja pagou" COM comprovante: depois de salvar o
   * atendimento, quem abriu o modal abre o registro do pagamento. */
  onRegistrarPagamento?: () => void;
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
  diz_que_pagou: { type: "call", result: "claims_paid" },
  venda_cancelada: { type: "call", result: "sale_cancel_reported" },
};

const CHANNEL_LABEL: Record<ScheduledVisitChannel, string> = {
  presencial: "Presencial",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
};

const formatDateBR = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
};

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text";

const toggleClass = (active: boolean) =>
  `flex-1 px-3 py-2 rounded-xl border font-bold text-xs transition-all ${
    active
      ? "bg-indigo-600 text-white border-indigo-600"
      : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-dark-bg-secondary dark:border-dark-border"
  }`;

/**
 * "Atender" do cobrador de carteira -- um modal so, em 2 etapas, para o que
 * antes eram 3 botoes ("Registrar Interacao", "Reagendar", "Agendar
 * contato"):
 *
 *  1. O que aconteceu: "Fiz o contato" (resultado + observacao) ou "Nao fiz
 *     contato" (so mexe na agenda; com contato agendado, pede o motivo).
 *  2. Proximo contato: canal/data/horario, sugeridos pelo resultado. Pulada
 *     quando o resultado tira o cliente da carteira (SPC).
 *
 * Cada combinacao continua chamando o mesmo caminho de antes: "fiz o
 * contato" -> RPC registrar_contato (tentativa + desfecho do agendamento +
 * proximo, numa transacao); "nao fiz contato" com agendamento ->
 * rescheduleVisit; sem agendamento -> scheduleVisit.
 */
const LogContactModal: React.FC<LogContactModalProps> = ({
  client,
  onClose,
  onSuccess,
  linkedVisit,
  canalUsado,
  onCancelarAgendamento,
  emNomeDe,
  onRegistrarPagamento,
}) => {
  const { user } = useAuth();
  // Em nome de quem fica o registro (o gestor pode escolher o cobrador).
  const responsavelId = emNomeDe ?? user?.id;
  const {
    refreshCollections,
    fetchScheduledVisits,
    rescheduleVisit,
    scheduleVisit,
    clientesRegistry,
  } = useCollection();
  const today = todayLocalStr();

  // Pessoa de contato do ERP Ciclone (mesma origem do bloco "Falar com" da
  // ficha): o cobrador esta ligando, precisa saber por quem perguntar.
  const cadastroErp = clientesRegistry.get(client.document);
  const contatoNome = cadastroErp?.contato_nome?.trim() || undefined;
  const telefonesContato = [
    cadastroErp?.contato_telefone,
    cadastroErp?.contato_telefone2,
  ]
    .map((t) => t?.trim())
    .filter((t): t is string => Boolean(t));
  const linkedChannel: ScheduledVisitChannel =
    linkedVisit?.channel && linkedVisit.channel !== "presencial"
      ? linkedVisit.channel
      : "ligacao";

  const [step, setStep] = useState<1 | 2>(1);
  // Ghost click em mobile: o toque em "Avancar" pode cair no "Salvar" que
  // nasce no mesmo lugar (mesmo problema tratado no AcordoModal). Ignora
  // submit logo depois de entrar na etapa 2.
  const step2EnteredAt = useRef(0);
  const [mode, setMode] = useState<"contato" | "sem_contato">("contato");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("promessa_pagamento");
  const [notes, setNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [error, setError] = useState("");

  const [nextDate, setNextDate] = useState("");
  const [nextDateTouched, setNextDateTouched] = useState(false);
  const [nextTime, setNextTime] = useState(linkedVisit?.scheduledTime ?? "");
  const [nextChannel, setNextChannel] = useState<ScheduledVisitChannel>(
    linkedVisit ? linkedChannel : (canalUsado ?? linkedChannel),
  );
  const [nextChannelTouched, setNextChannelTouched] = useState(false);
  const [semProximo, setSemProximo] = useState(false);
  const [scheduleNotes, setScheduleNotes] = useState("");
  // "Cliente diz que ja pagou": o comprovante ja chegou? (obrigatorio)
  const [comprovante, setComprovante] = useState<"sim" | "nao" | "">("");
  // "Cliente informa venda cancelada": vendas marcadas (chave da venda).
  const [vendasCanceladas, setVendasCanceladas] = useState<Set<number>>(
    new Set(),
  );

  const remarcarReasons = rescheduleReasonsForChannel(linkedChannel);
  const [remarcarReason, setRemarcarReason] = useState(
    remarcarReasons[0]?.key ?? "outro",
  );

  const { result } = STATUS_TO_ATTEMPT[status];
  const releaseSituacao =
    mode === "contato" ? releaseSituacaoForAttemptResult(result) : null;
  const reschedules = attemptReschedulesActiveContact(result);
  // "Diz que ja pagou" com comprovante: em seguida registra o pagamento, que
  // e o que resolve o caso -- sem proximo contato.
  const pagouComComprovante =
    mode === "contato" && status === "diz_que_pagou" && comprovante === "sim";
  // Resultado que tira o cliente da carteira (ou que segue para o registro
  // do pagamento): nao ha proximo contato a marcar, salva direto da etapa 1.
  // Venda informada como cancelada: vai para conferencia do gestor, sem
  // proximo contato por ela.
  const informaVendaCancelada =
    mode === "contato" && status === "venda_cancelada";
  const skipStep2 =
    mode === "contato" &&
    (!!releaseSituacao || pagouComComprovante || informaVendaCancelada);

  // Sugestao do proximo contato, enquanto o cobrador nao mexeu no campo:
  // nao atendeu/mensagem -> amanha; promessa -> dia seguinte ao prometido
  // (conferir se pagou); sem contato -> amanha se remarca, hoje se agenda.
  useEffect(() => {
    if (!nextDateTouched) {
      if (mode === "sem_contato") {
        setNextDate(linkedVisit ? addDaysLocalStr(today, 1) : today);
      } else if (
        status === "nao_atende" ||
        status === "mensagem_enviada" ||
        // Vai enviar o comprovante: cobrar amanha.
        status === "diz_que_pagou"
      ) {
        setNextDate(addDaysLocalStr(today, 1));
      } else if (status === "promessa_pagamento" && promiseDate) {
        setNextDate(addDaysLocalStr(promiseDate, 1));
      } else {
        setNextDate("");
      }
    }
    if (!nextChannelTouched) {
      setNextChannel(
        mode === "contato" && status === "mensagem_enviada"
          ? "whatsapp"
          : linkedChannel,
      );
    }
  }, [
    mode,
    status,
    promiseDate,
    nextDateTouched,
    nextChannelTouched,
    today,
    linkedChannel,
    linkedVisit,
  ]);

  // Um contato de carteira fala da divida do cliente como um todo, mas
  // collection_attempts e por titulo (collection_id). Grava uma linha em
  // cada titulo em aberto.
  // Vendas do cliente com saldo em aberto (para marcar a cancelada).
  const vendasEmAberto = useMemo(
    () =>
      (client?.sales ?? [])
        .map((sale) => ({
          chave: sale.saleNumber,
          parcelas: sale.installments.filter((i) => hasInstallmentBalance(i)),
        }))
        .filter((v) => v.parcelas.length > 0)
        .map((v) => ({
          chave: v.chave,
          aberto: v.parcelas.reduce(
            (s, i) =>
              s + (i.valor_original - (i.valor_recebido || 0) - (i.desconto || 0)),
            0,
          ),
          qtd: v.parcelas.length,
        })),
    [client],
  );
  // Uma venda so: ja vem marcada.
  useEffect(() => {
    if (status === "venda_cancelada" && vendasEmAberto.length === 1) {
      setVendasCanceladas(new Set([vendasEmAberto[0].chave]));
    }
  }, [status, vendasEmAberto]);

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

  const effectiveNext =
    mode === "sem_contato"
      ? nextDate
      : releaseSituacao || semProximo || pagouComComprovante || informaVendaCancelada
        ? ""
        : nextDate;
  // Remarcacao sem contato mantem o canal do agendamento (rescheduleVisit
  // nao troca canal).
  const remarcaSemContato = mode === "sem_contato" && !!linkedVisit;
  // Observacao do agendamento so quando nasce um agendamento NOVO -- na
  // remarcacao as notas sao o historico montado por buildRescheduleNotes.
  const criaAgendamentoNovo =
    (mode === "sem_contato" && !linkedVisit) ||
    (mode === "contato" && !!effectiveNext && !(linkedVisit && reschedules));

  // O que vai acontecer ao salvar, em texto -- o cobrador ve antes.
  const preview: string[] = [];
  if (mode === "contato") {
    if (releaseSituacao) {
      preview.push(`O cliente sai da sua carteira (${releaseSituacao}).`);
    }
    if (pagouComComprovante) {
      preview.push(
        "Depois de salvar, abre o registro do pagamento para lançar o valor do comprovante.",
      );
    }
    if (informaVendaCancelada) {
      preview.push(
        "As parcelas em aberto da(s) venda(s) marcada(s) saem da carteira até o gestor conferir. As outras vendas do cliente continuam.",
      );
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
        `Próximo contato (${CHANNEL_LABEL[nextChannel]}) agendado para ${formatDateBR(effectiveNext)}.`,
      );
    }
    if (!effectiveNext && !releaseSituacao && semProximo) {
      preview.push("Nenhum próximo contato será agendado.");
    }
  } else {
    if (linkedVisit && nextDate) {
      preview.push(
        `O contato agendado para ${formatDateBR(linkedVisit.scheduledDate)} será remarcado para ${formatDateBR(nextDate)} (motivo: ${rescheduleReasonLabel(remarcarReason)}).`,
      );
    } else if (nextDate) {
      preview.push(
        `Contato (${CHANNEL_LABEL[nextChannel]}) agendado para ${formatDateBR(nextDate)}.`,
      );
    }
    preview.push("Nenhuma tentativa de contato é registrada.");
  }

  const errorMessage = (err: unknown) =>
    err instanceof Error
      ? err.message
      : ((err as { message?: string })?.message ?? String(err));

  const reload = async () => {
    await Promise.all([refreshCollections(), fetchScheduledVisits(false)]);
  };

  /** Validacao da etapa 1 (o que aconteceu). */
  const validateStep1 = (): string | null => {
    if (mode === "sem_contato") return null;
    if (status === "diz_que_pagou" && !comprovante)
      return "Informe se o cliente já enviou o comprovante.";
    if (status === "venda_cancelada" && vendasCanceladas.size === 0)
      return "Marque qual venda o cliente informou como cancelada.";
    if (!notes.trim()) return "Por favor, adicione uma observação sobre o contato.";
    if (titulosEmAberto.length === 0)
      return "Este cliente não tem título em aberto para registrar o contato.";
    return null;
  };

  const goToStep2 = () => {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    step2EnteredAt.current = Date.now();
    setStep(2);
  };

  const handleSemContato = async () => {
    if (!user?.id) {
      setError("Usuário não autenticado.");
      return;
    }
    if (!nextDate || nextDate < today) {
      setError("Escolha uma data a partir de hoje.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (linkedVisit) {
        await rescheduleVisit(
          linkedVisit.id,
          nextDate,
          nextTime || undefined,
          remarcarReason,
        );
      } else {
        await scheduleVisit({
          collectorId: responsavelId ?? user.id,
          clientDocument: client.document,
          clientName: client.client,
          scheduledDate: nextDate,
          scheduledTime: nextTime || undefined,
          status: "agendada",
          notes: scheduleNotes.trim() || undefined,
          channel: nextChannel,
        });
      }
      onSuccess();
    } catch (err) {
      console.error("Erro ao agendar/remarcar contato:", err);
      const message = errorMessage(err);
      setError(
        message.includes("duplicate key") || message.includes("unique")
          ? "Este cliente já tem um contato agendado em aberto."
          : "Falha ao salvar: " + message,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleContato = async () => {
    if (!user?.id) {
      setError("Usuário não autenticado.");
      return;
    }
    if (
      !releaseSituacao &&
      !semProximo &&
      !pagouComComprovante &&
      !informaVendaCancelada &&
      !nextDate
    ) {
      setError(
        "Escolha a data do próximo contato ou marque “Não agendar próximo contato”.",
      );
      return;
    }
    if (effectiveNext && effectiveNext < today) {
      setError("O próximo contato não pode ser em data passada.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Veio do botao WhatsApp: a tentativa e por WhatsApp, qualquer que seja
      // o resultado (o mapa STATUS_TO_ATTEMPT assume ligacao).
      const type =
        canalUsado === "whatsapp" ? "whatsapp" : STATUS_TO_ATTEMPT[status].type;

      if (informaVendaCancelada) {
        // Registra o atendimento, a informacao e tira as parcelas da
        // carteira numa transacao (migration 20261110000008).
        const { error: vendaError } = await supabase.rpc(
          "informar_venda_cancelada",
          {
            p_documento: client.document,
            p_chaves: Array.from(vendasCanceladas),
            p_observacao: notes,
            p_tipo_contato: type,
            p_em_nome_de: emNomeDe ?? undefined,
          },
        );
        if (vendaError) throw vendaError;
        await reload();
        onSuccess();
        return;
      }
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
      const obsAgendamento = scheduleNotes.trim();

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
            ? `Acompanhamento: ${label}${isPromise && promiseDate ? ` (promessa para ${formatDateBR(promiseDate)})` : ""}${obsAgendamento ? ` — ${obsAgendamento}` : ""}`
            : undefined,
        p_situacao_liberacao: releaseSituacao ?? undefined,
        p_em_nome_de: emNomeDe ?? undefined,
      });

      if (rpcError) throw rpcError;

      await reload();
      onSuccess();
      if (pagouComComprovante) onRegistrarPagamento?.();
    } catch (err) {
      console.error("Erro ao registrar contato:", err);
      setError("Falha ao salvar contato: " + errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (step === 1 && !skipStep2) {
      goToStep2();
      return;
    }
    if (step === 2 && Date.now() - step2EnteredAt.current < 400) return;
    if (step === 1) {
      // skipStep2: salva direto da etapa 1.
      const err = validateStep1();
      if (err) {
        setError(err);
        return;
      }
    }
    if (mode === "sem_contato") await handleSemContato();
    else await handleContato();
  };

  const previewBox =
    preview.length > 0 ? (
      <div className="p-3 bg-indigo-50 dark:bg-dark-bg-secondary border border-indigo-100 dark:border-dark-border rounded-xl text-xs text-indigo-800 dark:text-dark-text-secondary flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          {preview.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>
    ) : null;

  const stepLabels = ["O que aconteceu", "Próximo contato"] as const;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border animate-in fade-in zoom-in duration-200 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Atender
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {client.client}
              {linkedVisit &&
                ` · agendado para ${formatDateBR(linkedVisit.scheduledDate)}${linkedVisit.scheduledTime ? ` ${formatHorario(linkedVisit.scheduledTime)}` : ""}`}
            </p>
            {client.razaoSocial && (
              <p
                className="text-[11px] text-gray-400 dark:text-dark-text-secondary truncate"
                title={`Razão social: ${client.razaoSocial}`}
              >
                {client.razaoSocial}
              </p>
            )}
            {canalUsado && (
              <p className="mt-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                {canalUsado === "whatsapp"
                  ? "Você abriu o WhatsApp deste cliente. Como foi?"
                  : "Você ligou para este cliente. Como foi?"}
              </p>
            )}
            {linkedVisit && onCancelarAgendamento && (
              <button
                type="button"
                onClick={() => onCancelarAgendamento(linkedVisit)}
                className="mt-1 text-[11px] font-semibold text-red-600 hover:underline"
              >
                Cancelar este agendamento
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Pessoa de contato (ERP Ciclone) */}
        {(contatoNome || telefonesContato.length > 0) && (
          <div className="px-6 pt-4">
            <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-bg-secondary border border-gray-100 dark:border-dark-border text-xs text-gray-600 dark:text-dark-text-secondary flex flex-wrap items-center gap-x-3 gap-y-1">
              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>
                Falar com{" "}
                <strong className="text-gray-900 dark:text-dark-text">
                  {contatoNome ?? "contato do cadastro"}
                </strong>
              </span>
              {telefonesContato.map((telefone) => (
                <a
                  key={telefone}
                  href={`tel:${telefone}`}
                  className="font-bold text-indigo-600 hover:text-indigo-700"
                >
                  {telefone}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Indicador de etapas */}
        {!skipStep2 && (
          <div className="px-6 pt-4 flex items-center gap-2">
            {stepLabels.map((label, idx) => {
              const numero = (idx + 1) as 1 | 2;
              return (
                <React.Fragment key={label}>
                  {idx > 0 && (
                    <span className="flex-1 h-px bg-gray-200 dark:bg-dark-border" />
                  )}
                  <span
                    className={`flex items-center gap-1 text-[11px] font-bold shrink-0 ${step === numero ? "text-indigo-600" : "text-gray-400"}`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${step === numero ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400"}`}
                    >
                      {numero}
                    </span>
                    {label}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        )}

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

          {step === 1 ? (
            <>
              <div className="flex gap-2">
                {(
                  [
                    ["contato", "Fiz o contato"],
                    ["sem_contato", "Não fiz contato"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setMode(key);
                      setError("");
                    }}
                    className={toggleClass(mode === key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

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
                      <option value="diz_que_pagou">
                        Cliente diz que já pagou
                      </option>
                      <option value="venda_cancelada">
                        Cliente informa venda cancelada
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

                  {status === "venda_cancelada" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400">
                        Qual venda foi cancelada?
                      </label>
                      {vendasEmAberto.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          Este cliente não tem venda em aberto.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {vendasEmAberto.map((v) => (
                            <label
                              key={v.chave}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border text-sm cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={vendasCanceladas.has(v.chave)}
                                onChange={() =>
                                  setVendasCanceladas((prev) => {
                                    const nova = new Set(prev);
                                    if (nova.has(v.chave)) nova.delete(v.chave);
                                    else nova.add(v.chave);
                                    return nova;
                                  })
                                }
                              />
                              <span className="flex-1">
                                {v.chave === 0 ? "Parcelas avulsas" : `Venda #${v.chave}`}
                                <span className="text-xs text-gray-400">
                                  {" "}
                                  · {v.qtd} parcela{v.qtd !== 1 ? "s" : ""} em aberto
                                </span>
                              </span>
                              <span className="font-semibold tabular-nums">
                                {formatCurrency(v.aberto)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                        Nas observações, conte o que o cliente disse (onde e
                        quando cancelou, com quem falou). O gestor confere antes
                        de cancelar.
                      </p>
                    </div>
                  )}

                  {status === "diz_que_pagou" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400">
                        O cliente enviou o comprovante?
                      </label>
                      <div className="flex gap-2">
                        {(
                          [
                            ["sim", "Sim — registrar o pagamento"],
                            ["nao", "Ainda não — vai enviar"],
                          ] as const
                        ).map(([valor, rotulo]) => (
                          <button
                            key={valor}
                            type="button"
                            onClick={() => {
                              setComprovante(valor);
                              setError("");
                            }}
                            className={toggleClass(comprovante === valor)}
                          >
                            {rotulo}
                          </button>
                        ))}
                      </div>
                      {comprovante === "nao" && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                          Na próxima etapa o retorno já vem sugerido para amanhã,
                          para cobrar o comprovante.
                        </p>
                      )}
                    </div>
                  )}

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

                  {skipStep2 && previewBox}
                </>
              ) : linkedVisit ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400">
                    Motivo da remarcação
                  </label>
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
                  <p className="text-xs text-gray-500 dark:text-dark-text-secondary pt-1">
                    Nenhuma tentativa de contato é registrada — use quando
                    não houve contato com o cliente. Na próxima etapa você
                    escolhe a nova data.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  Nenhuma tentativa de contato é registrada. Na próxima etapa
                  você agenda quando vai falar com o cliente.
                </p>
              )}
            </>
          ) : (
            <>
              {mode === "contato" && (
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={semProximo}
                    onChange={(e) => {
                      setSemProximo(e.target.checked);
                      setError("");
                    }}
                    className="rounded border-gray-300"
                  />
                  Não agendar próximo contato
                </label>
              )}

              {!(mode === "contato" && semProximo) && (
                <>
                  {remarcaSemContato ? (
                    <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                      Canal:{" "}
                      <span className="font-bold">
                        {CHANNEL_LABEL[linkedChannel]}
                      </span>
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400">
                        Canal
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
                              className={toggleClass(nextChannel === c)}
                            >
                              {CHANNEL_LABEL[c]}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400">
                        Data
                      </label>
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
                          disabled={!nextDate}
                          className={`${inputClass} pl-10 disabled:opacity-50`}
                        />
                      </div>
                    </div>
                  </div>

                  {criaAgendamentoNovo && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400">
                        Observação do agendamento (opcional)
                      </label>
                      <textarea
                        value={scheduleNotes}
                        onChange={(e) => setScheduleNotes(e.target.value)}
                        placeholder="Ex: Ligar depois das 18h, cliente só atende nesse horário..."
                        rows={2}
                        className={`${inputClass} py-3 resize-none`}
                      />
                    </div>
                  )}
                </>
              )}

              {previewBox}
            </>
          )}

          <div className="pt-2 flex gap-3">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : step === 1 && !skipStep2 ? (
                <>
                  Avançar
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {mode === "sem_contato"
                    ? linkedVisit
                      ? "Remarcar"
                      : "Agendar"
                    : "Salvar Registro"}
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
