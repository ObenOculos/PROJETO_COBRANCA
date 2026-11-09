import React, { useState, useEffect, useMemo, memo } from "react";
import {
  X,
  DollarSign,
  CheckCircle,
  Receipt,
  Calculator,
  TrendingDown,
  RefreshCw,
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
import { todayLocalStr } from "../../config/visitStatus";
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
  ({ clientGroup, clientSales, onClose, onSuccess }) => {
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
    const [saleDistribution, setSaleDistribution] = useState<
      SaleDistributionItem[]
    >([]);
    const [paymentMethod, setPaymentMethod] = useState("dinheiro");
    const [withDiscount, setWithDiscount] = useState(false);
    const [showRescheduleModal, setShowRescheduleModal] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleTime, setRescheduleTime] = useState("");
    const [rescheduleError, setRescheduleError] = useState("");
    const [observations, setObservations] = useState(""); // New state
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
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = "unset";
      };
    }, []);

    // Calcular totais com validações
    const totalValue =
      clientSales?.reduce((sum, sale) => {
        return sum + (sale.totalValue || 0);
      }, 0) || 0;

    const totalReceived =
      clientSales?.reduce((sum, sale) => {
        return sum + (sale.totalReceived || 0);
      }, 0) || 0;

    const totalPending =
      clientSales?.reduce((sum, sale) => {
        return sum + (sale.pendingValue || 0);
      }, 0) || 0;

    const amountToDistribute = parseFloat(distributionAmount) || 0;
    const discountAmount =
      withDiscount && amountToDistribute > 0
        ? totalPending - amountToDistribute
        : 0;
    const showDiscountBox = discountAmount >= 0 && withDiscount;

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

    // Calcular distribuição automática por venda
    const calculateSaleDistribution = React.useCallback(() => {
      const paymentAmount = parseFloat(distributionAmount) || 0;
      // Exige um pagamento positivo mesmo na quitação com desconto: não faz
      // sentido "quitar" sem receber nada (desconto de 100%).
      if (paymentAmount <= 0) {
        setSaleDistribution([]);
        return;
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
        setSaleDistribution(
          Array.from(porVenda.values())
            .filter((v) => v.aplicado > 0)
            .map(({ sale, aplicado }) => ({
              sale,
              currentReceived: sale.totalReceived || 0,
              appliedAmount: aplicado,
              appliedDiscount: 0,
              newAmount: (sale.totalReceived || 0) + aplicado,
              willBeComplete: saldoDaVenda(sale.saleNumber) - aplicado <= 0.01,
            })),
        );
        return;
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

      setSaleDistribution(newDistribution);
    }, [
      distributionAmount,
      clientSales,
      withDiscount,
      totalPending,
      acordoAtivo,
      principal,
      parcelasAbertas,
    ]);

    // Recalcular distribuição quando o valor mudar
    useEffect(() => {
      calculateSaleDistribution();
    }, [distributionAmount, calculateSaleDistribution]);

    // Função para notificar manager sobre pagamentos com desconto
    const notifyManagerAboutDiscount = (discountAmount: number) => {
      if (!user || user.type !== "collector" || discountAmount <= 0) {
        return;
      }

      const paymentAmount = parseFloat(distributionAmount) || 0;
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

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!observations.trim()) {
        alert("O campo de observações é obrigatório.");
        return;
      }

      if (!user) {
        alert("Usuário não identificado");
        return;
      }

      const inputAmount = parseFloat(distributionAmount) || 0;
      // Exige valor positivo mesmo na quitação com desconto (sem "desconto de 100%").
      if (inputAmount <= 0) {
        alert("O valor a distribuir deve ser maior que zero.");
        return;
      }

      // Sem desconto, não permite abater mais que o saldo devedor (o excedente
      // seria descartado silenciosamente na distribuição). Juros/multa não
      // abatem parcela, por isso ficam fora desta conta.
      if (!withDiscount && principal > totalPending + 0.01) {
        showErrorNotification(
          new Error(
            `O valor não pode ser maior que o saldo devedor (${formatCurrency(totalPending)}).`,
          ),
        );
        return;
      }

      const calculatedDiscount = withDiscount ? totalPending - inputAmount : 0;

      if (withDiscount && calculatedDiscount < 0) {
        showErrorNotification(
          new Error(
            "O valor do pagamento com desconto não pode ser maior que o saldo devedor.",
          ),
        );
        return;
      }

      if (temExcedente && !destinoExcedente) {
        showErrorNotification(
          new Error(
            `Informe se os ${formatCurrency(excedente)} acima do valor vencido são juros/multa ou adiantamento das próximas parcelas.`,
          ),
        );
        return;
      }

      // Ainda sobra valor VENCIDO: so o cobrador EXTERNO reagenda a visita
      // aqui. Cliente que ficou em dia -- so parcelas a vencer -- nao precisa.
      if (precisaAcompanhamento && ehExterno) {
        setRescheduleError("");
        setShowRescheduleModal(true);
        return;
      }

      await registrarPagamento(null);
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
      return `Pagamento de ${formatCurrency(amountToDistribute)} (${forma})${
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
        if (ehCarteira && isOnline) {
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
          const notas = `${detalhe}\nObs.: ${observations.trim()}`;
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

    const showErrorNotification = (error: any) => {
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
        <div class="font-semibold">Erro ao distribuir pagamento</div>
        <div class="text-sm">${errorMessage}</div>
      </div>
    `;
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 8000);
    };

    const handleConfirmReschedule = async () => {
      if (!rescheduleDate) {
        setRescheduleError("Informe a data.");
        return;
      }
      if (!rescheduleTime) {
        setRescheduleError("Informe a data e o horário da visita.");
        return;
      }
      if (rescheduleDate < hoje) {
        setRescheduleError("A data não pode estar no passado.");
        return;
      }
      if (
        rescheduleDate === hoje &&
        rescheduleTime &&
        rescheduleTime <= horaLocalAgora()
      ) {
        setRescheduleError("Esse horário de hoje já passou.");
        return;
      }
      setRescheduleError("");
      await registrarPagamento({
        data: rescheduleDate,
        horario: rescheduleTime,
      });
    };

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110]"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center flex-1 min-w-0">
              <Calculator className="h-5 w-5 sm:h-6 sm:w-6 text-white mr-2 sm:mr-3 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-white truncate">
                  Distribuir Pagamento
                </h2>
                <p className="text-sm text-purple-100 truncate">
                  {clientGroup.client || "Cliente"} -{" "}
                  {clientGroup.document || "Sem documento"}
                </p>
                {!isOnline && (
                  <div className="flex items-center mt-2">
                    <div className="w-2 h-2 bg-yellow-300 rounded-full mr-2 animate-pulse"></div>
                    <span className="text-xs text-yellow-200">
                      Modo offline - Pagamentos serão adicionados à fila
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              id="close-button"
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-2xl transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(95vh-180px)] sm:max-h-[calc(90vh-180px)]">
            <form onSubmit={handleSubmit} className="p-4 sm:p-6">
              {acordoAtivo && (
                <div className="mb-6 p-4 border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 rounded-2xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Este cliente tem um <strong>acordo ativo</strong>. Os
                    títulos vinculados a ele não podem ser pagos por aqui — o
                    sistema vai recusar e manter o valor neles; só títulos
                    fora do acordo (se houver) serão aplicados. Para pagar o
                    acordo, use a tela dele.
                  </p>
                </div>
              )}
              {/* Resumo do Cliente */}
              <div className="bg-gradient-to-r from-purple-50 dark:from-purple-900/20 to-indigo-50 dark:to-indigo-900/20 rounded-2xl p-4 sm:p-6 mb-6 border border-purple-200 dark:border-purple-800">
                <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center">
                  <Receipt className="h-5 w-5 text-purple-600 dark:text-purple-400 mr-2" />
                  Resumo Financeiro
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-4">
                  <div className="text-center p-3 sm:p-4 bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm">
                    <div className="text-base sm:text-xl font-bold text-gray-900 dark:text-dark-text">
                      {formatCurrency(totalValue)}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-text-secondary">
                      Valor Total
                    </div>
                  </div>

                  <div className="text-center p-3 sm:p-4 bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm">
                    <div className="text-base sm:text-xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(totalReceived)}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-text-secondary">
                      Já Recebido
                    </div>
                  </div>

                  {showDiscountBox ? (
                    <div className="text-center p-3 sm:p-4 bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm">
                      <div className="text-base sm:text-xl font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(discountAmount)}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-text-secondary">
                        Desconto Aplicado
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-3 sm:p-4 bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm">
                      <div className="text-base sm:text-xl font-bold text-red-600 dark:text-red-400">
                        {formatCurrency(totalPending)}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-text-secondary">
                        Saldo Devedor
                      </div>
                    </div>
                  )}

                  <div className="text-center p-3 sm:p-4 bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm">
                    <div className="text-base sm:text-xl font-bold text-purple-600 dark:text-purple-400">
                      {clientSales?.length || 0}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-text-secondary">
                      Total Vendas
                    </div>
                  </div>
                </div>
              </div>

              {/* Campo de Valor para Distribuição */}
              <div className="mb-6">
                <label
                  htmlFor="distribution-amount"
                  className="block text-base font-semibold text-gray-900 dark:text-dark-text mb-3"
                >
                  Valor a Distribuir
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 h-6 w-6 text-gray-400" />
                  <input
                    id="distribution-amount"
                    name="distributionAmount"
                    type="number"
                    step="0.01"
                    value={distributionAmount}
                    onChange={(e) => setDistributionAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 border-2 border-gray-300 dark:border-dark-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base sm:text-2xl font-bold dark:bg-dark-bg dark:text-dark-text"
                    placeholder="0,00"
                    required
                  />
                </div>

                {/* Atalhos de valor e ações */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      id="total-balance-button"
                      type="button"
                      onClick={() =>
                        setDistributionAmount(totalPending.toFixed(2))
                      }
                      className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors font-medium w-full sm:w-auto"
                    >
                      Saldo Total ({formatCurrency(totalPending)})
                    </button>
                    <button
                      id="R$-100-button"
                      type="button"
                      onClick={() => setDistributionAmount("100")}
                      className="px-4 py-2 text-xs bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-secondary rounded-full hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary transition-colors"
                    >
                      R$ 100
                    </button>
                    <button
                      id="R$-500-button"
                      type="button"
                      onClick={() => setDistributionAmount("500")}
                      className="px-4 py-2 text-xs bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-secondary rounded-full hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary transition-colors"
                    >
                      R$ 500
                    </button>
                    <button
                      id="R$-1000-button"
                      type="button"
                      onClick={() => setDistributionAmount("1000")}
                      className="px-4 py-2 text-xs bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-secondary rounded-full hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary transition-colors"
                    >
                      R$ 1.000
                    </button>
                  </div>
                </div>

                {/* Opção de Desconto */}
                <div className="mt-4">
                  <label
                    className={`flex sm:inline-flex justify-center sm:justify-start items-center gap-2 px-4 py-2.5 rounded-full cursor-pointer transition-all ${
                      withDiscount
                        ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                        : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary hover:bg-gray-150"
                    }`}
                  >
                    <input
                      type="checkbox"
                      id="with-discount"
                      name="withDiscount"
                      className="sr-only"
                      checked={withDiscount}
                      onChange={(e) => setWithDiscount(e.target.checked)}
                    />
                    <TrendingDown className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Quitar com desconto
                    </span>
                  </label>
                </div>

                {/* Valor acima do vencido: juros/multa ou adiantamento */}
                {!withDiscount && !acordoAtivo && vencidoTotal > 0.01 && (
                  <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-secondary">
                    Vencido hoje:{" "}
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(vencidoTotal)}
                    </span>
                  </p>
                )}
                {temExcedente && (
                  <div className="mt-3 p-4 border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 rounded-2xl">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                      O valor passa {formatCurrency(excedente)} do vencido.
                      Esse excedente é:
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {(
                        [
                          [
                            "juros",
                            "Juros / multa",
                            "Fica registrado no pagamento e não abate nenhuma parcela.",
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
                          className={`flex-1 cursor-pointer rounded-2xl border-2 px-3 py-2 transition-colors ${
                            destinoExcedente === valor
                              ? "border-amber-500 dark:border-amber-500 bg-white dark:bg-dark-bg-secondary"
                              : "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 hover:bg-white dark:hover:bg-dark-bg-tertiary"
                          }`}
                        >
                          <input
                            type="radio"
                            name="destinoExcedente"
                            value={valor}
                            checked={destinoExcedente === valor}
                            onChange={() => setDestinoExcedente(valor)}
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
                  </div>
                )}
              </div>

              {/* Forma de Pagamento */}
              <div className="mb-6">
                <label
                  htmlFor="payment-method"
                  className="block text-base font-semibold text-gray-900 dark:text-dark-text mb-3"
                >
                  Forma de Pagamento
                </label>
                <select
                  id="payment-method"
                  name="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm dark:bg-dark-bg dark:text-dark-text"
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                </select>
              </div>

              {/* Campo de Observações (New) */}
              <div className="mb-6">
                <label
                  htmlFor="observations"
                  className="block text-base font-semibold text-gray-900 dark:text-dark-text mb-3"
                >
                  Observações
                </label>
                <textarea
                  id="observations"
                  name="observations"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-border rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm dark:bg-dark-bg dark:text-dark-text"
                  rows={3}
                  placeholder="Adicione observações sobre este pagamento..."
                  required
                />
              </div>

              {/* Preview da Distribuição */}
              {saleDistribution.length > 0 && (
                <div className="mb-6">
                  <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                    {saleDistribution.map((item) => (
                      <div
                        key={item.sale.saleNumber}
                        className={`bg-white dark:bg-dark-bg-secondary rounded-2xl border-2 p-4 transition-all duration-200 ${
                          item.appliedAmount > 0
                            ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 shadow-md"
                            : "border-gray-200 dark:border-dark-border hover:border-gray-300"
                        }`}
                      >
                        {/* Cabeçalho da Venda */}
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="text-base font-semibold text-gray-900 dark:text-dark-text">
                              {item.sale.saleNumber === 0
                                ? "Venda Renegociada"
                                : `Venda #${item.sale.saleNumber}`}
                            </h4>
                            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
                              {item.sale.installments?.length || 0} parcela
                              {(item.sale.installments?.length || 0) !== 1
                                ? "s"
                                : ""}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                              Valor Total
                            </div>
                            <div className="font-semibold text-gray-900 dark:text-dark-text text-base">
                              {formatCurrency(item.sale.totalValue || 0)}
                            </div>
                          </div>
                        </div>

                        {/* Informações de Pagamento */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-2xl p-3">
                            <div className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                              Recebido Atualmente
                            </div>
                            <div className="font-semibold text-gray-900 dark:text-dark-text text-base">
                              {formatCurrency(item.currentReceived)}
                            </div>
                          </div>

                          <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-3">
                            <div className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                              Novo Total Recebido
                            </div>
                            <div className="font-semibold text-green-600 dark:text-green-400 text-base">
                              {formatCurrency(item.newAmount)}
                            </div>
                          </div>

                          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-3">
                            <div className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                              Valor Aplicado
                            </div>
                            <div className="font-semibold text-purple-600 dark:text-purple-400 text-base">
                              +{formatCurrency(item.appliedAmount)}
                            </div>
                          </div>
                        </div>

                        {/* Status da Venda */}
                        <div className="mt-3 flex items-center justify-between">
                          {item.willBeComplete ? (
                            item.appliedDiscount > 0 ? (
                              <div className="flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium">
                                <TrendingDown className="h-4 w-4 mr-1" />
                                Quitado com Desconto:{" "}
                                {formatCurrency(item.appliedDiscount)}
                              </div>
                            ) : (
                              <div className="flex items-center text-green-600 dark:text-green-400 text-sm font-medium">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Venda Quitada
                              </div>
                            )
                          ) : (
                            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
                              Saldo devedor:{" "}
                              <span className="font-medium text-red-600 dark:text-red-400">
                                {formatCurrency(
                                  Math.max(
                                    0,
                                    (item.sale.totalValue || 0) -
                                      item.newAmount -
                                      (item.appliedDiscount || 0),
                                  ),
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botões de Ação -- sticky pra nunca ficar escondido rolando o
                  conteúdo (ex.: muitas vendas na distribuição, ou o aviso de
                  acordo ativo empurrando o resto pra baixo). */}
              <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-6 px-4 sm:px-6 py-4 sm:py-6 bg-white dark:bg-dark-bg-secondary border-t border-gray-200 dark:border-dark-border z-10">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end">
                  <button
                    id="confirm-button"
                    type="submit"
                    disabled={
                      loading ||
                      saleDistribution.length === 0 ||
                      amountToDistribute <= 0
                    }
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center shadow-lg text-base"
                  >
                    {loading ? (
                      <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    ) : (
                      <CheckCircle className="h-5 w-5 mr-2" />
                    )}
                    {loading ? "Processando..." : "Confirmar Distribuição"}
                  </button>

                  <button
                    id="cancel-button"
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto px-6 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors font-medium text-base"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
        {showRescheduleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[120]">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl max-w-md w-full mx-4">
              <div className="px-4 lg:px-6 py-4 border-b border-gray-200 dark:border-dark-border">
                <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text flex items-center">
                  <RefreshCw className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
                  Reagendar Visita
                </h3>
              </div>

              <div className="px-4 lg:px-6 py-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                  Depois deste pagamento ainda ficam{" "}
                  <strong className="text-red-600 dark:text-red-400">
                    {formatCurrency(vencidoRestante)}
                  </strong>{" "}
                  vencidos.{" "}
                  Agende a próxima visita.
                </p>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="reschedule-date"
                      className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2"
                    >
                      Nova Data *
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="reschedule-date"
                        name="reschedule-date"
                        type="date"
                        min={hoje}
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base dark:bg-dark-bg dark:text-dark-text"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reschedule-time"
                      className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2"
                    >
                      Novo Horário *
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="reschedule-time"
                        name="reschedule-time"
                        type="time"
                        value={rescheduleTime}
                        onChange={(e) => setRescheduleTime(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base dark:bg-dark-bg dark:text-dark-text"
                        required
                      />
                    </div>
                  </div>
                  {rescheduleError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{rescheduleError}</p>
                  )}
                </div>
              </div>

              <div className="px-4 lg:px-6 py-4 border-t border-gray-200 dark:border-dark-border flex flex-col sm:flex-row gap-3">
                <button
                  id="cancel-reschedule-button"
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-base"
                >
                  Voltar
                </button>
                <button
                  id="confirm-reschedule-button"
                  type="button"
                  onClick={handleConfirmReschedule}
                  disabled={
                    loading || !rescheduleDate || !rescheduleTime
                  }
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-base"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {loading
                    ? "Salvando..."
                    : "Confirmar pagamento e agendamento"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default GeneralPaymentModal;
