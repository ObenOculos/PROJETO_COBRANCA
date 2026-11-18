import React, { useEffect, useMemo, useRef, useState } from "react";
import { invalidarHistoricoCliente } from "../../utils/cacheHistoricoCliente";
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
  AlertTriangle,
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
import { CONTACT_NOTE_TEMPLATES } from "../../config/contactNoteTemplates";
import {
  LIMITE_TENTATIVAS_SEM_RETORNO,
  RESULTADOS_SEM_RETORNO,
  dataMaxRemarcacao,
  isentoDaReincidencia,
  precisaAutorizacaoRemarcacao,
} from "../../config/reincidencia";
import {
  contarTentativasSemRetorno,
  pedirAutorizacaoRemarcacao,
  reportarTentativasGestor,
  temCasoPendente,
} from "../../utils/casosGestor";
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

// Motivo do contato -> tipo/resultado de collection_attempts. Desde
// 2026-11-18 (3 opcoes) o Atender nao grava mais not_found, refusal nem
// message_sent -- continuam validos no banco e no historico antigo.
const STATUS_TO_ATTEMPT: Record<
  string,
  { type: CollectionAttempt["type"]; result: CollectionAttempt["result"] }
> = {
  promessa_pagamento: { type: "call", result: "promise" },
  contato_realizado: { type: "call", result: "contact_made" },
  nao_atende: { type: "call", result: "no_answer" },
  contestou_divida: { type: "call", result: "disputed" },
  diz_que_pagou: { type: "call", result: "claims_paid" },
  venda_cancelada: { type: "call", result: "sale_cancel_reported" },
};

type OpcaoContato = "sem_retorno" | "com_retorno" | "acao";
type AcaoContato = "diz_que_pagou" | "venda_cancelada" | "contestou_divida";

const OPCOES_CONTATO: {
  key: OpcaoContato;
  label: string;
  sub: string;
  ativo: string;
  dot: string;
}[] = [
  {
    key: "sem_retorno",
    label: "Sem retorno",
    sub: "Tentou e não falou com o cliente",
    ativo:
      "bg-amber-50 border-amber-500 dark:bg-amber-900/20 dark:border-amber-500",
    dot: "bg-amber-500",
  },
  {
    key: "com_retorno",
    label: "Com retorno",
    sub: "Falou com o cliente",
    ativo:
      "bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20 dark:border-emerald-500",
    dot: "bg-emerald-500",
  },
  {
    key: "acao",
    label: "Precisa de ação",
    sub: "Já pagou, venda cancelada ou contestou",
    ativo: "bg-rose-50 border-rose-500 dark:bg-rose-900/20 dark:border-rose-500",
    dot: "bg-rose-500",
  },
];

const ACOES_CONTATO: { key: AcaoContato; label: string }[] = [
  { key: "diz_que_pagou", label: "Diz que já pagou" },
  { key: "venda_cancelada", label: "Venda cancelada" },
  { key: "contestou_divida", label: "Contestou a dívida" },
];

/** Opcao escolhida -> chave do STATUS_TO_ATTEMPT. Sem escolha completa cai
 * em "contato_realizado" so como valor neutro: o Avancar fica bloqueado. */
const statusDaOpcao = (
  opcao: OpcaoContato | null,
  prometeu: boolean,
  acao: AcaoContato | null,
): string => {
  if (opcao === "sem_retorno") return "nao_atende";
  if (opcao === "com_retorno")
    return prometeu ? "promessa_pagamento" : "contato_realizado";
  if (opcao === "acao" && acao) return acao;
  return "contato_realizado";
};

