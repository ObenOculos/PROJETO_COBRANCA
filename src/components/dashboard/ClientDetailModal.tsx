import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import AddressHistoryViewer from "./AddressHistoryViewer";
import ClientHistoryViewer from "./ClientHistoryViewer";
import {
  X,
  ChevronDown,
  ChevronRight,
  User,
  Edit,
  CreditCard,
  Info,
  AlertTriangle,
  Receipt,
  Phone,
  MessageCircle,
  Clock,
  RefreshCw,
  History,
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
  parseAndFormatDate,
} from "../../utils/formatters";
import {
  clientesReincidentes,
  rescheduleReasonLabel,
} from "../../config/rescheduleReasons";
import { isForaDaCobranca, seloForaDaCobranca } from "../../types/status";
import {
  clientMaxOverdueDays,
  hasInstallmentBalance,
  round2,
} from "../../filters/clientStatus";
import { parseAndNormalizeDate } from "../../filters/dates";
import {
  ATTEMPT_TYPE_LABELS,
  ATTEMPT_RESULT_LABELS,
} from "../../config/collectionAttempts";
import { useCollection } from "../../contexts/CollectionContext";
import { useClientBirthDate } from "../../hooks/useClientBirthDate";
import { razaoSocialDistinta } from "../../utils/clienteNome";
import { useAuth } from "../../contexts/AuthContext";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";

import GeneralPaymentModal from "./GeneralPaymentModal";
import GeneralPaymentEditModal from "./GeneralPaymentEditModal";

