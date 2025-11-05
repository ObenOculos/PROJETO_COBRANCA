import React, { useState } from "react";
import {
  X,
  ChevronDown,
  ChevronRight,
  User,
  Edit,
  CreditCard,
  Info,
  Receipt,
} from "lucide-react";
import { ClientGroup } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";

import GeneralPaymentModal from "./GeneralPaymentModal";
import GeneralPaymentEditModal from "./GeneralPaymentEditModal";

interface ClientDetailModalProps {
  clientGroup: ClientGroup;
  userType: "manager" | "collector";
  onClose: () => void;
}

// ============================================
// COMPONENTES AUXILIARES MINIMALISTAS
// ============================================

// Formatar data no padrão brasileiro
const formatDate = (dateString: string | null): string => {
  if (!dateString) return "-";
  
  try {
    let date: Date;
    
    // Verificar se já está no formato brasileiro (dd/mm/yyyy)
    if (dateString.includes('/')) {
      const [day, month, year] = dateString.split('/');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } 
    // Se estiver no formato ISO (yyyy-mm-dd)
    else if (dateString.includes('-')) {
      const dateStr = dateString.includes('T') ? dateString : `${dateString}T00:00:00`;
      date = new Date(dateStr);
    } 
    // Outros formatos
    else {
      date = new Date(dateString);
    }
    
    // Verificar se a data é válida
    if (isNaN(date.getTime())) {
      console.warn('Data inválida:', dateString);
      return dateString; // Retorna a string original se não conseguir converter
    }
    
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (error) {
    console.error('Erro ao formatar data:', dateString, error);
    return dateString; // Retorna a string original em caso de erro
  }
};

// Formatar dias de atraso de forma intuitiva
const formatDaysOverdue = (days: number | null): string => {
  if (!days || days <= 0) return "";
  
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days % 30;
  
  const parts: string[] = [];
  
  if (years > 0) {
    parts.push(`${years}${years === 1 ? 'ano' : 'a'}`);
  }
  if (months > 0) {
    parts.push(`${months}${months === 1 ? 'mês' : 'm'}`);
  }
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays}d`);
  }
  
  return parts.join(' ');
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

// Indicador de status para parcelas (dot)
const InstallmentStatusDot: React.FC<{
  status: string | null;
  daysOverdue: number | null;
}> = ({ status, daysOverdue }) => {
  const isPaid = status?.toLowerCase().includes("pago");
  const isOverdue = (daysOverdue ?? 0) > 0;

  const dotColor = isPaid
    ? "bg-green-500"
    : isOverdue
      ? "bg-red-500"
      : "bg-gray-400";

  return <div className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0`} />;
};

