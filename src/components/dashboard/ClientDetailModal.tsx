import React, { useState, useEffect } from "react";
import AddressHistoryViewer from "./AddressHistoryViewer";
import {
  X,
  ChevronDown,
  ChevronRight,
  User,
  Edit,
  CreditCard,
  AlertTriangle,
  Phone,
  MessageCircle,
  PhoneCall,
  Handshake,
  MoreHorizontal,
} from "lucide-react";
import {
  ClientGroup,
  Collection,
  UserType,
  isCollectorType,
} from "../../types";
import {
  formatCurrency,
  calculateOverdueDays,
} from "../../utils/formatters";
import { isForaDaCobranca, seloForaDaCobranca } from "../../types/status";
import {
  clientBalanceSplit,
  clientMaxOverdueDays,
  hasInstallmentBalance,
  round2,
} from "../../filters/clientStatus";
import { parseAndNormalizeDate } from "../../filters/dates";
import { useCollection } from "../../contexts/CollectionContext";
import { useClientBirthDate } from "../../hooks/useClientBirthDate";
import { razaoSocialDistinta } from "../../utils/clienteNome";
import { useAuth } from "../../contexts/AuthContext";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";

import GeneralPaymentModal from "./GeneralPaymentModal";
import GeneralPaymentEditModal from "./GeneralPaymentEditModal";
import LogContactModal from "./LogContactModal";
import AcordoModal from "./AcordoModal";
import AcordoDetailModal from "./AcordoDetailModal";
import LinhaDoTempoCliente from "./LinhaDoTempoCliente";
import { USER_TYPE_LABELS, isWalletCollectorType } from "../../config/profiles";

interface ClientDetailModalProps {
  clientGroup: ClientGroup;
  userType: UserType;
  onClose: () => void;
  /** Abre ja na lista de vendas com esta venda expandida (ex.: "Ver
   * detalhes da venda" na Cobrancas). */
  vendaInicial?: number;
  /** Veio do Atender ("Cliente diz que ja pagou" com comprovante): abre
   * direto o registro do pagamento (do acordo, se houver). */
  abrirPagamento?: boolean;
}

// ============================================
// COMPONENTES AUXILIARES MINIMALISTAS
// ============================================

// Formatar data no padrão brasileiro
const formatDate = (dateString: string | null): string => {
  if (!dateString) return "-";

  try {
    // Trata apenas a parte de DATA (ignora hora/fuso). Isso evita o
    // deslocamento de -1 dia quando o valor vem como ISO com timezone
    // (ex.: "2023-08-26T00:00:00Z"), que ao virar horario local recuava o dia.
    let day: number, month: number, year: number;

    if (dateString.includes("-")) {
      // ISO: YYYY-MM-DD (com ou sem "T...")
      const [y, m, d] = dateString.split("T")[0].split("-");
      year = parseInt(y, 10);
      month = parseInt(m, 10);
      day = parseInt(d, 10);
    } else if (dateString.includes("/")) {
      // Brasileiro: DD/MM/YYYY
      const [d, m, y] = dateString.split("/");
      day = parseInt(d, 10);
      month = parseInt(m, 10);
      year = parseInt(y, 10);
    } else {
      return dateString;
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      console.warn("Data inválida:", dateString);
      return dateString;
    }

    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  } catch (error) {
    console.error("Erro ao formatar data:", dateString, error);
    return dateString; // Retorna a string original em caso de erro
  }
};

// Formatar dias de atraso de forma intuitiva
const formatDaysOverdue = (days: number | null): string => {
  if (!days || days <= 0) return "";

  // Os dias que sobram sao o resto DEPOIS de tirar anos e meses: `days % 30`
  // sozinho ignorava os anos (400 dias saia "1ano 1mês 10d" em vez de 5d).
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = (days % 365) % 30;

  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years}${years === 1 ? "ano" : "a"}`);
  }
  if (months > 0) {
    parts.push(`${months}${months === 1 ? "mês" : "m"}`);
  }
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays}d`);
  }

  return parts.join(" ");
};

