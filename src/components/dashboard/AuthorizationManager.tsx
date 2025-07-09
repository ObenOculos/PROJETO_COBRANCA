import React, { useState, useEffect } from "react";
import { Clock, Check, X, AlertCircle, User, FileText, Download, Filter, Search, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";
import { AuthorizationHistory } from "../../types";
import { useAuth } from "../../contexts/AuthContext";

// Remove the old interface since we're using AuthorizationHistory from types

const AuthorizationManager: React.FC = () => {
  const { user } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<AuthorizationHistory[]>([]);
  const [processedRequests, setProcessedRequests] = useState<AuthorizationHistory[]>([]);
  const [expiredRequests, setExpiredRequests] = useState<AuthorizationHistory[]>([]);
  const [historyData, setHistoryData] = useState<AuthorizationHistory[]>([]);
  const [showExpired, setShowExpired] = useState(false);
  const [activeView, setActiveView] = useState<"current" | "history">("current");
  const [historyFilter, setHistoryFilter] = useState<"all" | "approved" | "rejected" | "expired">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    approvalRate: 0
  });
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);

  // Carregar dados do Supabase
  const loadCurrentRequests = async () => {
    try {
      const [pending, processed, expired] = await Promise.all([
        AuthorizationHistoryService.getPendingRequests(),
        AuthorizationHistoryService.getRecentlyProcessedRequests(),
        AuthorizationHistoryService.getExpiredRequests()
      ]);

      setPendingRequests(pending);
      setProcessedRequests(processed);
      setExpiredRequests(expired);
    } catch (error) {
      console.error('Erro ao carregar solicitações:', error);
    }
  };

  const loadHistoryData = async () => {
    try {
      const { data, total, totalPages } = await AuthorizationHistoryService.getAuthorizationHistory({
        status: historyFilter,
        searchTerm,
        dateFilter,
        page: historyPage,
        limit: historyPerPage
      });

      setHistoryData(data);
      setHistoryTotal(total);
      setHistoryTotalPages(totalPages);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await AuthorizationHistoryService.getAuthorizationStats();
      setStats(statsData);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  };

  // Carregar dados iniciais
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([
        loadCurrentRequests(),
        loadStats()
      ]);
      setLoading(false);
    };

    loadInitialData();

    // Listener para novas solicitações
    const handleNewRequest = (event: CustomEvent) => {
      loadCurrentRequests();
      // Notificação sonora (opcional)
      if ('Notification' in window) {
        new Notification('Nova solicitação de autorização', {
          body: `${event.detail.collectorName} solicitou autorização para editar pagamentos`,
          icon: '/favicon.ico'
        });
      }
    };

    window.addEventListener('authRequestCreated', handleNewRequest as EventListener);
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(loadCurrentRequests, 30000);

    return () => {
      window.removeEventListener('authRequestCreated', handleNewRequest as EventListener);
      clearInterval(interval);
    };
  }, []);

  // Recarregar histórico quando filtros mudarem
  useEffect(() => {
    if (activeView === 'history') {
      loadHistoryData();
    }
  }, [activeView, historyFilter, searchTerm, dateFilter, historyPage]);

  // Aprovar solicitação
  const approveRequest = async (token: string) => {
    if (!user) return;
    
    setActionLoading(token);
    try {
      const approvedRequest = await AuthorizationHistoryService.approveRequest(
        token,
        user.id,
        user.name
      );
      
      // Atualizar listas locais
      await loadCurrentRequests();
      await loadStats();
      
      // Disparar evento para notificar o cobrador
      window.dispatchEvent(new CustomEvent("tokenApproved", { 
        detail: {
          token: approvedRequest.token,
          clientDocument: approvedRequest.client_document,
          collectorName: approvedRequest.collector_name
        }
      }));
      
    } catch (error) {
      console.error('Erro ao aprovar solicitação:', error);
      // Aqui você pode adicionar uma notificação de erro
    } finally {
      setActionLoading(null);
    }
  };

  // Rejeitar solicitação
  const rejectRequest = async (token: string) => {
    if (!user) return;
    
    setActionLoading(token);
    try {
      const rejectedRequest = await AuthorizationHistoryService.rejectRequest(
        token,
        user.id,
        user.name
      );
      
      // Disparar evento para notificar o cobrador
      window.dispatchEvent(new CustomEvent("tokenRejected", { 
        detail: {
          token: rejectedRequest.token,
          clientDocument: rejectedRequest.client_document,
          collectorName: rejectedRequest.collector_name
        }
      }));
      
      // Atualizar listas locais
      await loadCurrentRequests();
      await loadStats();
      
    } catch (error) {
      console.error('Erro ao rejeitar solicitação:', error);
      // Aqui você pode adicionar uma notificação de erro
    } finally {
      setActionLoading(null);
    }
  };

  // Limpar solicitações expiradas
  const clearExpiredRequests = async () => {
    try {
      await AuthorizationHistoryService.markExpiredRequests();
      await loadCurrentRequests();
      await loadStats();
    } catch (error) {
      console.error('Erro ao limpar solicitações expiradas:', error);
    }
  };

  // Funções utilitárias
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return "Expirado";
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Exportar histórico
  const exportHistory = async () => {
    try {
      const csvContent = await AuthorizationHistoryService.exportAuthorizationHistory({
        status: historyFilter,
        searchTerm,
        dateFilter
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historico-autorizacoes-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar histórico:', error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600">Carregando solicitações...</span>
          </div>
        </div>
      </div>
    );
  }

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
                  {historyTotal} registro{historyTotal !== 1 ? 's' : ''}
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
                      <span className="font-medium text-gray-900">{request.collector_name}</span>
                      <span className="text-xs text-gray-500">
                        {formatTime(request.requested_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-gray-600" />
                      <span className="text-sm text-gray-700">
                        {request.client_name} ({request.client_document})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        Token: {request.token}
                      </span>
                      <span className="text-xs text-amber-600">
                        Expira em: {getTimeRemaining(request.expires_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => approveRequest(request.token)}
                      disabled={actionLoading === request.token}
                      className="flex items-center px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                    >
                      {actionLoading === request.token ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      Aprovar
                    </button>
                    <button
                      onClick={() => rejectRequest(request.token)}
                      disabled={actionLoading === request.token}
                      className="flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                    >
                      {actionLoading === request.token ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <X className="h-4 w-4 mr-1" />
                      )}
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
                      <span className="font-medium text-gray-900">{request.collector_name}</span>
                      <span className="text-xs text-gray-500">
                        {formatTime(request.requested_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        {request.token}
                      </span>
                      <span className="text-sm text-gray-700">
                        {request.client_name}
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
                      <span className="font-medium text-gray-900">{request.collector_name}</span>
                      <span className="text-xs text-gray-500">
                        {formatTime(request.requested_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        {request.token}
                      </span>
                      <span className="text-sm text-gray-700">
                        {request.client_name}
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
                    <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">Aprovadas</p>
                    <p className="text-2xl font-bold text-green-900">{stats.approved}</p>
                  </div>
                  <Check className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-800">Rejeitadas</p>
                    <p className="text-2xl font-bold text-red-900">{stats.rejected}</p>
                  </div>
                  <X className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-800">Taxa Aprovação</p>
                    <p className="text-2xl font-bold text-amber-900">{stats.approvalRate.toFixed(1)}%</p>
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
              {historyData.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum registro encontrado</p>
                </div>
              ) : (
                historyData.map((request) => (
                  <div key={`${request.token}-${request.requested_at}`} className={`border rounded-lg p-4 ${
                    request.status === "approved" ? "bg-green-50 border-green-200" : 
                    request.status === "rejected" ? "bg-red-50 border-red-200" : 
                    "bg-gray-50 border-gray-200"
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-gray-600" />
                          <span className="font-medium text-gray-900">{request.collector_name}</span>
                          <span className="text-xs text-gray-500">
                            {formatTime(request.requested_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-700">
                            {request.client_name} ({request.client_document})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                            Token: {request.token}
                          </span>
                          {request.processed_at && (
                            <span className="text-xs text-gray-500">
                              Processado em: {formatTime(request.processed_at)}
                            </span>
                          )}
                        </div>
                        {request.processed_by_name && (
                          <div className="text-xs text-gray-500">
                            Processado por: {request.processed_by_name}
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
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-700">
                  Mostrando {((historyPage - 1) * historyPerPage) + 1} a {Math.min(historyPage * historyPerPage, historyTotal)} de {historyTotal} registros
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
                    Página {historyPage} de {historyTotalPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage(Math.min(historyTotalPages, historyPage + 1))}
                    disabled={historyPage === historyTotalPages}
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