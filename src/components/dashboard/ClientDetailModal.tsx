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
import { ClientGroup, SaleGroup } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";
import SalePaymentModal from "./SalePaymentModal";
import GeneralPaymentModal from "./GeneralPaymentModal";
import GeneralPaymentEditModal from "./GeneralPaymentEditModal";

interface ClientDetailModalProps {
  clientGroup: ClientGroup;
  userType: "manager" | "collector";
  onClose: () => void;
}

const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  clientGroup,
  userType,
  onClose,
}) => {
  const { getSalesByClient, calculateSaleBalance } = useCollection();
  const { user } = useAuth();
  const [selectedSaleForPayment, setSelectedSaleForPayment] =
    useState<SaleGroup | null>(null);
  const [isSalePaymentModalOpen, setIsSalePaymentModalOpen] = useState(false);
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

  const handleOpenSalePayment = (sale: SaleGroup) => {
    setSelectedSaleForPayment(sale);
    setIsSalePaymentModalOpen(true);
  };

  const handleCloseSalePayment = () => {
    setSelectedSaleForPayment(null);
    setIsSalePaymentModalOpen(false);
  };

  const handlePaymentSuccess = () => {
    // Forçar uma nova renderização
    setRefreshKey((prev) => prev + 1);
    handleCloseSalePayment();
  };

  const handleGeneralPaymentSuccess = () => {
    // Forçar uma nova renderização
    setRefreshKey((prev) => prev + 1);
    setIsGeneralPaymentModalOpen(false);
  };

  const handleGeneralEditSuccess = () => {
    // Forçar uma nova renderização
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-4 lg:px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center flex-1 min-w-0">
              <User className="h-6 w-6 text-blue-600 mr-3 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-lg lg:text-xl font-semibold text-gray-900 truncate">
                  {clientGroup.client}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 truncate">
                  {clientGroup.document}
                </p>
              </div>
            </div>
            <button
              id="close-modal"
              name="closeModal"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
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
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
                title="Ver todos os dados de cadastro do cliente"
              >
                <Info className="h-5 w-5 mr-2" />
                <span className="text-xs sm:text-sm">Ver Dados</span>
              </button>
              <button
                id="view-client-sales"
                name="viewClientSales"
                onClick={() => setShowClientData(false)}
                className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                title="Ver vendas do cliente"
              >
                <Receipt className="h-5 w-5 mr-2" />
                <span className="text-xs sm:text-sm">Ver Vendas</span>
              </button>
              {clientSales.reduce((sum, sale) => sum + sale.pendingValue, 0) >
                0 && (
                <button
                  id="distribute-payment"
                  name="distributePayment"
                  onClick={() => setIsGeneralPaymentModalOpen(true)}
                  className="flex items-center px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm"
                  title="Distribuir pagamento entre parcelas"
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  <span className="text-xs sm:text-sm">
                    Distribuir Pagamento
                  </span>
                </button>
              )}

              {clientSales.reduce((sum, sale) => sum + sale.totalReceived, 0) >
                0 && (
                <button
                  id="edit-payments"
                  name="editPayments"
                  onClick={handleEditPaymentClick}
                  className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium shadow-sm"
                  title={
                    (userType as "manager" | "collector") === "manager"
                      ? "Editar valores recebidos"
                      : "Solicitar autorização para editar pagamentos"
                  }
                >
                  <Edit className="h-5 w-5 mr-2" />
                  <span className="text-xs sm:text-sm">Editar Pagamentos</span>
                </button>
              )}
            </div>
          )}

          {/* Sales and Collections or Client Data */}
          {showClientData ? (
            <div className="overflow-y-auto max-h-[60vh] p-4 lg:p-6">
              <h3 className="text-sm sm:text-lg font-medium text-gray-900 mb-4">
                Dados de Cadastro do Cliente
              </h3>
              <div className="space-y-3 text-xs sm:text-sm text-gray-700">
                {Object.entries(clientGroup)
                  .filter(([key]) =>
                    [
                      "client",
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
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        {/* Sale Header */}
                        <div className="px-4 py-3 bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div
                              id={`sale-expansion-${sale.saleNumber}`}
                              className="flex items-center flex-1 cursor-pointer hover:bg-gray-100 p-2 rounded-lg -m-2"
                              onClick={() =>
                                toggleSaleExpansion(sale.saleNumber)
                              }
                            >
                              <div className="mr-3">
                                {expandedSales.has(sale.saleNumber) ? (
                                  <ChevronDown className="h-5 w-5 text-gray-400" />
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-gray-400" />
                                )}
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900">
                                  Venda {sale.saleNumber}
                                </h4>
                                <p className="text-xs sm:text-sm text-gray-600">
                                  {sale.installments.length} parcela
                                  {sale.installments.length !== 1 ? "s" : ""}
                                </p>
                                <div className="flex items-center mt-1">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      saleBalance.status === "fully_paid"
                                        ? "bg-green-100 text-green-800"
                                        : saleBalance.status ===
                                            "partially_paid"
                                          ? "bg-yellow-100 text-yellow-800"
                                          : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    {saleBalance.status === "fully_paid"
                                      ? "Pago Integralmente"
                                      : saleBalance.status === "partially_paid"
                                        ? "Parcialmente Pago"
                                        : "Pendente"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-xs sm:text-sm font-medium text-gray-900">
                                  {formatCurrency(sale.totalValue)}
                                </div>
                                <div className="text-xs text-green-600 font-medium">
                                  Pago: {formatCurrency(saleBalance.totalPaid)}
                                </div>
                                <div className="text-xs text-red-600 font-medium">
                                  Restante:{" "}
                                  {formatCurrency(saleBalance.remainingBalance)}
                                </div>
                              </div>

                              {/* Botão de Pagamento por Venda */}
                              {userType === "collector" &&
                                saleBalance.remainingBalance > 0 && (
                                  <button
                                    id={`receive-payment-${sale.saleNumber}`}
                                    name={`receivePayment${sale.saleNumber}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenSalePayment(sale);
                                    }}
                                    className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
                                    title="Receber pagamento da venda"
                                  >
                                    <CreditCard className="h-4 w-4 mr-1" />
                                    <span className="text-xs sm:text-sm">
                                      Receber
                                    </span>
                                  </button>
                                )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Sale Details */}
                        {expandedSales.has(sale.saleNumber) && (
                          <div className="px-4 py-3 bg-gray-50">
                            <div className="space-y-3">
                              {/* Sale Summary */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="text-center p-3 bg-blue-50 rounded-lg">
                                  <div className="text-sm sm:text-base lg:text-lg font-bold text-blue-600">
                                    {formatCurrency(
                                      saleBalance.totalValue,
                                      false,
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Valor Total
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-green-50 rounded-lg">
                                  <div className="text-sm sm:text-lg font-bold text-green-600">
                                    {formatCurrency(saleBalance.totalPaid)}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Já Pago
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-red-50 rounded-lg">
                                  <div className="text-sm sm:text-lg font-bold text-red-600">
                                    {formatCurrency(
                                      saleBalance.remainingBalance,
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Saldo Devedor
                                  </div>
                                </div>
                              </div>

                              {/* Additional Info */}
                              <div className="text-xs sm:text-sm text-gray-600 pt-2 border-t border-gray-200">
                                <div className="flex justify-between items-center">
                                  <span>Número de parcelas:</span>
                                  <span className="font-medium">
                                    {sale.installments.length}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <span>Status da venda:</span>
                                  <span
                                    className={`font-medium ${
                                      saleBalance.status === "fully_paid"
                                        ? "text-green-600"
                                        : saleBalance.status ===
                                            "partially_paid"
                                          ? "text-yellow-600"
                                          : "text-red-600"
                                    }`}
                                  >
                                    {saleBalance.status === "fully_paid"
                                      ? "Quitada"
                                      : saleBalance.status === "partially_paid"
                                        ? "Parcial"
                                        : "Pendente"}
                                  </span>
                                </div>
                              </div>
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

      {/* Sale Payment Modal */}
      {isSalePaymentModalOpen && selectedSaleForPayment && (
        <SalePaymentModal
          saleGroup={selectedSaleForPayment}
          onClose={handleCloseSalePayment}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Authorization Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
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
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
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
                      className="flex-1 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      id="request-auth"
                      name="requestAuth"
                      onClick={requestManagerAuth}
                      disabled={isRequestingAuth}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRequestingAuth
                        ? "Solicitando..."
                        : "Solicitar Autorização"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {showApprovalNotification ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 animate-pulse">
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
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-sm sm:text-lg font-mono"
                      placeholder="000000"
                      maxLength={6}
                      onKeyDown={(e) => e.key === "Enter" && validateToken()}
                    />
                  </div>

                  {authError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
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
                      className="flex-1 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      id="validate-token"
                      name="validateToken"
                      onClick={validateToken}
                      disabled={authToken.length !== 6}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="w-full px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs sm:text-sm"
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
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
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
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
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
