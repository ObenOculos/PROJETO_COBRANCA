import React, { useState, useEffect } from "react";
import { Clock, Check, X, AlertCircle, User, FileText, Download, Filter, Search, Calendar, TrendingUp } from "lucide-react";

interface AuthRequest {
  token: string;
  collectorName: string;
  clientName: string;
  clientDocument: string;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
  processedAt?: number; // Timestamp when approved/rejected
  processedBy?: string; // Manager who processed the request
}

const AuthorizationManager: React.FC = () => {
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [history, setHistory] = useState<AuthRequest[]>([]);
  const [showExpired, setShowExpired] = useState(false);
  const [activeView, setActiveView] = useState<"current" | "history">("current");
  const [historyFilter, setHistoryFilter] = useState<"all" | "approved" | "rejected" | "expired">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPerPage] = useState(10);

  // Carregar solicitações e histórico do localStorage
  useEffect(() => {
    const loadRequests = () => {
      const storedRequests = JSON.parse(localStorage.getItem("authRequests") || "[]");
      const storedHistory = JSON.parse(localStorage.getItem("authHistory") || "[]");
      setRequests(storedRequests);
      setHistory(storedHistory);
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
    const now = Date.now();
    const updatedRequests = requests.map(req => 
      req.token === token ? { 
        ...req, 
        status: "approved" as const,
        processedAt: now,
        processedBy: "Gerente" // Em produção, pegar do contexto de usuário
      } : req
    );
    setRequests(updatedRequests);
    localStorage.setItem("authRequests", JSON.stringify(updatedRequests));
    
    // Adicionar ao histórico
    const approvedRequest = updatedRequests.find(req => req.token === token);
    if (approvedRequest) {
      const updatedHistory = [...history, approvedRequest];
      setHistory(updatedHistory);
      localStorage.setItem("authHistory", JSON.stringify(updatedHistory));
      
      // Disparar evento para notificar o cobrador
      window.dispatchEvent(new CustomEvent("tokenApproved", { 
        detail: approvedRequest 
      }));
    }
  };

  // Rejeitar solicitação
  const rejectRequest = (token: string) => {
    const now = Date.now();
    const updatedRequests = requests.map(req => 
      req.token === token ? { 
        ...req, 
        status: "rejected" as const,
        processedAt: now,
        processedBy: "Gerente" // Em produção, pegar do contexto de usuário
      } : req
    );
    setRequests(updatedRequests);
    localStorage.setItem("authRequests", JSON.stringify(updatedRequests));
    
    // Adicionar ao histórico
    const rejectedRequest = updatedRequests.find(req => req.token === token);
    if (rejectedRequest) {
      const updatedHistory = [...history, rejectedRequest];
      setHistory(updatedHistory);
      localStorage.setItem("authHistory", JSON.stringify(updatedHistory));
    }
  };

  // Limpar solicitações expiradas
  const clearExpiredRequests = () => {
    const now = Date.now();
    const expiredRequests = requests.filter(req => req.expiresAt <= now);
    const activeRequests = requests.filter(req => req.expiresAt > now);
    
    // Mover expiradas para o histórico
    const expiredWithStatus = expiredRequests.map(req => ({
      ...req,
      status: "expired" as const,
      processedAt: now,
      processedBy: "Sistema"
    }));
    
    if (expiredWithStatus.length > 0) {
      const updatedHistory = [...history, ...expiredWithStatus];
      setHistory(updatedHistory);
      localStorage.setItem("authHistory", JSON.stringify(updatedHistory));
    }
    
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

  // Filtrar histórico
  const getFilteredHistory = () => {
    let filtered = history;
    
    // Filtrar por status
    if (historyFilter !== "all") {
      filtered = filtered.filter(req => {
        if (historyFilter === "expired") {
          return req.expiresAt <= now || req.status === "expired";
        }
        return req.status === historyFilter;
      });
    }
    
    // Filtrar por termo de busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(req => 
        req.collectorName.toLowerCase().includes(term) ||
        req.clientName.toLowerCase().includes(term) ||
        req.clientDocument.includes(term) ||
        req.token.includes(term)
      );
    }
    
    // Filtrar por data
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      const filterStart = new Date(filterDate.setHours(0, 0, 0, 0)).getTime();
      const filterEnd = new Date(filterDate.setHours(23, 59, 59, 999)).getTime();
      filtered = filtered.filter(req => 
        req.requestedAt >= filterStart && req.requestedAt <= filterEnd
      );
    }
    
    // Ordenar por data (mais recente primeiro)
    return filtered.sort((a, b) => b.requestedAt - a.requestedAt);
  };

  // Exportar histórico
  const exportHistory = () => {
    const filteredHistory = getFilteredHistory();
    const csvContent = [
      "Token,Cobrador,Cliente,Documento,Data Solicitação,Data Processamento,Status,Processado Por",
      ...filteredHistory.map(req => [
        req.token,
        req.collectorName,
        req.clientName,
        req.clientDocument,
        new Date(req.requestedAt).toLocaleString('pt-BR'),
        req.processedAt ? new Date(req.processedAt).toLocaleString('pt-BR') : '-',
        req.status === "approved" ? "Aprovado" : req.status === "rejected" ? "Rejeitado" : "Expirado",
        req.processedBy || '-'
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-autorizacoes-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Estatísticas do histórico
  const getHistoryStats = () => {
    const total = history.length;
    const approved = history.filter(req => req.status === "approved").length;
    const rejected = history.filter(req => req.status === "rejected").length;
    const expired = history.filter(req => req.expiresAt <= now || req.status === "expired").length;
    
    const approvalRate = total > 0 ? (approved / total * 100).toFixed(1) : '0.0';
    
    return { total, approved, rejected, expired, approvalRate };
  };

  // Paginação do histórico
  const filteredHistory = getFilteredHistory();
  const totalPages = Math.ceil(filteredHistory.length / historyPerPage);
  const startIndex = (historyPage - 1) * historyPerPage;
  const paginatedHistory = filteredHistory.slice(startIndex, startIndex + historyPerPage);
  const historyStats = getHistoryStats();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">
            Solicitações de Autorização
          </h3>
          <div className="flex items-center gap-3">
            {/* Toggle Views */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setActiveView("current")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeView === "current"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Atuais
              </button>
              <button
                onClick={() => setActiveView("history")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeView === "history"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Histórico
              </button>
            </div>
            
            {activeView === "current" ? (
              <>
                <button
                  onClick={clearExpiredRequests}
                  className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Limpar Expiradas
                </button>
                <span className="text-sm text-gray-500">
                  {pendingRequests.length} pendente{pendingRequests.length !== 1 ? 's' : ''}
                </span>
              </>
            ) : (
              <>
                <button
                  onClick={exportHistory}
                  className="flex items-center px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Exportar
                </button>
                <span className="text-sm text-gray-500">
                  {filteredHistory.length} registro{filteredHistory.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {activeView === "current" ? (
          <div>
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
        ) : (
          <div>
            {/* Estatísticas do Histórico */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800">Total</p>
                    <p className="text-2xl font-bold text-blue-900">{historyStats.total}</p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">Aprovadas</p>
                    <p className="text-2xl font-bold text-green-900">{historyStats.approved}</p>
                  </div>
                  <Check className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-800">Rejeitadas</p>
                    <p className="text-2xl font-bold text-red-900">{historyStats.rejected}</p>
                  </div>
                  <X className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-800">Taxa Aprovação</p>
                    <p className="text-2xl font-bold text-amber-900">{historyStats.approvalRate}%</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-amber-600" />
                </div>
              </div>
            </div>

            {/* Filtros do Histórico */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buscar
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Cobrador, cliente, documento..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">Todos</option>
                    <option value="approved">Aprovadas</option>
                    <option value="rejected">Rejeitadas</option>
                    <option value="expired">Expiradas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data
                  </label>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setHistoryFilter("all");
                      setDateFilter("");
                      setHistoryPage(1);
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Limpar Filtros
                  </button>
                </div>
              </div>
            </div>

            {/* Lista do Histórico */}
            <div className="space-y-3">
              {paginatedHistory.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum registro encontrado</p>
                </div>
              ) : (
                paginatedHistory.map((request) => (
                  <div key={`${request.token}-${request.requestedAt}`} className={`border rounded-lg p-4 ${
                    request.status === "approved" ? "bg-green-50 border-green-200" : 
                    request.status === "rejected" ? "bg-red-50 border-red-200" : 
                    "bg-gray-50 border-gray-200"
                  }`}>
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
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                            Token: {request.token}
                          </span>
                          {request.processedAt && (
                            <span className="text-xs text-gray-500">
                              Processado em: {formatTime(request.processedAt)}
                            </span>
                          )}
                        </div>
                        {request.processedBy && (
                          <div className="text-xs text-gray-500">
                            Processado por: {request.processedBy}
                          </div>
                        )}
                      </div>
                      <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        request.status === "approved" 
                          ? "bg-green-100 text-green-800" 
                          : request.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                      }`}>
                        {request.status === "approved" ? (
                          <><Check className="h-4 w-4 mr-1" /> Aprovado</>
                        ) : request.status === "rejected" ? (
                          <><X className="h-4 w-4 mr-1" /> Rejeitado</>
                        ) : (
                          <><Clock className="h-4 w-4 mr-1" /> Expirado</>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-700">
                  Mostrando {startIndex + 1} a {Math.min(startIndex + historyPerPage, filteredHistory.length)} de {filteredHistory.length} registros
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage(Math.max(1, historyPage - 1))}
                    disabled={historyPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-gray-700">
                    Página {historyPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage(Math.min(totalPages, historyPage + 1))}
                    disabled={historyPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthorizationManager;