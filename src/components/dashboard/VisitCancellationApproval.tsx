import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  MessageSquare,
  User,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { ScheduledVisit } from "../../types";
import { formatCurrency } from "../../utils/formatters";

interface VisitCancellationApprovalProps {
  onClose?: () => void;
}

const VisitCancellationApproval: React.FC<VisitCancellationApprovalProps> = ({
  onClose,
}) => {
  const {
    getPendingCancellationRequests,
    getCancellationHistory,
    approveVisitCancellation,
    rejectVisitCancellation,
    users,
  } = useCollection();
  const { user } = useAuth();

  const [pendingRequests, setPendingRequests] = useState<ScheduledVisit[]>([]);
  const [cancellationHistory, setCancellationHistory] = useState<
    ScheduledVisit[]
  >([]);
  const [selectedRequest, setSelectedRequest] = useState<ScheduledVisit | null>(
    null,
  );
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<
    "approve" | "reject" | null
  >(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  useEffect(() => {
    // Carregar solicitações pendentes e histórico
    const requests = getPendingCancellationRequests();
    const history = getCancellationHistory(30);
    setPendingRequests(requests);
    setCancellationHistory(history);
  }, [getPendingCancellationRequests, getCancellationHistory]);

  const getCollectorName = (collectorId: string) => {
    const collector = users.find((u) => u.id === collectorId);
    return collector?.name || "Cobrador não encontrado";
  };

  const formatSafeDateTime = (dateString: string, timeString?: string) => {
    try {
      const date = new Date(dateString);
      const dateFormatted = date.toLocaleDateString("pt-BR");
      return `${dateFormatted} às ${timeString || "00:00"}`;
    } catch {
      return `${dateString} às ${timeString || "00:00"}`;
    }
  };

  const formatSafeDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("pt-BR");
    } catch {
      return dateString;
    }
  };

  const handleOpenApproval = (
    request: ScheduledVisit,
    action: "approve" | "reject",
  ) => {
    setSelectedRequest(request);
    setApprovalAction(action);
    setShowApprovalModal(true);
    setRejectionReason("");
  };

  const handleCloseApproval = () => {
    setSelectedRequest(null);
    setApprovalAction(null);
    setShowApprovalModal(false);
    setRejectionReason("");
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || !user || !approvalAction) return;

    if (approvalAction === "reject" && !rejectionReason.trim()) {
      alert("Por favor, informe o motivo da rejeição");
      return;
    }

    try {
      setLoading(true);

      if (approvalAction === "approve") {
        await approveVisitCancellation(selectedRequest.id, user.id);
        showSuccessNotification("Cancelamento aprovado com sucesso");
      } else {
        await rejectVisitCancellation(
          selectedRequest.id,
          user.id,
          rejectionReason.trim(),
        );
        showSuccessNotification("Cancelamento rejeitado com sucesso");
      }

      // Atualizar lista de solicitações pendentes e histórico
      const updatedRequests = getPendingCancellationRequests();
      const updatedHistory = getCancellationHistory(30);
      setPendingRequests(updatedRequests);
      setCancellationHistory(updatedHistory);

      handleCloseApproval();
    } catch (error) {
      console.error("Erro ao processar solicitação:", error);
      alert("Erro ao processar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const showSuccessNotification = (message: string) => {
    const notification = document.createElement("div");
    notification.className =
      "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center";
    notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      ${message}
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-lg">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-pink-600 text-white px-4 lg:px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 mr-3" />
              <div>
                <h2 className="text-lg lg:text-xl font-bold">
                  Aprovação de Cancelamentos
                </h2>
                <p className="text-red-100 text-sm lg:text-base">
                  Gerencie solicitações de cancelamento de visitas
                </p>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Abas */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 lg:px-6 py-3 font-medium transition-colors relative ${
                activeTab === "pending"
                  ? "border-b-2 border-red-500 text-red-600"
                  : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Solicitações Pendentes
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 lg:px-6 py-3 font-medium transition-colors ${
                activeTab === "history"
                  ? "border-b-2 border-red-500 text-red-600"
                  : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Histórico (30 dias)
            </button>
          </div>
        </div>

        <div className="p-4 lg:p-6">
          {activeTab === "pending" ? (
            /* Lista de Solicitações Pendentes */
            <>
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    Nenhuma solicitação de cancelamento pendente
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    Todas as solicitações foram processadas
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Solicitações Pendentes ({pendingRequests.length})
                    </h3>
                  </div>

                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="border border-red-200 rounded-lg p-3 lg:p-4 bg-red-50"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-3 lg:space-y-0">
                        <div className="flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-3">
                            <div className="font-semibold text-gray-900 mb-1 sm:mb-0">
                              {request.clientName}
                            </div>
                            <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 w-fit">
                              Cancelamento Solicitado
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4 text-sm text-gray-600 mb-3">
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-2" />
                                {formatSafeDateTime(
                                  request.scheduledDate,
                                  request.scheduledTime,
                                )}
                              </div>
                              <div className="flex items-center">
                                <User className="h-4 w-4 mr-2" />
                                Cobrador:{" "}
                                {getCollectorName(request.collectorId)}
                              </div>
                              <div className="flex items-center">
                                <MapPin className="h-4 w-4 mr-2" />
                                {request.clientAddress}
                              </div>
                            </div>

                            <div className="space-y-2">
                              {request.totalPendingValue && (
                                <div className="flex items-center">
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  Pendente:{" "}
                                  {formatCurrency(request.totalPendingValue)}
                                </div>
                              )}
                              {request.cancellationRequestDate && (
                                <div className="flex items-center">
                                  <Clock className="h-4 w-4 mr-2" />
                                  Solicitado em:{" "}
                                  {formatSafeDate(
                                    request.cancellationRequestDate,
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {request.cancellationRequestReason && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                              <div className="flex items-start">
                                <MessageSquare className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0 mt-0.5" />
                                <div>
                                  <div className="text-sm font-medium text-gray-700 mb-1">
                                    Motivo do cancelamento:
                                  </div>
                                  <div className="text-sm text-gray-600 italic">
                                    "{request.cancellationRequestReason}"
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {request.notes && (
                            <div className="text-sm text-gray-500 italic mb-3">
                              Observações da visita: "{request.notes}"
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-3 lg:ml-4">
                          <button
                            onClick={() =>
                              handleOpenApproval(request, "approve")
                            }
                            className="px-3 lg:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center text-sm lg:text-base"
                            title="Aprovar cancelamento"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </button>
                          <button
                            onClick={() =>
                              handleOpenApproval(request, "reject")
                            }
                            className="px-3 lg:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center text-sm lg:text-base"
                            title="Rejeitar cancelamento"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Histórico de Cancelamentos */
            <>
              {cancellationHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    Nenhum cancelamento nos últimos 30 dias
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    O histórico aparecerá aqui conforme as decisões forem
                    tomadas
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base lg:text-lg font-semibold text-gray-900">
                      Histórico dos últimos 30 dias (
                      {cancellationHistory.length}{" "}
                      {cancellationHistory.length === 1
                        ? "decisão"
                        : "decisões"}
                      )
                    </h3>
                  </div>

                  {cancellationHistory.map((visit) => {
                    const isApproved =
                      visit.status === "cancelada" &&
                      visit.cancellationApprovedBy;
                    const isRejected =
                      visit.status === "agendada" &&
                      visit.cancellationRejectedBy;
                    const decisionDate = isApproved
                      ? visit.cancellationApprovedAt
                      : visit.cancellationRejectedAt;
                    const decisionBy = isApproved
                      ? visit.cancellationApprovedBy
                      : visit.cancellationRejectedBy;

                    return (
                      <div
                        key={visit.id}
                        className={`border rounded-lg p-3 lg:p-4 ${
                          isApproved
                            ? "border-green-200 bg-green-50"
                            : "border-red-200 bg-red-50"
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-3 lg:space-y-0">
                          <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-3">
                              <div className="font-semibold text-gray-900 mb-1 sm:mb-0">
                                {visit.clientName}
                              </div>
                              <span
                                className={`px-2 py-1 rounded-full text-xs w-fit ${
                                  isApproved
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {isApproved
                                  ? "Cancelamento Aprovado"
                                  : "Cancelamento Rejeitado"}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4 text-sm text-gray-600 mb-3">
                              <div className="space-y-2">
                                <div className="flex items-center">
                                  <Calendar className="h-4 w-4 mr-2" />
                                  Visita:{" "}
                                  {formatSafeDateTime(
                                    visit.scheduledDate,
                                    visit.scheduledTime,
                                  )}
                                </div>
                                <div className="flex items-center">
                                  <User className="h-4 w-4 mr-2" />
                                  Cobrador:{" "}
                                  {getCollectorName(visit.collectorId)}
                                </div>
                                <div className="flex items-center">
                                  <MapPin className="h-4 w-4 mr-2" />
                                  {visit.clientAddress}
                                </div>
                              </div>

                              <div className="space-y-2">
                                {visit.totalPendingValue && (
                                  <div className="flex items-center">
                                    <DollarSign className="h-4 w-4 mr-2" />
                                    Pendente:{" "}
                                    {formatCurrency(visit.totalPendingValue)}
                                  </div>
                                )}
                                {decisionDate && (
                                  <div className="flex items-center">
                                    <Clock className="h-4 w-4 mr-2" />
                                    Decidido em: {formatSafeDate(decisionDate)}
                                  </div>
                                )}
                                <div className="flex items-center">
                                  <User className="h-4 w-4 mr-2" />
                                  Decidido por:{" "}
                                  {getCollectorName(decisionBy || "")}
                                </div>
                              </div>
                            </div>

                            {visit.cancellationRequestReason && (
                              <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                                <div className="flex items-start">
                                  <MessageSquare className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <div className="text-sm font-medium text-gray-700 mb-1">
                                      Motivo da solicitação:
                                    </div>
                                    <div className="text-sm text-gray-600 italic">
                                      "{visit.cancellationRequestReason}"
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {isRejected &&
                              visit.cancellationRejectionReason && (
                                <div className="bg-white border border-red-200 rounded-lg p-3 mb-3">
                                  <div className="flex items-start">
                                    <XCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-sm font-medium text-red-700 mb-1">
                                        Motivo da rejeição:
                                      </div>
                                      <div className="text-sm text-red-600 italic">
                                        "{visit.cancellationRejectionReason}"
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                            {visit.notes && (
                              <div className="text-sm text-gray-500 italic">
                                Observações da visita: "{visit.notes}"
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de Confirmação */}
      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {approvalAction === "approve" ? "Aprovar" : "Rejeitar"}{" "}
                Cancelamento
              </h3>
            </div>

            <div className="px-4 lg:px-6 py-4">
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Cliente:</strong> {selectedRequest.clientName}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Data:</strong>{" "}
                  {formatSafeDateTime(
                    selectedRequest.scheduledDate,
                    selectedRequest.scheduledTime,
                  )}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Cobrador:</strong>{" "}
                  {getCollectorName(selectedRequest.collectorId)}
                </div>
              </div>

              {selectedRequest.cancellationRequestReason && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium text-gray-700 mb-1">
                    Motivo solicitado:
                  </div>
                  <div className="text-sm text-gray-600 italic">
                    "{selectedRequest.cancellationRequestReason}"
                  </div>
                </div>
              )}

              {approvalAction === "reject" && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo da rejeição *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explique por que está rejeitando esta solicitação..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    required
                  />
                </div>
              )}

              <div
                className={`border rounded-lg p-3 mb-4 ${
                  approvalAction === "approve"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-start">
                  {approvalAction === "approve" ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  )}
                  <div
                    className={`text-sm ${
                      approvalAction === "approve"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {approvalAction === "approve" ? (
                      <>
                        <strong>Confirmar aprovação:</strong> A visita será
                        cancelada e o cobrador será notificado.
                      </>
                    ) : (
                      <>
                        <strong>Confirmar rejeição:</strong> A visita
                        permanecerá agendada e o cobrador será notificado da
                        rejeição.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 lg:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
              <button
                onClick={handleCloseApproval}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={
                  loading ||
                  (approvalAction === "reject" && !rejectionReason.trim())
                }
                className={`w-full sm:w-auto px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
                  approvalAction === "approve"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                ) : approvalAction === "approve" ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                <span className="ml-2">
                  {loading
                    ? "Processando..."
                    : approvalAction === "approve"
                      ? "Aprovar"
                      : "Rejeitar"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VisitCancellationApproval;
