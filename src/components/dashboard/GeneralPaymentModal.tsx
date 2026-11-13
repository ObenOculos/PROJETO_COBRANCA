import React, { useState, useEffect, useMemo, memo } from "react";
import {
  X,
  Check,
  CheckCircle,
  ChevronRight,
  TrendingDown,
  Calendar,
  Clock,
  Info,
} from "lucide-react";
import {
  ClientGroup,
  CollectionAttempt,
  SaleGroup,
  ScheduledVisit,
} from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { useOffline } from "../../hooks/useOffline";
import { useNotifications } from "../../contexts/NotificationContext";
import { calculateOverdueDays, formatCurrency } from "../../utils/formatters";
import { supabase } from "../../lib/supabase";
import { addDaysLocalStr, todayLocalStr } from "../../config/visitStatus";
import { isWalletCollectorType } from "../../config/profiles";
import { ATTEMPT_RESULT_LABELS } from "../../config/collectionAttempts";
import { isForaDaCobranca } from "../../types/status";
import {
  clientBalanceSplit,
  hasInstallmentBalance,
  round2,
} from "../../filters/clientStatus";

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
};

/**
 * Valor digitado -> numero. Aceita "1.234,56", "1234,56" e "1234.56";
 * "1.234" (so ponto de milhar) vale mil duzentos e trinta e quatro.
 */
const parseValor = (texto: string): number => {
  const t = (texto || "").trim();
  if (!t) return 0;
  const normal = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t;
  const n = parseFloat(normal);
  return Number.isFinite(n) ? round2(n) : 0;
};

/** Numero -> texto do campo ("1234,56"). */
const valorParaCampo = (n: number): string => n.toFixed(2).replace(".", ",");

/** Hora local "HH:MM" -- para barrar reagendamento hoje em horario que ja passou. */
const horaLocalAgora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

interface GeneralPaymentModalProps {
  clientGroup: ClientGroup;
  clientSales: SaleGroup[];
  onClose: () => void;
  onSuccess: () => void;
  /** O atendimento ja foi registrado pelo Atender ("Cliente diz que ja
   * pagou" com comprovante): nao grava um segundo contato. */
  contatoJaRegistrado?: boolean;
}

interface SaleDistributionItem {
  sale: SaleGroup;
  currentReceived: number;
  newAmount: number;
  appliedAmount: number;
  appliedDiscount: number;
  willBeComplete: boolean;
}