/** Chave dos modelos de observacao (config/contactNoteTemplates). */
const chaveModelos = (opcao: OpcaoContato | null, status: string) =>
  opcao === "sem_retorno"
    ? "sem_retorno"
    : opcao === "com_retorno" && status === "contato_realizado"
      ? "com_retorno"
      : opcao
        ? status
        : "";

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
  // Tres opcoes (pedido do gestor, 2026-11-18): Sem retorno / Com retorno /
  // Precisa de acao -- o detalhe (telefone errado, caixa postal, mensagem
  // sem resposta...) vai na observacao. Cada combinacao cai num `status` do
  // STATUS_TO_ATTEMPT, entao as regras que dependem do resultado
  // (remarcacao, item 83, meta, credito do pago na loja, SPC) nao mudam.
  // Mensagem sem resposta agora e "Sem retorno" (no_answer): deixa de contar
  // como atendimento, decisao do gestor -- revisa em parte o item 81.
  const [opcao, setOpcao] = useState<OpcaoContato | null>(null);
  const [prometeu, setPrometeu] = useState(false);
  const [acao, setAcao] = useState<AcaoContato | null>(null);
  const status = statusDaOpcao(opcao, prometeu, acao);
  const modelosKey = chaveModelos(opcao, status);
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

  // Item 83: clientes reincidentes (config/reincidencia.ts; gestor isento).
  // Remarcacao = a data escolhida empurra o agendamento que ja existe.
  const isento = isentoDaReincidencia(user?.type);
  const ehRemarcacao =
    !!linkedVisit && (mode === "sem_contato" || reschedules);
  const remarcacoesFeitas = linkedVisit?.rescheduleCount ?? 0;
  const maxDataRemarcacao =
    !isento && ehRemarcacao && linkedVisit
      ? dataMaxRemarcacao(linkedVisit.scheduledDate)
      : undefined;
  const remarcacaoVaiAoGestor =
    !isento && ehRemarcacao && precisaAutorizacaoRemarcacao(remarcacoesFeitas);
  // Depois de salvar uma tentativa sem retorno: 5 ou mais -> aviso antes de
  // fechar, com a opcao de reportar ao gestor.
  const [alertaTentativas, setAlertaTentativas] = useState<{
    qtd: number;
    pendente: boolean;
  } | null>(null);
  const [obsGestor, setObsGestor] = useState("");
  const [reportando, setReportando] = useState(false);

  // Sugestao do proximo contato, enquanto o cobrador nao mexeu no campo:
  // nao atendeu/mensagem -> amanha; promessa -> dia seguinte ao prometido
  // (conferir se pagou); sem contato -> amanha se remarca, hoje se agenda.
  useEffect(() => {
    if (!nextDateTouched) {
      if (mode === "sem_contato") {
        setNextDate(linkedVisit ? addDaysLocalStr(today, 1) : today);
      } else if (
        // Sem retorno: tentar de novo amanha.
        status === "nao_atende" ||
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
      // Contato feito pelo WhatsApp: o proximo ja sugere WhatsApp (antes
      // dependia da opcao "Mensagem enviada", que saiu).
      setNextChannel(
        mode === "contato" && canalUsado === "whatsapp"
          ? "whatsapp"
          : linkedChannel,
      );
    }
  }, [
    mode,
    status,
    canalUsado,
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
      if (effectiveNext && reschedules && remarcacaoVaiAoGestor) {
        preview.push(
          `Este agendamento já foi remarcado ${remarcacoesFeitas} vezes: a nova data (${formatDateBR(effectiveNext)}) vai para autorização do gestor. O contato fica registrado e o agendamento de ${when} continua até ele decidir.`,
        );
      } else if (effectiveNext && reschedules) {
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
    if (linkedVisit && nextDate && remarcacaoVaiAoGestor) {
      preview.push(
        `Este agendamento já foi remarcado ${remarcacoesFeitas} vezes: a nova data (${formatDateBR(nextDate)}) vai para autorização do gestor. O agendamento de ${formatDateBR(linkedVisit.scheduledDate)} continua até ele decidir.`,
      );
    } else if (linkedVisit && nextDate) {
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

  // Recarregar a carteira inteira (milhares de parcelas) so quando o
  // registro mexeu nela: cliente saiu da carteira ou venda informada como
  // cancelada. Um contato comum so grava collection_attempts e agenda
  // (scheduled_visits) -- os contatos a fila rele sozinha (versaoRegistros
  // no onSuccess). Antes TODO registro baixava a carteira de novo, e era o
  // "travou depois de salvar" do cobrador.
  const reload = async (carteiraMudou: boolean) => {
    await Promise.all([
      carteiraMudou ? refreshCollections() : Promise.resolve(),
      fetchScheduledVisits(false),
    ]);
  };

  /** Validacao da etapa 1 (o que aconteceu). */
  const validateStep1 = (): string | null => {
    if (mode === "sem_contato") return null;
    if (!opcao) return "Escolha como foi o contato.";
    if (opcao === "acao" && !acao) return "Escolha qual ação.";
    if (status === "diz_que_pagou" && !comprovante)
      return "Informe se o cliente já enviou o comprovante.";
    if (status === "venda_cancelada" && vendasCanceladas.size === 0)
      return "Marque qual venda o cliente informou como cancelada.";
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
    if (maxDataRemarcacao && nextDate > maxDataRemarcacao) {
      setError(
        `A nova data pode ir até ${formatDateBR(maxDataRemarcacao)} (60 dias a partir do agendamento).`,
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (linkedVisit && remarcacaoVaiAoGestor) {
        const notas = buildRescheduleNotes(
          linkedVisit,
          nextDate,
          nextTime || undefined,
          remarcarReason,
        );
        await pedirAutorizacaoRemarcacao({
          visitId: linkedVisit.id,
          novaData: nextDate,
          novoHorario: nextTime || undefined,
          motivoChave: remarcarReason,
          notasOriginal: notas.original,
          notasNova: notas.nova,
        });
      } else if (linkedVisit) {
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
      invalidarHistoricoCliente(client.document);
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
    if (maxDataRemarcacao && effectiveNext && effectiveNext > maxDataRemarcacao) {
      setError(
        `A nova data pode ir até ${formatDateBR(maxDataRemarcacao)} (60 dias a partir do agendamento).`,
      );
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
        await reload(true);
        invalidarHistoricoCliente(client.document);
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

      await reload(!!releaseSituacao);
      invalidarHistoricoCliente(client.document);

      // Item 83, regra 3: tentativa sem retorno -> confere o acumulado e,
      // a partir de 5, avisa antes de fechar (a cada nova tentativa).
      // Falha aqui nunca desfaz nem trava o registro ja salvo.
      if (!isento && !releaseSituacao && RESULTADOS_SEM_RETORNO.has(result)) {
        try {
          const qtd = await contarTentativasSemRetorno(client.document);
          if (qtd >= LIMITE_TENTATIVAS_SEM_RETORNO) {
            const pendente = await temCasoPendente(
              client.document,
              "tentativas_sem_retorno",
            );
            setAlertaTentativas({ qtd, pendente });
            return;
          }
        } catch (avisoErr) {
          console.error("Erro ao conferir tentativas sem retorno:", avisoErr);
        }
      }

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

  const fecharAviso = () => {
    setAlertaTentativas(null);
    onSuccess();
  };
  const reportarAoGestor = async () => {
    setReportando(true);
    setError("");
    try {
      await reportarTentativasGestor(client.document, obsGestor);
      fecharAviso();
    } catch (err) {
      setError("Não foi possível reportar: " + errorMessage(err));
    } finally {
      setReportando(false);
    }
  };

  if (alertaTentativas) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
        <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border max-h-[95vh] flex flex-col">
          <div className="px-6 py-4 border-b border-amber-100 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-gray-900 dark:text-dark-text">
                {alertaTentativas.qtd} tentativas sem retorno
              </h3>
              <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                {client.client}
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <p className="text-sm text-gray-700 dark:text-dark-text">
              O contato foi registrado. Este cliente já recebeu{" "}
              <strong>{alertaTentativas.qtd} tentativas de contato</strong>{" "}
              sem retorno e ainda tem pendência em aberto.
            </p>
            {alertaTentativas.pendente ? (
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                Este caso já foi reportado ao gestor e está aguardando a
                avaliação. Você pode continuar tentando enquanto isso.
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  Você pode continuar tentando ou reportar ao gestor, que
                  avalia se o cliente sai da carteira e vai para o SPC.
                </p>
                <textarea
                  value={obsGestor}
                  onChange={(e) => setObsGestor(e.target.value)}
                  placeholder="Observação para o gestor (opcional)"
                  rows={2}
                  className={`${inputClass} py-3 resize-none`}
                />
              </>
            )}
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={fecharAviso}
                disabled={reportando}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary disabled:opacity-50"
              >
                Continuar tentando
              </button>
              {!alertaTentativas.pendente && (
                <button
                  type="button"
                  onClick={reportarAoGestor}
                  disabled={reportando}
                  className="flex-1 px-4 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50"
                >
                  {reportando ? "Reportando..." : "Reportar ao gestor"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
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
                      Como foi o contato?
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {OPCOES_CONTATO.map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          aria-pressed={opcao === o.key}
                          onClick={() => {
                            setOpcao(o.key);
                            setError("");
                          }}
                          className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                            opcao === o.key
                              ? o.ativo
                              : "bg-gray-50 border-gray-200 hover:border-indigo-300 dark:bg-dark-bg-secondary dark:border-dark-border"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-dark-text">
                            <span className={`w-2 h-2 rounded-full ${o.dot}`} />
                            {o.label}
                          </span>
                          <span className="block text-[11px] leading-snug text-gray-500 dark:text-dark-text-secondary">
                            {o.sub}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {opcao === "com_retorno" && (
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-dark-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prometeu}
                        onChange={(e) => setPrometeu(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      Prometeu pagar
                    </label>
                  )}

                  {opcao === "acao" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400">
                        Qual ação?
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ACOES_CONTATO.map((a) => (
                          <button
                            key={a.key}
                            type="button"
                            aria-pressed={acao === a.key}
                            onClick={() => {
                              setAcao(a.key);
                              setError("");
                            }}
                            className={toggleClass(acao === a.key)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                      {acao === "contestou_divida" && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                          O cliente sai da sua carteira e vai para Aguardando
                          Jurídico (SPC).
                        </p>
                      )}
                    </div>
                  )}

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
                    {(CONTACT_NOTE_TEMPLATES[modelosKey]?.length ?? 0) > 0 && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {CONTACT_NOTE_TEMPLATES[modelosKey].map((modelo) => (
                          <button
                            key={modelo}
                            type="button"
                            onClick={() => setNotes(modelo)}
                            title="Preenche a observação com este modelo — edite a parte entre [ ]"
                            className="px-2.5 py-1.5 rounded-lg border text-[11px] font-medium text-left leading-snug bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text-secondary dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                          >
                            {modelo}
                          </button>
                        ))}
                      </div>
                    )}
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
                          max={maxDataRemarcacao}
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

                  {maxDataRemarcacao && (
                    <p className="text-[11px] text-gray-500 dark:text-dark-text-secondary -mt-1">
                      Remarcação até {formatDateBR(maxDataRemarcacao)} (60
                      dias a partir do agendamento).
                    </p>
                  )}

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
              disabled={
                loading ||
                (step === 1 &&
                  mode !== "sem_contato" &&
                  (!opcao || (opcao === "acao" && !acao) || !notes.trim()))
              }
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
