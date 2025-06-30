import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  CollectionContextType, 
  Collection, 
  User, 
  CollectorStore,
  CollectionAttempt,
  DashboardStats,
  CollectorPerformance,
  ClientGroup,
  SaleGroup,
  FilterOptions,
  SalePayment,
  SalePaymentInput,
  SaleBalance,
  PaymentDistribution,
  ScheduledVisit
} from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useLoading } from './LoadingContext';

const CollectionContext = createContext<CollectionContextType | undefined>(undefined);

export const useCollection = () => {
  const context = useContext(CollectionContext);
  if (context === undefined) {
    throw new Error('useCollection must be used within a CollectionProvider');
  }
  return context;
};

interface CollectionProviderProps {
  children: React.ReactNode;
}

export const CollectionProvider: React.FC<CollectionProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { setLoading: setGlobalLoading } = useLoading();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [collectorStores, setCollectorStores] = useState<CollectorStore[]>([]);
  const [salePayments, setSalePayments] = useState<SalePayment[]>([]);
  const [scheduledVisits, setScheduledVisits] = useState<ScheduledVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado para controlar se é o primeiro carregamento
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    // Só carregar dados se o usuário estiver logado
    if (user) {
      console.log('Usuário logado, carregando dados...');
      
      // Só mostra loading global se não for o carregamento inicial
      if (!isInitialLoad) {
        setGlobalLoading(true, 'Carregando dados do sistema...');
      }
      
      Promise.all([
        fetchUsers(),
        fetchCollectorStores(),
        fetchCollections(),
        fetchSalePayments(),
        fetchScheduledVisits()
      ]).finally(() => {
        if (!isInitialLoad) {
          setGlobalLoading(false);
        }
        setLoading(false);
        setIsInitialLoad(false);
      });
    } else {
      console.log('Usuário não logado, limpando dados...');
      setCollections([]);
      setUsers([]);
      setCollectorStores([]);
      setSalePayments([]);
      setScheduledVisits([]);
      setLoading(false);
      if (!isInitialLoad) {
        setGlobalLoading(false);
      }
    }
  }, [user]);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Buscando dados da tabela BANCO_DADOS...');
      
      // Primeiro, verificar o total de registros no banco
      const { count, error: countError } = await supabase
        .from('BANCO_DADOS')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        console.error('Erro ao contar registros:', countError);
      } else {
        console.log('Total de registros no banco:', count);
      }
      
      // Carregar TODOS os dados sem limite
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`Carregando registros ${from} a ${from + pageSize - 1}...`);
        
        const { data: pageData, error: pageError } = await supabase
          .from('BANCO_DADOS')
          .select('*')
          .range(from, from + pageSize - 1)
          .order('id_parcela', { ascending: true });
          
        if (pageError) {
          console.error('Erro ao carregar página:', pageError);
          throw pageError;
        }
        
        if (pageData && pageData.length > 0) {
          allData = allData.concat(pageData);
          console.log(`Carregados ${pageData.length} registros. Total acumulado: ${allData.length}`);
          
          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        } else {
          hasMore = false;
        }
      }
      
      console.log('TOTAL FINAL de registros carregados:', allData.length);
      const data = allData;

      if (!data || data.length === 0) {
        console.warn('Nenhum dado retornado do Supabase');
        setCollections([]);
        return;
      }

      console.log('Dados carregados:', data.length, 'registros');
      
      // Verificar quantos clientes únicos temos nos dados carregados
      const uniqueDocuments = new Set();
      data.forEach(row => {
        if (row.documento && row.documento.trim() !== '') {
          uniqueDocuments.add(row.documento.trim());
        }
      });
      console.log('Clientes únicos nos dados carregados:', uniqueDocuments.size);
      console.log('Primeiros 10 documentos:', Array.from(uniqueDocuments).slice(0, 10));
      
      // Debug: verificar formato das datas
      const sampleDates = data.slice(0, 5).map(row => ({
        data_vencimento: row.data_vencimento,
        data_lancamento: row.data_lancamento,
        data_de_recebimento: row.data_de_recebimento
      }));
      console.log('Amostras de datas:', sampleDates);

      // Transformar os dados para corresponder à interface Collection
      
      const transformedData: Collection[] = (data || []).map(row => ({
        id_parcela: row.id_parcela,
        nome_da_loja: row.nome_da_loja,
        data_lancamento: row.data_lancamento,
        data_vencimento: row.data_vencimento,
        valor_original: parseFloat(row.valor_original || '0'),
        valor_reajustado: parseFloat(row.valor_reajustado || '0'),
        multa: parseFloat(row.multa || '0'),
        juros_por_dia: parseFloat(row.juros_por_dia || '0'),
        multa_aplicada: parseFloat(row.multa_aplicada || '0'),
        juros_aplicado: parseFloat(row.juros_aplicado || '0'),
        valor_recebido: parseFloat(row.valor_recebido || '0'),
        data_de_recebimento: row.data_de_recebimento,
        dias_em_atraso: row.dias_em_atraso,
        dias_carencia: parseFloat(row.dias_carencia || '0'),
        desconto: parseFloat(row.desconto || '0'),
        acrescimo: parseFloat(row.acrescimo || '0'),
        multa_paga: parseFloat(row.multa_paga || '0'),
        juros_pago: parseFloat(row.juros_pago || '0'),
        tipo_de_cobranca: row.tipo_de_cobranca,
        numero_titulo: row.numero_titulo,
        parcela: row.parcela,
        status: row.status,
        cliente: row.cliente,
        documento: row.documento,
        endereco: row.endereco,
        numero: row.numero,
        bairro: row.bairro,
        complemento: row.complemento,
        cep: row.cep,
        cidade: row.cidade,
        estado: row.estado,
        obs: row.obs,
        codigo_externo: row.codigo_externo,
        descricao: row.descricao,
        venda_n: row.venda_n,
        convenio: row.convenio,
        telefone: row.telefone,
        celular: row.celular,
        celular1: row.celular1,
        celular2: row.celular2,
        email: row.email,
        user_id: row.user_id,
        data_visita_agendada: row.data_visita_agendada,
        data_visita_realizada: row.data_visita_realizada,
        data_recebimento: row.data_recebimento,
        updated_at: row.updated_at,
      }));

      setCollections(transformedData);
      console.log('Collections carregadas:', transformedData.length);
    } catch (err) {
      console.error('Erro ao carregar collections:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      console.log('Buscando usuários...');
      
      const { data, error: supabaseError } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true });

      if (supabaseError) {
        console.error('Erro ao buscar usuários:', supabaseError);
        throw supabaseError;
      }

      const transformedUsers: User[] = (data || []).map(user => ({
        id: user.id,
        name: user.name,
        login: user.login,
        password: user.password,
        type: user.type as 'manager' | 'collector',
        createdAt: user.created_at || new Date().toISOString(),
      }));

      setUsers(transformedUsers);
      console.log('Usuários carregados:', transformedUsers.length);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  };

  const fetchCollectorStores = async () => {
    try {
      console.log('Buscando atribuições de lojas...');
      
      const { data, error: supabaseError } = await supabase
        .from('collector_stores')
        .select('*')
        .order('created_at', { ascending: true });

      if (supabaseError) {
        console.error('Erro ao buscar collector_stores:', supabaseError);
        throw supabaseError;
      }

      const transformedStores: CollectorStore[] = (data || []).map(store => ({
        id: store.id,
        collectorId: store.collector_id,
        storeName: store.store_name,
        createdAt: store.created_at || new Date().toISOString(),
      }));

      setCollectorStores(transformedStores);
      console.log('Atribuições de lojas carregadas:', transformedStores.length);
    } catch (err) {
      console.error('Erro ao carregar collector stores:', err);
    }
  };

  const updateCollection = async (id: number, updates: Partial<Collection>) => {
    try {
      // Converter updates para formato do banco
      const dbUpdates: any = {};
      
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.valor_recebido !== undefined) dbUpdates.valor_recebido = updates.valor_recebido.toString();
      if (updates.data_de_recebimento !== undefined) dbUpdates.data_de_recebimento = updates.data_de_recebimento;
      if (updates.obs !== undefined) dbUpdates.obs = updates.obs;
      if (updates.user_id !== undefined) dbUpdates.user_id = updates.user_id;

      const { error: supabaseError } = await supabase
        .from('BANCO_DADOS')
        .update(dbUpdates)
        .eq('id_parcela', id);

      if (supabaseError) {
        throw supabaseError;
      }

      // Atualizar estado local
      setCollections(prev => 
        prev.map(collection => 
          collection.id_parcela === id ? { ...collection, ...updates } : collection
        )
      );

      console.log('Collection atualizada:', id, updates);
    } catch (err) {
      console.error('Erro ao atualizar collection:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar cobrança');
    }
  };

  const assignCollectorToStore = async (collectorId: string, storeName: string) => {
    try {
      console.log('Atribuindo loja ao cobrador:', { collectorId, storeName });
      
      // Verificar se a atribuição já existe
      const existingAssignment = collectorStores.find(
        cs => cs.collectorId === collectorId && cs.storeName === storeName
      );

      if (existingAssignment) {
        console.log('Atribuição já existe');
        setError('Esta loja já está atribuída a este cobrador');
        return;
      }

      const { data, error: supabaseError } = await supabase
        .from('collector_stores')
        .insert({
          collector_id: collectorId,
          store_name: storeName,
        })
        .select();

      if (supabaseError) {
        console.error('Erro do Supabase ao atribuir loja:', supabaseError);
        throw supabaseError;
      }

      console.log('Resposta do Supabase:', data);

      // Recarregar as atribuições
      await fetchCollectorStores();
      console.log('Loja atribuída com sucesso');
      setError(null);
    } catch (err) {
      console.error('Erro ao atribuir loja ao cobrador:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atribuir loja ao cobrador');
    }
  };

  const removeCollectorFromStore = async (collectorId: string, storeName: string) => {
    try {
      console.log('Removendo loja do cobrador:', { collectorId, storeName });
      
      const { error: supabaseError } = await supabase
        .from('collector_stores')
        .delete()
        .eq('collector_id', collectorId)
        .eq('store_name', storeName);

      if (supabaseError) {
        console.error('Erro do Supabase ao remover loja:', supabaseError);
        throw supabaseError;
      }

      await fetchCollectorStores();
      console.log('Loja removida com sucesso');
      setError(null);
    } catch (err) {
      console.error('Erro ao remover loja do cobrador:', err);
      setError(err instanceof Error ? err.message : 'Erro ao remover loja do cobrador');
    }
  };


  const addAttempt = async (collectionId: number, attempt: Omit<CollectionAttempt, 'id'>) => {
    try {
      const { error: supabaseError } = await supabase
        .from('collection_attempts')
        .insert({
          collection_id: collectionId.toString(),
          date: attempt.date,
          type: attempt.type,
          result: attempt.result,
          notes: attempt.notes,
          next_action: attempt.nextAction,
          next_action_date: attempt.nextActionDate,
        });

      if (supabaseError) {
        throw supabaseError;
      }

      console.log('Tentativa adicionada para cobrança:', collectionId, attempt);
    } catch (err) {
      console.error('Erro ao adicionar tentativa:', err);
      setError(err instanceof Error ? err.message : 'Erro ao adicionar tentativa');
    }
  };

  const addUser = async (user: Omit<User, 'id' | 'createdAt'>) => {
    try {
      const { error: supabaseError } = await supabase
        .from('users')
        .insert({
          name: user.name,
          login: user.login,
          password: user.password,
          type: user.type,
        });

      if (supabaseError) {
        throw supabaseError;
      }

      await fetchUsers();
    } catch (err) {
      console.error('Erro ao adicionar usuário:', err);
      setError(err instanceof Error ? err.message : 'Erro ao adicionar usuário');
    }
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.login !== undefined) dbUpdates.login = updates.login;
      if (updates.password !== undefined) dbUpdates.password = updates.password;
      if (updates.type !== undefined) dbUpdates.type = updates.type;

      const { error: supabaseError } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', id);

      if (supabaseError) {
        throw supabaseError;
      }

      await fetchUsers();
    } catch (err) {
      console.error('Erro ao atualizar usuário:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar usuário');
    }
  };

  const deleteUser = async (id: string) => {
    try {
      const { error: supabaseError } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (supabaseError) {
        throw supabaseError;
      }

      await fetchUsers();
    } catch (err) {
      console.error('Erro ao deletar usuário:', err);
      setError(err instanceof Error ? err.message : 'Erro ao deletar usuário');
    }
  };

  const getFilteredCollections = (filters: FilterOptions, userType: 'manager' | 'collector', collectorId?: string): Collection[] => {
    let filtered = collections;

    // Filtrar por cobrador se o usuário for cobrador
    if (userType === 'collector' && collectorId) {
      // Obter lojas atribuídas a este cobrador
      const assignedStores = getCollectorStores(collectorId);
      filtered = filtered.filter(c => 
        c.user_id === collectorId || 
        (assignedStores.includes(c.nome_da_loja || ''))
      );
    }

    // Helper function to parse date strings (supports multiple formats)
    const parseDate = (dateStr: string): Date | null => {
      if (!dateStr) return null;
      
      try {
        const cleanDateStr = dateStr.trim();
        
        // Handle Brazilian format DD/MM/YYYY
        if (cleanDateStr.includes('/')) {
          const parts = cleanDateStr.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            const dayNum = parseInt(day, 10);
            const monthNum = parseInt(month, 10);
            const yearNum = parseInt(year, 10);
            
            if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
              return new Date(yearNum, monthNum - 1, dayNum);
            }
          }
        }
        
        // Handle ISO format and other standard formats
        const date = new Date(cleanDateStr);
        return isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    };

    // Apply overdueOnly filter
    if (filters.overdueOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      filtered = filtered.filter(c => {
        const dueDate = parseDate(c.data_vencimento || '');
        if (!dueDate) return false;
        dueDate.setHours(0, 0, 0, 0);
        
        const isOverdue = dueDate < today;
        const isPending = (c.valor_recebido || 0) < (c.valor_original || 0);
        return isOverdue && isPending;
      });
    }

    // Apply highValueOnly filter
    if (filters.highValueOnly) {
      filtered = filtered.filter(c => (c.valor_original || 0) > 1000);
    }

    // Apply amount range filters - based on total client amount, not individual installments
    if ((filters.minAmount !== undefined && filters.minAmount > 0) || 
        (filters.maxAmount !== undefined && filters.maxAmount > 0)) {
      
      // Group collections by client to calculate total pending amount
      const clientGroups = new Map<string, Collection[]>();
      filtered.forEach(c => {
        const key = `${c.documento}-${c.cliente}`;
        if (!clientGroups.has(key)) {
          clientGroups.set(key, []);
        }
        clientGroups.get(key)!.push(c);
      });
      
      // Filter clients based on their total pending amount
      const targetClientKeys = new Set<string>();
      clientGroups.forEach((clientCollections, clientKey) => {
        const totalValue = clientCollections.reduce((sum, c) => sum + c.valor_original, 0);
        const totalReceived = clientCollections.reduce((sum, c) => sum + c.valor_recebido, 0);
        const pendingValue = totalValue - totalReceived;
        
        let includeClient = true;
        
        // Check minimum amount
        if (filters.minAmount !== undefined && filters.minAmount > 0) {
          includeClient = includeClient && pendingValue >= filters.minAmount;
        }
        
        // Check maximum amount
        if (filters.maxAmount !== undefined && filters.maxAmount > 0) {
          includeClient = includeClient && pendingValue <= filters.maxAmount;
        }
        
        if (includeClient) {
          targetClientKeys.add(clientKey);
        }
      });
      
      // Filter collections of clients that meet the criteria
      filtered = filtered.filter(c => {
        const key = `${c.documento}-${c.cliente}`;
        return targetClientKeys.has(key);
      });
    }

    // Apply existing status filter
    if (filters.status) {
      // Para filtros 'parcial' e 'pago', precisamos de lógica especial para status do cliente
      if (filters.status?.toLowerCase() === 'parcial' || filters.status?.toLowerCase() === 'pago') {
        // Agrupar por cliente para verificar status do cliente
        const clientGroups = new Map<string, Collection[]>();
        filtered.forEach(c => {
          const key = `${c.documento}-${c.cliente}`;
          if (!clientGroups.has(key)) {
            clientGroups.set(key, []);
          }
          clientGroups.get(key)!.push(c);
        });
        
        // Filtrar clientes baseado no status solicitado
        const targetClientKeys = new Set<string>();
        clientGroups.forEach((clientCollections, clientKey) => {
          const totalValue = clientCollections.reduce((sum, c) => sum + c.valor_original, 0);
          const totalReceived = clientCollections.reduce((sum, c) => sum + c.valor_recebido, 0);
          const pendingValue = totalValue - totalReceived;
          
          if (filters.status?.toLowerCase() === 'parcial') {
            // Cliente é parcial se tem valor recebido E ainda tem valor pendente
            if (totalReceived > 0 && pendingValue > 0) {
              targetClientKeys.add(clientKey);
            }
          } else if (filters.status?.toLowerCase() === 'pago') {
            // Cliente é pago apenas se não tem nenhum valor pendente E tem valor recebido (completamente quitado)
            if (pendingValue <= 0.01 && totalReceived > 0) {
              targetClientKeys.add(clientKey);
            }
          }
        });
        
        // Filtrar collections dos clientes que atendem ao critério
        filtered = filtered.filter(c => {
          const key = `${c.documento}-${c.cliente}`;
          return targetClientKeys.has(key);
        });
      } else {
        // Para outros filtros, usar lógica de parcela individual
        filtered = filtered.filter(c => {
          // Determinar o status real da parcela baseado na lógica de negócio
          const valorRecebido = c.valor_recebido || 0;
          const valorOriginal = c.valor_original || 0;
          
          let realStatus: string;
          
          if (valorRecebido === 0) {
            realStatus = 'pendente';
          } else if (valorRecebido >= valorOriginal) {
            realStatus = 'pago';
          } else {
            realStatus = 'parcial';
          }
          
          // Se existe um status explícito, normalizar manualmente
          if (c.status) {
            const status = c.status.toLowerCase();
            if (['recebido', 'pago', 'paid', 'received', 'quitado', 'finalizado'].includes(status)) {
              realStatus = 'pago';
            } else if (['parcialmente_pago', 'parcialmente pago', 'pago parcial', 'partial', 'parcial'].includes(status)) {
              realStatus = 'parcial';
            } else {
              realStatus = 'pendente';
            }
          }
          
          return realStatus === filters.status?.toLowerCase();
        });
      }
    }

    if (filters.dueDate) {
      filtered = filtered.filter(c => c.data_vencimento === filters.dueDate);
    }

    if (filters.collector) {
      filtered = filtered.filter(c => c.user_id === filters.collector);
    }

    if (filters.store) {
      filtered = filtered.filter(c => c.nome_da_loja === filters.store);
    }

    if (filters.city) {
      filtered = filtered.filter(c => c.cidade === filters.city);
    }

    if (filters.neighborhood) {
      filtered = filtered.filter(c => c.bairro === filters.neighborhood);
    }

    // Filtro por período de data de vencimento (dateFrom/dateTo)
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(c => {
        if (!c.data_vencimento) return false;
        
        const dueDate = parseDate(c.data_vencimento);
        if (!dueDate) return false;
        
        let matchesDateRange = true;
        
        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          if (!isNaN(fromDate.getTime())) {
            fromDate.setHours(0, 0, 0, 0);
            dueDate.setHours(0, 0, 0, 0);
            matchesDateRange = matchesDateRange && dueDate >= fromDate;
          }
        }
        
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          if (!isNaN(toDate.getTime())) {
            // Adicionar 23:59:59 para incluir todo o dia final
            toDate.setHours(23, 59, 59, 999);
            dueDate.setHours(0, 0, 0, 0);
            matchesDateRange = matchesDateRange && dueDate <= toDate;
          }
        }
        
        return matchesDateRange;
      });
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(c => 
        c.cliente?.toLowerCase().includes(searchLower) ||
        c.documento?.toLowerCase().includes(searchLower) ||
        c.numero_titulo?.toString().includes(searchLower) ||
        c.venda_n?.toString().includes(searchLower)
      );
    }

    return filtered;
  };

  const getClientGroups = (collectorId?: string): ClientGroup[] => {
    let filteredCollections = collections;
    
    if (collectorId) {
      const assignedStores = getCollectorStores(collectorId);
      filteredCollections = collections.filter(c => 
        c.user_id === collectorId || 
        (assignedStores.includes(c.nome_da_loja || ''))
      );
    }

    const clientMap = new Map<string, ClientGroup>();

    filteredCollections.forEach(collection => {
      if (!collection.cliente || !collection.documento) return;
      
      const clientId = collection.documento; // Usando documento como identificador único
      
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          clientId,
          client: collection.cliente,
          document: collection.documento,
          phone: collection.telefone || undefined,
          mobile: collection.celular || undefined,
          address: collection.endereco || '',
          number: collection.numero || '',
          neighborhood: collection.bairro || '',
          city: collection.cidade || '',
          state: collection.estado || '',
          sales: [],
          totalValue: 0,
          totalReceived: 0,
          pendingValue: 0,
        });
      }

      const clientGroup = clientMap.get(clientId)!;
      
      // Agrupar por número da venda (venda_n)
      let saleGroup = clientGroup.sales.find(s => s.saleNumber === collection.venda_n);
      if (!saleGroup && collection.venda_n) {
        saleGroup = {
          saleNumber: collection.venda_n,
          titleNumber: collection.numero_titulo || 0,
          description: collection.descricao || '',
          installments: [],
          totalValue: 0,
          totalReceived: 0,
          pendingValue: 0,
          saleStatus: 'pending',
          payments: [],
          clientDocument: collection.documento || '',
        };
        clientGroup.sales.push(saleGroup!);
      }

      if (saleGroup) {
        saleGroup.installments.push(collection);
        
        // Arredondar para 2 casas decimais para evitar problemas de precisão
        const roundTo2Decimals = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
        
        saleGroup.totalValue = roundTo2Decimals(saleGroup.totalValue + collection.valor_original);
        saleGroup.totalReceived = roundTo2Decimals(saleGroup.totalReceived + collection.valor_recebido);
        
        // Calcular valor pendente corretamente
        const pendingForThisInstallment = roundTo2Decimals(collection.valor_original - collection.valor_recebido);
        if (pendingForThisInstallment > 0.01) {
          saleGroup.pendingValue = roundTo2Decimals(saleGroup.pendingValue + pendingForThisInstallment);
        }
      }

      // Arredondar para 2 casas decimais para evitar problemas de precisão
      const roundTo2Decimals = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
      
      clientGroup.totalValue = roundTo2Decimals(clientGroup.totalValue + collection.valor_original);
      clientGroup.totalReceived = roundTo2Decimals(clientGroup.totalReceived + collection.valor_recebido);
      
      // Calcular valor pendente corretamente
      const pendingForThisCollection = roundTo2Decimals(collection.valor_original - collection.valor_recebido);
      if (pendingForThisCollection > 0.01) {
        clientGroup.pendingValue = roundTo2Decimals(clientGroup.pendingValue + pendingForThisCollection);
      }
    });

    return Array.from(clientMap.values()).sort((a, b) => a.client.localeCompare(b.client));
  };

  const getDashboardStats = (): DashboardStats => {
    const totalPending = collections.filter(c => c.status?.toLowerCase() === 'pendente').length;
    const totalOverdue = collections.filter(c => c.dias_em_atraso && c.dias_em_atraso > 0).length;
    const totalReceived = collections.filter(c => c.status?.toLowerCase() === 'recebido' || c.valor_recebido > 0).length;
    const totalAmount = collections.reduce((sum, c) => sum + c.valor_original, 0);
    const receivedAmount = collections.reduce((sum, c) => sum + c.valor_recebido, 0);
    const pendingAmount = totalAmount - receivedAmount;
    const conversionRate = collections.length > 0 ? (totalReceived / collections.length) * 100 : 0;
    const collectorsCount = users.filter(u => u.type === 'collector').length;

    return {
      totalPending,
      totalOverdue,
      totalReceived,
      totalAmount,
      receivedAmount,
      pendingAmount,
      conversionRate,
      collectorsCount,
    };
  };

  const getCollectorPerformance = (): CollectorPerformance[] => {
    const collectors = users.filter(u => u.type === 'collector');
    
    return collectors.map(collector => {
      const assignedStores = getCollectorStores(collector.id);
      const collectorCollections = collections.filter(c => 
        c.user_id === collector.id || 
        (assignedStores.includes(c.nome_da_loja || ''))
      );
      
      // Agrupar por venda (venda_n + documento)
      const salesMap = new Map<string, {
        totalValue: number;
        receivedValue: number;
        status: 'pendente' | 'parcial' | 'pago';
        installments: Collection[];
      }>();

      collectorCollections.forEach(collection => {
        const saleKey = `${collection.venda_n}-${collection.documento}`;
        if (!salesMap.has(saleKey)) {
          salesMap.set(saleKey, {
            totalValue: 0,
            receivedValue: 0,
            status: 'pendente',
            installments: []
          });
        }
        
        const sale = salesMap.get(saleKey)!;
        sale.totalValue += collection.valor_original;
        sale.receivedValue += collection.valor_recebido;
        sale.installments.push(collection);
      });

      // Determinar status das vendas
      salesMap.forEach((sale) => {
        const pendingValue = sale.totalValue - sale.receivedValue;
        if (sale.receivedValue > 0 && pendingValue > 0) {
          sale.status = 'parcial';
        } else if (pendingValue <= 0.01 && sale.receivedValue > 0) {
          sale.status = 'pago';
        } else {
          sale.status = 'pendente';
        }
      });

      const salesArray = Array.from(salesMap.values());
      const totalAssigned = salesArray.length; // Total de vendas atribuídas
      const totalReceived = salesArray.filter(s => s.status === 'pago').length; // Vendas totalmente pagas
      const totalAmount = salesArray.reduce((sum, s) => sum + s.totalValue, 0);
      const receivedAmount = salesArray.reduce((sum, s) => sum + s.receivedValue, 0);
      const conversionRate = totalAssigned > 0 ? (totalReceived / totalAssigned) * 100 : 0;
      
      // Calcular tempo médio (simplificado)
      const averageTime = 15; // Valor mock

      return {
        collectorId: collector.id,
        collectorName: collector.name,
        totalAssigned,
        totalReceived,
        totalAmount,
        receivedAmount,
        conversionRate,
        averageTime,
      };
    });
  };

  const getCollectorCollections = (collectorId: string): Collection[] => {
    const assignedStores = getCollectorStores(collectorId);
    return collections.filter(c => 
      c.user_id === collectorId || 
      (assignedStores.includes(c.nome_da_loja || ''))
    );
  };

  const getAvailableStores = (): string[] => {
    const stores = new Set<string>();
    collections.forEach(c => {
      if (c.nome_da_loja) {
        stores.add(c.nome_da_loja);
      }
    });
    return Array.from(stores).sort();
  };

  const getCollectorStores = (collectorId: string): string[] => {
    return collectorStores
      .filter(cs => cs.collectorId === collectorId)
      .map(cs => cs.storeName);
  };

  const refreshData = async () => {
    setGlobalLoading(true, 'Atualizando dados...');
    try {
      await Promise.all([
        fetchCollections(),
        fetchUsers(),
        fetchCollectorStores(),
        fetchSalePayments(),
        fetchScheduledVisits()
      ]);
    } finally {
      setGlobalLoading(false);
    }
  };

  const assignCollectorToClients = async (collectorId: string, documentos: string[]) => {
    try {
      setGlobalLoading(true, 'Atribuindo clientes ao cobrador...');
      setLoading(true);
      
      console.log(`Iniciando atribuição de ${documentos.length} clientes ao cobrador ${collectorId}`);
      
      // Processar em lotes (Limite de 200 clientes por operação para performance e estabilidade)
      const batchSize = 200; // Tamanho do lote - máximo recomendado
      
      if (documentos.length > batchSize) {
        console.log(`⚠️ Processamento em lotes: ${Math.ceil(documentos.length / batchSize)} lotes de ${batchSize} clientes`);
      }
      let totalParcelasAtualizadas = 0;
      
      for (let i = 0; i < documentos.length; i += batchSize) {
        const batch = documentos.slice(i, i + batchSize);
        console.log(`Processando lote ${Math.floor(i / batchSize) + 1}: ${batch.length} documentos`);
        
        // Buscar todas as parcelas dos clientes deste lote
        const { data: parcelas, error: fetchError } = await supabase
          .from('BANCO_DADOS')
          .select('id_parcela')
          .in('documento', batch);

        if (fetchError) {
          console.error('Erro ao buscar parcelas do lote:', fetchError);
          throw fetchError;
        }

        if (!parcelas || parcelas.length === 0) {
          console.warn(`Nenhuma parcela encontrada para este lote de ${batch.length} clientes`);
          continue;
        }

        console.log(`Encontradas ${parcelas.length} parcelas para este lote`);

        // Atualizar todas as parcelas com o novo cobrador
        const { error: updateError } = await supabase
          .from('BANCO_DADOS')
          .update({ user_id: collectorId })
          .in('id_parcela', parcelas.map(p => p.id_parcela));

        if (updateError) {
          console.error('Erro ao atualizar parcelas do lote:', updateError);
          throw updateError;
        }

        totalParcelasAtualizadas += parcelas.length;
        console.log(`Lote processado com sucesso. Total de parcelas atualizadas até agora: ${totalParcelasAtualizadas}`);
      }

      await refreshData();
      console.log(`✅ Atribuição concluída: ${documentos.length} clientes (${totalParcelasAtualizadas} parcelas) atribuídos ao cobrador ${collectorId}`);
    } catch (err) {
      console.error('Erro ao atribuir cobrador aos clientes:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atribuir cobrador');
      throw err;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const removeCollectorFromClients = async (documentos: string[]) => {
    try {
      setGlobalLoading(true, 'Removendo cobrador dos clientes...');
      setLoading(true);
      console.log(`Removendo cobrador de ${documentos.length} clientes`);
      
      // Processar em lotes para evitar problemas de performance
      const batchSize = 200;
      let totalParcelasAtualizadas = 0;

      for (let i = 0; i < documentos.length; i += batchSize) {
        const batch = documentos.slice(i, i + batchSize);
        console.log(`Processando lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(documentos.length / batchSize)} (${batch.length} clientes)`);
        
        // Buscar todas as parcelas dos clientes neste lote
        const { data: parcelas, error: fetchError } = await supabase
          .from('BANCO_DADOS')
          .select('id_parcela')
          .in('documento', batch);

        if (fetchError) {
          console.error('Erro ao buscar parcelas do lote:', fetchError);
          throw fetchError;
        }

        if (!parcelas || parcelas.length === 0) {
          console.warn(`Nenhuma parcela encontrada para este lote de ${batch.length} clientes`);
          continue;
        }

        console.log(`Encontradas ${parcelas.length} parcelas para este lote`);

        // Atualizar todas as parcelas para remover o cobrador
        const { error: updateError } = await supabase
          .from('BANCO_DADOS')
          .update({ user_id: null })
          .in('id_parcela', parcelas.map(p => p.id_parcela));

        if (updateError) {
          console.error('Erro ao atualizar parcelas do lote:', updateError);
          throw updateError;
        }

        totalParcelasAtualizadas += parcelas.length;
        console.log(`Lote processado com sucesso. Total de parcelas atualizadas até agora: ${totalParcelasAtualizadas}`);
      }

      await refreshData();
      console.log(`✅ Remoção concluída: ${documentos.length} clientes (${totalParcelasAtualizadas} parcelas) removidos do cobrador`);
    } catch (err) {
      console.error('Erro ao remover cobrador dos clientes:', err);
      setError(err instanceof Error ? err.message : 'Erro ao remover cobrador');
      throw err;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  // === SALE PAYMENT FUNCTIONS ===
  
  const fetchSalePayments = async () => {
    try {
      console.log('Buscando pagamentos de venda...');
      
      // Simular dados de pagamentos por enquanto (pode ser implementado com Supabase depois)
      // Por enquanto, vamos calcular dos dados existentes
      setSalePayments([]);
      
    } catch (err) {
      console.error('Erro ao carregar pagamentos de venda:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar pagamentos');
    }
  };

  // Algoritmo de distribuição de pagamento
  const distributeSalePayment = (
    installments: Collection[],
    paymentAmount: number
  ): { updatedInstallments: Collection[]; distributionDetails: PaymentDistribution[] } => {
    console.log('Distribuindo pagamento:', paymentAmount, 'entre', installments.length, 'parcelas');
    
    // 1. Filtrar apenas parcelas pendentes
    const pendingInstallments = installments.filter(inst => 
      inst.valor_recebido < inst.valor_original
    );
    
    if (pendingInstallments.length === 0) {
      return { updatedInstallments: installments, distributionDetails: [] };
    }
    
    // 2. Ordenar por prioridade (vencidas primeiro, depois por data)
    const sortedInstallments = [...pendingInstallments].sort((a, b) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const aDate = new Date(a.data_vencimento || '');
      const bDate = new Date(b.data_vencimento || '');
      aDate.setHours(0, 0, 0, 0);
      bDate.setHours(0, 0, 0, 0);
      
      const aOverdue = aDate < today;
      const bOverdue = bDate < today;
      
      // Vencidas primeiro
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      
      // Se ambas vencidas ou ambas não vencidas, ordenar por data
      return aDate.getTime() - bDate.getTime();
    });
    
    // 3. Distribuir o pagamento
    let remainingPayment = paymentAmount;
    const distributionDetails: PaymentDistribution[] = [];
    const updatedInstallments = [...installments];
    
    // Função helper para arredondamento
    const roundTo2Decimals = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

    for (const installment of sortedInstallments) {
      if (remainingPayment <= 0.01) break; // Parar se restante for <= 1 centavo
      
      const pendingAmount = roundTo2Decimals(installment.valor_original - installment.valor_recebido);
      const paymentForThisInstallment = roundTo2Decimals(Math.min(remainingPayment, pendingAmount));
      
      if (paymentForThisInstallment > 0.01) { // Só processar se valor for > 1 centavo
        // Encontrar e atualizar a parcela no array
        const installmentIndex = updatedInstallments.findIndex(
          inst => inst.id_parcela === installment.id_parcela
        );
        
        if (installmentIndex !== -1) {
          const newValueReceived = roundTo2Decimals(updatedInstallments[installmentIndex].valor_recebido + paymentForThisInstallment);
          const remainingValue = roundTo2Decimals(updatedInstallments[installmentIndex].valor_original - newValueReceived);
          
          updatedInstallments[installmentIndex] = {
            ...updatedInstallments[installmentIndex],
            valor_recebido: newValueReceived,
            status: remainingValue <= 0.01 // Considera pago se restante for <= 1 centavo
              ? 'recebido' 
              : 'parcialmente_pago',
            data_de_recebimento: new Date().toISOString().split('T')[0]
          };
          
          distributionDetails.push({
            installmentId: installment.id_parcela,
            originalAmount: pendingAmount,
            appliedAmount: paymentForThisInstallment,
            installmentStatus: updatedInstallments[installmentIndex].status || 'pendente'
          });
          
          remainingPayment = roundTo2Decimals(remainingPayment - paymentForThisInstallment);
        }
      }
    }
    
    console.log('Distribuição concluída. Valor restante:', remainingPayment);
    console.log('Detalhes da distribuição:', distributionDetails);
    
    return { updatedInstallments, distributionDetails };
  };

  const processSalePayment = async (payment: SalePaymentInput, collectorId: string) => {
    try {
      setLoading(true);
      console.log('Processando pagamento de venda:', payment);
      
      // 1. Buscar todas as parcelas da venda para o cliente
      const saleInstallments = collections.filter(collection => 
        collection.venda_n === payment.saleNumber && 
        collection.documento === payment.clientDocument
      );
      
      if (saleInstallments.length === 0) {
        throw new Error('Nenhuma parcela encontrada para esta venda e cliente');
      }
      
      console.log('Parcelas encontradas:', saleInstallments.length);
      
      // 2. Distribuir o pagamento
      const { updatedInstallments, distributionDetails } = distributeSalePayment(
        saleInstallments, 
        payment.paymentAmount
      );
      
      // 3. Atualizar no banco de dados
      for (const installment of updatedInstallments) {
        const originalInstallment = saleInstallments.find(inst => inst.id_parcela === installment.id_parcela);
        
        // Se houve mudança, atualizar no banco
        if (originalInstallment && (
          originalInstallment.valor_recebido !== installment.valor_recebido ||
          originalInstallment.status !== installment.status
        )) {
          const { error } = await supabase
            .from('BANCO_DADOS')
            .update({
              valor_recebido: installment.valor_recebido,
              status: installment.status,
              data_de_recebimento: installment.data_de_recebimento
            })
            .eq('id_parcela', installment.id_parcela);
          
          if (error) {
            console.error('Erro ao atualizar parcela:', error);
            throw error;
          }
        }
      }
      
      // 4. Registrar o pagamento da venda (futuramente pode ir para uma tabela separada)
      const salePayment: SalePayment = {
        id: `${Date.now()}-${Math.random()}`, // ID temporário
        saleNumber: payment.saleNumber,
        clientDocument: payment.clientDocument,
        paymentAmount: payment.paymentAmount,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: payment.paymentMethod,
        notes: payment.notes,
        collectorId,
        collectorName: users.find(u => u.id === collectorId)?.name,
        createdAt: new Date().toISOString(),
        distributionDetails
      };
      
      // Adicionar aos pagamentos locais
      setSalePayments(prev => [...prev, salePayment]);
      
      // 5. Atualizar estado local das collections imediatamente
      setCollections(prevCollections => 
        prevCollections.map(collection => {
          const updatedInstallment = updatedInstallments.find(
            inst => inst.id_parcela === collection.id_parcela
          );
          return updatedInstallment || collection;
        })
      );
      
      // 6. Atualizar dados do banco (refresh)
      await refreshData();
      
      console.log('✅ Pagamento de venda processado com sucesso!');
      
    } catch (err) {
      console.error('Erro ao processar pagamento de venda:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar pagamento');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const processGeneralPayment = async (
    clientDocument: string,
    paymentAmount: number,
    paymentMethod: string,
    notes: string,
    collectorId: string
  ) => {
    try {
      setLoading(true);
      console.log('Processando pagamento geral do cliente:', clientDocument, 'Valor:', paymentAmount);
      
      // 1. Buscar todas as parcelas pendentes do cliente
      console.log('Total de collections no contexto:', collections.length);
      console.log('Buscando parcelas para cliente:', clientDocument);
      
      const clientInstallments = collections.filter(collection => 
        collection.documento === clientDocument && 
        collection.valor_recebido < collection.valor_original
      );
      
      console.log('Parcelas encontradas para o cliente:', clientInstallments.length);
      
      if (clientInstallments.length === 0) {
        throw new Error(`Nenhuma parcela pendente encontrada para o cliente ${clientDocument}`);
      }
      
      console.log('Parcelas pendentes encontradas:', clientInstallments.length);
      
      // 2. Ordenar por prioridade (vencidas primeiro, depois por data de vencimento)
      const sortedInstallments = clientInstallments.sort((a, b) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const aDate = new Date(a.data_vencimento || '');
        const bDate = new Date(b.data_vencimento || '');
        aDate.setHours(0, 0, 0, 0);
        bDate.setHours(0, 0, 0, 0);
        
        const aOverdue = aDate < today;
        const bOverdue = bDate < today;
        
        // Parcelas vencidas primeiro
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        
        // Depois por data de vencimento
        return aDate.getTime() - bDate.getTime();
      });
      
      // 3. Distribuir o pagamento
      let remainingPayment = paymentAmount;
      const updatedInstallments: Collection[] = [];
      const distributionDetails: any[] = [];
      
      for (const installment of sortedInstallments) {
        if (remainingPayment <= 0) break;
        
        const pendingAmount = installment.valor_original - installment.valor_recebido;
        const paymentForThisInstallment = Math.min(remainingPayment, pendingAmount);
        
        if (paymentForThisInstallment > 0) {
          const newReceivedAmount = installment.valor_recebido + paymentForThisInstallment;
          
          const updatedInstallment: Collection = {
            ...installment,
            valor_recebido: newReceivedAmount,
            status: newReceivedAmount >= installment.valor_original ? 'recebido' : 'parcialmente_pago',
            data_de_recebimento: newReceivedAmount >= installment.valor_original 
              ? new Date().toISOString().split('T')[0] 
              : installment.data_de_recebimento
          };
          
          updatedInstallments.push(updatedInstallment);
          
          distributionDetails.push({
            installmentId: installment.id_parcela,
            saleNumber: installment.venda_n,
            installmentNumber: installment.parcela,
            originalAmount: pendingAmount,
            appliedAmount: paymentForThisInstallment,
            installmentStatus: updatedInstallment.status
          });
          
          remainingPayment -= paymentForThisInstallment;
        }
      }
      
      // 4. Atualizar no banco de dados
      console.log('Atualizando', updatedInstallments.length, 'parcelas no banco de dados...');
      for (const installment of updatedInstallments) {
        console.log('Atualizando parcela', installment.id_parcela, 'valor recebido:', installment.valor_recebido);
        
        const { error: updateError } = await supabase
          .from('BANCO_DADOS')
          .update({
            valor_recebido: installment.valor_recebido,
            status: installment.status,
            data_de_recebimento: installment.data_de_recebimento
          })
          .eq('id_parcela', installment.id_parcela);
        
        if (updateError) {
          console.error('Erro ao atualizar parcela', installment.id_parcela, ':', updateError);
          throw updateError;
        }
      }
      
      // 5. Registrar o pagamento geral (opcional - se a tabela existir)
      try {
        const affectedSales = [...new Set(distributionDetails.map(d => d.saleNumber))];
        
        for (const saleNumber of affectedSales) {
          const saleDistribution = distributionDetails.filter(d => d.saleNumber === saleNumber);
          const salePaymentAmount = saleDistribution.reduce((sum, d) => sum + d.appliedAmount, 0);
          
          const paymentRecord = {
            id: crypto.randomUUID(),
            sale_number: saleNumber,
            client_document: clientDocument,
            payment_amount: salePaymentAmount,
            payment_date: new Date().toISOString().split('T')[0],
            payment_method: paymentMethod,
            notes: `Pagamento geral do cliente. ${notes}`.trim(),
            collector_id: collectorId,
            created_at: new Date().toISOString(),
            distribution_details: JSON.stringify(saleDistribution)
          };
          
          const { error: paymentError } = await supabase
            .from('sale_payments')
            .insert(paymentRecord);
          
          if (paymentError) {
            console.warn('Tabela sale_payments não encontrada, prosseguindo sem registro de histórico:', paymentError);
          }
        }
      } catch (historyError) {
        console.warn('Erro ao registrar histórico de pagamento (não crítico):', historyError);
      }
      
      // 6. Atualizar estado local das collections imediatamente
      setCollections(prevCollections => 
        prevCollections.map(collection => {
          const updatedInstallment = updatedInstallments.find(
            inst => inst.id_parcela === collection.id_parcela
          );
          return updatedInstallment || collection;
        })
      );
      
      // 7. Atualizar dados do banco (refresh)
      await refreshData();
      
      console.log('✅ Pagamento geral processado com sucesso!');
      
    } catch (err) {
      console.error('Erro ao processar pagamento geral:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar pagamento geral');
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  const getSalePayments = (saleNumber: number, clientDocument: string): SalePayment[] => {
    return salePayments.filter(payment => 
      payment.saleNumber === saleNumber && 
      payment.clientDocument === clientDocument
    );
  };
  
  const calculateSaleBalance = (saleNumber: number, clientDocument: string): SaleBalance => {
    const saleInstallments = collections.filter(collection => 
      collection.venda_n === saleNumber && 
      collection.documento === clientDocument
    );
    
    // Arredondar para 2 casas decimais para evitar problemas de precisão
    const roundTo2Decimals = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
    
    const totalValue = roundTo2Decimals(saleInstallments.reduce((sum, inst) => sum + inst.valor_original, 0));
    const totalPaid = roundTo2Decimals(saleInstallments.reduce((sum, inst) => sum + inst.valor_recebido, 0));
    const remainingBalance = roundTo2Decimals(totalValue - totalPaid);
    
    let status: 'pending' | 'partially_paid' | 'fully_paid' = 'pending';
    if (totalPaid === 0) {
      status = 'pending';
    } else if (remainingBalance <= 0.01) { // Considera pago se restante for <= 1 centavo
      status = 'fully_paid';
    } else {
      status = 'partially_paid';
    }
    
    const installmentBreakdown = saleInstallments.map(inst => ({
      installmentId: inst.id_parcela,
      originalValue: inst.valor_original,
      paidValue: inst.valor_recebido,
      remainingValue: roundTo2Decimals(inst.valor_original - inst.valor_recebido),
      status: inst.status || 'pendente'
    }));
    
    return {
      totalValue,
      totalPaid,
      remainingBalance,
      status,
      installmentBreakdown
    };
  };
  
  const getSalesByClient = (clientDocument: string): SaleGroup[] => {
    // Agrupar collections por venda
    const salesMap = new Map<number, Collection[]>();
    
    collections
      .filter(collection => collection.documento === clientDocument)
      .forEach(collection => {
        if (collection.venda_n) {
          if (!salesMap.has(collection.venda_n)) {
            salesMap.set(collection.venda_n, []);
          }
          salesMap.get(collection.venda_n)!.push(collection);
        }
      });
    
    // Converter para SaleGroup
    return Array.from(salesMap.entries()).map(([saleNumber, installments]) => {
      // Arredondar para 2 casas decimais para evitar problemas de precisão
      const roundTo2Decimals = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
      
      const totalValue = roundTo2Decimals(installments.reduce((sum, inst) => sum + inst.valor_original, 0));
      const totalReceived = roundTo2Decimals(installments.reduce((sum, inst) => sum + inst.valor_recebido, 0));
      const pendingValue = roundTo2Decimals(totalValue - totalReceived);
      
      const balance = calculateSaleBalance(saleNumber, clientDocument);
      const payments = getSalePayments(saleNumber, clientDocument);
      
      return {
        saleNumber,
        titleNumber: installments[0]?.numero_titulo || 0,
        description: installments[0]?.descricao || `Venda ${saleNumber}`,
        installments,
        totalValue,
        totalReceived,
        pendingValue,
        saleStatus: balance.status,
        payments,
        clientDocument
      };
    });
  };

  // Scheduled Visits Functions
  const fetchScheduledVisits = async () => {
    try {
      console.log('Buscando visitas agendadas...');
      
      const { data, error: supabaseError } = await supabase
        .from('scheduled_visits')
        .select('*')
        .order('scheduled_date', { ascending: true });

      if (supabaseError) {
        console.error('Erro ao buscar visitas agendadas:', supabaseError);
        
        // Se a tabela não existir, mostrar instruções para criar
        if (supabaseError.message.includes('relation "scheduled_visits" does not exist')) {
          console.log('Tabela scheduled_visits não existe.');
          console.log('Por favor, execute o seguinte SQL no Supabase:');
          console.log(`
            CREATE TABLE scheduled_visits (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              collector_id TEXT NOT NULL,
              client_document TEXT NOT NULL,
              client_name TEXT NOT NULL,
              scheduled_date DATE NOT NULL,
              scheduled_time TIME,
              status TEXT NOT NULL DEFAULT 'agendada',
              notes TEXT,
              client_address TEXT,
              client_neighborhood TEXT,
              client_city TEXT,
              total_pending_value DECIMAL(10,2),
              overdue_count INTEGER DEFAULT 0,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            
            CREATE INDEX idx_scheduled_visits_collector ON scheduled_visits(collector_id);
            CREATE INDEX idx_scheduled_visits_client ON scheduled_visits(client_document);
            CREATE INDEX idx_scheduled_visits_date ON scheduled_visits(scheduled_date);
          `);
        }
        
        // Usar sistema local como fallback
        setScheduledVisits([]);
        return;
      }

      const transformedVisits: ScheduledVisit[] = (data || []).map(visit => ({
        id: visit.id,
        collectorId: visit.collector_id,
        clientDocument: visit.client_document,
        clientName: visit.client_name,
        scheduledDate: visit.scheduled_date,
        scheduledTime: visit.scheduled_time,
        status: visit.status,
        notes: visit.notes,
        createdAt: visit.created_at,
        updatedAt: visit.updated_at,
        clientAddress: visit.client_address,
        clientNeighborhood: visit.client_neighborhood,
        clientCity: visit.client_city,
        totalPendingValue: visit.total_pending_value,
        overdueCount: visit.overdue_count,
        cancellationRequestDate: visit.cancellation_request_date,
        cancellationRequestReason: visit.cancellation_request_reason,
        cancellationApprovedBy: visit.cancellation_approved_by,
        cancellationApprovedAt: visit.cancellation_approved_at,
        cancellationRejectedBy: visit.cancellation_rejected_by,
        cancellationRejectedAt: visit.cancellation_rejected_at,
        cancellationRejectionReason: visit.cancellation_rejection_reason
      }));

      setScheduledVisits(transformedVisits);
      console.log('Visitas agendadas carregadas:', transformedVisits.length);
    } catch (err) {
      console.error('Erro ao carregar visitas agendadas:', err);
      // Fallback para sistema local
      setScheduledVisits([]);
    }
  };

  const scheduleVisit = async (visitData: Omit<ScheduledVisit, 'id' | 'createdAt'>) => {
    try {
      console.log('Agendando visita:', visitData);

      // Tentar inserir no Supabase
      const { data, error } = await supabase
        .from('scheduled_visits')
        .insert([
          {
            collector_id: visitData.collectorId,
            client_document: visitData.clientDocument,
            client_name: visitData.clientName,
            scheduled_date: visitData.scheduledDate,
            scheduled_time: visitData.scheduledTime,
            status: visitData.status,
            notes: visitData.notes,
            client_address: visitData.clientAddress,
            client_neighborhood: visitData.clientNeighborhood,
            client_city: visitData.clientCity,
            total_pending_value: visitData.totalPendingValue,
            overdue_count: visitData.overdueCount
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Erro ao inserir visita no Supabase:', error);
        
        // Fallback para sistema local
        const newVisit: ScheduledVisit = {
          ...visitData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString()
        };

        setScheduledVisits(prev => [...prev, newVisit]);
        console.log('Visita agendada localmente:', newVisit);
        return newVisit;
      }

      // Transformar dados do Supabase para o formato esperado
      const newVisit: ScheduledVisit = {
        id: data.id,
        collectorId: data.collector_id,
        clientDocument: data.client_document,
        clientName: data.client_name,
        scheduledDate: data.scheduled_date,
        scheduledTime: data.scheduled_time,
        status: data.status,
        notes: data.notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        clientAddress: data.client_address,
        clientNeighborhood: data.client_neighborhood,
        clientCity: data.client_city,
        totalPendingValue: data.total_pending_value,
        overdueCount: data.overdue_count,
        cancellationRequestDate: data.cancellation_request_date,
        cancellationRequestReason: data.cancellation_request_reason,
        cancellationApprovedBy: data.cancellation_approved_by,
        cancellationApprovedAt: data.cancellation_approved_at,
        cancellationRejectedBy: data.cancellation_rejected_by,
        cancellationRejectedAt: data.cancellation_rejected_at,
        cancellationRejectionReason: data.cancellation_rejection_reason
      };

      // Atualizar estado local
      setScheduledVisits(prev => [...prev, newVisit]);
      console.log('Visita agendada com sucesso no Supabase:', newVisit);
      
      return newVisit;
    } catch (error) {
      console.error('Erro ao agendar visita:', error);
      throw error;
    }
  };

  const updateVisitStatus = async (visitId: string, status: ScheduledVisit['status'], notes?: string) => {
    try {
      console.log('Atualizando status da visita:', visitId, status);

      // Tentar atualizar no Supabase
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };
      
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      const { error } = await supabase
        .from('scheduled_visits')
        .update(updateData)
        .eq('id', visitId);

      if (error) {
        console.error('Erro ao atualizar visita no Supabase:', error);
        // Continuar com atualização local mesmo se falhar no Supabase
      }

      // Atualizar estado local
      setScheduledVisits(prev => prev.map(visit => 
        visit.id === visitId 
          ? { 
              ...visit, 
              status, 
              notes: notes || visit.notes,
              updatedAt: new Date().toISOString()
            }
          : visit
      ));

      console.log('Status da visita atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar status da visita:', error);
      throw error;
    }
  };

  const requestVisitCancellation = async (visitId: string, reason: string) => {
    try {
      console.log('Solicitando cancelamento da visita:', visitId, reason);

      // Tentar atualizar no Supabase
      const updateData = {
        status: 'cancelamento_solicitado' as const,
        cancellation_request_date: new Date().toISOString(),
        cancellation_request_reason: reason,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('scheduled_visits')
        .update(updateData)
        .eq('id', visitId);

      if (error) {
        console.error('Erro ao solicitar cancelamento no Supabase:', error);
        // Continuar com atualização local mesmo se falhar no Supabase
      }

      // Atualizar estado local
      setScheduledVisits(prev => prev.map(visit => 
        visit.id === visitId 
          ? { 
              ...visit, 
              status: 'cancelamento_solicitado',
              cancellationRequestDate: new Date().toISOString(),
              cancellationRequestReason: reason,
              updatedAt: new Date().toISOString()
            }
          : visit
      ));

      console.log('Solicitação de cancelamento enviada com sucesso');
    } catch (error) {
      console.error('Erro ao solicitar cancelamento:', error);
      throw error;
    }
  };

  const approveVisitCancellation = async (visitId: string, managerId: string) => {
    try {
      console.log('Aprovando cancelamento da visita:', visitId);

      const updateData = {
        status: 'cancelada' as const,
        cancellation_approved_by: managerId,
        cancellation_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('scheduled_visits')
        .update(updateData)
        .eq('id', visitId);

      if (error) {
        console.error('Erro ao aprovar cancelamento no Supabase:', error);
      }

      // Atualizar estado local
      setScheduledVisits(prev => prev.map(visit => 
        visit.id === visitId 
          ? { 
              ...visit, 
              status: 'cancelada',
              cancellationApprovedBy: managerId,
              cancellationApprovedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : visit
      ));

      console.log('Cancelamento aprovado com sucesso');
    } catch (error) {
      console.error('Erro ao aprovar cancelamento:', error);
      throw error;
    }
  };

  const rejectVisitCancellation = async (visitId: string, managerId: string, rejectionReason: string) => {
    try {
      console.log('Rejeitando cancelamento da visita:', visitId);

      const updateData = {
        status: 'agendada' as const,
        cancellation_rejected_by: managerId,
        cancellation_rejected_at: new Date().toISOString(),
        cancellation_rejection_reason: rejectionReason,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('scheduled_visits')
        .update(updateData)
        .eq('id', visitId);

      if (error) {
        console.error('Erro ao rejeitar cancelamento no Supabase:', error);
      }

      // Atualizar estado local
      setScheduledVisits(prev => prev.map(visit => 
        visit.id === visitId 
          ? { 
              ...visit, 
              status: 'agendada',
              cancellationRejectedBy: managerId,
              cancellationRejectedAt: new Date().toISOString(),
              cancellationRejectionReason: rejectionReason,
              updatedAt: new Date().toISOString()
            }
          : visit
      ));

      console.log('Cancelamento rejeitado com sucesso');
    } catch (error) {
      console.error('Erro ao rejeitar cancelamento:', error);
      throw error;
    }
  };

  const getPendingCancellationRequests = () => {
    return scheduledVisits.filter(visit => visit.status === 'cancelamento_solicitado');
  };

  const getCancellationHistory = (days: number = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return scheduledVisits.filter(visit => {
      // Incluir visitas que foram aprovadas ou rejeitadas nos últimos X dias
      const hasApproval = visit.cancellationApprovedAt && new Date(visit.cancellationApprovedAt) >= cutoffDate;
      const hasRejection = visit.cancellationRejectedAt && new Date(visit.cancellationRejectedAt) >= cutoffDate;
      
      return hasApproval || hasRejection;
    }).sort((a, b) => {
      // Ordenar por data mais recente primeiro
      const dateA = new Date(a.cancellationApprovedAt || a.cancellationRejectedAt || 0);
      const dateB = new Date(b.cancellationApprovedAt || b.cancellationRejectedAt || 0);
      return dateB.getTime() - dateA.getTime();
    });
  };

  const getVisitsByDate = (date: string, collectorId?: string) => {
    return scheduledVisits.filter(visit => {
      const matchesDate = visit.scheduledDate === date;
      const matchesCollector = !collectorId || visit.collectorId === collectorId;
      return matchesDate && matchesCollector;
    });
  };

  const getVisitsByCollector = (collectorId: string) => {
    return scheduledVisits.filter(visit => visit.collectorId === collectorId);
  };

  const getClientDataForVisit = (clientDocument: string) => {
    const clientGroups = getClientGroups();
    const clientGroup = clientGroups.find(group => group.document === clientDocument);
    
    if (!clientGroup) return null;

    const clientSales = getSalesByClient(clientDocument);
    const totalPending = clientSales.reduce((sum, sale) => sum + sale.pendingValue, 0);
    
    // Calcular dias em atraso considerando formato brasileiro DD/MM/YYYY
    const calculateOverdueDays = (dueDateStr: string): number => {
      if (!dueDateStr) return 0;
      
      try {
        let dueDate: Date;
        
        // Limpar a string de data
        const cleanDateStr = dueDateStr.trim();
        
        // Verificar se a data está no formato DD/MM/YYYY (brasileiro)
        if (cleanDateStr.includes('/')) {
          const parts = cleanDateStr.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            // Converter para números e validar
            const dayNum = parseInt(day, 10);
            const monthNum = parseInt(month, 10);
            const yearNum = parseInt(year, 10);
            
            if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
              dueDate = new Date(yearNum, monthNum - 1, dayNum);
            } else {
              console.warn('Data brasileira inválida:', cleanDateStr);
              return 0;
            }
          } else {
            console.warn('Formato de data brasileiro inválido:', cleanDateStr);
            return 0;
          }
        } else if (cleanDateStr.includes('-')) {
          // Formato ISO (YYYY-MM-DD) ou americano (MM-DD-YYYY)
          const parts = cleanDateStr.split('-');
          if (parts.length === 3) {
            // Assumir formato ISO se o primeiro elemento tem 4 dígitos
            if (parts[0].length === 4) {
              dueDate = new Date(cleanDateStr);
            } else {
              // Formato americano MM-DD-YYYY
              const [month, day, year] = parts;
              dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
            }
          } else {
            dueDate = new Date(cleanDateStr);
          }
        } else {
          // Tentar parseamento direto
          dueDate = new Date(cleanDateStr);
        }
        
        // Verificar se a data é válida
        if (isNaN(dueDate.getTime())) {
          console.warn('Data inválida após parsing:', cleanDateStr);
          return 0;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
        
        const diffTime = today.getTime() - dueDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        return Math.max(0, diffDays);
      } catch (error) {
        console.error('Erro ao calcular dias em atraso:', error, dueDateStr);
        return 0;
      }
    };
    
    const overdueCount = clientSales.reduce((sum, sale) => {
      return sum + sale.installments.filter(inst => {
        const pending = (inst.valor_original || 0) - (inst.valor_recebido || 0);
        if (pending <= 0) return false;
        
        // Primeiro, tentar usar o campo dias_em_atraso se existir e for válido
        if (inst.dias_em_atraso !== null && inst.dias_em_atraso !== undefined && inst.dias_em_atraso > 0) {
          return true;
        }
        
        // Caso contrário, calcular baseado na data_vencimento
        const overdueDays = calculateOverdueDays(inst.data_vencimento || '');
        return overdueDays > 0;
      }).length;
    }, 0);

    return {
      name: clientGroup.client,
      document: clientGroup.document,
      address: `${clientGroup.address}, ${clientGroup.number}`,
      neighborhood: clientGroup.neighborhood,
      city: clientGroup.city,
      phone: clientGroup.phone,
      mobile: clientGroup.mobile,
      totalPendingValue: totalPending,
      overdueCount: overdueCount
    };
  };

  const rescheduleVisit = async (visitId: string, newDate: string, newTime?: string, reason?: string) => {
    try {
      console.log('Reagendando visita:', visitId, newDate, newTime);

      // Buscar visita atual para manter histórico
      const currentVisit = scheduledVisits.find(v => v.id === visitId);
      if (!currentVisit) {
        throw new Error('Visita não encontrada');
      }

      // Montar nota com informações do reagendamento
      const rescheduleNote = `Reagendado de ${currentVisit.scheduledDate} ${currentVisit.scheduledTime || ''} para ${newDate} ${newTime || ''}${reason ? `. Motivo: ${reason}` : ''}`;
      
      // Atualizar notas concatenando com as existentes
      const updatedNotes = currentVisit.notes 
        ? `${currentVisit.notes}\n${rescheduleNote}`
        : rescheduleNote;

      // Tentar atualizar no Supabase
      const updateData = {
        scheduled_date: newDate,
        scheduled_time: newTime || null,
        notes: updatedNotes,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('scheduled_visits')
        .update(updateData)
        .eq('id', visitId);

      if (error) {
        console.error('Erro ao reagendar visita no Supabase:', error);
        // Continuar com atualização local mesmo se falhar no Supabase
      }

      // Atualizar estado local
      setScheduledVisits(prev => prev.map(visit => 
        visit.id === visitId 
          ? { 
              ...visit, 
              scheduledDate: newDate,
              scheduledTime: newTime || visit.scheduledTime,
              notes: updatedNotes,
              updatedAt: new Date().toISOString()
            }
          : visit
      ));

      console.log('Visita reagendada com sucesso');
    } catch (error) {
      console.error('Erro ao reagendar visita:', error);
      throw error;
    }
  };

  const value: CollectionContextType = {
    collections,
    users,
    collectorStores,
    salePayments,
    scheduledVisits,
    loading,
    error,
    fetchCollections,
    fetchUsers,
    fetchCollectorStores,
    fetchSalePayments,
    refreshData,
    updateCollection,
    assignCollectorToStore,
    removeCollectorFromStore,
    assignCollectorToClients,
    removeCollectorFromClients,
    addAttempt,
    addUser,
    updateUser,
    deleteUser,
    getDashboardStats,
    getCollectorPerformance,
    getCollectorCollections,
    getClientGroups,
    getFilteredCollections,
    getAvailableStores,
    getCollectorStores,
    // Sale payment methods
    processSalePayment,
    processGeneralPayment,
    getSalePayments,
    calculateSaleBalance,
    getSalesByClient,
    // Visit scheduling methods
    fetchScheduledVisits,
    scheduleVisit,
    updateVisitStatus,
    requestVisitCancellation,
    approveVisitCancellation,
    rejectVisitCancellation,
    getPendingCancellationRequests,
    getCancellationHistory,
    getVisitsByDate,
    getVisitsByCollector,
    getClientDataForVisit,
    rescheduleVisit,
  };

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
};