const GeneralPaymentModal: React.FC<GeneralPaymentModalProps> = memo(
  ({ clientGroup, clientSales, onClose, onSuccess, contatoJaRegistrado }) => {
    const {
      scheduleVisit,
      processSalePayment,
      getAcordoAtivoDoCliente,
      acordoAtivoOverdueMap,
      scheduledVisits,
      fetchScheduledVisits,
    } = useCollection();
    const acordoAtivo = clientGroup.document
      ? getAcordoAtivoDoCliente(clientGroup.document)
      : undefined;
    const { user } = useAuth();
    const { isOnline } = useOffline();
    const { addNotification } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [distributionAmount, setDistributionAmount] = useState<string>("");
    const [paymentMethod, setPaymentMethod] = useState("dinheiro");
    const [withDiscount, setWithDiscount] = useState(false);
    // Proxima visita do cobrador externo quando sobra vencido (etapa 3).
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleTime, setRescheduleTime] = useState("");
    const [observations, setObservations] = useState("");
    const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
    const [erroEtapa, setErroEtapa] = useState<string | null>(null);
    // Excedente acima do vencido: juros/multa (nao abate parcela) ou
    // adiantamento das proximas parcelas. Sem escolha = nao deixa confirmar.
    const [destinoExcedente, setDestinoExcedente] = useState<
      "juros" | "adiantamento" | null
    >(null);

    // Perfil de quem registra: cobrador de carteira so registra a interacao
    // (agenda o proximo contato pelo "Atender", nao aqui -- decisao do
    // usuario em 2026-11-09); externo reagenda a VISITA quando sobra vencido;
    // gestor so registra o pagamento.
    const ehCarteira = isWalletCollectorType(user?.type);
    const ehExterno = user?.type === "collector";
    const hoje = todayLocalStr();
    // Dia em que o cliente pagou. O cobrador interno (e o gestor) muitas vezes
    // da a baixa depois -- o Pix caiu ontem, a baixa e lancada hoje. O
    // externo registra na hora, em campo: fica sempre hoje. O banco
    // (process_payment) recusa data futura ou anterior a 30 dias.
    const podeEscolherData = !ehExterno;
    const DIAS_RETROATIVOS = 30;
    const dataMinima = addDaysLocalStr(hoje, -DIAS_RETROATIVOS);
    const [dataPagamento, setDataPagamento] = useState(hoje);
    const dataPagamentoValida =
      !podeEscolherData ||
      (dataPagamento !== "" && dataPagamento >= dataMinima && dataPagamento <= hoje);

    // Contato agendado ATIVO deste cliente, do proprio cobrador de carteira:
    // o pagamento conclui ele (mesma regra do "Atender" -- RPC
    // registrar_contato).
    const contatoAgendado = useMemo(
      () =>
        ehCarteira && user
          ? scheduledVisits.find(
              (v) =>
                v.clientDocument === clientGroup.document &&
                v.status === "agendada" &&
                v.collectorId === user.id &&
                v.channel !== "presencial",
            )
          : undefined,
      [ehCarteira, user, scheduledVisits, clientGroup.document],
    );

    // Parcelas em aberto na MESMA ordem em que o process_payment aplica
    // (vencimento mais antigo primeiro): o vencido e pago antes do a vencer,
    // mesmo quando esta em vendas diferentes. Com acordo ativo, os titulos
    // do acordo nao sao pagaveis aqui e nao temos a lista deles nesta tela --
    // ai a distribuicao segue a regra antiga (por venda) e o excedente nao e
    // tratado como juros.
    const parcelasAbertas = useMemo(() => {
      const lista: {
        sale: SaleGroup;
        idParcela: number;
        vencimento: string;
        saldo: number;
        vencida: boolean;
        numero: number | null;
      }[] = [];
      (clientSales || []).forEach((sale) =>
        sale.installments?.forEach((inst) => {
          if (isForaDaCobranca(inst.status) || !hasInstallmentBalance(inst)) {
            return;
          }
          lista.push({
            sale,
            idParcela: inst.id_parcela,
            vencimento: inst.data_vencimento ?? "",
            saldo: round2(
              (inst.valor_original || 0) -
                (inst.valor_recebido || 0) -
                (inst.desconto || 0),
            ),
            vencida: calculateOverdueDays(inst.data_vencimento) > 0,
            numero: inst.parcela ?? null,
          });
        }),
      );
      return lista.sort(
        (a, b) =>
          a.vencimento.localeCompare(b.vencimento) || a.idParcela - b.idParcela,
      );
    }, [clientSales]);

    // Vencido do cliente (mesma regra da carteira: clientBalanceSplit, que
    // com acordo ativo segue o cronograma do acordo).
    const vencidoTotal = useMemo(
      () =>
        clientBalanceSplit(
          { document: clientGroup.document, sales: clientSales },
          acordoAtivoOverdueMap,
        ).vencido,
      [clientGroup.document, clientSales, acordoAtivoOverdueMap],
    );

    // Desabilitar scroll do body quando o modal estiver aberto
    useEffect(() => {
      // Restaura o valor anterior: aberto por cima da Ficha, "unset" soltava
      // a rolagem da pagina com a Ficha ainda aberta.
      const anterior = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = anterior;
      };
    }, []);

    const totalPending =
      clientSales?.reduce((sum, sale) => {
        return sum + (sale.pendingValue || 0);
      }, 0) || 0;

    const amountToDistribute = parseValor(distributionAmount);

    // Excedente sobre o vencido -- pergunta se e juros/multa ou adiantamento.
    // So sem desconto e sem acordo ativo (ver parcelasAbertas).
    const excedente =
      !withDiscount && !acordoAtivo && vencidoTotal > 0.01
        ? round2(Math.max(0, amountToDistribute - vencidoTotal))
        : 0;
    const temExcedente = excedente > 0.01;
    const jurosValor = temExcedente && destinoExcedente === "juros" ? excedente : 0;
    // Principal = o que abate parcelas.
    const principal = round2(amountToDistribute - jurosValor);

    // Vencido que sobra depois deste pagamento: decide se pede reagendamento.
    const vencidoRestante = useMemo(() => {
      if (withDiscount) return 0; // quitacao total
      if (acordoAtivo) return vencidoTotal; // pagamento aqui nao abate o acordo
      let resto = principal;
      let sobra = 0;
      parcelasAbertas.forEach((p) => {
        const aplicado = Math.min(Math.max(resto, 0), p.saldo);
        resto -= aplicado;
        if (p.vencida) sobra += p.saldo - aplicado;
      });
      return round2(sobra);
    }, [withDiscount, acordoAtivo, vencidoTotal, principal, parcelasAbertas]);
    const precisaAcompanhamento = vencidoRestante > 0.01;

    // Conferencia (etapa 3): quanto cada parcela recebe, na mesma ordem do
    // process_payment. So sem desconto e sem acordo -- nos outros casos a
    // distribuicao e por venda (saleDistribution).
    const abatimentoPorParcela = useMemo(() => {
      if (withDiscount || acordoAtivo) return null;
      let resto = principal;
      const lista: ((typeof parcelasAbertas)[number] & {
        aplicado: number;
        quita: boolean;
      })[] = [];
      parcelasAbertas.forEach((p) => {
        if (resto <= 0.001) return;
        const aplicado = round2(Math.min(resto, p.saldo));
        resto = round2(resto - aplicado);
        lista.push({ ...p, aplicado, quita: aplicado >= p.saldo - 0.01 });
      });
      return lista;
    }, [withDiscount, acordoAtivo, principal, parcelasAbertas]);

    // Observacao so e obrigatoria quando ha algo a justificar: desconto ou
    // juros/multa. Pagamento comum dispensa (virava "pagou").
    const observacaoObrigatoria = withDiscount || jurosValor > 0;

    // Distribuicao por venda, calculada no render (useMemo): antes ficava num
    // estado atualizado por useEffect, e um Enter logo depois de digitar o
    // valor via a lista ainda vazia ("Não há parcela em aberto").
    const saleDistribution = useMemo((): SaleDistributionItem[] => {
      const paymentAmount = amountToDistribute;
      // Exige um pagamento positivo mesmo na quitação com desconto: não faz
      // sentido "quitar" sem receber nada (desconto de 100%).
      if (paymentAmount <= 0) {
        return [];
      }

      // Sem desconto e sem acordo: distribui parcela a parcela, vencimento
      // mais antigo primeiro (mesma ordem do process_payment), e soma por
      // venda. Antes ia pela venda de MENOR saldo, o que podia mandar o
      // dinheiro para parcela a vencer com outra venda em atraso.
      if (!withDiscount && !acordoAtivo) {
        const porVenda = new Map<number, { sale: SaleGroup; aplicado: number }>();
        let resto = principal;
        parcelasAbertas.forEach((p) => {
          if (resto <= 0.001) return;
          const aplicado = round2(Math.min(resto, p.saldo));
          resto = round2(resto - aplicado);
          const atual = porVenda.get(p.sale.saleNumber) ?? {
            sale: p.sale,
            aplicado: 0,
          };
          atual.aplicado = round2(atual.aplicado + aplicado);
          porVenda.set(p.sale.saleNumber, atual);
        });
        const saldoDaVenda = (saleNumber: number) =>
          round2(
            parcelasAbertas
              .filter((p) => p.sale.saleNumber === saleNumber)
              .reduce((s, p) => s + p.saldo, 0),
          );
        return Array.from(porVenda.values())
            .filter((v) => v.aplicado > 0)
            .map(({ sale, aplicado }) => ({
              sale,
              currentReceived: sale.totalReceived || 0,
              appliedAmount: aplicado,
              appliedDiscount: 0,
              newAmount: (sale.totalReceived || 0) + aplicado,
              willBeComplete: saldoDaVenda(sale.saleNumber) - aplicado <= 0.01,
            }));
      }

      let remainingPayment = paymentAmount;
      let remainingDiscount = withDiscount ? totalPending - paymentAmount : 0;
      if (remainingDiscount < 0) remainingDiscount = 0;

      const newDistribution: SaleDistributionItem[] = [];

      const sortedSales = [...(clientSales || [])].sort((a, b) => {
        return (a.pendingValue || 0) - (b.pendingValue || 0);
      });

      for (const sale of sortedSales) {
        let pendingValue = sale.pendingValue || 0;
        if (pendingValue <= 0) continue;

        const discountForThisSale = Math.min(remainingDiscount, pendingValue);
        pendingValue -= discountForThisSale;
        remainingDiscount -= discountForThisSale;

        const paymentForThisSale = Math.min(remainingPayment, pendingValue);
        pendingValue -= paymentForThisSale;
        remainingPayment -= paymentForThisSale;

        if (paymentForThisSale > 0 || discountForThisSale > 0) {
          newDistribution.push({
            sale,
            currentReceived: sale.totalReceived || 0,
            appliedAmount: paymentForThisSale,
            appliedDiscount: discountForThisSale,
            newAmount: (sale.totalReceived || 0) + paymentForThisSale,
            willBeComplete: pendingValue <= 0.01,
          });
        }
      }

      return newDistribution;
    }, [
      amountToDistribute,
      clientSales,
      withDiscount,
      totalPending,
      acordoAtivo,
      principal,
      parcelasAbertas,
    ]);


    // Função para notificar manager sobre pagamentos com desconto
    const notifyManagerAboutDiscount = (discountAmount: number) => {
      if (!user || user.type !== "collector" || discountAmount <= 0) {
        return;
      }

      const paymentAmount = amountToDistribute;
      const originalPendingAmount = totalPending;
      const discountPercentage =
        originalPendingAmount > 0
          ? ((discountAmount / originalPendingAmount) * 100).toFixed(1)
          : "0";

      const notificationData = {
        type: "payment" as const,
        title: "Pagamento com Desconto Aplicado",
        message: `${user.name || "Cobrador"} aplicou desconto de ${formatCurrency(discountAmount)} (${discountPercentage}%) no cliente ${clientGroup.client}. Valor pago: ${formatCurrency(paymentAmount)} | Valor original: ${formatCurrency(originalPendingAmount)}`,
        priority:
          discountAmount > 1000 ? ("high" as const) : ("medium" as const),
        relatedId: `discount-${clientGroup.document}-${Date.now()}`,
        targetUserType: "manager" as const, // Notificação direcionada para managers
      };

      try {
        addNotification(notificationData);
      } catch (error) {
        console.error("❌ Erro ao enviar notificação:", error);
      }
    };

    // ---------- Etapas: 1 Valor -> 2 Pagamento -> 3 Conferir ----------
    // Cada "Continuar" valida so a sua etapa; o erro aparece na propria tela
    // (sem alert -- dialog nativo trava a aba).

    /** Erro da etapa 1 (valor), ou null. */
    const erroDoValor = (): string | null => {
      // Exige valor positivo mesmo na quitação com desconto (sem "desconto de 100%").
      if (amountToDistribute <= 0) return "Informe o valor que o cliente pagou.";
      // Sem desconto, não permite abater mais que o saldo devedor (o excedente
      // seria descartado silenciosamente na distribuição). Juros/multa não
      // abatem parcela, por isso ficam fora desta conta.
      if (!withDiscount && principal > totalPending + 0.01) {
        return `O valor não pode ser maior que o saldo devedor (${formatCurrency(totalPending)}).`;
      }
      if (withDiscount && amountToDistribute > totalPending + 0.01) {
        return "Na quitação com desconto o valor pago não pode passar do saldo devedor.";
      }
      if (temExcedente && !destinoExcedente) {
        return `Diga se os ${formatCurrency(excedente)} acima do vencido são juros/multa ou adiantamento.`;
      }
      if (saleDistribution.length === 0) {
        return acordoAtivo
          ? "Não há títulos fora do acordo para abater. Registre o pagamento na tela do acordo."
          : "Não há parcela em aberto para abater.";
      }
      return null;
    };

    /** Erro da etapa 2 (forma, data, observação), ou null. */
    const erroDoPagamento = (): string | null => {
      if (!dataPagamentoValida) {
        return `Escolha uma data entre ${dataMinima.split("-").reverse().join("/")} e hoje.`;
      }
      if (observacaoObrigatoria && !observations.trim()) {
        return withDiscount
          ? "Explique o desconto na observação."
          : "Explique os juros/multa na observação.";
      }
      return null;
    };

    /** Erro do agendamento da proxima visita (externo com vencido), ou null. */
    const erroDoAgendamento = (): string | null => {
      if (!(precisaAcompanhamento && ehExterno)) return null;
      if (!rescheduleDate || !rescheduleTime) {
        return "Informe a data e o horário da próxima visita.";
      }
      if (rescheduleDate < hoje) return "A data da visita não pode estar no passado.";
      if (rescheduleDate === hoje && rescheduleTime <= horaLocalAgora()) {
        return "Esse horário de hoje já passou.";
      }
      return null;
    };

    const avancar = () => {
      const erro = etapa === 1 ? erroDoValor() : erroDoPagamento();
      setErroEtapa(erro);
      if (!erro) setEtapa((e) => (e === 1 ? 2 : 3));
    };

    const voltar = () => {
      setErroEtapa(null);
      setEtapa((e) => (e === 3 ? 2 : 1));
    };

    const confirmar = async () => {
      if (!user) {
        setErroEtapa("Usuário não identificado. Entre de novo no app.");
        return;
      }
      const erro = erroDoValor() ?? erroDoPagamento() ?? erroDoAgendamento();
      setErroEtapa(erro);
      if (erro) return;
      await registrarPagamento(
        precisaAcompanhamento && ehExterno
          ? { data: rescheduleDate, horario: rescheduleTime }
          : null,
      );
    };

    // Enter no formulario: avanca (ou confirma na ultima etapa).
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;
      if (etapa < 3) avancar();
      else void confirmar();
    };

    /**
     * Texto automatico da interacao gravada junto do pagamento (Historico de
     * Contatos): quanto, como, o que cada parcela recebeu e como o cliente
     * ficou. Ex.: "Pagamento de R$ 150,61 (PIX): parcela de 05/11 quitada;
     * R$ 3,11 de juros/multa. Cliente ficou sem valor vencido."
     */
    const resumoDoPagamento = (): string => {
      const dataBR = (iso: string) =>
        iso ? iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "?";
      const partes: string[] = [];
      if (withDiscount) {
        partes.push(
          `quitação com desconto de ${formatCurrency(Math.max(0, totalPending - amountToDistribute))}`,
        );
      } else if (!acordoAtivo) {
        // Mesma alocacao da distribuicao (vencimento mais antigo primeiro).
        let resto = principal;
        parcelasAbertas.forEach((p) => {
          if (resto <= 0.001) return;
          const aplicado = round2(Math.min(resto, p.saldo));
          resto = round2(resto - aplicado);
          partes.push(
            aplicado >= p.saldo - 0.01
              ? `parcela de ${dataBR(p.vencimento)} quitada`
              : `${formatCurrency(aplicado)} abatidos da parcela de ${dataBR(p.vencimento)}`,
          );
        });
      }
      if (jurosValor > 0) {
        partes.push(`${formatCurrency(jurosValor)} de juros/multa`);
      }
      const forma = FORMA_PAGAMENTO_LABEL[paymentMethod] ?? paymentMethod;
      const situacao = precisaAcompanhamento
        ? `Ainda restam ${formatCurrency(vencidoRestante)} vencidos.`
        : "Cliente ficou sem valor vencido.";
      const quando =
        podeEscolherData && dataPagamento !== hoje
          ? ` pago em ${dataBR(dataPagamento)}`
          : "";
      return `Pagamento de ${formatCurrency(amountToDistribute)} (${forma})${quando}${
        partes.length ? `: ${partes.join("; ")}` : ""
      }. ${situacao}`;
    };

    /**
     * Grava o pagamento (uma chamada de process_payment por venda) e, para
     * cobrador, o acompanhamento:
     *  - carteira: interacao "Pagamento integral/parcial" + conclusao do
     *    contato agendado, numa transacao (RPC registrar_contato, a mesma do
     *    "Atender"); sem agendar proximo contato;
     *  - externo: nova visita presencial, se ainda sobra vencido.
     * O pagamento e o acompanhamento sao gravados em passos separados: se o
     * segundo falhar, o pagamento continua valendo e o aviso diz o que faltou.
     */
    const registrarPagamento = async (
      agendamento: {
        data: string;
        horario: string;
      } | null,
    ) => {
      if (!user) return;
      try {
        setLoading(true);

        // Juros/multa vao junto da primeira venda (um registro so).
        let jurosPendente = jurosValor;
        for (const item of saleDistribution) {
          if (item.appliedAmount > 0 || item.appliedDiscount > 0) {
            await processSalePayment(
              {
                saleNumber: item.sale.saleNumber,
                clientDocument: clientGroup.document || "",
                paymentAmount: item.appliedAmount,
                paymentMethod: paymentMethod,
                notes: observations.trim(),
                discountAmount: item.appliedDiscount,
                jurosAmount: jurosPendente,
                paymentDate: podeEscolherData ? dataPagamento : undefined,
              },
              user.id,
            );
            jurosPendente = 0;
          }
        }

        // Verificar se houve desconto aplicado e notificar manager
        const totalDiscountApplied = saleDistribution.reduce(
          (sum, item) => sum + item.appliedDiscount,
          0,
        );
        if (totalDiscountApplied > 0) {
          notifyManagerAboutDiscount(totalDiscountApplied);
        }
      } catch (error) {
        console.error("Erro ao aplicar distribuição:", error);
        showErrorNotification(error);
        setLoading(false);
        return;
      }

      let avisoAcompanhamento: string | null = null;
      try {
        if (contatoJaRegistrado && ehCarteira) {
          // Atendimento ja registrado pelo Atender; so o pagamento entra.
        } else if (ehCarteira && isOnline) {
          const resultado: CollectionAttempt["result"] = precisaAcompanhamento
            ? "partial_payment"
            : "full_payment";
          const rotulo = ATTEMPT_RESULT_LABELS[resultado];
          const titulos = Array.from(
            new Set(parcelasAbertas.map((p) => p.idParcela.toString())),
          );
          const detalhe = resumoDoPagamento();
          const tipo =
            contatoAgendado?.channel === "whatsapp" ? "whatsapp" : "call";
          const notas = observations.trim()
            ? `${detalhe}\nObs.: ${observations.trim()}`
            : detalhe;
          if (precisaAcompanhamento && contatoAgendado) {
            // Parcial com contato agendado: so registra a interacao e deixa o
            // agendamento como esta (o cobrador segue acompanhando por ele).
            // A RPC registrar_contato concluiria o agendamento.
            const { error } = await supabase.from("collection_attempts").insert(
              titulos.map((t) => ({
                collection_id: t,
                date: hoje,
                type: tipo,
                result: resultado,
                notes: notas,
                collector_id: user.id,
              })),
            );
            if (error) throw error;
          } else {
            // Ficou sem vencido (ou nao havia agendamento): interacao +
            // conclusao do contato agendado, numa transacao.
            const { error } = await supabase.rpc("registrar_contato", {
              p_documento: clientGroup.document,
              p_nome_cliente: clientGroup.client,
              p_titulos: titulos,
              p_data: hoje,
              p_tipo: tipo,
              p_resultado: resultado,
              p_notas: notas,
              p_visita_id: contatoAgendado?.id,
              p_rotulo_resultado: rotulo,
              p_reagendar: false,
            });
            if (error) throw error;
          }
        } else if (ehCarteira) {
          avisoAcompanhamento =
            "Pagamento na fila offline. Registre o contato pelo “Atender” quando voltar a conexão.";
        } else if (ehExterno && agendamento) {
          const visitData: Omit<ScheduledVisit, "id" | "createdAt"> = {
            collectorId: user.id,
            clientDocument: clientGroup.document,
            clientName: clientGroup.client,
            scheduledDate: agendamento.data,
            scheduledTime: agendamento.horario,
            status: "agendada",
            notes: `Visita reagendada após pagamento parcial — restam ${formatCurrency(vencidoRestante)} vencidos.`,
            clientAddress: clientGroup.address,
            clientNeighborhood: clientGroup.neighborhood,
            clientCity: clientGroup.city,
            totalPendingValue: round2(totalPending - principal),
            overdueCount: 0, // This might need adjustment based on real data
            channel: "presencial",
          };
          await scheduleVisit(visitData);
        }
        if (ehCarteira || ehExterno) await fetchScheduledVisits(false);
      } catch (error) {
        console.error("Erro ao registrar acompanhamento do pagamento:", error);
        const msg =
          error instanceof Error
            ? error.message
            : ((error as { message?: string })?.message ?? String(error));
        avisoAcompanhamento = `Pagamento registrado, mas ${ehCarteira ? "o contato não foi salvo" : "a visita não foi salva"}: ${msg}`;
      }

      setLoading(false);
      if (avisoAcompanhamento) {
        showErrorNotification(new Error(avisoAcompanhamento));
      } else {
        showSuccessNotification(
          agendamento
            ? "Pagamento registrado e visita reagendada!"
            : "Pagamento distribuído com sucesso!",
        );
      }
      onSuccess();
      onClose();
    };

    const showSuccessNotification = (message?: string) => {
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center";

      const successMessage =
        message ||
        (isOnline
          ? "Pagamento distribuído com sucesso!"
          : "Pagamento adicionado à fila offline!");

      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      ${successMessage}
    `;
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    };

    const showErrorNotification = (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center max-w-md";
      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
      </svg>
      <div>
        <div class="font-semibold">Erro ao registrar pagamento</div>
        <div class="text-sm"></div>
      </div>
    `;
      // Mensagem como texto (vem do servidor): nada de HTML injetado.
      const corpo = notification.querySelector("div > div.text-sm");
      if (corpo) corpo.textContent = errorMessage;
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 8000);
    };

    const ETAPAS = ["Valor", "Pagamento", "Conferir"] as const;
    const formaRotulo = FORMA_PAGAMENTO_LABEL[paymentMethod] ?? paymentMethod;
    const dataTexto = (iso: string) => iso.split("-").reverse().join("/");
    const desconto = withDiscount
      ? round2(Math.max(0, totalPending - amountToDistribute))
      : 0;

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-stretch sm:items-center justify-center sm:p-4 z-[110]"
        onClick={(e) => {
          if (e.target === e.currentTarget && !loading) onClose();
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-dark-bg-secondary sm:rounded-2xl max-w-xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Cabecalho */}
          <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-200 dark:border-dark-border shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-dark-text">
                  Receber pagamento
                </h2>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary truncate">
                  {clientGroup.client || "Cliente"}
                </p>
              </div>
              <button
                type="button"
                id="close-button"
                onClick={onClose}
                disabled={loading}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Etapas */}
            <ol className="mt-3 flex items-center gap-2 text-xs">
              {ETAPAS.map((rotulo, i) => {
                const n = (i + 1) as 1 | 2 | 3;
                const feita = n < etapa;
                const atual = n === etapa;
                return (
                  <React.Fragment key={rotulo}>
                    {i > 0 && (
                      <span
                        className={`h-px flex-1 ${feita || atual ? "bg-indigo-300" : "bg-gray-200"}`}
                      />
                    )}
                    <li
                      className={`flex items-center gap-1.5 ${
                        atual
                          ? "text-indigo-700 font-semibold"
                          : feita
                            ? "text-indigo-600"
                            : "text-gray-400"
                      }`}
                      aria-current={atual ? "step" : undefined}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                          atual
                            ? "bg-indigo-600 text-white"
                            : feita
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {feita ? <Check className="h-3 w-3" /> : n}
                      </span>
                      {rotulo}
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>

            {!isOnline && (
              <p className="mt-2 flex items-center gap-2 text-xs text-amber-700">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                Sem conexão: o pagamento vai para a fila e é enviado depois.
              </p>
            )}
          </div>

          {/* Conteudo da etapa (unica area com rolagem) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
            {etapa === 1 && (
              <>
                {acordoAtivo && (
                  <div className="p-3 border border-amber-200 bg-amber-50 rounded-xl flex items-start gap-2 text-sm text-amber-800">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>
                      Cliente com <strong>acordo ativo</strong>: aqui só entram
                      títulos fora do acordo. Parcela do acordo se paga na tela
                      do acordo.
                    </p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="distribution-amount"
                    className="block text-sm font-semibold text-gray-900 dark:text-dark-text mb-2"
                  >
                    Quanto o cliente pagou?
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400">
                      R$
                    </span>
                    <input
                      id="distribution-amount"
                      name="distributionAmount"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      autoFocus
                      value={distributionAmount}
                      onChange={(e) => {
                        setDistributionAmount(
                          e.target.value.replace(/[^\d.,]/g, ""),
                        );
                        setErroEtapa(null);
                      }}
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-2xl font-semibold tabular-nums dark:bg-dark-bg dark:text-dark-text"
                      placeholder="0,00"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!acordoAtivo &&
                      vencidoTotal > 0.01 &&
                      vencidoTotal < totalPending - 0.01 && (
                        <button
                          type="button"
                          onClick={() => {
                            setDistributionAmount(valorParaCampo(vencidoTotal));
                            setErroEtapa(null);
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          Todo o vencido · {formatCurrency(vencidoTotal)}
                        </button>
                      )}
                    <button
                      id="total-balance-button"
                      type="button"
                      onClick={() => {
                        setDistributionAmount(valorParaCampo(totalPending));
                        setErroEtapa(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                    >
                      Saldo total · {formatCurrency(totalPending)}
                    </button>
                  </div>
                </div>

                {/* Excedente sobre o vencido: juros/multa ou adiantamento */}
                {temExcedente && (
                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
                      Passou {formatCurrency(excedente)} do vencido. Esse valor
                      a mais é:
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(
                        [
                          [
                            "juros",
                            "Juros / multa",
                            "Fica registrado no pagamento e não abate parcela.",
                          ],
                          [
                            "adiantamento",
                            "Adiantamento",
                            "Abate as próximas parcelas a vencer.",
                          ],
                        ] as const
                      ).map(([valor, rotulo, ajuda]) => (
                        <label
                          key={valor}
                          className={`cursor-pointer rounded-xl border-2 px-3 py-2 transition-colors ${
                            destinoExcedente === valor
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="destinoExcedente"
                            value={valor}
                            checked={destinoExcedente === valor}
                            onChange={() => {
                              setDestinoExcedente(valor);
                              setErroEtapa(null);
                            }}
                            className="sr-only"
                          />
                          <span className="block text-sm font-semibold text-gray-900 dark:text-dark-text">
                            {rotulo}
                          </span>
                          <span className="block text-xs text-gray-600 dark:text-dark-text-secondary">
                            {ajuda}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {/* Quitacao com desconto */}
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    withDiscount
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    id="with-discount"
                    name="withDiscount"
                    checked={withDiscount}
                    onChange={(e) => {
                      setWithDiscount(e.target.checked);
                      setErroEtapa(null);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-dark-text">
                      <TrendingDown className="h-4 w-4 text-indigo-600" />
                      Quitar tudo com desconto
                    </span>
                    <span className="block text-xs text-gray-600 dark:text-dark-text-secondary">
                      {withDiscount && amountToDistribute > 0 && desconto > 0
                        ? `Desconto de ${formatCurrency(desconto)} (${((desconto / totalPending) * 100).toFixed(1)}% do saldo de ${formatCurrency(totalPending)}). O gestor é avisado.`
                        : `O que faltar para ${formatCurrency(totalPending)} vira desconto e todas as parcelas são quitadas.`}
                    </span>
                  </span>
                </label>
              </>
            )}

            {etapa === 2 && (
              <>
                <fieldset>
                  <legend className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
                    Como pagou?
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(FORMA_PAGAMENTO_LABEL).map(
                      ([valor, rotulo]) => (
                        <label
                          key={valor}
                          className={`cursor-pointer rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-center transition-colors ${
                            paymentMethod === valor
                              ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                              : "border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={valor}
                            checked={paymentMethod === valor}
                            onChange={() => setPaymentMethod(valor)}
                            className="sr-only"
                          />
                          {rotulo}
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>

                {/* Data: so quem pode lancar baixa depois (externo e hoje) */}
                {podeEscolherData && (
                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
                      Quando pagou?
                    </legend>
                    <div className="flex flex-wrap items-center gap-2">
                      {(
                        [
                          ["Hoje", hoje],
                          ["Ontem", addDaysLocalStr(hoje, -1)],
                        ] as const
                      ).map(([rotulo, valor]) => (
                        <button
                          key={rotulo}
                          type="button"
                          onClick={() => {
                            setDataPagamento(valor);
                            setErroEtapa(null);
                          }}
                          className={`px-3 py-2 rounded-xl border-2 text-sm font-medium ${
                            dataPagamento === valor
                              ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                              : "border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {rotulo}
                        </button>
                      ))}
                      <input
                        id="payment-date"
                        name="paymentDate"
                        type="date"
                        value={dataPagamento}
                        min={dataMinima}
                        max={hoje}
                        onChange={(e) => {
                          setDataPagamento(e.target.value);
                          setErroEtapa(null);
                        }}
                        className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-xl text-sm dark:bg-dark-bg dark:text-dark-text"
                        aria-label="Outra data"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Até {DIAS_RETROATIVOS} dias atrás.
                    </p>
                  </fieldset>
                )}

                <div>
                  <label
                    htmlFor="observations"
                    className="block text-sm font-semibold text-gray-900 dark:text-dark-text mb-2"
                  >
                    Observação{" "}
                    <span className="font-normal text-gray-500">
                      {observacaoObrigatoria
                        ? withDiscount
                          ? "(obrigatória: explique o desconto)"
                          : "(obrigatória: explique os juros/multa)"
                        : "(opcional)"}
                    </span>
                  </label>
                  <textarea
                    id="observations"
                    name="observations"
                    value={observations}
                    onChange={(e) => {
                      setObservations(e.target.value);
                      setErroEtapa(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-dark-bg dark:text-dark-text"
                    rows={3}
                    placeholder="Ex.: comprovante enviado pelo WhatsApp"
                  />
                </div>
              </>
            )}

            {etapa === 3 && (
              <>
                {/* Resumo do que vai ser gravado */}
                <div className="rounded-xl bg-gray-50 dark:bg-dark-bg-tertiary p-4">
                  <p className="text-2xl font-semibold text-gray-900 dark:text-dark-text tabular-nums">
                    {formatCurrency(amountToDistribute)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    {formaRotulo}
                    {podeEscolherData && ` · pago em ${dataTexto(dataPagamento)}`}
                  </p>
                  {(jurosValor > 0 || desconto > 0) && (
                    <p className="mt-1 text-sm text-gray-600">
                      {jurosValor > 0 &&
                        `${formatCurrency(jurosValor)} de juros/multa (não abate parcela)`}
                      {desconto > 0 && `Desconto de ${formatCurrency(desconto)}`}
                    </p>
                  )}
                  {observations.trim() && (
                    <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">
                      “{observations.trim()}”
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
                    Vai abater
                  </h3>
                  {abatimentoPorParcela ? (
                    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                      {abatimentoPorParcela.map((p) => (
                        <li
                          key={p.idParcela}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="text-gray-900">
                              {p.sale.saleNumber === 0
                                ? "Renegociada"
                                : `Venda #${p.sale.saleNumber}`}
                              {p.numero != null && ` · Parcela ${p.numero}`}
                            </span>
                            <span
                              className={`block text-xs ${p.vencida ? "text-red-600" : "text-gray-500"}`}
                            >
                              venc. {dataTexto(p.vencimento.slice(0, 10))}
                              {p.vencida && " (vencida)"}
                            </span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="block font-medium tabular-nums">
                              {formatCurrency(p.aplicado)}
                            </span>
                            <span
                              className={`block text-xs ${p.quita ? "text-emerald-600" : "text-gray-500"}`}
                            >
                              {p.quita
                                ? "quita"
                                : `falta ${formatCurrency(p.saldo - p.aplicado)}`}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                      {saleDistribution.map((item) => (
                        <li
                          key={item.sale.saleNumber}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="text-gray-900">
                            {item.sale.saleNumber === 0
                              ? "Venda renegociada"
                              : `Venda #${item.sale.saleNumber}`}
                          </span>
                          <span className="text-right">
                            <span className="block font-medium tabular-nums">
                              {formatCurrency(item.appliedAmount)}
                            </span>
                            <span
                              className={`block text-xs ${item.willBeComplete ? "text-emerald-600" : "text-gray-500"}`}
                            >
                              {item.appliedDiscount > 0
                                ? `+ desconto ${formatCurrency(item.appliedDiscount)} · `
                                : ""}
                              {item.willBeComplete ? "quita a venda" : "abate parte"}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p
                  className={`text-sm ${precisaAcompanhamento ? "text-red-700" : "text-emerald-700"}`}
                >
                  {precisaAcompanhamento
                    ? `Depois deste pagamento ainda ficam ${formatCurrency(vencidoRestante)} vencidos.`
                    : "Depois deste pagamento o cliente fica sem valor vencido."}
                </p>

                {ehCarteira && !contatoJaRegistrado && isOnline && (
                  <p className="text-xs text-gray-500">
                    Fica registrado no histórico como contato “
                    {ATTEMPT_RESULT_LABELS[
                      precisaAcompanhamento ? "partial_payment" : "full_payment"
                    ]}
                    ”.
                  </p>
                )}

                {/* Externo com vencido sobrando: proxima visita aqui mesmo */}
                {precisaAcompanhamento && ehExterno && (
                  <fieldset className="rounded-xl border border-gray-200 p-3">
                    <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-dark-text">
                      Próxima visita
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600">
                        <span className="flex items-center gap-1 mb-1">
                          <Calendar className="h-3.5 w-3.5" /> Data
                        </span>
                        <input
                          id="reschedule-date"
                          name="reschedule-date"
                          type="date"
                          min={hoje}
                          value={rescheduleDate}
                          onChange={(e) => {
                            setRescheduleDate(e.target.value);
                            setErroEtapa(null);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-xl text-sm dark:bg-dark-bg dark:text-dark-text"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        <span className="flex items-center gap-1 mb-1">
                          <Clock className="h-3.5 w-3.5" /> Horário
                        </span>
                        <input
                          id="reschedule-time"
                          name="reschedule-time"
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => {
                            setRescheduleTime(e.target.value);
                            setErroEtapa(null);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-xl text-sm dark:bg-dark-bg dark:text-dark-text"
                        />
                      </label>
                    </div>
                  </fieldset>
                )}
              </>
            )}

            {erroEtapa && (
              <p
                role="alert"
                className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700"
              >
                {erroEtapa}
              </p>
            )}
          </div>

          {/* Rodape fixo */}
          <div className="px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-dark-border flex gap-3 shrink-0 bg-white dark:bg-dark-bg-secondary">
            <button
              id="cancel-button"
              type="button"
              onClick={etapa === 1 ? onClose : voltar}
              disabled={loading}
              className="px-4 py-2.5 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary text-sm font-medium disabled:opacity-50"
            >
              {etapa === 1 ? "Cancelar" : "Voltar"}
            </button>
            <button
              id="confirm-button"
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                etapa === 3
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {loading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Gravando...
                </>
              ) : etapa === 3 ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {precisaAcompanhamento && ehExterno
                    ? "Confirmar pagamento e visita"
                    : `Confirmar ${formatCurrency(amountToDistribute)}`}
                </>
              ) : (
                <>
                  Continuar
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  },
);

export default GeneralPaymentModal;