// Badge de status minimalista (outline)
const StatusBadge: React.FC<{
  status: "pending" | "partially_paid" | "fully_paid";
}> = ({ status }) => {
  const styles = {
    fully_paid: "text-green-600 border-green-300 bg-green-50",
    partially_paid: "text-amber-600 border-amber-300 bg-amber-50",
    pending: "text-red-600 border-red-300 bg-red-50",
  };

  const labels = {
    fully_paid: "Pago",
    partially_paid: "Parcial",
    pending: "Pendente",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
};

// Situacao de uma parcela no detalhe. Decidida pelos VALORES (saldo), nao
// pelo texto de `status`: o Ciclone grava "recebido" (sem "pago") e ha
// "Pago"/"Pago Parcial" com saldo -- ver hasInstallmentBalance.
type SituacaoParcela = "fora" | "quitada" | "atrasada" | "a_vencer";

const situacaoParcela = (
  installment: Pick<
    Collection,
    "status" | "valor_original" | "valor_recebido" | "desconto"
  >,
  diasAtraso: number,
): SituacaoParcela => {
  if (isForaDaCobranca(installment.status)) return "fora";
  if (!hasInstallmentBalance(installment)) return "quitada";
  return diasAtraso > 0 ? "atrasada" : "a_vencer";
};

const DOT_SITUACAO: Record<SituacaoParcela, string> = {
  fora: "bg-gray-300",
  quitada: "bg-green-500",
  atrasada: "bg-red-500",
  a_vencer: "bg-gray-400",
};

// Indicador de status para parcelas (dot)
const InstallmentStatusDot: React.FC<{ situacao: SituacaoParcela }> = ({
  situacao,
}) => (
  <div
    className={`w-2 h-2 rounded-full ${DOT_SITUACAO[situacao]} flex-shrink-0`}
  />
);

type AbaVendas = "todos" | "aberto" | "pagos";

const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  clientGroup,
  userType,
  onClose,
  vendaInicial,
  abrirPagamento,
}) => {
  const {
    getSalesByClient,
    calculateSaleBalance,
    refreshCollections,
    scheduledVisits,
    users,
    getAcordoAtivoDoCliente,
    clientesRegistry,
    acordoAtivoOverdueMap,
  } = useCollection();
  const { user } = useAuth();

  // Espelho do ERP Ciclone (somente leitura). Lido direto do cadastro porque o
  // ClientGroup chega de varias telas e nem todas montam esses campos.
  const cadastroErp = clientesRegistry.get(clientGroup.document);
  const razaoSocial = razaoSocialDistinta(
    cadastroErp?.razao_social,
    clientGroup.client,
  );
  const telefonesContato = [
    cadastroErp?.contato_telefone,
    cadastroErp?.contato_telefone2,
  ].filter((t): t is string => Boolean(t?.trim()));
  const codigoErp = cadastroErp?.codigo_cliente_erp?.trim() || undefined;
  const temDadosErp = Boolean(
    codigoErp ||
      cadastroErp?.vendedor_responsavel ||
      cadastroErp?.regiao ||
      cadastroErp?.observacao_erp,
  );

  const [isGeneralPaymentModalOpen, setIsGeneralPaymentModalOpen] =
    useState(false);
  const [showAcordoAtivoConfirm, setShowAcordoAtivoConfirm] = useState(false);
  const [isGeneralEditModalOpen, setIsGeneralEditModalOpen] = useState(false);
  const [view, setView] = useState<"vendas" | "dados" | "historico">("vendas");
  const [expandedSales, setExpandedSales] = useState<Set<number>>(
    () => new Set(vendaInicial != null ? [vendaInicial] : []),
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [isRequestingAuth, setIsRequestingAuth] = useState(false);
  const [authRequestSent, setAuthRequestSent] = useState(false);
  const [showApprovalNotification, setShowApprovalNotification] =
    useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvedToken, setApprovedToken] = useState("");
  const [processedApprovalToken, setProcessedApprovalToken] = useState("");
  const birthDate = useClientBirthDate(clientGroup.document);

  // Monitorar aprovações e rejeições de token
  React.useEffect(() => {
    const handleTokenApproved = (event: CustomEvent) => {
      const approvedRequest = event.detail;
      if (
        approvedRequest.clientDocument === clientGroup.document &&
        authRequestSent
      ) {
        setApprovedToken(approvedRequest.token);
        setProcessedApprovalToken(approvedRequest.token);
        setShowApprovalNotification(true);
        setAuthToken(approvedRequest.token);

        // Notificação do navegador
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Token Aprovado!", {
            body: `Seu token ${approvedRequest.token} foi aprovado pelo gerente.`,
            icon: "/icon_aplicativo.png",
          });
        }

        // Auto-hide notification after 10 seconds
        setTimeout(() => {
          setShowApprovalNotification(false);
        }, 10000);
      }
    };

    const handleTokenRejected = (event: CustomEvent) => {
      const rejectedRequest = event.detail;
      if (
        rejectedRequest.clientDocument === clientGroup.document &&
        authRequestSent
      ) {
        setShowRejectionModal(true);
        setShowAuthModal(false); // Esconder modal de solicitação

        // Notificação do navegador
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Token Rejeitado", {
            body: `Seu token ${rejectedRequest.token} foi rejeitado pelo gerente.`,
            icon: "/icon_aplicativo.png",
          });
        }
      }
    };

    const checkTokenStatus = async () => {
      if (authRequestSent && user) {
        try {
          // Buscar solicitações do usuário atual para este cliente
          const { data } =
            await AuthorizationHistoryService.getAuthorizationHistory({
              searchTerm: clientGroup.document,
              status: "all",
            });

          const userRequests = data.filter(
            (req: any) =>
              req.collector_id === user.id &&
              req.client_document === clientGroup.document,
          );

          // Verificar aprovações
          const approvedRequest = userRequests.find(
            (req: any) =>
              req.status === "approved" &&
              new Date(req.expires_at) > new Date(),
          );

          if (
            approvedRequest &&
            processedApprovalToken !== approvedRequest.token
          ) {
            setApprovedToken(approvedRequest.token);
            setProcessedApprovalToken(approvedRequest.token);
            setShowApprovalNotification(true);
            setAuthToken(approvedRequest.token);

            // Notificação do navegador
            if (
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification("Token Aprovado!", {
                body: `Seu token ${approvedRequest.token} foi aprovado pelo gerente.`,
                icon: "/icon_aplicativo.png",
              });
            }

            // Auto-hide notification after 10 seconds
            setTimeout(() => {
              setShowApprovalNotification(false);
            }, 10000);
          }

          // Verificar rejeições
          const rejectedRequest = userRequests.find(
            (req: any) =>
              req.status === "rejected" &&
              new Date(req.processed_at) > new Date(Date.now() - 30000), // Rejeitado nos últimos 30 segundos
          );

          if (rejectedRequest && !showRejectionModal) {
            setShowRejectionModal(true);
            setShowAuthModal(false); // Esconder modal de solicitação

            // Notificação do navegador
            if (
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification("Token Rejeitado", {
                body: `Seu token ${rejectedRequest.token} foi rejeitado pelo gerente.`,
                icon: "/icon_aplicativo.png",
              });
            }
          }
        } catch (error) {
          console.error("Erro ao verificar status de token:", error);
        }
      }
    };

    // Listeners para aprovação e rejeição imediatas
    window.addEventListener(
      "tokenApproved",
      handleTokenApproved as EventListener,
    );
    window.addEventListener(
      "tokenRejected",
      handleTokenRejected as EventListener,
    );

    // Fallback: verificar periodicamente -- so enquanto ha pedido de token
    // pendente (sem pedido, o timer rodava a toa com o modal aberto).
    const interval = authRequestSent
      ? setInterval(checkTokenStatus, 3000)
      : undefined;

    return () => {
      window.removeEventListener(
        "tokenApproved",
        handleTokenApproved as EventListener,
      );
      window.removeEventListener(
        "tokenRejected",
        handleTokenRejected as EventListener,
      );
      if (interval) clearInterval(interval);
    };
  }, [
    authRequestSent,
    clientGroup.document,
    showApprovalNotification,
    showRejectionModal,
    user,
    processedApprovalToken,
  ]);

  // Solicitar permissão para notificações
  React.useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Desabilitar scroll do body quando o modal estiver aberto
  React.useEffect(() => {
    const originalBodyOverflow = window.getComputedStyle(
      document.body,
    ).overflow;
    const originalDocElementOverflow = window.getComputedStyle(
      document.documentElement,
    ).overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocElementOverflow;
    };
  }, []);

  // Obter vendas do cliente usando a nova estrutura
  const clientSales = React.useMemo(() => {
    return getSalesByClient(clientGroup.document);
  }, [getSalesByClient, clientGroup.document, refreshKey]);

  // Atraso do cliente: MESMA regra da carteira (clientMaxOverdueDays) -- com
  // acordo ativo segue o cronograma do acordo, nao o vencimento original dos
  // titulos. Montado sobre clientSales (com quitados/cancelados) porque o
  // clientGroup recebido pode vir de telas que nao trazem todas as vendas.
  const acordoAtivo = getAcordoAtivoDoCliente(clientGroup.document);
  const atrasoCliente = clientMaxOverdueDays(
    { document: clientGroup.document, sales: clientSales },
    acordoAtivoOverdueMap,
  );
  // Vencido x a vencer do cabecalho: mesma regra da carteira (item 34).
  const saldoCliente = clientBalanceSplit(
    { document: clientGroup.document, sales: clientSales },
    acordoAtivoOverdueMap,
  );
  const [menuMaisAberto, setMenuMaisAberto] = useState(false);

  // Saldo de cada venda calculado UMA vez e reaproveitado (pendencia, abas e
  // lista). Antes era recalculado em cada uso e a cada clique no modal.
  const saldoPorVenda = React.useMemo(() => {
    const saldos = new Map<number, ReturnType<typeof calculateSaleBalance>>();
    clientSales.forEach((sale) => {
      saldos.set(
        sale.saleNumber,
        calculateSaleBalance(sale.saleNumber, clientGroup.document),
      );
    });
    return saldos;
  }, [clientSales, calculateSaleBalance, clientGroup.document]);
  const saldoDaVenda = (saleNumber: number) =>
    saldoPorVenda.get(saleNumber) ??
    calculateSaleBalance(saleNumber, clientGroup.document);

  // Gestor atende e faz acordo pelo cobrador (2026-11-10, migration
  // 20261110000004): em cada registro escolhe se fica em nome do cobrador
  // da carteira do cliente ou no dele. Mesmos modais do cobrador (Atender,
  // Acordo) -- a regra fica num lugar so.
  const souGestor = userType === "manager";
  // Ficha unica (item 43, etapa 4): cobrador de carteira tambem atende e faz
  // acordo por aqui, sempre no proprio nome (sem a escolha do gestor).
  const podeAtender = souGestor || isWalletCollectorType(userType);
  const cobradorDaCarteira = React.useMemo(() => {
    const ids = new Set<string>();
    clientSales.forEach((sale) =>
      sale.installments.forEach((i) => {
        if (i.user_id && hasInstallmentBalance(i)) ids.add(i.user_id);
      }),
    );
    // Titulos em aberto com mais de um cobrador: ambiguo, so "eu".
    if (ids.size !== 1) return null;
    return users?.find((u) => u.id === Array.from(ids)[0]) ?? null;
  }, [clientSales, users]);
  const [emNomeDoCobrador, setEmNomeDoCobrador] = useState(true);
  const emNomeDe =
    souGestor && emNomeDoCobrador && cobradorDaCarteira
      ? cobradorDaCarteira.id
      : null;
  // Acordo em nome de cobrador de visita nao existe (perfil sem acordo).
  const acordoEmNomeDe =
    emNomeDe && cobradorDaCarteira && isWalletCollectorType(cobradorDaCarteira.type)
      ? emNomeDe
      : null;
  const [isAtenderOpen, setIsAtenderOpen] = useState(false);
  // Pagamento aberto depois do Atender: o contato ja foi registrado la.
  const [pagamentoSemContato, setPagamentoSemContato] = useState(false);
  const abrirRegistroDePagamento = () => {
    if (acordoAtivo) {
      setAcordoDetalheId(acordoAtivo.id);
    } else {
      setPagamentoSemContato(true);
      setIsGeneralPaymentModalOpen(true);
    }
  };
  useEffect(() => {
    if (abrirPagamento) abrirRegistroDePagamento();
    // So ao abrir a ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isAcordoOpen, setIsAcordoOpen] = useState(false);
  const [acordoDetalheId, setAcordoDetalheId] = useState<string | null>(null);
  // O ClientGroup recebido pode nao trazer todas as vendas: os modais
  // recebem as vendas completas do cliente.
  const clienteCompleto = React.useMemo(
    () => ({ ...clientGroup, sales: clientSales }),
    [clientGroup, clientSales],
  );
  // Contato agendado ativo (ligacao/WhatsApp) do responsavel escolhido: o
  // Atender conclui ou remarca ele na mesma transacao.
  const contatoAgendadoDoResponsavel = scheduledVisits.find(
    (v) =>
      v.clientDocument === clientGroup.document &&
      v.status === "agendada" &&
      !!v.channel &&
      v.channel !== "presencial" &&
      v.collectorId === (emNomeDe ?? user?.id),
  );

  // Calcular se há pendências reais considerando descontos
  const hasRealPendingValue = React.useMemo(() => {
    return Array.from(saldoPorVenda.values()).some(
      (saldo) => saldo.remainingBalance > 0.01,
    );
  }, [saldoPorVenda]);

  // Abas da lista de vendas. "Em aberto" = venda com saldo (mesma conta do
  // "Falta" do cabecalho da venda), mais atrasada primeiro; "Pagos" = sem
  // saldo. Venda toda fora da cobranca (cancelada/agrupada/renegociada no
  // ERP) so aparece em "Todos". Sem escolha do usuario, abre em "Em aberto"
  // quando ha divida.
  // Aberta numa venda especifica: aba "Todos" (a venda pode estar paga).
  const [abaVendas, setAbaVendas] = useState<AbaVendas | null>(
    vendaInicial != null ? "todos" : null,
  );
  // ...e rola ate ela.
  useEffect(() => {
    if (vendaInicial == null) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`ficha-venda-${vendaInicial}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [vendaInicial]);
  const vendasPorAba = React.useMemo(() => {
    const classificadas = clientSales.map((sale) => {
      const fora =
        seloForaDaCobranca(sale.installments.map((i) => i.status)) !== null;
      const saldo = saldoPorVenda.get(sale.saleNumber)?.remainingBalance ?? 0;
      let maiorAtraso = 0;
      sale.installments.forEach((inst) => {
        if (isForaDaCobranca(inst.status) || !hasInstallmentBalance(inst)) {
          return;
        }
        const dias = calculateOverdueDays(inst.data_vencimento);
        if (dias > maiorAtraso) maiorAtraso = dias;
      });
      return { sale, fora, aberto: !fora && saldo > 0.01, maiorAtraso };
    });
    const abertas = classificadas
      .filter((c) => c.aberto)
      .sort((a, b) => b.maiorAtraso - a.maiorAtraso);
    return {
      todos: clientSales,
      aberto: abertas.map((c) => c.sale),
      pagos: classificadas.filter((c) => !c.fora && !c.aberto).map((c) => c.sale),
      emAtraso: abertas.filter((c) => c.maiorAtraso > 0).length,
    };
  }, [clientSales, saldoPorVenda]);
  const abaEfetiva: AbaVendas =
    abaVendas ?? (vendasPorAba.aberto.length > 0 ? "aberto" : "todos");
  const vendasVisiveis = vendasPorAba[abaEfetiva];

  const handleGeneralPaymentSuccess = async () => {
    // Pequeno delay para garantir que a operação no banco seja concluída
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Forçar refresh dos dados do contexto
    await refreshCollections();

    // Disparar evento global para atualizar outros componentes
    window.dispatchEvent(
      new CustomEvent("paymentProcessed", {
        detail: {
          clientDocument: clientGroup.document,
          type: "general",
        },
      }),
    );

    // Forçar uma nova renderização local
    setRefreshKey((prev) => prev + 1);
    setIsGeneralPaymentModalOpen(false);
  };

  const handleGeneralEditSuccess = async () => {
    // Pequeno delay para garantir que a operação no banco seja concluída
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Forçar refresh dos dados do contexto
    await refreshCollections();

    // Disparar evento global para atualizar outros componentes
    window.dispatchEvent(
      new CustomEvent("paymentProcessed", {
        detail: {
          clientDocument: clientGroup.document,
          type: "edit",
        },
      }),
    );

    // Forçar uma nova renderização local
    setRefreshKey((prev) => prev + 1);
    setIsGeneralEditModalOpen(false);
  };

  const toggleSaleExpansion = (saleNumber: number) => {
    const newExpanded = new Set(expandedSales);
    if (newExpanded.has(saleNumber)) {
      newExpanded.delete(saleNumber);
    } else {
      newExpanded.add(saleNumber);
    }
    setExpandedSales(newExpanded);
  };

  // Gerar token de 6 dígitos
  const generateToken = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Função para solicitar autorização do gerente
  const requestManagerAuth = async () => {
    if (!user) return;

    setIsRequestingAuth(true);
    setAuthError("");

    try {
      // Primeiro, expirar qualquer solicitação anterior pendente para este cliente e cobrador
      await AuthorizationHistoryService.expirePreviousRequests(
        user.id,
        clientGroup.document,
      );

      // Gerar token único
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos

      // Criar solicitação no Supabase
      const authRequest =
        await AuthorizationHistoryService.createAuthorizationRequest({
          token,
          collector_id: user.id,
          collector_name: user.name,
          client_name: clientGroup.client,
          client_document: clientGroup.document,
          expires_at: expiresAt,
        });

      // Disparar evento para notificar o gerente
      window.dispatchEvent(
        new CustomEvent("authRequestCreated", {
          detail: {
            token: authRequest.token,
            collectorName: authRequest.collector_name,
            clientName: authRequest.client_name,
            clientDocument: authRequest.client_document,
          },
        }),
      );

      setAuthRequestSent(true);
      setProcessedApprovalToken("");
      setAuthError("");
    } catch (error) {
      console.error("Erro ao solicitar autorização:", error);
      setAuthError("Erro ao solicitar autorização. Tente novamente.");
    } finally {
      setIsRequestingAuth(false);
    }
  };

  // Função para validar token inserido
  const validateToken = async () => {
    if (!authToken) return;

    try {
      const { isValid, authorization, error } =
        await AuthorizationHistoryService.validateToken(authToken);

      if (isValid && authorization) {
        // Token válido e aprovado
        setAuthError("");
        setShowAuthModal(false);
        setAuthToken("");
        setAuthRequestSent(false);
        setIsGeneralEditModalOpen(true);

        // Marcar token como usado (opcional - ou deixar expirar naturalmente)
        // await AuthorizationHistoryService.markTokenAsUsed(authToken);
      } else {
        // Token inválido
        setAuthError(error || "Token inválido.");
      }
    } catch (error) {
      console.error("Erro ao validar token:", error);
      setAuthError("Erro ao validar token. Tente novamente.");
    }
  };

  const handleEditPaymentClick = () => {
    setShowAuthModal(true);
    setAuthError("");
    setAuthToken("");
    setAuthRequestSent(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-stretch sm:items-center justify-center sm:p-4 z-[100] backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* Celular: tela cheia. Computador: janela de ate 90% da altura. Uma
            area de rolagem so (o conteudo da aba), o resto fica fixo. */}
        <div className="bg-white sm:rounded-2xl max-w-6xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          {/* Cabecalho: quem e, como falar, situacao e acoes -- em 3 linhas */}
          <div className="relative px-4 lg:px-6 pt-4 pb-3 border-b border-gray-200 shrink-0">
            <button
              id="close-modal"
              name="closeModal"
              onClick={onClose}
              className="absolute top-3 right-3 p-2 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" />
            </button>

            {/* 1. Quem e */}
            <div className="pr-10 min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                {clientGroup.client}
              </h2>
              {razaoSocial && (
                <p
                  className="text-xs text-gray-500 truncate"
                  title={`Razão social: ${razaoSocial}`}
                >
                  {razaoSocial}
                </p>
              )}
              {/* Documento e codigo numa linha so */}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="tabular-nums">{clientGroup.document}</span>
                {codigoErp && (
                  <span title="Código do cliente no Ciclone">
                    Cód. {codigoErp}
                  </span>
                )}
              </div>
            </div>

            {/* 2. Situacao (mesma regra da carteira: vencido x a vencer; com
                acordo ativo, as parcelas do acordo) + 3. acoes, lado a lado
                no computador. So mostra o que tem valor. */}
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* So o que pede atencao: valor vencido (com o atraso) e acordo
                  ativo. Em dia / a vencer nao aparece (pedido do usuario). */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {saldoCliente.vencido > 0.01 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700">
                    Vencido{" "}
                    <strong>{formatCurrency(saldoCliente.vencido)}</strong>
                    {atrasoCliente > 0 && (
                      <span className="text-red-600">
                        {" "}
                        · {atrasoCliente} dia{atrasoCliente !== 1 ? "s" : ""}{" "}
                        de atraso
                      </span>
                    )}
                  </span>
                )}
                {acordoAtivo && (
                  <span
                    className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-xs font-medium"
                    title="Valores e atraso seguem as parcelas do acordo, não o vencimento original dos títulos"
                  >
                    Em acordo
                  </span>
                )}
              </div>

              {/* Atender e Receber pagamento sao o dia a dia; Acordo ao lado;
                  Editar pagamentos (rara, pede autorizacao) no menu. */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {podeAtender && hasRealPendingValue && (
                  <button
                    type="button"
                    onClick={() => setIsAtenderOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm"
                    title="Registrar contato e agendar o próximo"
                  >
                    <PhoneCall className="h-4 w-4" />
                    Atender
                  </button>
                )}
                {(isCollectorType(userType) || souGestor) &&
                  hasRealPendingValue && (
                    <button
                      id="distribute-payment"
                      name="distributePayment"
                      type="button"
                      onClick={() => {
                        if (getAcordoAtivoDoCliente(clientGroup.document)) {
                          setShowAcordoAtivoConfirm(true);
                        } else {
                          setIsGeneralPaymentModalOpen(true);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm"
                      title="Lançar o valor recebido; o sistema distribui entre as parcelas"
                    >
                      <CreditCard className="h-4 w-4" />
                      Receber pagamento
                    </button>
                  )}
                {podeAtender &&
                  (acordoAtivo ? (
                    <button
                      type="button"
                      onClick={() => setAcordoDetalheId(acordoAtivo.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-800 bg-white rounded-lg hover:bg-amber-50 text-sm font-medium"
                      title="Ver o acordo ativo, registrar pagamento de parcela"
                    >
                      <Handshake className="h-4 w-4" />
                      Ver acordo
                    </button>
                  ) : (
                    hasRealPendingValue && (
                      <button
                        type="button"
                        onClick={() => setIsAcordoOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-800 bg-white rounded-lg hover:bg-amber-50 text-sm font-medium"
                        title="Negociar a dívida em parcelas"
                      >
                        <Handshake className="h-4 w-4" />
                        Fazer acordo
                      </button>
                    )
                  ))}
                {(isCollectorType(userType) || souGestor) &&
                  clientSales.some((sale) => sale.totalReceived > 0) && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuMaisAberto((v) => !v)}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        title="Mais ações"
                        aria-label="Mais ações"
                        aria-expanded={menuMaisAberto}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuMaisAberto && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuMaisAberto(false)}
                          />
                          <div className="absolute right-0 mt-1 z-20 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                            <button
                              id="edit-payments"
                              name="editPayments"
                              type="button"
                              onClick={() => {
                                setMenuMaisAberto(false);
                                handleEditPaymentClick();
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                            >
                              <Edit className="h-4 w-4 text-gray-500" />
                              {souGestor
                                ? "Editar pagamentos"
                                : "Editar pagamentos (pede autorização)"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
              </div>
            </div>

            {/* Gestor: em nome de quem fica o registro. Sem cobrador de
                carteira nao ha escolha (fica no nome dele) -- nada a mostrar. */}
            {souGestor && cobradorDaCarteira && (hasRealPendingValue || acordoAtivo) && (
              <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                <span>Registrar em nome de</span>
                <select
                  value={emNomeDoCobrador ? "cobrador" : "eu"}
                  onChange={(e) =>
                    setEmNomeDoCobrador(e.target.value === "cobrador")
                  }
                  className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs"
                  title={
                    emNomeDoCobrador
                      ? `Conta para o cobrador e o próximo contato vai para a agenda dele; fica registrado que foi você.${
                          !acordoEmNomeDe
                            ? " Acordo de cobrador de visita fica no seu nome."
                            : ""
                        }`
                      : "Conta para você e o próximo contato fica na sua agenda."
                  }
                >
                  <option value="cobrador">
                    {cobradorDaCarteira.name} (
                    {USER_TYPE_LABELS[cobradorDaCarteira.type] ?? "cobrador"})
                  </option>
                  <option value="eu">Eu ({user?.name ?? "gestor"})</option>
                </select>
                {emNomeDoCobrador && !acordoEmNomeDe && (
                  <span className="text-gray-400">
                    · acordo fica no seu nome
                  </span>
                )}
              </label>
            )}
          </div>

          {/* Abas: navegacao, nao acao. Sem overflow: com overflow-x o
              sublinhado (-mb-px) criava barra de rolagem vertical. */}
          <div
            role="tablist"
            className="flex gap-1 px-4 lg:px-6 border-b border-gray-200 shrink-0"
          >
            {(
              [
                ["vendas", `Vendas (${clientSales.length})`, "Vendas e parcelas do cliente"],
                [
                  "historico",
                  "Histórico",
                  userType === "manager"
                    ? "Contatos, visitas, baixas e quem teve o cliente na carteira"
                    : "Contatos, visitas e baixas do cliente",
                ],
                ["dados", "Cadastro", "Dados de cadastro e endereços"],
              ] as const
            ).map(([aba, rotulo, dica]) => (
              <button
                key={aba}
                type="button"
                role="tab"
                aria-selected={view === aba}
                onClick={() => setView(aba)}
                title={dica}
                className={`px-3 py-2.5 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  view === aba
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {/* Sales and Collections, Client Data or History */}
          {view === "historico" ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
              <LinhaDoTempoCliente
                clientDocument={clientGroup.document}
                sales={clientSales}
                mostrarCarteira={userType === "manager"}
              />
            </div>
          ) : view === "dados" ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Column 1: Basic and Contact Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="h-5 w-5 mr-2 text-blue-600" />
                    Informações Básicas e de Contato
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-2xl space-y-3 text-sm border border-gray-200">
                    {/* Client Info */}
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">
                        {razaoSocial ? "Nome fantasia:" : "Nome:"}
                      </span>
                      <span className="font-semibold text-gray-900 text-right">
                        {clientGroup.client || "-"}
                      </span>
                    </div>
                    {razaoSocial && (
                      <div className="flex justify-between gap-4">
                        <span className="font-medium text-gray-600 shrink-0">
                          Razão social:
                        </span>
                        <span className="font-semibold text-gray-900 text-right">
                          {razaoSocial}
                        </span>
                      </div>
                    )}
                    {clientGroup.apelido && (
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-600">
                          Apelido:
                        </span>
                        <span className="font-semibold text-gray-900 text-right">
                          {clientGroup.apelido}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">
                        Documento:
                      </span>
                      <span className="font-semibold text-gray-900 text-right">
                        {clientGroup.document || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">
                        Data de Nascimento:
                      </span>
                      <span className="font-semibold text-gray-900 text-right">
                        {birthDate ? formatDate(birthDate) : "-"}
                      </span>
                    </div>

                    {/* Contacts */}
                    <div className="pt-4 mt-4 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        Contatos
                      </h4>
                      <div className="space-y-2">
                        {clientGroup.phone && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center">
                              <Phone className="h-4 w-4 text-gray-400 mr-2" />
                              <span>{clientGroup.phone}</span>
                            </div>
                            <button
                              onClick={() =>
                                window.open(`tel:${clientGroup.phone}`, "_self")
                              }
                              className="text-[10px] font-bold text-blue-600"
                            >
                              Ligar
                            </button>
                          </div>
                        )}
                        {clientGroup.mobile && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center">
                              <MessageCircle className="h-4 w-4 text-gray-400 mr-2" />
                              <span>{clientGroup.mobile}</span>
                            </div>
                            <button
                              onClick={() =>
                                window.open(`tel:${clientGroup.mobile}`, "_self")
                              }
                              className="text-[10px] font-bold text-blue-600"
                            >
                              Ligar
                            </button>
                          </div>
                        )}
                        {!clientGroup.phone &&
                          !clientGroup.mobile &&
                          telefonesContato.length === 0 && (
                            <p className="text-xs text-gray-500">
                              Nenhum telefone cadastrado.
                            </p>
                          )}
                      </div>
                    </div>

                    {/* Pessoa de contato (ERP Ciclone) */}
                    {(cadastroErp?.contato_nome ||
                      telefonesContato.length > 0) && (
                      <div className="pt-4 mt-4 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Falar com
                        </h4>
                        <div className="space-y-2">
                          {cadastroErp?.contato_nome && (
                            <div className="flex items-center text-sm">
                              <User className="h-4 w-4 text-gray-400 mr-2" />
                              <span className="font-semibold text-gray-900">
                                {cadastroErp.contato_nome}
                              </span>
                            </div>
                          )}
                          {telefonesContato.map((telefone) => (
                            <div
                              key={telefone}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center">
                                <Phone className="h-4 w-4 text-gray-400 mr-2" />
                                <span>{telefone}</span>
                              </div>
                              <button
                                onClick={() =>
                                  window.open(`tel:${telefone}`, "_self")
                                }
                                className="text-[10px] font-bold text-blue-600"
                              >
                                Ligar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dados comerciais (ERP Ciclone) */}
                    {temDadosErp && (
                      <div className="pt-4 mt-4 border-t border-gray-200 space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700">
                          Dados do Ciclone
                        </h4>
                        {codigoErp && (
                          <div className="flex justify-between gap-4">
                            <span className="font-medium text-gray-600 shrink-0">
                              Código do cliente:
                            </span>
                            <span className="font-semibold text-gray-900 text-right">
                              {codigoErp}
                            </span>
                          </div>
                        )}
                        {cadastroErp?.vendedor_responsavel && (
                          <div className="flex justify-between gap-4">
                            <span className="font-medium text-gray-600 shrink-0">
                              Vendedor:
                            </span>
                            <span className="font-semibold text-gray-900 text-right">
                              {cadastroErp.vendedor_responsavel}
                            </span>
                          </div>
                        )}
                        {cadastroErp?.regiao && (
                          <div className="flex justify-between gap-4">
                            <span className="font-medium text-gray-600 shrink-0">
                              Região:
                            </span>
                            <span className="font-semibold text-gray-900 text-right">
                              {cadastroErp.regiao}
                            </span>
                          </div>
                        )}
                        {cadastroErp?.observacao_erp && (
                          <div>
                            <span className="font-medium text-gray-600">
                              Observação do cadastro:
                            </span>
                            <p className="mt-1 text-gray-900 whitespace-pre-line break-words">
                              {cadastroErp.observacao_erp}
                            </p>
                          </div>
                        )}
                        <p className="text-[11px] text-gray-500">
                          Vem do cadastro do Ciclone; correções são feitas lá.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Address History */}
                <AddressHistoryViewer
                  clientDocument={clientGroup.document}
                  initialData={clientGroup}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-4 lg:px-6 py-4">
                {/* Abas: Todos | Em aberto | Pagos */}
                <div
                  role="tablist"
                  className="mb-3 flex gap-1 p-1 bg-gray-100 rounded-xl text-xs"
                >
                  {(
                    [
                      ["todos", "Todos", vendasPorAba.todos.length],
                      ["aberto", "Em aberto", vendasPorAba.aberto.length],
                      ["pagos", "Pagos", vendasPorAba.pagos.length],
                    ] as const
                  ).map(([aba, rotulo, total]) => (
                    <button
                      key={aba}
                      type="button"
                      role="tab"
                      aria-selected={abaEfetiva === aba}
                      onClick={() => setAbaVendas(aba)}
                      className={`flex-1 px-2 py-1.5 rounded-lg font-semibold transition-colors ${
                        abaEfetiva === aba
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {rotulo} ({total})
                      {aba === "aberto" && vendasPorAba.emAtraso > 0 && (
                        <span className="ml-1 text-red-600">
                          · {vendasPorAba.emAtraso} em atraso
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {vendasVisiveis.length === 0 && (
                    <p className="py-6 text-center text-xs text-gray-400">
                      {abaEfetiva === "aberto"
                        ? "Nenhuma venda com saldo em aberto."
                        : abaEfetiva === "pagos"
                          ? "Nenhuma venda quitada."
                          : "Nenhuma venda."}
                    </p>
                  )}
                  {vendasVisiveis.map((sale) => {
                    const saleBalance = saldoDaVenda(sale.saleNumber);
                    const saleSeloFora = seloForaDaCobranca(
                      sale.installments.map((i) => i.status),
                    );

                    return (
                      <div
                        key={sale.saleNumber}
                        id={`ficha-venda-${sale.saleNumber}`}
                        className="border border-gray-200 rounded-xl overflow-hidden bg-white"
                      >
                        {/* Sale Header - Minimalista */}
                        <div
                          className="px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => toggleSaleExpansion(sale.saleNumber)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* Left: Chevron + Info */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="flex-shrink-0">
                                {expandedSales.has(sale.saleNumber) ? (
                                  <ChevronDown className="h-4 w-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-medium text-gray-900">
                                    {sale.saleNumber === 0
                                      ? "Venda Renegociada"
                                      : `Venda #${sale.saleNumber}`}
                                  </h4>
                                  {saleSeloFora ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs border bg-gray-200 text-gray-600 border-gray-300">
                                      {saleSeloFora}
                                    </span>
                                  ) : (
                                    <StatusBadge status={saleBalance.status} />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  {sale.installments.length} parcela
                                  {sale.installments.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>

                            {/* Right: Valores */}
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-semibold text-gray-900">
                                {formatCurrency(sale.totalValue)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Pago{" "}
                                <span className="text-green-600">
                                  {formatCurrency(saleBalance.totalPaid)}
                                </span>
                              </div>
                              {saleBalance.remainingBalance > 0.01 && (
                                <div className="text-xs text-gray-500">
                                  Falta{" "}
                                  <span className="font-medium text-red-600">
                                    {formatCurrency(saleBalance.remainingBalance)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Sale Details - Minimalista */}
                        {expandedSales.has(sale.saleNumber) && (
                          <div className="px-3 py-3 bg-white border-t border-gray-100">
                            {/* Tabela de Parcelas */}
                            <div className="space-y-1">

                              {/* Mobile: Cards compactos */}
                              <div className="space-y-1.5">
                                {[...sale.installments]
                                  .sort(
                                    (a, b) =>
                                      (parseAndNormalizeDate(
                                        a.data_vencimento,
                                      )?.getTime() ?? 0) -
                                        (parseAndNormalizeDate(
                                          b.data_vencimento,
                                        )?.getTime() ?? 0) ||
                                      a.id_parcela - b.id_parcela,
                                  )
                                  .map((installment) => {
                                  const diasVencida = calculateOverdueDays(
                                    installment.data_vencimento,
                                  );
                                  const situacao = situacaoParcela(
                                    installment,
                                    diasVencida,
                                  );
                                  const actualAtraso =
                                    situacao === "atrasada" ? diasVencida : 0;
                                  // Mesma base dos totais da venda (Total /
                                  // Pago / Falta): valor_original.
                                  const saldoParcela = round2(
                                    (installment.valor_original || 0) -
                                      (installment.valor_recebido || 0) -
                                      (installment.desconto || 0),
                                  );
                                  const reajusteDiferente =
                                    installment.valor_reajustado > 0 &&
                                    round2(installment.valor_reajustado) !==
                                      round2(installment.valor_original);

                                  return (
                                    <div
                                      key={installment.id_parcela}
                                      className="flex items-center justify-between py-1.5 px-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded transition-colors"
                                    >
                                      {/* Left: ID, Data, Status */}
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <InstallmentStatusDot
                                          situacao={situacao}
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className="text-xs font-medium text-gray-700"
                                              title={`ID da parcela: ${installment.id_parcela}`}
                                            >
                                              {installment.parcela != null
                                                ? `Parcela ${installment.parcela}`
                                                : `#${installment.id_parcela}`}
                                            </span>
                                            {isForaDaCobranca(
                                              installment.status,
                                            ) && (
                                              <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                                                {seloForaDaCobranca([
                                                  installment.status,
                                                ])}
                                              </span>
                                            )}
                                            {actualAtraso > 0 && (
                                              <span
                                                className={`text-xs font-medium ${
                                                  acordoAtivo
                                                    ? "text-gray-500"
                                                    : "text-red-600"
                                                }`}
                                                title={
                                                  acordoAtivo
                                                    ? "Vencimento original do título; com acordo ativo o atraso do cliente segue as parcelas do acordo"
                                                    : `${actualAtraso} dias de atraso`
                                                }
                                              >
                                                {formatDaysOverdue(
                                                  actualAtraso,
                                                )}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-xs text-gray-600 truncate">
                                            {formatDate(
                                              installment.data_vencimento,
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Right: Valores */}
                                      <div className="text-right flex-shrink-0">
                                        <div className="font-medium text-xs text-gray-900">
                                          {formatCurrency(
                                            installment.valor_original,
                                          )}
                                        </div>
                                        {reajusteDiferente && (
                                          <div
                                            className="text-[10px] text-gray-400"
                                            title="Valor reajustado informado na origem; os totais usam o valor original"
                                          >
                                            reaj.{" "}
                                            {formatCurrency(
                                              installment.valor_reajustado,
                                            )}
                                          </div>
                                        )}
                                        {installment.valor_recebido > 0 && (
                                          <div className="text-xs text-green-600">
                                            ✓{" "}
                                            {formatCurrency(
                                              installment.valor_recebido,
                                            )}
                                          </div>
                                        )}
                                        {situacao !== "fora" &&
                                          (installment.desconto || 0) > 0.01 && (
                                            <div className="text-[10px] text-blue-600">
                                              desc.{" "}
                                              {formatCurrency(
                                                installment.desconto || 0,
                                              )}
                                            </div>
                                          )}
                                        {(situacao === "atrasada" ||
                                          situacao === "a_vencer") &&
                                          (installment.valor_recebido > 0 ||
                                            (installment.desconto || 0) >
                                              0.01) && (
                                            <div className="text-[10px] font-semibold text-red-600">
                                              falta{" "}
                                              {formatCurrency(saldoParcela)}
                                            </div>
                                          )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Informações adicionais (se houver desconto) */}
                              {saleBalance.totalDiscount !== undefined &&
                                saleBalance.totalDiscount > 0 && (
                                  <div className="mt-2 pt-2 border-t border-gray-100">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-gray-600">
                                        Desconto total:
                                      </span>
                                      <span className="font-medium text-blue-600">
                                        {formatCurrency(
                                          saleBalance.totalDiscount,
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Authorization Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-4">
              Autorização Necessária
            </h3>

            {!authRequestSent ? (
              <>
                <p className="text-gray-600 mb-4">
                  Para editar pagamentos, é necessária autorização do gerente.
                  Clique no botão abaixo para solicitar um token de autorização.
                </p>
                <p className="text-xs sm:text-sm text-amber-600 mb-4">
                  ⚠️ O token expira em 5 minutos após a aprovação.
                </p>

                <div className="space-y-4">
                  {authError && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                      <p className="text-xs sm:text-sm text-red-700">
                        {authError}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      id="cancel-auth"
                      name="cancelAuth"
                      onClick={() => {
                        setShowAuthModal(false);
                        setAuthToken("");
                        setAuthError("");
                        setAuthRequestSent(false);
                      }}
                      className="flex-1 px-4 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      id="request-auth"
                      name="requestAuth"
                      onClick={requestManagerAuth}
                      disabled={isRequestingAuth}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRequestingAuth ? (
                        "Solicitando..."
                      ) : (
                        <>
                          <span className="sm:hidden">Solicitar</span>
                          <span className="hidden sm:inline">
                            Solicitar Autorização
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {showApprovalNotification ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 animate-pulse">
                    <div className="flex items-center">
                      <div className="bg-blue-500 rounded-full p-1 mr-3">
                        <svg
                          className="h-4 w-4 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-blue-700">
                          Token Aprovado pelo Gerente!
                        </p>
                        <p className="text-xs sm:text-sm text-blue-600">
                          Token:{" "}
                          <span className="font-mono font-bold">
                            {approvedToken}
                          </span>{" "}
                          - Token preenchido automaticamente
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  !approvedToken && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-3 mb-4">
                      <p className="text-xs sm:text-sm text-green-700">
                        ✅ Solicitação enviada para o gerente! Aguarde a
                        aprovação.
                      </p>
                    </div>
                  )
                )}

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="auth-token"
                      className="block text-xs sm:text-sm font-medium text-gray-700 mb-2"
                    >
                      Token de Autorização
                    </label>
                    <input
                      id="auth-token"
                      name="authToken"
                      type="text"
                      value={authToken}
                      onChange={(e) =>
                        setAuthToken(
                          e.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-sm sm:text-lg font-mono"
                      placeholder="000000"
                      maxLength={6}
                      onKeyDown={(e) => e.key === "Enter" && validateToken()}
                    />
                  </div>

                  {authError && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                      <p className="text-xs sm:text-sm text-red-700">
                        {authError}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      id="cancel-auth"
                      name="cancelAuth"
                      onClick={() => {
                        setShowAuthModal(false);
                        setAuthToken("");
                        setAuthError("");
                        setAuthRequestSent(false);
                      }}
                      className="flex-1 px-4 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      id="validate-token"
                      name="validateToken"
                      onClick={validateToken}
                      disabled={authToken.length !== 6}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Validar Token
                    </button>
                  </div>

                  <button
                    id="new-request"
                    name="newRequest"
                    onClick={() => {
                      setAuthRequestSent(false);
                      setShowApprovalNotification(false);
                      setShowRejectionModal(false);
                      setAuthToken("");
                      setAuthError("");
                      setApprovedToken("");
                      setProcessedApprovalToken("");
                    }}
                    className="w-full px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors text-xs sm:text-sm"
                  >
                    Solicitar Nova Autorização
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Aviso de acordo ativo antes de abrir o Distribuir Pagamento --
          titulos vinculados ao acordo nao podem ser pagos por aqui (ver
          migration 20261102000005); o cobrador precisa confirmar que sabe
          disso antes de continuar. */}
      {showAcordoAtivoConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[130]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  Este cliente tem um acordo ativo
                </h3>
              </div>
              <p className="text-sm text-gray-600">
                Títulos vinculados ao acordo não podem ser pagos por aqui — o
                sistema vai recusar e manter o valor neles. Só títulos fora do
                acordo (se houver) serão aplicados. Para pagar o acordo, use a
                tela dele.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowAcordoAtivoConfirm(false)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAcordoAtivoConfirm(false);
                  setIsGeneralPaymentModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-amber-600 text-white rounded-2xl hover:bg-amber-700 transition-colors font-medium text-sm"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gestor: Atender / Acordo (mesmos modais do cobrador) */}
      {isAtenderOpen && (
        <LogContactModal
          client={clienteCompleto}
          linkedVisit={contatoAgendadoDoResponsavel}
          emNomeDe={emNomeDe}
          onClose={() => setIsAtenderOpen(false)}
          onSuccess={() => setIsAtenderOpen(false)}
          onRegistrarPagamento={abrirRegistroDePagamento}
        />
      )}
      {isAcordoOpen && (
        <AcordoModal
          client={clienteCompleto}
          emNomeDe={acordoEmNomeDe}
          onClose={() => setIsAcordoOpen(false)}
          onSuccess={() => setIsAcordoOpen(false)}
        />
      )}
      {acordoDetalheId && (
        <AcordoDetailModal
          acordoId={acordoDetalheId}
          onClose={() => setAcordoDetalheId(null)}
        />
      )}

      {/* General Payment Modal */}
      {isGeneralPaymentModalOpen && (
        <GeneralPaymentModal
          clientGroup={clientGroup}
          clientSales={clientSales}
          contatoJaRegistrado={pagamentoSemContato}
          onClose={() => {
            setIsGeneralPaymentModalOpen(false);
            setPagamentoSemContato(false);
          }}
          onSuccess={async () => {
            setPagamentoSemContato(false);
            await handleGeneralPaymentSuccess();
          }}
        />
      )}

      {/* General Payment Edit Modal */}
      {isGeneralEditModalOpen && (
        <GeneralPaymentEditModal
          clientGroup={clientGroup}
          clientSales={clientSales}
          onClose={() => setIsGeneralEditModalOpen(false)}
          onSuccess={handleGeneralEditSuccess}
        />
      )}

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2">
                Solicitação Rejeitada
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-6">
                Sua solicitação de autorização foi rejeitada pelo gerente.
              </p>
              <button
                onClick={() => {
                  setShowRejectionModal(false);
                  setAuthRequestSent(false);
                  setAuthToken("");
                  setAuthError("");
                }}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-colors font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ClientDetailModal;
