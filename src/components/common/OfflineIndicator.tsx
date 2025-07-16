import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOffline } from '../../hooks/useOffline';

const OfflineIndicator: React.FC = () => {
  const { isOnline, offlineQueue } = useOffline();

  if (isOnline && offlineQueue.length === 0) {
    return null;
  }

  const paymentActions = offlineQueue.filter(action => 
    action.type === 'DISTRIBUTE_PAYMENT' || action.type === 'CREATE_PAYMENT'
  );
  const otherActions = offlineQueue.length - paymentActions.length;



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
                Modo Offline
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;