const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  clientGroup,
  userType,
  onClose,
}) => {
  const { getSalesByClient, calculateSaleBalance, refreshCollections } =
    useCollection();
  const { user } = useAuth();

  const [isGeneralPaymentModalOpen, setIsGeneralPaymentModalOpen] =
    useState(false);
  const [isGeneralEditModalOpen, setIsGeneralEditModalOpen] = useState(false);
  const [showClientData, setShowClientData] = useState(false);
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
    const originalBodyOverflow = window.getComputedStyle(document.body).overflow;
    const originalDocElementOverflow = window.getComputedStyle(document.documentElement).overflow;
    
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocElementOverflow;
    };
  }, []);

  // Obter vendas do cliente usando a nova estrutura
  const clientSales = React.useMemo(() => {
    const sales = getSalesByClient(clientGroup.document);
    console.log(
      "Vendas do Cliente recalculadas:",
      sales.map((sale) => ({
        saleNumber: sale.saleNumber,
        totalValue: sale.totalValue,
        totalReceived: sale.totalReceived,
        pendingValue: sale.pendingValue,
      })),
    );
    return sales;
  }, [getSalesByClient, clientGroup.document, refreshKey]);

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
    if ((userType as "manager" | "collector") === "manager") {
      // Gerente pode editar diretamente
      setIsGeneralEditModalOpen(true);
    } else {
      // Cobrador precisa solicitar autorização
      setShowAuthModal(true);
      setAuthError("");
      setAuthToken("");
      setAuthRequestSent(false);
      setIsRequestingAuth(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
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
                <h3 className="text-sm font-medium text-gray-600">Detalhes do Cliente</h3>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                  {clientGroup.client}
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 truncate">
                  {clientGroup.document}
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
          {userType === "collector" && (
            <div className="mt-4 px-4 lg:px-6 py-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                id="view-client-data"
                name="viewClientData"
                onClick={() => setShowClientData(true)}
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
                onClick={() => setShowClientData(false)}
                className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                title="Ver vendas do cliente"
              >
                <Receipt className="h-5 w-5 mr-2" />
                <span className="text-xs sm:text-sm">
                  <span className="sm:hidden">Vendas</span>
                  <span className="hidden sm:inline">Ver Vendas</span>
                </span>
              </button>
              {hasRealPendingValue && (
                <button
                  id="distribute-payment"
                  name="distributePayment"
                  onClick={() => setIsGeneralPaymentModalOpen(true)}
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
                    (userType as "manager" | "collector") === "manager"
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

          {/* Sales and Collections or Client Data */}
          {showClientData ? (
            <div className="overflow-y-auto max-h-[60vh] p-4 lg:p-6">
              <h3 className="text-sm sm:text-lg font-medium text-gray-900 mb-2">
                Dados de Cadastro do Cliente
              </h3>
              <div className="bg-gray-200 p-4 space-y-3 rounded-lg text-xs sm:text-sm text-gray-700">
                {Object.entries(clientGroup)
                  .filter(([key]) =>
                    [
                      "client",
                      "apelido",
                      "document",
                      "address",
                      "number",
                      "neighborhood",
                      "city",
                      "phone",
                      "mobile",
                    ].includes(key),
                  )
                  .map(([key, value]) => {
                    const labelMap: { [key: string]: string } = {
                      client: "Nome do Cliente",
                      apelido: "Apelido",
                      document: "Documento",
                      address: "Endereço",
                      number: "Número",
                      neighborhood: "Bairro",
                      city: "Cidade",
                      phone: "Telefone",
                      mobile: "Celular",
                    };
                    return (
                      <div
                        key={key}
                        className="flex justify-between items-center border-b pb-2 last:border-b-0 last:pb-0"
                      >
                        <span className="font-medium capitalize">
                          {labelMap[key] ||
                            key.replace(/([A-Z])/g, " $1").trim()}
                          :
                        </span>
                        <span className="text-right">
                          {value
                            ? typeof value === "object" && value !== null
                              ? JSON.stringify(value)
                              : String(value)
                            : "-"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              <div className="px-4 lg:px-6 py-4">
                <h3 className="text-sm sm:text-lg font-medium text-gray-900 mb-4">
                  Vendas ({clientSales.length} venda
                  {clientSales.length !== 1 ? "s" : ""})
                </h3>

                <div className="space-y-3">
                  {clientSales.map((sale) => {
                    const saleBalance = calculateSaleBalance(
                      sale.saleNumber,
                      clientGroup.document,
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
                                    Venda #
                                    {sale.saleNumber === 0
                                      ? "Renegociada"
                                      : sale.saleNumber}
                                  </h4>
                                  <StatusBadge status={saleBalance.status} />
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
                                {sale.installments.map((installment) => {
                                  const isPaid =
                                    installment.status
                                      ?.toLowerCase()
                                      .includes("pago") || false;
                                  const isOverdue =
                                    (installment.dias_em_atraso ?? 0) > 0;
                                  
                                  // Usar valor_original se valor_reajustado for 0
                                  const installmentValue = installment.valor_reajustado > 0 
                                    ? installment.valor_reajustado 
                                    : installment.valor_original;

                                  return (
                                    <div
                                      key={installment.id_parcela}
                                      className="flex items-center justify-between py-1.5 px-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded transition-colors"
                                    >
                                      {/* Left: ID, Data, Status */}
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <InstallmentStatusDot
                                          status={installment.status}
                                          daysOverdue={
                                            installment.dias_em_atraso
                                          }
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs text-gray-500">
                                              #{installment.id_parcela}
                                            </span>
                                            {isOverdue && !isPaid && (
                                              <span className="text-xs text-red-600 font-medium">
                                                {formatDaysOverdue(installment.dias_em_atraso)}
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
                                          {formatCurrency(installmentValue)}
                                        </div>
                                        {installment.valor_recebido > 0 && (
                                          <div className="text-xs text-green-600">
                                            ✓{" "}
                                            {formatCurrency(
                                              installment.valor_recebido,
                                            )}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
