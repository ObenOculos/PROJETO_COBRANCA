import React from 'react';
import { WifiOff, Wifi, RefreshCw, X } from 'lucide-react';
import { useOffline } from '../../hooks/useOffline';

const OfflineIndicator: React.FC = () => {
  const { isOnline, offlineQueue, retrySyncOfflineQueue, clearOfflineQueue } = useOffline();

  if (isOnline && offlineQueue.length === 0) {
    return null;
  }

  const paymentActions = offlineQueue.filter(action => action.type === 'DISTRIBUTE_PAYMENT');
  const otherActions = offlineQueue.length - paymentActions.length;

  const handleRetrySync = () => {
    retrySyncOfflineQueue();
  };

  const handleClearQueue = () => {
    if (window.confirm('Tem certeza que deseja limpar a fila offline? Isso removerá todas as ações pendentes.')) {
      clearOfflineQueue();
    }
  };

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 transition-all max-w-sm ${
        isOnline
          ? 'bg-yellow-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      <div className="flex items-center gap-2 flex-1">
        {isOnline ? (
          <>
            <Wifi className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                Sincronizando {offlineQueue.length} ações...
              </div>
              {paymentActions.length > 0 && (
                <div className="text-xs opacity-90">
                  {paymentActions.length} pagamento(s)
                  {otherActions > 0 && `, ${otherActions} outras`}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <WifiOff className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                Modo Offline - {offlineQueue.length} ações na fila
              </div>
              {paymentActions.length > 0 && (
                <div className="text-xs opacity-90">
                  {paymentActions.length} pagamento(s)
                  {otherActions > 0 && `, ${otherActions} outras`}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        {isOnline && offlineQueue.length > 0 && (
          <button
            onClick={handleRetrySync}
            className="p-1 hover:bg-white hover:bg-opacity-20 rounded transition-colors"
            title="Tentar sincronizar novamente"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={handleClearQueue}
          className="p-1 hover:bg-white hover:bg-opacity-20 rounded transition-colors"
          title="Limpar fila offline"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default OfflineIndicator;