interface ClientDetailModalProps {
  clientGroup: ClientGroup;
  userType: UserType;
  onClose: () => void;
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

const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  clientGroup,
  userType,
  onClose,
}) => {
  const {
    getSalesByClient,
    calculateSaleBalance,
    refreshCollections,
    scheduledVisits,
    users,
    reincidenciaResets,
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

  const getCollectorName = (collectorId: string) => {
    const collector = users?.find((u) => u.id === collectorId);
    return collector?.name || "Cobrador não identificado";
  };

  const formatVisitDate = (dateString: string) => {
    try {
      const [year, month, day] = dateString.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString("pt-BR");
    } catch {
      return dateString;
    }
  };

  const getStatusVisitBadge = (status: string) => {
    const config = {
      realizada: {
        bg: "bg-green-100",
        text: "text-green-800",
        label: "Realizada",
      },
      cancelada: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        label: "Cancelada",
      },
      nao_encontrado: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        label: "Não Encontrado",
      },
    };

    const statusConfig =
      config[status as keyof typeof config] || config["realizada"];

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}
      >
        {statusConfig.label}
      </span>
    );
  };

  const clientVisits = React.useMemo(() => {
    if (!clientGroup?.document || !scheduledVisits) return [];

    return scheduledVisits
      .filter((visit) => visit.clientDocument === clientGroup.document)
      .filter((visit) => visit.status === "realizada" && visit.notes) // Apenas visitas realizadas com observações
      .sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB.getTime() - dateA.getTime(); // Mais recentes primeiro
      });
  }, [clientGroup.document, scheduledVisits]);

  // Reincidência de reagendamentos do cliente. Mesma regra da aba Reincidentes
  // do Acompanhamento (config/rescheduleReasons): conta a MAIOR cadeia, isto é,
  // quantas vezes a mesma cobrança foi empurrada — não remarcações avulsas.
  const reincidencia = React.useMemo(() => {
    if (!clientGroup?.document || !scheduledVisits) return null;
    const doCliente = scheduledVisits.filter(
      (v) => v.clientDocument === clientGroup.document,
    );
    return clientesReincidentes(doCliente, 2, reincidenciaResets)[0] ?? null;
  }, [clientGroup.document, scheduledVisits, reincidenciaResets]);

  // Histórico completo de collection_attempts do cliente (ligação/WhatsApp/
  // mensagem registrados por LogContactModal ou CollectionModal), em TODOS
  // os títulos dele -- não só os em aberto (diferente do attemptsByCollection
  // da agenda do cobrador, que só olha título pendente). Nunca existiu uma
  // visão agregada disso antes; a aba "Tentativas" do CollectionModal só
  // mostra um título por vez.
  interface ContactAttemptRow {
    id: string;
    saleDescription: string;
    date: string;
    type: string;
    result: string;
    notes: string | null;
    nextAction: string | null;
    nextActionDate: string | null;
  }
  const [contactAttempts, setContactAttempts] = useState<ContactAttemptRow[]>(
    [],
  );

  useEffect(() => {
    const idToSale = new Map<string, string>();
    clientGroup.sales?.forEach((sale) => {
      sale.installments?.forEach((inst) => {
        idToSale.set(
          inst.id_parcela.toString(),
          sale.description || `Venda ${sale.titleNumber}`,
        );
      });
    });
    const ids = Array.from(idToSale.keys());
    if (ids.length === 0) {
      setContactAttempts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("collection_attempts")
        .select(
          "id, collection_id, date, type, result, notes, next_action, next_action_date, created_at",
        )
        .in("collection_id", ids)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("Erro ao buscar histórico de contatos do cliente:", error);
        return;
      }
      setContactAttempts(
        (data || []).map((row) => ({
          id: row.id,
          saleDescription: idToSale.get(row.collection_id) ?? "Título",
          date: row.date,
          type: row.type,
          result: row.result,
          notes: row.notes,
          nextAction: row.next_action,
          nextActionDate: row.next_action_date,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientGroup.document]);

  const [isGeneralPaymentModalOpen, setIsGeneralPaymentModalOpen] =
    useState(false);
  const [showAcordoAtivoConfirm, setShowAcordoAtivoConfirm] = useState(false);
  const [isGeneralEditModalOpen, setIsGeneralEditModalOpen] = useState(false);
  const [view, setView] = useState<"vendas" | "dados" | "historico">("vendas");
  const [expandedSales, setExpandedSales] = useState<Set<number>>(new Set());
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

    // Fallback: verificar periodicamente
    const interval = setInterval(checkTokenStatus, 3000);

    return () => {
      window.removeEventListener(
        "tokenApproved",
        handleTokenApproved as EventListener,
      );
      window.removeEventListener(
        "tokenRejected",
        handleTokenRejected as EventListener,
      );
      clearInterval(interval);
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

  // Calcular se há pendências reais considerando descontos
  const hasRealPendingValue = React.useMemo(() => {
    return clientSales.some((sale) => {
      const saleBalance = calculateSaleBalance(
        sale.saleNumber,
        clientGroup.document,
      );
      return saleBalance.remainingBalance > 0.01;
    });
  }, [clientSales, calculateSaleBalance, clientGroup.document]);

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
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="relative px-4 py-4 border-b border-gray-200 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center pr-8 sm:pr-0">
              <User className="h-6 w-6 text-blue-600 mr-3 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-gray-600">
                  Detalhes do Cliente
                </h3>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                  {clientGroup.client}
                </h2>
                {razaoSocial && (
                  <p
                    className="text-xs sm:text-sm text-gray-700 truncate"
                    title={`Razão social: ${razaoSocial}`}
                  >
                    {razaoSocial}
                  </p>
                )}
                <p className="text-xs sm:text-sm text-gray-500 truncate">
                  {clientGroup.document}
                  {codigoErp && (
                    <span title="Código do cliente no Ciclone">
                      {" "}
                      · Cód. Ciclone {codigoErp}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              id="close-modal"
              name="closeModal"
              onClick={onClose}
              className="absolute top-3 right-3 p-2 text-gray-500 hover:text-gray-800 sm:static sm:p-2 sm:ml-4 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Action Buttons */}

          {/* Todo perfil de cobranca precisa consultar dados/vendas e registrar
              recebimento na propria carteira — Terceirizado e Juridico ficavam
              de fora por omissao de quando esses perfis foram criados. */}
          {(isCollectorType(userType) || userType === "manager") && (
            <div
              className={`mt-4 px-4 lg:px-6 py-0 grid grid-cols-2 gap-3 ${
                userType === "manager" ? "sm:grid-cols-5" : "sm:grid-cols-4"
              }`}
            >
              <button
                id="view-client-data"
                name="viewClientData"
                onClick={() => setView("dados")}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
                title="Ver todos os dados de cadastro do cliente"
              >
                <Info className="h-5 w-5 mr-2" />
                <span className="text-xs sm:text-sm">
                  <span className="sm:hidden">Dados</span>
                  <span className="hidden sm:inline">Ver Dados</span>
                </span>
              </button>
              <button
                id="view-client-sales"
                name="viewClientSales"
                onClick={() => setView("vendas")}
                className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                title="Ver vendas do cliente"
              >
                <Receipt className="h-5 w-5 mr-2" />
                <span className="text-xs sm:text-sm">
                  <span className="sm:hidden">Vendas</span>
                  <span className="hidden sm:inline">Ver Vendas</span>
                </span>
              </button>
              {/* Linha do tempo de carteira e baixas: so gestor, pois mostra
                  outros cobradores e quem fez cada mudanca. */}
              {userType === "manager" && (
                <button
                  id="view-client-history"
                  name="viewClientHistory"
                  onClick={() => setView("historico")}
                  className="flex items-center px-3 py-2 bg-slate-700 text-white rounded-2xl hover:bg-slate-800 transition-colors text-sm font-medium shadow-sm"
                  title="Quem teve o cliente na carteira e cada baixa registrada"
                >
                  <History className="h-5 w-5 mr-2" />
                  <span className="text-xs sm:text-sm">Histórico</span>
                </button>
              )}
              {hasRealPendingValue && (
                <button
                  id="distribute-payment"
                  name="distributePayment"
                  onClick={() => {
                    if (getAcordoAtivoDoCliente(clientGroup.document)) {
                      setShowAcordoAtivoConfirm(true);
                    } else {
                      setIsGeneralPaymentModalOpen(true);
                    }
                  }}
                  className="flex items-center px-3 py-2 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm"
                  title="Distribuir pagamento entre parcelas"
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  <span className="text-xs sm:text-sm">
                    <span className="sm:hidden">Distribuir</span>
                    <span className="hidden sm:inline">
                      Distribuir Pagamento
                    </span>
                  </span>
                </button>
              )}

              {clientSales.reduce((sum, sale) => sum + sale.totalReceived, 0) >
                0 && (
                <button
                  id="edit-payments"
                  name="editPayments"
                  onClick={handleEditPaymentClick}
                  className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 transition-colors text-sm font-medium shadow-sm"
                  title={
                    userType === "manager"
                      ? "Editar valores recebidos"
                      : "Solicitar autorização para editar pagamentos"
                  }
                >
                  <Edit className="h-5 w-5 mr-2" />
                  <span className="text-xs sm:text-sm">
                    <span className="sm:hidden">Editar</span>
                    <span className="hidden sm:inline">Editar Pagamentos</span>
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Sales and Collections, Client Data or History */}
          {view === "historico" ? (
            <div className="overflow-y-auto max-h-[60vh] p-4 lg:p-6">
              <ClientHistoryViewer
                clientDocument={clientGroup.document}
                users={users ?? []}
              />
            </div>
          ) : view === "dados" ? (
            <div className="overflow-y-auto max-h-[60vh] p-4 lg:p-6">
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
              {/* Reincidência de reagendamentos — contexto rápido antes do
                  histórico, para o gestor não precisar abrir visita por visita. */}
              {reincidencia && (
                <div className="mt-8 lg:col-span-2">
                  <div className="border border-amber-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="text-sm font-semibold text-amber-900">
                        Reagendado {reincidencia.totalRemarcacoes}x
                      </span>
                      {reincidencia.maiorCadeia >= 2 && (
                        <span
                          className="text-[10px] font-medium text-amber-700 bg-white border border-amber-200 rounded-md px-1.5 py-0.5"
                          title="Maior sequência da MESMA cobrança sendo empurrada."
                        >
                          seq. {reincidencia.maiorCadeia}x
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1.5 ml-auto">
                        {reincidencia.motivos.map((m) => (
                          <span
                            key={m.key}
                            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white text-amber-800 border border-amber-200"
                          >
                            {m.label} ({m.count})
                          </span>
                        ))}
                      </div>
                    </div>
                    <ol className="divide-y divide-amber-100 bg-white">
                      {reincidencia.elos.map((step, i) => (
                        <li
                          key={step.visitId}
                          className="px-4 py-2 text-xs text-gray-600 flex items-center gap-2"
                        >
                          <span className="w-5 shrink-0 text-gray-400 tabular-nums">
                            {i + 1}.
                          </span>
                          <span className="font-semibold text-gray-800 tabular-nums">
                            {parseAndFormatDate(step.date)}
                          </span>
                          <span className="text-gray-400">—</span>
                          <span>{rescheduleReasonLabel(step.reasonKey)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {/* Histórico de Contatos (collection_attempts) -- ligação,
                  WhatsApp, mensagem registrados pelo cobrador de carteira.
                  Visualmente distinto do bloco de visitas abaixo, que é do
                  cobrador externo (scheduled_visits). */}
              {contactAttempts.length > 0 && (
                <div className="mt-8 space-y-4 lg:col-span-2">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <MessageCircle className="h-5 w-5 mr-2 text-indigo-600" />
                    Histórico de Contatos
                  </h3>
                  <ul className="space-y-3 max-h-48 overflow-y-auto pr-2">
                    {contactAttempts.map((attempt) => (
                      <li
                        key={attempt.id}
                        className="bg-gray-50 p-4 rounded-2xl border border-gray-200"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-800">
                            <History className="w-4 h-4 text-indigo-500" />
                            {ATTEMPT_TYPE_LABELS[
                              attempt.type as keyof typeof ATTEMPT_TYPE_LABELS
                            ] ?? attempt.type}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {formatDate(attempt.date)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">
                          {attempt.saleDescription}
                        </p>
                        <p className="text-xs font-semibold text-gray-600 mb-1">
                          {ATTEMPT_RESULT_LABELS[
                            attempt.result as keyof typeof ATTEMPT_RESULT_LABELS
                          ] ?? attempt.result}
                        </p>
                        {attempt.notes && (
                          <p className="text-xs text-gray-500 whitespace-pre-wrap">
                            {attempt.notes}
                          </p>
                        )}
                        {attempt.nextAction && (
                          <p className="text-[11px] text-gray-400 mt-2">
                            Próxima ação: {attempt.nextAction}
                            {attempt.nextActionDate
                              ? ` (${formatDate(attempt.nextActionDate)})`
                              : ""}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Visit History */}
              {clientVisits.length > 0 && (
                <div className="mt-8 space-y-4 lg:col-span-2">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Clock className="h-5 w-5 mr-2 text-blue-600" />
                    Histórico de Acompanhamento
                  </h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                    {clientVisits.map((visit) => (
                      <div
                        key={visit.id}
                        className="bg-gray-50 p-4 rounded-2xl border border-gray-200"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {getStatusVisitBadge(visit.status)}
                              <span className="text-xs text-gray-500">
                                {formatVisitDate(visit.scheduledDate)}
                                {visit.scheduledTime &&
                                  ` às ${visit.scheduledTime}`}
                              </span>
                            </div>

                            <div className="flex items-center text-sm text-gray-600 mb-2">
                              <User className="h-4 w-4 mr-1" />
                              <span className="font-medium">
                                {getCollectorName(visit.collectorId)}
                              </span>
                            </div>

                            {visit.notes && (
                              <div className="bg-white p-3 rounded-2xl border border-gray-200">
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                  {visit.notes}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center text-xs text-gray-400">
                            <Clock className="h-3 w-3 mr-1" />
                            {visit.updatedAt ? (
                              <>
                                Finalizada em{" "}
                                {formatVisitDate(visit.updatedAt.split("T")[0])}
                              </>
                            ) : (
                              <>
                                Registrada em{" "}
                                {formatVisitDate(visit.createdAt.split("T")[0])}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              <div className="px-4 lg:px-6 py-4">
                <h3 className="text-sm sm:text-lg font-medium text-gray-900 mb-4">
                  Vendas ({clientSales.length} venda
                  {clientSales.length !== 1 ? "s" : ""})
                </h3>

                {hasRealPendingValue && (
                  <div
                    className={`mb-4 px-3 py-2 rounded-xl border text-xs flex flex-wrap items-center gap-x-2 gap-y-1 ${
                      atrasoCliente > 0
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {atrasoCliente > 0 ? (
                        <>
                          Maior atraso:{" "}
                          <strong>{formatDaysOverdue(atrasoCliente)}</strong> (
                          {atrasoCliente} dia{atrasoCliente !== 1 ? "s" : ""})
                        </>
                      ) : (
                        "Sem parcela vencida em aberto"
                      )}
                    </span>
                    {acordoAtivo && (
                      <span className="text-gray-600">
                        · cliente em acordo: o atraso segue as parcelas do
                        acordo, não o vencimento original dos títulos abaixo
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {clientSales.map((sale) => {
                    const saleBalance = calculateSaleBalance(
                      sale.saleNumber,
                      clientGroup.document,
                    );
                    const saleSeloFora = seloForaDaCobranca(
                      sale.installments.map((i) => i.status),
                    );

                    return (
                      <div
                        key={sale.saleNumber}
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
                              <div className="text-xs text-green-600">
                                ↑ {formatCurrency(saleBalance.totalPaid)}
                              </div>
                              <div className="text-xs text-red-600">
                                ↓ {formatCurrency(saleBalance.remainingBalance)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Sale Details - Minimalista */}
                        {expandedSales.has(sale.saleNumber) && (
                          <div className="px-3 py-3 bg-white border-t border-gray-100">
                            {/* Resumo em linha única */}
                            <div className="flex justify-between text-xs mb-3 pb-2 border-b border-gray-100">
                              <span className="text-gray-600">
                                Total:{" "}
                                <strong className="text-gray-900">
                                  {formatCurrency(saleBalance.totalValue)}
                                </strong>
                              </span>
                              <span className="text-gray-600">
                                Pago:{" "}
                                <strong className="text-green-600">
                                  {formatCurrency(saleBalance.totalPaid)}
                                </strong>
                              </span>
                              <span className="text-gray-600">
                                Falta:{" "}
                                <strong className="text-red-600">
                                  {formatCurrency(saleBalance.remainingBalance)}
                                </strong>
                              </span>
                            </div>

                            {/* Tabela de Parcelas */}
                            <div className="space-y-1">
                              <h4 className="text-xs font-medium text-gray-700 mb-2">
                                Parcelas ({sale.installments.length})
                              </h4>

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
                                            <span className="font-mono text-xs text-gray-500">
                                              #{installment.id_parcela}
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

      {/* General Payment Modal */}
      {isGeneralPaymentModalOpen && (
        <GeneralPaymentModal
          clientGroup={clientGroup}
          clientSales={clientSales}
          onClose={() => setIsGeneralPaymentModalOpen(false)}
          onSuccess={handleGeneralPaymentSuccess}
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
