import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOffline } from '../../hooks/useOffline';

const OfflineIndicator: React.FC = () => {
  const { isOnline, offlineQueue } = useOffline();

  if (isOnline && offlineQueue.length === 0) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 transition-all ${
        isOnline
          ? 'bg-yellow-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-5 h-5" />
          <span>Sincronizando {offlineQueue.length} ações pendentes...</span>
        </>
      ) : (
        <>
          <WifiOff className="w-5 h-5" />
          <span>Modo Offline - {offlineQueue.length} ações na fila</span>
        </>
      )}
    </div>
  );
};

export default OfflineIndicator;