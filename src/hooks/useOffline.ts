import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { PaymentDistribution } from '../types';

// Tipos para ações offline
export interface OfflineAction {
  id: string;
  timestamp: string;
  type: 'CREATE_PAYMENT' | 'UPDATE_VISIT' | 'CREATE_COLLECTION' | 'DISTRIBUTE_PAYMENT';
  data: unknown;
  retryCount?: number;
  maxRetries?: number;
  lastError?: string;
}

export interface DistributePaymentAction {
  type: 'DISTRIBUTE_PAYMENT';
  data: {
    saleNumber: number;
    clientDocument: string;
    paymentAmount: number;
    paymentMethod?: string;
    notes?: string;
    collectorId: string;
    distributionDetails: PaymentDistribution[];
  };
}

export const useOffline = () => {
  const [isOnline, setIsOnline] = useState(() => {
    const online = navigator.onLine;
    console.log('🔄 Estado inicial da conexão:', online ? 'ONLINE' : 'OFFLINE');
    return online;
  });
  const [offlineQueue, setOfflineQueue] = useState<OfflineAction[]>(() => {
    // Carregar fila do localStorage na inicialização
    try {
      const stored = localStorage.getItem('offlineQueue');
      const queue = stored ? JSON.parse(stored) : [];
      console.log('📋 Fila offline carregada:', queue.length, 'itens');
      return queue;
    } catch (error) {
      console.error('Erro ao carregar fila offline:', error);
      return [];
    }
  });

  const processOfflineQueue = useCallback(async () => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    if (queue.length === 0) return;

    console.log('Processando fila offline:', queue.length, 'itens');

    let processedCount = 0;
    let failedCount = 0;

    for (const action of queue) {
      try {
        // Aplicar delay exponencial baseado no número de tentativas
        const retryCount = action.retryCount || 0;
        if (retryCount > 0) {
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000); // Max 10 segundos
          console.log(`⏳ Aguardando ${delay}ms antes da tentativa ${retryCount + 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Processar cada ação da fila
        await processAction(action);
        // Remover da fila após sucesso
        removeFromQueue(action.id);
        processedCount++;
        console.log(`✅ Ação ${action.id} processada com sucesso`);
      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`❌ Erro ao processar ação ${action.id}:`, errorMessage);
        
        // Atualizar ação com informações do erro e retry
        const retryCount = (action.retryCount || 0) + 1;
        const maxRetries = action.maxRetries || 3;
        
        if (retryCount <= maxRetries) {
          // Atualizar ação na fila para próxima tentativa
          updateActionInQueue(action.id, {
            retryCount,
            lastError: errorMessage
          });
          console.log(`🔄 Ação ${action.id} será tentada novamente (${retryCount}/${maxRetries})`);
        } else {
          // Remover da fila após esgotar tentativas
          console.log(`⚠️ Ação ${action.id} removida da fila após ${maxRetries} tentativas`);
          removeFromQueue(action.id);
        }
      }
    }

    console.log(`Processamento da fila concluído: ${processedCount} sucessos, ${failedCount} falhas`);
    
    // Mostrar notificação de sincronização
    if (processedCount > 0) {
      showSyncNotification(processedCount, failedCount);
      
      // Disparar evento customizado para atualizar os dados
      window.dispatchEvent(new CustomEvent('offlineDataSynced', {
        detail: { processedCount, failedCount }
      }));
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Conectado online');
      setIsOnline(true);
      // Processar fila de ações offline quando voltar online
      processOfflineQueue();
    };

    const handleOffline = () => {
      console.log('📵 Modo offline detectado');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processOfflineQueue]);

  const addToOfflineQueue = (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount' | 'maxRetries' | 'lastError'>) => {
    console.log('📥 Adicionando à fila offline:', action);
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    const newAction: OfflineAction = {
      ...action,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID(),
      retryCount: 0,
      maxRetries: 3,
      lastError: undefined
    };
    queue.push(newAction);
    localStorage.setItem('offlineQueue', JSON.stringify(queue));
    setOfflineQueue(queue);
    console.log('✅ Ação adicionada à fila. Total de itens:', queue.length);
  };

  const processAction = async (action: OfflineAction) => {
    console.log('Processando ação offline:', action.type, action.id);
    
    switch (action.type) {
      case 'CREATE_PAYMENT':
        await processCreatePayment(action.data);
        break;
      case 'UPDATE_VISIT':
        await processUpdateVisit(action.data);
        break;
      case 'CREATE_COLLECTION':
        await processCreateCollection(action.data);
        break;
      case 'DISTRIBUTE_PAYMENT':
        await processDistributePayment(action.data);
        break;
      default:
        console.warn('Tipo de ação desconhecida:', action.type);
    }
  };

  const processCreatePayment = async (data: unknown) => {
    // TODO: Implementar criação de pagamento
    console.log('Processando criação de pagamento offline:', data);
  };

  const processUpdateVisit = async (data: unknown) => {
    // TODO: Implementar atualização de visita
    console.log('Processando atualização de visita offline:', data);
  };

  const processCreateCollection = async (data: unknown) => {
    // TODO: Implementar criação de cobrança
    console.log('Processando criação de cobrança offline:', data);
  };

  const processDistributePayment = async (data: unknown) => {
    // Type guard para verificar se data tem a estrutura esperada
    if (!data || typeof data !== 'object') {
      throw new Error('Dados inválidos para distribuição de pagamento');
    }
    
    const paymentData = data as DistributePaymentAction['data'];
    try {
      console.log('Processando distribuição de pagamento offline:', paymentData);
      
      // Criar registro de pagamento no banco
      const paymentRecord = {
        sale_number: paymentData.saleNumber,
        client_document: paymentData.clientDocument,
        payment_amount: paymentData.paymentAmount,
        payment_method: paymentData.paymentMethod || 'dinheiro',
        notes: paymentData.notes || '',
        collector_id: paymentData.collectorId,
        payment_date: new Date().toISOString().split('T')[0],
        distribution_details: paymentData.distributionDetails
      };

      const { error: paymentError } = await supabase
        .from('sale_payments')
        .insert(paymentRecord);

      if (paymentError) {
        throw new Error(`Erro ao salvar pagamento: ${paymentError.message}`);
      }

      // Atualizar valores das parcelas
      // IMPORTANTE: Como o pagamento offline é processado depois, 
      // precisamos usar a mesma lógica do processamento online
      console.log('🔄 Processando distribuições offline:', paymentData.distributionDetails);

      for (const distribution of paymentData.distributionDetails) {
        console.log('📝 Processando parcela:', {
          installmentId: distribution.installmentId,
          appliedAmount: distribution.appliedAmount,
          originalAmount: distribution.originalAmount
        });

        // Buscar dados atuais da parcela
        const { data: currentData, error: fetchError } = await supabase
          .from('BANCO_DADOS')
          .select('valor_recebido, valor_original')
          .eq('id_parcela', distribution.installmentId)
          .single();

        if (fetchError) {
          throw new Error(`Erro ao buscar parcela ${distribution.installmentId}: ${fetchError.message}`);
        }

        const currentReceived = currentData?.valor_recebido || 0;
        const originalValue = currentData?.valor_original || 0;
        const appliedAmount = distribution.appliedAmount || 0;
        
        // Calcular novo valor recebido
        const newReceivedValue = currentReceived + appliedAmount;
        
        // Calcular novo status
        const remainingValue = originalValue - newReceivedValue;
        const newStatus = remainingValue <= 0.01 ? "recebido" : "parcialmente_pago";

        console.log('💰 Detalhes do cálculo:', {
          installmentId: distribution.installmentId,
          currentReceived,
          originalValue,
          appliedAmount,
          newReceivedValue,
          remainingValue,
          newStatus
        });

        // Verificações de segurança
        if (appliedAmount <= 0) {
          console.warn('⚠️ Valor aplicado deve ser positivo:', appliedAmount);
          continue;
        }
        
        if (newReceivedValue > originalValue + 0.01) {
          console.warn('⚠️ Valor recebido maior que o original:', {
            newReceived: newReceivedValue,
            original: originalValue
          });
        }

        // Atualizar no banco
        const { error: updateError } = await supabase
          .from('BANCO_DADOS')
          .update({
            valor_recebido: newReceivedValue,
            status: newStatus,
            data_de_recebimento: new Date().toISOString().split('T')[0]
          })
          .eq('id_parcela', distribution.installmentId);

        if (updateError) {
          throw new Error(`Erro ao atualizar parcela ${distribution.installmentId}: ${updateError.message}`);
        }
      }

      console.log('Distribuição de pagamento processada com sucesso');
    } catch (error) {
      console.error('Erro ao processar distribuição de pagamento:', error);
      throw error;
    }
  };

  const showSyncNotification = (processedCount: number, failedCount: number) => {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center';
    
    let message = `${processedCount} pagamento(s) sincronizado(s)`;
    if (failedCount > 0) {
      message += ` (${failedCount} falha(s))`;
    }
    
    notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
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

  const updateActionInQueue = (actionId: string, updates: Partial<OfflineAction>) => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    const updatedQueue = queue.map((item: OfflineAction) => {
      if (item.id === actionId) {
        return { ...item, ...updates };
      }
      return item;
    });
    localStorage.setItem('offlineQueue', JSON.stringify(updatedQueue));
    setOfflineQueue(updatedQueue);
  };

  const removeFromQueue = (actionId: string) => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    const updatedQueue = queue.filter((item: OfflineAction) => item.id !== actionId);
    localStorage.setItem('offlineQueue', JSON.stringify(updatedQueue));
    setOfflineQueue(updatedQueue);
  };

  const retrySyncOfflineQueue = async () => {
    if (!isOnline) {
      console.log('Não é possível sincronizar offline');
      return;
    }
    
    console.log('Tentando sincronizar fila offline manualmente...');
    await processOfflineQueue();
  };

  const clearOfflineQueue = () => {
    localStorage.removeItem('offlineQueue');
    setOfflineQueue([]);
    console.log('Fila offline limpa');
  };

  return {
    isOnline,
    offlineQueue,
    addToOfflineQueue,
    processOfflineQueue,
    retrySyncOfflineQueue,
    clearOfflineQueue
  };
};