import { useState, useEffect } from 'react';

export const useOffline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Processar fila de ações offline quando voltar online
      processOfflineQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const addToOfflineQueue = (action: any) => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    queue.push({
      ...action,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID()
    });
    localStorage.setItem('offlineQueue', JSON.stringify(queue));
    setOfflineQueue(queue);
  };

  const processOfflineQueue = async () => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    if (queue.length === 0) return;

    console.log('Processando fila offline:', queue.length, 'itens');

    for (const action of queue) {
      try {
        // Processar cada ação da fila
        await processAction(action);
        // Remover da fila após sucesso
        removeFromQueue(action.id);
      } catch (error) {
        console.error('Erro ao processar ação offline:', error);
      }
    }
  };

  const processAction = async (action: any) => {
    // Implementar lógica específica para cada tipo de ação
    switch (action.type) {
      case 'CREATE_PAYMENT':
        // Implementar criação de pagamento
        break;
      case 'UPDATE_VISIT':
        // Implementar atualização de visita
        break;
      case 'CREATE_COLLECTION':
        // Implementar criação de cobrança
        break;
      default:
        console.warn('Tipo de ação desconhecida:', action.type);
    }
  };

  const removeFromQueue = (actionId: string) => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    const updatedQueue = queue.filter((item: any) => item.id !== actionId);
    localStorage.setItem('offlineQueue', JSON.stringify(updatedQueue));
    setOfflineQueue(updatedQueue);
  };

  return {
    isOnline,
    offlineQueue,
    addToOfflineQueue,
    processOfflineQueue
  };
};