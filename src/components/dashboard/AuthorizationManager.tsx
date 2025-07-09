import React, { useState, useEffect } from "react";
import { Clock, Check, X, AlertCircle, User, FileText } from "lucide-react";

interface AuthRequest {
  token: string;
  collectorName: string;
  clientName: string;
  clientDocument: string;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "rejected";
}

const AuthorizationManager: React.FC = () => {
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [showExpired, setShowExpired] = useState(false);

  // Carregar solicitações do localStorage
  useEffect(() => {
    const loadRequests = () => {
      const storedRequests = JSON.parse(localStorage.getItem("authRequests") || "[]");
      setRequests(storedRequests);
    };

    loadRequests();

    // Listener para novas solicitações
    const handleNewRequest = (event: CustomEvent) => {
      loadRequests();
      // Notificação sonora (opcional)
      if ('Notification' in window) {
        new Notification('Nova solicitação de autorização', {
          body: `${event.detail.collectorName} solicitou autorização para editar pagamentos`,
          icon: '/favicon.ico'
        });
      }
    };

    window.addEventListener('authRequestCreated', handleNewRequest as EventListener);
    
    // Atualizar a cada 10 segundos
    const interval = setInterval(loadRequests, 10000);

    return () => {
      window.removeEventListener('authRequestCreated', handleNewRequest as EventListener);
      clearInterval(interval);
    };
  }, []);

  // Aprovar solicitação
  const approveRequest = (token: string) => {
    const updatedRequests = requests.map(req => 
      req.token === token ? { ...req, status: "approved" as const } : req
    );
    setRequests(updatedRequests);
    localStorage.setItem("authRequests", JSON.stringify(updatedRequests));
    
    // Disparar evento para notificar o cobrador
    const approvedRequest = updatedRequests.find(req => req.token === token);
    if (approvedRequest) {
      window.dispatchEvent(new CustomEvent("tokenApproved", { 
        detail: approvedRequest 
      }));
    }
  };

  // Rejeitar solicitação
  const rejectRequest = (token: string) => {
    const updatedRequests = requests.map(req => 
      req.token === token ? { ...req, status: "rejected" as const } : req
    );
    setRequests(updatedRequests);
    localStorage.setItem("authRequests", JSON.stringify(updatedRequests));
  };

  // Limpar solicitações expiradas
  const clearExpiredRequests = () => {
    const now = Date.now();
    const activeRequests = requests.filter(req => req.expiresAt > now);
    setRequests(activeRequests);
    localStorage.setItem("authRequests", JSON.stringify(activeRequests));
  };

  // Filtrar solicitações
  const now = Date.now();
  const pendingRequests = requests.filter(req => req.status === "pending" && req.expiresAt > now);
  const expiredRequests = requests.filter(req => req.expiresAt <= now);
  const processedRequests = requests.filter(req => req.status !== "pending" && req.expiresAt > now);

  // Formatar tempo
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Calcular tempo restante
  const getTimeRemaining = (expiresAt: number) => {
    const remaining = expiresAt - now;
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">
            Solicitações de Autorização
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={clearExpiredRequests}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Limpar Expiradas
            </button>
            <span className="text-sm text-gray-500">
              {pendingRequests.length} pendente{pendingRequests.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Solicitações Pendentes */}
        {pendingRequests.length > 0 && (
          <div className="space-y-3 mb-6">
            <h4 className="text-sm font-medium text-gray-700 flex items-center">
              <Clock className="h-4 w-4 mr-2 text-amber-500" />
              Aguardando Aprovação
            </h4>
            {pendingRequests.map((request) => (
              <div key={request.token} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-gray-600" />
                      <span className="font-medium text-gray-900">{request.collectorName}</span>
                      <span className="text-xs text-gray-500">
                        {formatTime(request.requestedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-gray-600" />
                      <span className="text-sm text-gray-700">
                        {request.clientName} ({request.clientDocument})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        Token: {request.token}
                      </span>
                      <span className="text-xs text-amber-600">
                        Expira em: {getTimeRemaining(request.expiresAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => approveRequest(request.token)}
                      className="flex items-center px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Aprovar
                    </button>
                    <button
                      onClick={() => rejectRequest(request.token)}
                      className="flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Rejeitar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Solicitações Processadas */}
        {processedRequests.length > 0 && (
          <div className="space-y-3 mb-6">
            <h4 className="text-sm font-medium text-gray-700">Processadas Recentemente</h4>
            {processedRequests.map((request) => (
              <div key={request.token} className={`border rounded-lg p-4 ${
                request.status === "approved" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-gray-600" />
                      <span className="font-medium text-gray-900">{request.collectorName}</span>
                      <span className="text-xs text-gray-500">
                        {formatTime(request.requestedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        {request.token}
                      </span>
                      <span className="text-sm text-gray-700">
                        {request.clientName}
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center px-3 py-1 rounded-full text-sm ${
                    request.status === "approved" 
                      ? "bg-green-100 text-green-800" 
                      : "bg-red-100 text-red-800"
                  }`}>
                    {request.status === "approved" ? (
                      <><Check className="h-4 w-4 mr-1" /> Aprovado</>
                    ) : (
                      <><X className="h-4 w-4 mr-1" /> Rejeitado</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Solicitações Expiradas */}
        {expiredRequests.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowExpired(!showExpired)}
              className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
              Expiradas ({expiredRequests.length})
              {showExpired ? " - Ocultar" : " - Mostrar"}
            </button>
            {showExpired && expiredRequests.map((request) => (
              <div key={request.token} className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-gray-600" />
                      <span className="font-medium text-gray-900">{request.collectorName}</span>
                      <span className="text-xs text-gray-500">
                        {formatTime(request.requestedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        {request.token}
                      </span>
                      <span className="text-sm text-gray-700">
                        {request.clientName}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-red-600 font-medium">
                    Expirado
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Estado vazio */}
        {pendingRequests.length === 0 && processedRequests.length === 0 && expiredRequests.length === 0 && (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Nenhuma solicitação de autorização</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthorizationManager;