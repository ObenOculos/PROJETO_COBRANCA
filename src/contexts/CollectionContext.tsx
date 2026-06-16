import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import {
  CollectionContextType,
  Collection,
  User,
  UserType,
  MonthlyGoal,
  CollectionAttempt,
  DashboardStats,
  CollectorPerformance,
  ClientGroup,
  SaleGroup,
  FilterOptions,
  SalePayment,
  SalePaymentInput,
  SaleBalance,
  ScheduledVisit,
  AllowedVisitDate,
} from "../types";
import { supabase } from "../lib/supabase";
import { PRIMARY_SITUACAO, situacoesOutsideProfile } from "../config/profiles";
import { useAuth } from "./AuthContext";
import { useLoading } from "./LoadingContext";
import { useOffline } from "../hooks/useOffline";
import {
  dataCache,
  statsCache,
  userCache,
  collectionsCache,
} from "../utils/cache";
import { calculateOverdueDays } from "../utils/formatters";
import {
  useRealtimeCacheInvalidation,
  useOfflineSyncCacheInvalidation,
} from "../hooks/useCacheInvalidation";

const CollectionContext = createContext<CollectionContextType | undefined>(
  undefined,
);

export const useCollection = () => {
  const context = useContext(CollectionContext);
  if (context === undefined) {
    throw new Error("useCollection must be used within a CollectionProvider");
  }
  return context;
};

interface CollectionProviderProps {
  children: React.ReactNode;
}

export const CollectionProvider: React.FC<CollectionProviderProps> = ({
  children,
}) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { setLoading: setGlobalLoading } = useLoading();
  const { isOnline, addToOfflineQueue } = useOffline();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [salePayments, setSalePayments] = useState<SalePayment[]>([]);
  const [scheduledVisits, setScheduledVisits] = useState<ScheduledVisit[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoal[]>([]);
  const [allowedVisitDates, setAllowedVisitDates] = useState<
    AllowedVisitDate[]
  >([]);
  const [activeAddressHistory, setActiveAddressHistory] = useState<
    {
      cliente_documento: string;
      created_at: string;
      logradouro?: string;
      numero?: string;
      bairro?: string;
      cidade?: string;
      estado?: string;
      cep?: string;
      complemento?: string;
    }[]
  >([]);
  const [clientDataCache, setClientDataCache] = useState<Map<string, any>>(
    new Map(),
  );

  const realtimeRefreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ CORREÇÃO: Ref para mirror do cache para evitar dependências circulares em callbacks
  const clientDataCacheRef = React.useRef(clientDataCache);
  React.useEffect(() => {
    clientDataCacheRef.current = clientDataCache;
  }, [clientDataCache]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scheduled Visits Functions (Moved to earlier declaration)
  const fetchScheduledVisits = React.useCallback(
    async (useCache = true) => {
      const cacheKey = "scheduled-visits";

      // 1. Load from cache if available
      if (useCache) {
        const cachedData = dataCache.get<ScheduledVisit[]>(cacheKey);
        if (cachedData) {
          console.log("✅ Dados de scheduled visits carregados do cache");
          setScheduledVisits(cachedData);
        }
      }

      // 2. If offline, do not proceed to fetch from network
      if (!isOnline) {
        console.log("🚫 Offline, não buscando visitas agendadas do servidor.");
        return;
      }

      // 3. If online, fetch fresh data
      try {
        console.log("Buscando TODAS as visitas agendadas com paginação...");

        let allVisits: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: pageData, error: pageError } = await supabase
            .from("scheduled_visits")
            .select("*")
            .range(from, from + pageSize - 1)
            .order("scheduled_date", { ascending: true });

          if (pageError) {
            console.error("Erro ao carregar página de visitas:", pageError);
            throw pageError;
          }

          if (pageData && pageData.length > 0) {
            allVisits = allVisits.concat(pageData);
            if (pageData.length < pageSize) {
              hasMore = false;
            } else {
              from += pageSize;
            }
          } else {
            hasMore = false;
          }
        }

        const transformedVisits: ScheduledVisit[] = (allVisits || []).map(
          (visit) => ({
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
            dataVisitaRealizada: visit.data_visita_realizada,
            clientAddress: visit.client_address,
            clientNumber: visit.client_number,
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
            cancellationRejectionReason: visit.cancellation_rejection_reason,
            scheduled_by_manager_id: visit.scheduled_by_manager_id, // Add this line
            rescheduleCount: visit.reschedule_count,
            rescheduledTo: visit.rescheduled_to,
            rescheduledFromId: visit.rescheduled_from_id,
            rescheduledToId: visit.rescheduled_to_id,
          }),
        );

        setScheduledVisits(transformedVisits);

        // Cache the fresh data
        dataCache.set(cacheKey, transformedVisits);

        console.log(
          "TODAS as visitas agendadas carregadas:",
          transformedVisits.length,
        );
      } catch (err) {
        // Also log error here and do not clear state
        console.error("Erro ao carregar visitas agendadas:", err);
      }
    },
    [isOnline],
  );

  const getVisitsByCollector = (collectorId: string) => {
    return scheduledVisits.filter(
      (visit: ScheduledVisit) => visit.collectorId === collectorId,
    );
  };

  // Fetch allowed visit dates
  const fetchAllowedVisitDates = React.useCallback(async () => {
    const cacheKey = "allowed-visit-dates";

    // Load from cache if available
    const cachedData = dataCache.get<AllowedVisitDate[]>(cacheKey);
    if (cachedData) {
      console.log("✅ Dados de datas permitidas carregados do cache");
      setAllowedVisitDates(cachedData);
    }

    // If offline, do not proceed to fetch from network
    if (!isOnline) {
      console.log("🚫 Offline, não buscando datas permitidas do servidor.");
      return;
    }

    // If online, fetch fresh data
    try {
      console.log("Buscando datas de visita permitidas...");

      const { data, error: supabaseError } = await supabase
        .from("allowed_visit_dates")
        .select("*")
        .order("city", { ascending: true });

      if (supabaseError) {
        console.error("Erro ao buscar datas permitidas:", supabaseError);
        return;
      }

      const transformedDates = data.map((date) => ({
        id: date.id,
        city: date.city,
        neighborhood: date.neighborhood,
        allowed_date: date.allowed_date,
        created_at: date.created_at,
        updated_at: date.updated_at,
      })) as AllowedVisitDate[];

      setAllowedVisitDates(transformedDates);

      // Cache the fresh data
      dataCache.set(cacheKey, transformedDates);

      console.log("Datas permitidas carregadas:", transformedDates.length);
    } catch (err) {
      console.error("Erro ao carregar datas permitidas:", err);
    }
  }, [isOnline]);

  // Fetch active address history for "New" badge
  const fetchActiveAddressHistory = React.useCallback(async () => {
    // If offline, skip
    if (!isOnline) return;

    try {
      const { data, error } = await supabase
        .from("enderecos_historico")
        .select(
          "cliente_documento, created_at, logradouro, numero, bairro, cidade, estado, cep, complemento",
        )
        .eq("is_atual", true);

      if (error) {
        console.error("Erro ao buscar histórico de endereços:", error);
        return;
      }

      setActiveAddressHistory((data || []) as typeof activeAddressHistory);
    } catch (err) {
      console.error("Erro ao carregar histórico de endereços:", err);
    }
  }, [isOnline]);

  // Cache invalidation hooks
  const {
    invalidateCollections,
    invalidatePayments,
    invalidateUsers,
    invalidateVisits,
  } = useRealtimeCacheInvalidation();

  useOfflineSyncCacheInvalidation();

  // Função para atualizar apenas as collections sem recarregar tudo
  const refreshCollections = async () => {
    try {
      console.log("Atualizando collections em tempo real...");
      invalidateCollections(); // Invalidate cache before fetching
      await fetchCollections(false); // Force fresh fetch
    } catch (error) {
      console.error("Erro ao atualizar collections:", error);
    }
  };

  useEffect(() => {
    let realtimeChannel: any = null;

    // Wait for AuthContext to finish loading before making any decisions
    if (isAuthLoading) {
      console.log("Aguardando autenticação carregar...");
      return;
    }

    if (user) {
      console.log("Usuário logado, carregando dados...");
      setGlobalLoading(true, "Carregando dados do sistema...");

      const fetchData = async () => {
        try {
          await Promise.all([
            fetchUsers(),
            fetchSalePayments(),
            fetchScheduledVisits(),
            fetchMonthlyGoals(),
            fetchAllowedVisitDates(),
            fetchActiveAddressHistory(),
          ]);

          // Now fetch collections
          await fetchCollections();
        } catch (error) {
          console.error("Erro ao carregar dados iniciais:", error);
          setError("Erro ao carregar dados iniciais. Tente novamente.");
        }
      };

      // Define a timeout for the data fetching
      const timeoutId = setTimeout(() => {
        console.warn(
          "Tempo limite excedido ao carregar dados. Liberando o estado de carregamento.",
        );
        setGlobalLoading(false);
        setLoading(false);
      }, 20000); // 20 seconds timeout

      fetchData()
        .catch((error) => {
          console.error("Erro ao carregar dados:", error);
          setError("Erro ao carregar dados. Tente novamente.");
        })
        .finally(() => {
          clearTimeout(timeoutId); // Clear the timeout
          setGlobalLoading(false);
          setLoading(false);
        });

      // Configurar listener em tempo real para mudanças nas tabelas
      console.log("Configurando listeners em tempo real...");
      realtimeChannel = supabase
        .channel("database_changes")
        .on(
          "postgres_changes",
          {
            event: "*", // Escutar todos os eventos (INSERT, UPDATE, DELETE)
            schema: "public",
            table: "BANCO_DADOS",
          },
          (payload) => {
            console.log("Mudança detectada na tabela BANCO_DADOS:", payload);
            if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
            realtimeRefreshTimer.current = setTimeout(() => {
              realtimeRefreshTimer.current = null;
              refreshCollections();
            }, 2000);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*", // Escutar todos os eventos (INSERT, UPDATE, DELETE)
            schema: "public",
            table: "sale_payments",
          },
          (payload) => {
            console.log("Mudança detectada na tabela sale_payments:", payload);
            // Atualizar sale payments quando houver mudanças
            invalidatePayments(); // Invalidate cache before fetching
            fetchSalePayments(false); // Force fresh fetch
          },
        )
        .subscribe((status) => {
          console.log("Status da conexão realtime:", status);
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            console.warn(
              "Erro na subscription do realtime, tentando reconectar em 5s...",
            );
            setTimeout(() => {
              if (realtimeChannel) {
                realtimeChannel.unsubscribe();
                realtimeChannel = null;
              }
              // Reconectar será feito no próximo ciclo do useEffect
            }, 5000);
          }
        });
    } else {
      console.log("Usuário não logado, limpando dados...");
      setCollections([]);
      setUsers([]);
      setSalePayments([]);
      setScheduledVisits([]);
      setLoading(false);
      setGlobalLoading(false);
    }

    // Cleanup: remover listener quando o componente for desmontado ou usuário mudar
    return () => {
      if (realtimeChannel) {
        console.log("Removendo listener em tempo real...");
        try {
          realtimeChannel.unsubscribe();
          supabase.removeChannel(realtimeChannel);
        } catch (error) {
          console.warn("Erro ao remover canal realtime:", error);
        }
      }
    };
  }, [user, isAuthLoading]);

  // Escutar evento de sincronização offline para recarregar dados
  useEffect(() => {
    const handleOfflineDataSynced = () => {
      // Debounce para evitar múltiplas chamadas em sequência
      setTimeout(() => {
        console.log(
          "Sincronização offline concluída. Atualizando todos os dados...",
        );
        refreshData();
      }, 100);
    };

    window.addEventListener(
      "offlineDataSynced",
      handleOfflineDataSynced as EventListener,
    );

    return () => {
      window.removeEventListener(
        "offlineDataSynced",
        handleOfflineDataSynced as EventListener,
      );
    };
  }, []);

  const fetchCollections = async (useCache = true) => {
    try {
      setError(null);

      const cacheKey = `collections-${user?.id || "all"}-${user?.type || "manager"}`;

      // Try to get from cache first
      if (useCache) {
        const cachedData = collectionsCache.get<Collection[]>(cacheKey);
        if (cachedData) {
          console.log(
            "✅ Dados de collections carregados do cache",
            cachedData.length,
            "registros",
          );
          setCollections(cachedData);
          return;
        }
      } else {
        console.log("🔄 Fetch forçado sem cache (useCache=false)");
      }

      // Se estiver offline e não houver cache, não prosseguir com a busca de rede
      if (!isOnline) {
        console.log(
          "🚫 Offline e sem cache de collections. A busca de dados foi ignorada.",
        );
        // Manter os dados existentes ou um array vazio se não houver nada
        setCollections((prev) => (prev.length > 0 ? prev : []));
        return;
      }

      console.log("Buscando dados da tabela BANCO_DADOS...");

      let query = supabase.from("BANCO_DADOS").select("*");

      if (user?.type === "collector") {
        const assignedStores: string[] = [];
        console.log(
          `Cobrador ${user.name} (${user.id}) tem lojas atribuídas:`,
          assignedStores,
        );

        // Fetch collections assigned directly to the collector OR to their assigned stores
        query = query.or(
          `user_id.eq.${user.id},nome_da_loja.in.(${assignedStores.join(",")})`,
        );
      }

      // Carregar TODOS os dados sem limite (ou com limite para o cobrador)
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000; // Still use pagination for large datasets, even with filters
      let hasMore = true;

      while (hasMore) {
        console.log(`Carregando registros ${from} a ${from + pageSize - 1}...`);

        const { data: pageData, error: pageError } = await query
          .range(from, from + pageSize - 1)
          .order("id_parcela", { ascending: true });

        if (pageError) {
          console.error("Erro ao carregar página:", pageError);
          throw pageError;
        }

        if (pageData && pageData.length > 0) {
          allData = allData.concat(pageData);
          console.log(
            `Carregados ${pageData.length} registros. Total acumulado: ${allData.length}`,
          );

          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        } else {
          hasMore = false;
        }
      }

      console.log("TOTAL FINAL de registros carregados:", allData.length);
      const data = allData;

      if (!data || data.length === 0) {
        console.warn("Nenhum dado retornado do Supabase");
        setCollections([]);
        return;
      }

      console.log("Dados carregados:", data.length, "registros");

      // Verificar quantos clientes únicos temos nos dados carregados
      const uniqueDocuments = new Set();
      data.forEach((row) => {
        if (row.documento && row.documento.trim() !== "") {
          uniqueDocuments.add(row.documento.trim());
        }
      });
      console.log(
        "Clientes únicos nos dados carregados:",
        uniqueDocuments.size,
      );
      console.log(
        "Primeiros 10 documentos:",
        Array.from(uniqueDocuments).slice(0, 10),
      );

      // Debug: verificar formato das datas
      const sampleDates = data.slice(0, 5).map((row) => ({
        data_vencimento: row.data_vencimento,
        data_lancamento: row.data_lancamento,
        data_de_recebimento: row.data_de_recebimento,
      }));
      console.log("Amostras de datas:", sampleDates);

      // Transformar os dados para corresponder à interface Collection

      const transformedData: Collection[] = (data || []).map((row) => ({
        id_parcela: row.id_parcela,
        nome_da_loja: row.nome_da_loja,
        data_lancamento: row.data_lancamento,
        data_vencimento: row.data_vencimento,
        valor_original: parseFloat(
          (row.valor_original || "0").toString().replace(",", "."),
        ),
        valor_reajustado: parseFloat(
          (row.valor_reajustado || "0").toString().replace(",", "."),
        ),
        multa: parseFloat((row.multa || "0").toString().replace(",", ".")),
        juros_por_dia: parseFloat(
          (row.juros_por_dia || "0").toString().replace(",", "."),
        ),
        multa_aplicada: parseFloat(
          (row.multa_aplicada || "0").toString().replace(",", "."),
        ),
        juros_aplicado: parseFloat(
          (row.juros_aplicado || "0").toString().replace(",", "."),
        ),
        valor_recebido: parseFloat(
          (row.valor_recebido || "0").toString().replace(",", "."),
        ),
        data_de_recebimento: row.data_de_recebimento,
        dias_em_atraso: row.dias_em_atraso,
        dias_carencia: parseFloat(row.dias_carencia || "0"),
        desconto: parseFloat(
          (row.desconto || "0").toString().replace(",", "."),
        ),
        acrescimo: parseFloat(
          (row.acrescimo || "0").toString().replace(",", "."),
        ),
        multa_paga: parseFloat(
          (row.multa_paga || "0").toString().replace(",", "."),
        ),
        juros_pago: parseFloat(
          (row.juros_pago || "0").toString().replace(",", "."),
        ),
        tipo_de_cobranca: row.tipo_de_cobranca,
        numero_titulo: row.numero_titulo,
        parcela: row.parcela,
        status: row.status,
        cliente: row.cliente,
        documento: row.documento,
        apelido: row.apelido,
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
        situacao: row.situacao,
      }));

      setCollections(transformedData);

      // Cache the data using dedicated collections cache
      collectionsCache.set(cacheKey, transformedData);

      console.log("Collections carregadas:", transformedData.length);
    } catch (err) {
      console.error("Erro ao carregar collections:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (useCache = true) => {
    try {
      const cacheKey = "users";

      // Try to get from cache first
      if (useCache) {
        const cachedData = userCache.get<User[]>(cacheKey);
        if (cachedData) {
          console.log("Dados de usuários carregados do cache");
          setUsers(cachedData);
          return;
        }
      }

      console.log("Buscando usuários...");

      const { data, error: supabaseError } = await supabase
        .from("users")
        .select("*")
        .order("name", { ascending: true });

      if (supabaseError) {
        console.error("Erro ao buscar usuários:", supabaseError);
        throw supabaseError;
      }

      const transformedUsers: User[] = (data || []).map((user) => ({
        id: user.id,
        name: user.name,
        login: user.login,
        password: user.password,
        type: user.type as UserType,
        createdAt: user.created_at || new Date().toISOString(),
      }));

      setUsers(transformedUsers);

      // Cache the data
      userCache.set(cacheKey, transformedUsers);

      console.log("Usuários carregados:", transformedUsers.length);
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
    }
  };

  const updateCollection = async (id: number, updates: Partial<Collection>) => {
    try {
      // Converter updates para formato do banco
      const dbUpdates: any = {};

      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.valor_recebido !== undefined)
        dbUpdates.valor_recebido = updates.valor_recebido;
      if (updates.data_de_recebimento !== undefined)
        dbUpdates.data_de_recebimento = updates.data_de_recebimento;
      if (updates.obs !== undefined) dbUpdates.obs = updates.obs;
      if (updates.user_id !== undefined) dbUpdates.user_id = updates.user_id;
      if (updates.desconto !== undefined) dbUpdates.desconto = updates.desconto; // Added this line
      if (updates.situacao !== undefined) dbUpdates.situacao = updates.situacao;

      const { error: supabaseError } = await supabase
        .from("BANCO_DADOS")
        .update(dbUpdates)
        .eq("id_parcela", id);

      if (supabaseError) {
        throw supabaseError;
      }

      // Atualizar estado local
      setCollections((prev) =>
        prev.map((collection) =>
          collection.id_parcela === id
            ? { ...collection, ...updates }
            : collection,
        ),
      );

      console.log("Collection atualizada:", id, updates);
    } catch (err) {
      console.error("Erro ao atualizar collection:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao atualizar cobrança",
      );
    }
  };

  const addAttempt = async (
    collectionId: number,
    attempt: Omit<CollectionAttempt, "id">,
  ) => {
    try {
      const { error: supabaseError } = await supabase
        .from("collection_attempts")
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

      console.log("Tentativa adicionada para cobrança:", collectionId, attempt);
    } catch (err) {
      console.error("Erro ao adicionar tentativa:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao adicionar tentativa",
      );
    }
  };

  const addUser = async (user: Omit<User, "id" | "createdAt">) => {
    try {
      const { error: supabaseError } = await supabase.from("users").insert({
        name: user.name,
        login: user.login,
        password: user.password,
        type: user.type,
      });

      if (supabaseError) {
        throw supabaseError;
      }

      invalidateUsers(); // Invalidate cache before fetching
      await fetchUsers(false); // Force fresh fetch
    } catch (err) {
      console.error("Erro ao adicionar usuário:", err);
      const message = err instanceof Error ? err.message : "Erro ao adicionar usuário";
      setError(message);
      throw err;
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
        .from("users")
        .update(dbUpdates)
        .eq("id", id);

      if (supabaseError) {
        throw supabaseError;
      }

      invalidateUsers(); // Invalidate cache before fetching
      await fetchUsers(false); // Force fresh fetch
    } catch (err) {
      console.error("Erro ao atualizar usuário:", err);
      const message = err instanceof Error ? err.message : "Erro ao atualizar usuário";
      setError(message);
      throw err;
    }
  };

  const deleteUser = async (id: string) => {
    try {
      const { error: supabaseError } = await supabase
        .from("users")
        .delete()
        .eq("id", id);

      if (supabaseError) {
        throw supabaseError;
      }

      invalidateUsers(); // Invalidate cache before fetching
      await fetchUsers(false); // Force fresh fetch
    } catch (err) {
      console.error("Erro ao deletar usuário:", err);
      const message = err instanceof Error ? err.message : "Erro ao deletar usuário";
      setError(message);
      throw err;
    }
  };

  const deleteSalesFromClient = async (
    clientDocument: string,
    saleNumbers: number[],
  ) => {
    try {
      setGlobalLoading(
        true,
        `Deletando ${saleNumbers.length} venda(s) do cliente ${clientDocument}...`,
      );
      setLoading(true);

      if (!isOnline) {
        throw new Error("Não é possível deletar vendas offline.");
      }

      // 1. Delete from BANCO_DADOS (collections/installments)
      const validSaleNumbers = saleNumbers.filter((num) => num > 0);
      const includesRenegotiated = saleNumbers.includes(0);

      let collectionsQuery = supabase
        .from("BANCO_DADOS")
        .delete()
        .eq("documento", clientDocument);

      if (validSaleNumbers.length > 0 && includesRenegotiated) {
        collectionsQuery = collectionsQuery.or(
          `venda_n.in.(${validSaleNumbers.join(",")}),venda_n.is.null`,
        );
      } else if (validSaleNumbers.length > 0) {
        collectionsQuery = collectionsQuery.in("venda_n", validSaleNumbers);
      } else if (includesRenegotiated) {
        collectionsQuery = collectionsQuery.is("venda_n", null);
      }

      const { error: collectionsError } = await collectionsQuery;

      if (collectionsError) {
        throw collectionsError;
      }

      // 2. Delete from sale_payments
      let paymentsQuery = supabase
        .from("sale_payments")
        .delete()
        .eq("client_document", clientDocument);

      if (validSaleNumbers.length > 0 && includesRenegotiated) {
        paymentsQuery = paymentsQuery.or(
          `sale_number.in.(${validSaleNumbers.join(",")}),sale_number.eq.0`,
        );
      } else if (validSaleNumbers.length > 0) {
        paymentsQuery = paymentsQuery.in("sale_number", validSaleNumbers);
      } else if (includesRenegotiated) {
        paymentsQuery = paymentsQuery.eq("sale_number", 0);
      }

      const { error: paymentsError } = await paymentsQuery;

      if (paymentsError) {
        console.warn(
          `Aviso: Erro ao deletar pagamentos das vendas ${saleNumbers} do cliente ${clientDocument}:`,
          paymentsError.message,
        );
      }

      console.log(
        `✅ ${saleNumbers.length} venda(s) do cliente ${clientDocument} e pagamentos relacionados deletados.`,
      );

      // After deleting sales, check if the client still has any remaining sales
      const { data: remainingSales, error: fetchRemainingSalesError } =
        await supabase
          .from("BANCO_DADOS")
          .select("venda_n")
          .eq("documento", clientDocument)
          .limit(1); // Only need to know if at least one exists

      if (fetchRemainingSalesError) {
        console.error(
          "Erro ao verificar vendas restantes do cliente:",
          fetchRemainingSalesError,
        );
        // Continue without deleting other client data if we can't verify remaining sales
      } else if (!remainingSales || remainingSales.length === 0) {
        console.log(
          `Cliente ${clientDocument} não possui mais vendas. Deletando dados relacionados (visitas, histórico de autorização).`,
        );

        // 3. Delete from scheduled_visits
        const { error: visitsError } = await supabase
          .from("scheduled_visits")
          .delete()
          .eq("client_document", clientDocument);

        if (visitsError) {
          console.warn(
            `Aviso: Erro ao deletar visitas agendadas do cliente ${clientDocument}:`,
            visitsError.message,
          );
        }

        // 4. Delete from authorization_history
        const { error: authHistoryError } = await supabase
          .from("authorization_history")
          .delete()
          .eq("client_document", clientDocument);

        if (authHistoryError) {
          console.warn(
            `Aviso: Erro ao deletar histórico de autorização do cliente ${clientDocument}:`,
            authHistoryError.message,
          );
        }
      }

      await refreshData(); // Refresh all data after deletion
    } catch (err) {
      console.error(
        `Erro ao deletar vendas ${saleNumbers} do cliente ${clientDocument}:`,
        err,
      );
      setError(err instanceof Error ? err.message : "Erro ao deletar vendas");
      throw err;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const bulkDeleteClients = async (clientDocuments: string[]) => {
    try {
      setGlobalLoading(true, `Deletando ${clientDocuments.length} clientes...`);
      setLoading(true);

      if (!isOnline) {
        throw new Error("Não é possível deletar clientes offline.");
      }

      // 1. Delete from BANCO_DADOS (collections)
      const { error: collectionsError } = await supabase
        .from("BANCO_DADOS")
        .delete()
        .in("documento", clientDocuments);

      if (collectionsError) throw collectionsError;

      // 2. Delete from sale_payments
      const { error: paymentsError } = await supabase
        .from("sale_payments")
        .delete()
        .in("client_document", clientDocuments);
      if (paymentsError)
        console.warn(
          `Aviso: Erro ao deletar pagamentos:`,
          paymentsError.message,
        );

      // 3. Delete from scheduled_visits
      const { error: visitsError } = await supabase
        .from("scheduled_visits")
        .delete()
        .in("client_document", clientDocuments);
      if (visitsError)
        console.warn(`Aviso: Erro ao deletar visitas:`, visitsError.message);

      // 4. Delete from authorization_history
      const { error: authHistoryError } = await supabase
        .from("authorization_history")
        .delete()
        .in("client_document", clientDocuments);
      if (authHistoryError)
        console.warn(
          `Aviso: Erro ao deletar histórico de autorização:`,
          authHistoryError.message,
        );

      console.log(
        `✅ ${clientDocuments.length} clientes e dados relacionados deletados.`,
      );
      await refreshData();
    } catch (err) {
      console.error(`Erro ao deletar clientes em massa:`, err);
      setError(err instanceof Error ? err.message : "Erro ao deletar clientes");
      throw err;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const deleteClient = async (clientDocument: string) => {
    try {
      setGlobalLoading(true, `Deletando cliente ${clientDocument}...`);
      setLoading(true);

      if (!isOnline) {
        throw new Error("Não é possível deletar clientes offline.");
      }

      // 1. Delete from BANCO_DADOS (collections)
      const { error: collectionsError } = await supabase
        .from("BANCO_DADOS")
        .delete()
        .eq("documento", clientDocument);

      if (collectionsError) {
        throw collectionsError;
      }

      // 2. Delete from sale_payments
      const { error: paymentsError } = await supabase
        .from("sale_payments")
        .delete()
        .eq("client_document", clientDocument);

      if (paymentsError) {
        console.warn(
          `Aviso: Erro ao deletar pagamentos do cliente ${clientDocument}:`,
          paymentsError.message,
        );
        // Don't throw, as collections might have been deleted successfully
      }

      // 3. Delete from scheduled_visits
      const { error: visitsError } = await supabase
        .from("scheduled_visits")
        .delete()
        .eq("client_document", clientDocument);

      if (visitsError) {
        console.warn(
          `Aviso: Erro ao deletar visitas agendadas do cliente ${clientDocument}:`,
          visitsError.message,
        );
      }

      // 4. Delete from authorization_history
      const { error: authHistoryError } = await supabase
        .from("authorization_history")
        .delete()
        .eq("client_document", clientDocument);

      if (authHistoryError) {
        console.warn(
          `Aviso: Erro ao deletar histórico de autorização do cliente ${clientDocument}:`,
          authHistoryError.message,
        );
      }

      console.log(
        `✅ Cliente ${clientDocument} e dados relacionados deletados.`,
      );
      await refreshData(); // Refresh all data after deletion
    } catch (err) {
      console.error(`Erro ao deletar cliente ${clientDocument}:`, err);
      setError(err instanceof Error ? err.message : "Erro ao deletar cliente");
      throw err;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const fetchMonthlyGoals = async (useCache = true) => {
    try {
      const cacheKey = "monthly_goals";
      if (useCache) {
        const cachedData = dataCache.get<MonthlyGoal[]>(cacheKey);
        if (cachedData) {
          setMonthlyGoals(cachedData);
          return;
        }
      }

      const { data, error } = await supabase.from("monthly_goals").select("*");

      if (error) {
        throw error;
      }

      setMonthlyGoals(data || []);
      dataCache.set(cacheKey, data || []);
    } catch (err) {
      console.error("Erro ao carregar metas mensais:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar metas mensais",
      );
    }
  };

  const setMonthlyGoal = async (
    goal: Omit<MonthlyGoal, "id" | "created_at" | "updated_at">,
  ) => {
    try {
      const { data, error } = await supabase
        .from("monthly_goals")
        .upsert(
          {
            user_id: goal.user_id,
            month: goal.month,
            visits_goal: goal.visits_goal,
            payments_goal: goal.payments_goal,
          },
          { onConflict: "user_id,month" },
        )
        .select();

      if (error) {
        throw error;
      }

      // Refresh local state
      await fetchMonthlyGoals(false);

      return data;
    } catch (err) {
      console.error("Erro ao salvar meta mensal:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao salvar meta mensal",
      );
      throw err;
    }
  };

  const getFilteredCollections = (
    filters: FilterOptions,
    userType: UserType,
    collectorId?: string,
  ): Collection[] => {
    let filtered = collections;

    // Filtrar por cobrador se o usuário for cobrador
    if (userType !== "manager" && collectorId) {
      // Obter lojas atribuídas a este cobrador
      const assignedStores: string[] = [];
      filtered = filtered.filter(
        (c) =>
          c.user_id === collectorId ||
          assignedStores.includes(c.nome_da_loja || ""),
      );
    }

    // Helper function to parse date strings (supports multiple formats)
    const parseDate = (dateStr: string): Date | null => {
      if (!dateStr) return null;

      try {
        const cleanDateStr = dateStr.trim();

        // Match DD/MM/YYYY or DD-MM-YYYY
        const brazilMatch = cleanDateStr.match(
          /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/,
        );
        if (brazilMatch) {
          const day = parseInt(brazilMatch[1], 10);
          const month = parseInt(brazilMatch[2], 10);
          const year = parseInt(brazilMatch[3], 10);
          // Create date in UTC to avoid timezone shifts
          return new Date(Date.UTC(year, month - 1, day));
        }

        // Match YYYY-MM-DD (from filter input)
        const isoMatch = cleanDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
          const year = parseInt(isoMatch[1], 10);
          const month = parseInt(isoMatch[2], 10);
          const day = parseInt(isoMatch[3], 10);
          // Create date in UTC
          return new Date(Date.UTC(year, month - 1, day));
        }

        // Fallback for other standard formats
        const date = new Date(cleanDateStr);
        if (!isNaN(date.getTime())) {
          return new Date(
            Date.UTC(
              date.getUTCFullYear(),
              date.getUTCMonth(),
              date.getUTCDate(),
            ),
          );
        }

        return null;
      } catch {
        return null;
      }
    };

    // Apply overdueOnly filter
    if (filters.overdueOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      filtered = filtered.filter((c) => {
        const dueDate = parseDate(c.data_vencimento || "");
        if (!dueDate) return false;
        dueDate.setHours(0, 0, 0, 0);

        const isOverdue = dueDate < today;
        const isPending = (c.valor_recebido || 0) < (c.valor_original || 0);
        return isOverdue && isPending;
      });
    }

    // Apply highValueOnly filter
    if (filters.highValueOnly) {
      filtered = filtered.filter((c) => (c.valor_original || 0) > 1000);
    }

    // Apply amount range filters - based on total client amount, not individual installments
    if (
      (filters.minAmount !== undefined && filters.minAmount > 0) ||
      (filters.maxAmount !== undefined && filters.maxAmount > 0)
    ) {
      // Group collections by client to calculate total pending amount
      const clientGroups = new Map<string, Collection[]>();
      filtered.forEach((c) => {
        const key = `${c.documento}-${c.cliente}`;
        if (!clientGroups.has(key)) {
          clientGroups.set(key, []);
        }
        clientGroups.get(key)!.push(c);
      });

      // Filter clients based on their total pending amount
      const targetClientKeys = new Set<string>();
      clientGroups.forEach((clientCollections, clientKey) => {
        const totalValue = clientCollections.reduce(
          (sum, c) => sum + c.valor_original,
          0,
        );
        const totalReceived = clientCollections.reduce(
          (sum, c) => sum + c.valor_recebido,
          0,
        );
        const pendingValue = Math.max(0, totalValue - totalReceived);

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
      filtered = filtered.filter((c) => {
        const key = `${c.documento}-${c.cliente}`;
        return targetClientKeys.has(key);
      });
    }

    // Apply existing status filter
    if (filters.status) {
      // Para filtros 'parcial' e 'pago', precisamos de lógica especial para status do cliente
      if (
        filters.status?.toLowerCase() === "parcial" ||
        filters.status?.toLowerCase() === "pago"
      ) {
        // Agrupar por cliente para verificar status do cliente
        const clientGroups = new Map<string, Collection[]>();
        filtered.forEach((c) => {
          const key = `${c.documento}-${c.cliente}`;
          if (!clientGroups.has(key)) {
            clientGroups.set(key, []);
          }
          clientGroups.get(key)!.push(c);
        });

        // Filtrar clientes baseado no status solicitado
        const targetClientKeys = new Set<string>();
        clientGroups.forEach((clientCollections, clientKey) => {
          const totalValue = clientCollections.reduce(
            (sum, c) => sum + c.valor_original,
            0,
          );
          const totalReceived = clientCollections.reduce(
            (sum, c) => sum + c.valor_recebido,
            0,
          );
          const pendingValue = Math.max(0, totalValue - totalReceived);

          if (filters.status?.toLowerCase() === "parcial") {
            // Cliente é parcial se tem valor recebido E ainda tem valor pendente
            if (totalReceived > 0 && pendingValue > 0) {
              targetClientKeys.add(clientKey);
            }
          } else if (filters.status?.toLowerCase() === "pago") {
            // Cliente é pago apenas se não tem nenhum valor pendente E tem valor recebido (completamente quitado)
            if (pendingValue <= 0.01 && totalReceived > 0) {
              targetClientKeys.add(clientKey);
            }
          }
        });

        // Filtrar collections dos clientes que atendem ao critério
        filtered = filtered.filter((c) => {
          const key = `${c.documento}-${c.cliente}`;
          return targetClientKeys.has(key);
        });
        // Para outros filtros, incluindo 'pendente', usar lógica de cliente
      } else if (filters.status?.toLowerCase() === "pendente") {
        const clientGroups = new Map<string, Collection[]>();
        filtered.forEach((c) => {
          const key = `${c.documento}-${c.cliente}`;
          if (!clientGroups.has(key)) {
            clientGroups.set(key, []);
          }
          clientGroups.get(key)!.push(c);
        });

        const targetClientKeys = new Set<string>();
        clientGroups.forEach((clientCollections, clientKey) => {
          const totalValue = clientCollections.reduce(
            (sum, c) => sum + c.valor_original,
            0,
          );
          const totalReceived = clientCollections.reduce(
            (sum, c) => sum + c.valor_recebido,
            0,
          );
          const pendingValue = Math.max(0, totalValue - totalReceived);

          // Cliente é pendente se não tem valor recebido E ainda tem valor pendente
          if (totalReceived <= 0.01 && pendingValue > 0) {
            targetClientKeys.add(clientKey);
          }
        });

        filtered = filtered.filter((c) => {
          const key = `${c.documento}-${c.cliente}`;
          return targetClientKeys.has(key);
        });
      } else {
        // Para qualquer outro status não tratado acima, usar a lógica de parcela individual
        filtered = filtered.filter((c) => {
          const currentStatus = c.status?.toLowerCase() || "pendente";
          const filterStatus = filters.status?.toLowerCase();

          if (!filterStatus) return true; // No status filter

          if (filterStatus === "pago") {
            return (
              currentStatus === "pago" || currentStatus === "pago com desconto"
            );
          }

          // For other statuses like 'parcial' or 'pendente', do an exact match.
          return currentStatus === filterStatus;
        });
      }
    }

    if (filters.dueDate) {
      filtered = filtered.filter((c) => c.data_vencimento === filters.dueDate);
    }

    if (filters.collector) {
      filtered = filtered.filter((c) => c.user_id === filters.collector);
    }

    if (filters.store) {
      filtered = filtered.filter((c) => c.nome_da_loja === filters.store);
    }

    if (filters.city) {
      filtered = filtered.filter((c) => c.cidade === filters.city);
    }

    if (filters.neighborhood) {
      filtered = filtered.filter((c) => c.bairro === filters.neighborhood);
    }

    // Filtro por período de data de vencimento (dateFrom/dateTo)
    if (filters.dateFrom || filters.dateTo) {
      const toYYYYMMDD = (dateStr: string): string | null => {
        if (!dateStr || typeof dateStr !== "string") return null;

        // Case 1: Already in YYYY-MM-DD format (from filter input or data)
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.substring(0, 10))) {
          return dateStr.substring(0, 10);
        }

        // Case 2: In DD/MM/YYYY or DD-MM-YYYY format (from data)
        const parts = dateStr.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
        if (parts) {
          const [, day, month, year] = parts;
          return `${year}-${month}-${day}`;
        }

        // Fallback for full Date objects that might have been created
        try {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
          }
        } catch (e) {
          // Ignore errors from invalid date strings
        }

        return null; // Unknown/invalid format
      };

      filtered = filtered.filter((c) => {
        // Skip items where data_vencimento is null
        if (!c.data_vencimento) return false;

        const comparableDueDate = toYYYYMMDD(c.data_vencimento);
        if (!comparableDueDate) return false;

        let matches = true;
        if (filters.dateFrom) {
          matches = matches && comparableDueDate >= filters.dateFrom;
        }
        if (filters.dateTo) {
          matches = matches && comparableDueDate <= filters.dateTo;
        }
        return matches;
      });
    }

    // Filtro por período de data de lançamento (launchDateFrom/launchDateTo)
    if (filters.launchDateFrom || filters.launchDateTo) {
      const toYYYYMMDD = (dateStr: string): string | null => {
        if (!dateStr || typeof dateStr !== "string") return null;

        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.substring(0, 10))) {
          return dateStr.substring(0, 10);
        }

        const parts = dateStr.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
        if (parts) {
          const [, day, month, year] = parts;
          return `${year}-${month}-${day}`;
        }

        try {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
          }
        } catch (e) {
          // Ignore errors from invalid date strings
        }

        return null;
      };

      filtered = filtered.filter((c) => {
        if (!c.data_lancamento) return false;

        const comparableLaunchDate = toYYYYMMDD(c.data_lancamento);
        if (!comparableLaunchDate) return false;

        let matches = true;
        if (filters.launchDateFrom) {
          matches = matches && comparableLaunchDate >= filters.launchDateFrom;
        }
        if (filters.launchDateTo) {
          matches = matches && comparableLaunchDate <= filters.launchDateTo;
        }
        return matches;
      });
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.cliente?.toLowerCase().includes(searchLower) ||
          c.documento?.toLowerCase().includes(searchLower) ||
          c.apelido?.toLowerCase().includes(searchLower) ||
          c.numero_titulo?.toString().includes(searchLower) ||
          c.venda_n?.toString().includes(searchLower) ||
          c.id_parcela?.toString().includes(searchLower),
      );
    }

    // Apply visitsOnly filter - show only clients with scheduled visits
    if (filters.visitsOnly && userType !== "manager" && collectorId) {
      const collectorVisits = getVisitsByCollector(collectorId).filter(
        (visit) => visit.status === "agendada",
      );

      const clientsWithVisits = new Set(
        collectorVisits.map((visit) => visit.clientDocument),
      );

      filtered = filtered.filter(
        (c) => c.documento && clientsWithVisits.has(c.documento),
      );
    }

    return filtered;
  };

  const getClientGroups = useMemo(
    () =>
      (collectorId?: string): ClientGroup[] => {
        const cacheKey = `client-groups-${collectorId || "all"}`;

        const cachedData = dataCache.get<ClientGroup[]>(cacheKey);
        if (cachedData) {
          return cachedData;
        }

        let filteredCollections = collections;

        if (collectorId) {
          const profileUser = users.find((u) => u.id === collectorId);
          const profileType = profileUser?.type;
          const assignedStores: string[] = [];

          filteredCollections = collections.filter((c) => {
            const isAssigned =
              c.user_id === collectorId ||
              assignedStores.includes(c.nome_da_loja || "");

            // Non-external collectors see only clients assigned directly to them
            if (profileType !== "collector") {
              return isAssigned;
            }

            // External collectors don't see clients that moved to a later phase
            const movedToLaterPhase =
              c.situacao != null &&
              (situacoesOutsideProfile("collector") as string[]).includes(c.situacao);

            return isAssigned && !movedToLaterPhase;
          });
        }

        const clientMap = new Map<string, ClientGroup>();
        let skippedCollectionsCount = 0;

        filteredCollections.forEach((collection) => {
          const clientId = collection.documento?.trim();
          if (!clientId) {
            skippedCollectionsCount++;
            return;
          }

          if (!clientMap.has(clientId)) {
            clientMap.set(clientId, {
              clientId,
              client: collection.cliente || "Cliente sem nome",
              document: clientId,
              apelido: collection.apelido || undefined,
              phone: collection.telefone || undefined,
              mobile: collection.celular || undefined,
              address: collection.endereco || "",
              number: collection.numero || "",
              neighborhood: collection.bairro || "",
              city: collection.cidade || "",
              state: collection.estado || "",
              complemento: collection.complemento || undefined,
              cep: collection.cep || undefined,
              sales: [],
              totalValue: 0,
              totalReceived: 0,
              totalDiscount: 0,
              pendingValue: 0,
            });
          }

          const clientGroup = clientMap.get(clientId)!;

          let saleGroup = clientGroup.sales.find(
            (s) => s.saleNumber === (collection.venda_n || 0),
          );
          if (!saleGroup) {
            saleGroup = {
              saleNumber: collection.venda_n || 0,
              titleNumber: collection.numero_titulo || 0,
              description: collection.descricao || "",
              installments: [],
              totalValue: 0,
              totalReceived: 0,
              pendingValue: 0,
              saleStatus: "pending",
              payments: [],
              clientDocument: collection.documento || "",
            };
            clientGroup.sales.push(saleGroup!);
          }

          saleGroup.installments.push(collection);
        });

        clientMap.forEach((clientGroup) => {
          const roundTo2Decimals = (num: number) =>
            Math.round((num + Number.EPSILON) * 100) / 100;

          let clientTotalDiscount = 0;

          clientGroup.sales.forEach((saleGroup) => {
            const saleTotalValue = saleGroup.installments.reduce(
              (sum, inst) => sum + (inst.valor_original || 0),
              0,
            );
            const saleTotalReceived = saleGroup.installments.reduce(
              (sum, inst) => sum + (inst.valor_recebido || 0),
              0,
            );
            const saleTotalDiscount = saleGroup.installments.reduce(
              (sum, inst) => sum + (inst.desconto || 0),
              0,
            );

            saleGroup.totalValue = roundTo2Decimals(saleTotalValue);
            saleGroup.totalReceived = roundTo2Decimals(saleTotalReceived);
            saleGroup.totalDiscount = roundTo2Decimals(saleTotalDiscount);
            saleGroup.pendingValue = roundTo2Decimals(
              saleTotalValue - saleTotalReceived - saleTotalDiscount,
            );

            const effectiveSalePaid = saleTotalReceived + saleTotalDiscount;
            saleGroup.saleStatus =
              effectiveSalePaid === 0
                ? "pending"
                : saleGroup.pendingValue <= 0.01
                  ? "fully_paid"
                  : "partially_paid";

            clientTotalDiscount += saleGroup.totalDiscount;
          });

          const clientTotalValue = clientGroup.sales.reduce(
            (sum, sale) => sum + sale.totalValue,
            0,
          );
          const clientTotalReceived = clientGroup.sales.reduce(
            (sum, sale) => sum + sale.totalReceived,
            0,
          );

          clientGroup.totalValue = roundTo2Decimals(clientTotalValue);
          clientGroup.totalReceived = roundTo2Decimals(clientTotalReceived);
          clientGroup.totalDiscount = roundTo2Decimals(clientTotalDiscount);
          clientGroup.pendingValue = roundTo2Decimals(
            clientTotalValue - clientTotalReceived - clientTotalDiscount,
          );
        });

        if (skippedCollectionsCount > 0) {
          console.warn(
            `[getClientGroups] Skipped ${skippedCollectionsCount} collection entries because they were missing a 'documento'.`,
          );
        }

        const result = Array.from(clientMap.values()).sort((a, b) =>
          a.client.localeCompare(b.client),
        );

        dataCache.set(cacheKey, result);

        return result;
      },
    [collections],
  );

  const getDashboardStats = useMemo(
    () => (): DashboardStats => {
      const cacheKey = "dashboard-stats";

      // Try to get from cache first
      const cachedData = statsCache.get<DashboardStats>(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const totalPending = collections.filter(
        (c) => c.status?.toLowerCase() === "pendente",
      ).length;
      const totalOverdue = collections.filter((c) => {
        const isPending = (c.valor_original || 0) - (c.valor_recebido || 0) > 0.01;
        return isPending && calculateOverdueDays(c.data_vencimento) > 0;
      }).length;
      const totalReceived = collections.filter(
        (c) => c.status?.toLowerCase() === "recebido" || c.valor_recebido > 0,
      ).length;
      const totalAmount = collections.reduce(
        (sum, c) => sum + c.valor_original,
        0,
      );
      const receivedAmount = collections.reduce(
        (sum, c) => sum + c.valor_recebido,
        0,
      );
      const pendingAmount = totalAmount - receivedAmount;
      const conversionRate =
        collections.length > 0 ? (totalReceived / collections.length) * 100 : 0;
      const collectorsCount = users.filter(
        (u) => u.type === "collector",
      ).length;

      const result = {
        totalPending,
        totalOverdue,
        totalReceived,
        totalAmount,
        receivedAmount,
        pendingAmount,
        conversionRate,
        collectorsCount,
      };

      // Cache the result
      statsCache.set(cacheKey, result);

      return result;
    },
    [collections, users],
  );

  const getCollectorPerformance = useMemo(
    () => (): CollectorPerformance[] => {
      const cacheKey = "collector-performance";

      // Try to get from cache first
      const cachedData = statsCache.get<CollectorPerformance[]>(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const collectors = users.filter((u) => u.type === "collector");

      const result = collectors.map((collector) => {
        const assignedStores: string[] = [];
        const collectorCollections = collections.filter(
          (c) =>
            c.user_id === collector.id ||
            assignedStores.includes(c.nome_da_loja || ""),
        );

        // Contar clientes únicos usando documento (CPF) como identificador
        const uniqueClients = new Set<string>();
        collectorCollections.forEach((collection) => {
          if (collection.documento && collection.documento.trim()) {
            uniqueClients.add(collection.documento.trim());
          }
        });
        const clientCount = uniqueClients.size;

        // Agrupar por venda (venda_n + documento)
        const salesMap = new Map<
          string,
          {
            totalValue: number;
            receivedValue: number;
            status: "pendente" | "parcial" | "pago";
            installments: Collection[];
          }
        >();

        collectorCollections.forEach((collection) => {
          const saleKey = `${collection.venda_n}-${collection.documento}`;
          if (!salesMap.has(saleKey)) {
            salesMap.set(saleKey, {
              totalValue: 0,
              receivedValue: 0,
              status: "pendente",
              installments: [],
            });
          }

          const sale = salesMap.get(saleKey)!;
          sale.totalValue =
            Number(sale.totalValue) + Number(collection.valor_original);
          sale.receivedValue =
            Number(sale.receivedValue) + Number(collection.valor_recebido);
          sale.installments.push(collection);
        });

        // Determinar status das vendas
        salesMap.forEach((sale) => {
          const pendingValue = Math.max(
            0,
            sale.totalValue - sale.receivedValue,
          );
          if (sale.receivedValue > 0 && pendingValue > 0) {
            sale.status = "parcial";
          } else if (pendingValue <= 0.01 && sale.receivedValue > 0) {
            sale.status = "pago";
          } else {
            sale.status = "pendente";
          }
        });

        const salesArray = Array.from(salesMap.values());
        const totalAssigned = salesArray.length; // Total de vendas atribuídas
        const totalReceived = salesArray.filter(
          (s) => s.status === "pago",
        ).length; // Vendas totalmente pagas
        const totalAmount = salesArray.reduce(
          (sum, s) => sum + s.totalValue,
          0,
        );
        const receivedAmount = salesArray.reduce(
          (sum, s) => sum + s.receivedValue,
          0,
        );
        const conversionRate =
          totalAssigned > 0 ? (totalReceived / totalAssigned) * 100 : 0;

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
          clientCount,
        };
      });

      // Sort by conversionRate descending before caching and returning
      result.sort((a, b) => b.conversionRate - a.conversionRate);

      // Cache the result
      statsCache.set(cacheKey, result);

      return result;
    },
    [collections, users],
  );

  const getCollectorCollections = (collectorId: string): Collection[] => {
    const profileUser = users.find((u) => u.id === collectorId);
    const profileType = profileUser?.type;
    const assignedStores: string[] = [];

    return collections.filter((c) => {
      const isAssigned =
        c.user_id === collectorId ||
        assignedStores.includes(c.nome_da_loja || "");

      if (profileType !== "collector") return isAssigned;

      const movedToLaterPhase =
        c.situacao != null &&
        (situacoesOutsideProfile("collector") as string[]).includes(c.situacao);

      return isAssigned && !movedToLaterPhase;
    });
  };

  const getAvailableStores = (): string[] => {
    const stores = new Set<string>();
    collections.forEach((c) => {
      if (c.nome_da_loja) {
        stores.add(c.nome_da_loja);
      }
    });
    return Array.from(stores).sort();
  };

  const refreshData = async (showLoading = true) => {
    if (showLoading) setGlobalLoading(true, "Atualizando dados...");
    try {
      invalidateCollections(); // Ensure collections are fresh
      invalidatePayments(); // Ensure sale payments are fresh
      invalidateUsers(); // Ensure users are fresh
      invalidateVisits(); // Ensure visits are fresh
      await Promise.all([
        fetchCollections(false), // Force fetch
        fetchUsers(false), // Force fetch
        fetchSalePayments(false), // Force fetch
        fetchScheduledVisits(false), // Force fetch
        fetchMonthlyGoals(false), // Force fetch monthly goals
        fetchActiveAddressHistory(),
      ]);
    } finally {
      if (showLoading) setGlobalLoading(false);
    }
  };

  const assignCollectorToClients = async (
    collectorId: string,
    clientIdentifiers: { document?: string; clientName?: string }[],
    skipRefresh = false,
    onBatchProgress?: (completed: number, total: number) => void,
  ) => {
    try {
      console.log(
        `Iniciando atribuição de ${clientIdentifiers.length} clientes ao cobrador ${collectorId}`,
      );

      const targetUser = users.find((u) => u.id === collectorId);
      const targetType = targetUser?.type;
      const situacaoUpdate =
        targetType === "internal_collector" || targetType === "third_party_collector"
          ? PRIMARY_SITUACAO[targetType]
          : undefined;

      // Lotes grandes: a RPC recebe os identificadores no corpo da requisicao
      // (sem risco de URL gigante) e faz UPDATE + historico numa unica transacao
      // no servidor (atomico). Substitui o antigo fluxo client-side de
      // SELECT + UPDATE + INSERT em requisicoes separadas e nao-transacionais.
      const batchSize = 500;
      let totalParcelasAtualizadas = 0;
      const totalBatches = Math.ceil(clientIdentifiers.length / batchSize);
      let batchesCompleted = 0;

      for (let i = 0; i < clientIdentifiers.length; i += batchSize) {
        const batch = clientIdentifiers.slice(i, i + batchSize);

        const documentBatch = batch
          .filter((id) => id.document)
          .map((id) => id.document as string);
        const clientNameBatch = batch
          .filter((id) => !id.document && id.clientName)
          .map((id) => id.clientName as string);

        const { data, error } = await supabase.rpc("atribuir_clientes_em_lote", {
          p_user_id: collectorId,
          p_documentos: documentBatch,
          p_clientes: clientNameBatch,
          p_situacao: situacaoUpdate,
          p_gerente_id: user?.id,
        });

        if (error) {
          console.error("Erro ao atribuir clientes (RPC):", error);
          throw error;
        }

        totalParcelasAtualizadas += data ?? 0;
        batchesCompleted++;
        onBatchProgress?.(batchesCompleted, totalBatches);
        console.log(
          `Lote ${batchesCompleted}/${totalBatches} concluído. Parcelas atualizadas até agora: ${totalParcelasAtualizadas}`,
        );
      }

      if (!skipRefresh) await refreshData();
      console.log(
        `✅ Atribuição concluída: ${clientIdentifiers.length} clientes (${totalParcelasAtualizadas} parcelas) atribuídos ao cobrador ${collectorId}`,
      );
    } catch (err) {
      console.error("Erro ao atribuir cobrador aos clientes:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao atribuir cobrador",
      );
      throw err;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const removeCollectorFromClients = async (
    clientIdentifiers: { document?: string; clientName?: string }[],
    skipRefresh = false,
    onBatchProgress?: (completed: number, total: number) => void,
  ) => {
    try {
      console.log(`Removendo cobrador de ${clientIdentifiers.length} clientes`);

      const batchSize = 200;
      let totalParcelasAtualizadas = 0;
      const totalBatches = Math.ceil(clientIdentifiers.length / batchSize);
      let batchesCompleted = 0;

      for (let i = 0; i < clientIdentifiers.length; i += batchSize) {
        const batch = clientIdentifiers.slice(i, i + batchSize);
        console.log(
          `Processando lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(clientIdentifiers.length / batchSize)} (${batch.length} identificadores)`,
        );

        const documentBatch = batch
          .filter((id) => id.document)
          .map((id) => id.document);
        const clientNameBatch = batch
          .filter((id) => !id.document && id.clientName)
          .map((id) => id.clientName);

        // Remove o cobrador filtrando direto por documento/cliente. Nao precisa
        // buscar antes a lista de id_parcela (sem historico aqui), o que elimina
        // um round-trip por lote e a lista gigante de ids na URL. O total
        // afetado vem do count: "exact" do proprio UPDATE.
        let updateError: any = null;
        let parcelasAfetadas = 0;

        if (documentBatch.length > 0) {
          const { error, count } = await supabase
            .from("BANCO_DADOS")
            .update({ user_id: null }, { count: "exact" })
            .in("documento", documentBatch as string[]);
          if (error) updateError = error;
          else parcelasAfetadas += count ?? 0;
        }

        if (clientNameBatch.length > 0 && !updateError) {
          const { error, count } = await supabase
            .from("BANCO_DADOS")
            .update({ user_id: null }, { count: "exact" })
            .in("cliente", clientNameBatch as string[]);
          if (error) updateError = error;
          else parcelasAfetadas += count ?? 0;
        }

        if (updateError) {
          console.error("Erro ao atualizar parcelas do lote:", updateError);
          throw updateError;
        }

        totalParcelasAtualizadas += parcelasAfetadas;
        batchesCompleted++;
        onBatchProgress?.(batchesCompleted, totalBatches);
        console.log(
          `Lote processado com sucesso. Total de parcelas atualizadas até agora: ${totalParcelasAtualizadas}`,
        );
      }

      if (!skipRefresh) await refreshData();
      console.log(
        `✅ Remoção concluída: ${clientIdentifiers.length} clientes (${totalParcelasAtualizadas} parcelas) removidos do cobrador`,
      );
    } catch (err) {
      console.error("Erro ao remover cobrador dos clientes:", err);
      setError(err instanceof Error ? err.message : "Erro ao remover cobrador");
      throw err;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  // === SALE PAYMENT FUNCTIONS ===

  const fetchSalePayments = async (useCache = true) => {
    try {
      const cacheKey = "sale-payments";

      // Try to get from cache first
      if (useCache) {
        const cachedData = dataCache.get<SalePayment[]>(cacheKey);
        if (cachedData) {
          console.log("Dados de sale payments carregados do cache");
          setSalePayments(cachedData);
          return;
        }
      }

      console.log("Buscando pagamentos de venda da tabela sale_payments...");

      const { data: payments, error } = await supabase
        .from("sale_payments")
        .select("*")
        .order("payment_date", { ascending: false });

      if (error) {
        console.error("Erro ao buscar pagamentos:", error);
        throw error;
      }

      // Converter para o formato esperado pela aplicação
      const convertedPayments = (payments || []).map(
        (payment) =>
          ({
          id: payment.id,
          saleNumber: payment.sale_number,
          clientDocument: payment.client_document,
          paymentAmount: payment.payment_amount,
          paymentDate: payment.payment_date,
          paymentMethod: payment.payment_method,
          notes: payment.notes,
          collectorId: payment.collector_id,
          collectorName: payment.collector_name,
          createdAt: payment.created_at,
          distribution_details: payment.distribution_details || [], // Corrected casing
          discountAmount: payment.discount_amount, // Added this line
        }) as unknown as SalePayment,
      );

      setSalePayments(convertedPayments);

      // Cache the data
      dataCache.set(cacheKey, convertedPayments);

      console.log(
        `✅ ${convertedPayments.length} pagamentos carregados da tabela sale_payments`,
      );
    } catch (err) {
      console.error("Erro ao carregar pagamentos de venda:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar pagamentos",
      );
      // Em caso de erro, definir array vazio
      setSalePayments([]);
    }
  };

  const processSalePayment = async (
    payment: SalePaymentInput & { discountAmount?: number },
    collectorId: string,
  ) => {
    setGlobalLoading(true, "Processando pagamento...");
    try {
      // OFFLINE LOGIC
      if (!isOnline) {
        console.log("Modo offline: Adicionando pagamento à fila");
        addToOfflineQueue({
          type: "DISTRIBUTE_PAYMENT",
          data: {
            saleNumber: payment.saleNumber,
            clientDocument: payment.clientDocument,
            paymentAmount: payment.paymentAmount || 0,
            discountAmount: payment.discountAmount || 0,
            paymentMethod: payment.paymentMethod,
            notes: payment.notes,
            collectorId: collectorId,
          },
        });
        console.log("✅ Pagamento adicionado à fila offline");
        return; // Exit early
      }

      // ONLINE LOGIC
      console.log("Chamando RPC process_payment para venda:", payment);
      const { error } = await supabase.rpc("process_payment", {
        p_collector_id: collectorId,
        p_client_document: payment.clientDocument,
        p_payment_amount: payment.paymentAmount || 0,
        p_discount_amount: payment.discountAmount || 0,
        p_payment_method: payment.paymentMethod || "default",
        p_notes: payment.notes || "",
        p_sale_number: payment.saleNumber ?? undefined,
      });

      if (error) {
        console.error("Erro ao chamar RPC process_payment:", error);
        throw new Error(`Erro no processamento do pagamento: ${error.message}`);
      }

      console.log("✅ RPC process_payment executado com sucesso.");
      await refreshData();
    } catch (err) {
      console.error("Erro ao processar pagamento de venda:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao processar pagamento",
      );
      throw err;
    } finally {
      setGlobalLoading(false);
    }
  };

  const processGeneralPayment = async (
    clientDocument: string,
    paymentAmount: number,
    paymentMethod: string,
    notes: string,
    collectorId: string,
    discountAmount?: number,
    saleNumber?: number | null,
  ) => {
    setGlobalLoading(true, "Processando pagamento...");
    try {
      // OFFLINE LOGIC
      if (!isOnline) {
        console.log("Modo offline: Adicionando pagamento geral à fila");
        addToOfflineQueue({
          type: "DISTRIBUTE_PAYMENT",
          data: {
            saleNumber: 0, // Garantir que seja 0 e nunca null
            clientDocument: clientDocument,
            paymentAmount: paymentAmount,
            discountAmount: discountAmount || 0, // Use new parameter
            paymentMethod: paymentMethod,
            notes: notes,
            collectorId: collectorId,
          },
        });
        console.log("✅ Pagamento geral adicionado à fila offline");
        return; // Exit early
      }

      // ONLINE LOGIC
      console.log(
        "Chamando RPC process_payment para pagamento geral:",
        clientDocument,
      );
      const { error } = await supabase.rpc("process_payment", {
        p_collector_id: collectorId,
        p_client_document: clientDocument,
        p_payment_amount: paymentAmount || 0,
        p_discount_amount: discountAmount || 0, // Use new parameter
        p_payment_method: paymentMethod || "default",
        p_notes: notes || "",
        p_sale_number:
          saleNumber === null
            ? undefined
            : typeof saleNumber === "number"
              ? saleNumber
              : 0,
      });

      if (error) {
        console.error(
          "Erro ao chamar RPC process_payment para pagamento geral:",
          error,
        );
        throw new Error(
          `Erro no processamento do pagamento geral: ${error.message}`,
        );
      }

      console.log("✅ RPC process_payment (geral) executado com sucesso.");
      await refreshData();
    } catch (err) {
      console.error("Erro ao processar pagamento geral via RPC:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao processar pagamento geral",
      );
      throw err;
    } finally {
      setGlobalLoading(false);
    }
  };

  const recordPaymentAdjustment = async (
    saleNumber: number,
    clientDocument: string,
    clientName: string, // Added clientName
    adjustmentAmount: number,
    managerId: string,
    managerName: string,
    notes?: string,
  ) => {
    setGlobalLoading(true, "Registrando ajuste de pagamento...");
    try {
      // This try block should encompass all the logic that can throw errors
      console.log("Registrando ajuste de pagamento na tabela sale_payments:", {
        saleNumber,
        clientDocument,
        adjustmentAmount,
        managerId,
        managerName,
        notes,
      });

      if (adjustmentAmount === 0) {
        console.log("Ajuste de pagamento é zero, ignorando registro.");
        return; // Exit early if no adjustment
      }

      const isNegativeAdjustment = adjustmentAmount < 0;
      const finalPaymentMethod = isNegativeAdjustment
        ? "Estorno/Ajuste Negativo"
        : "Ajuste Administrativo";
      const finalNotes =
        notes ||
        (isNegativeAdjustment
          ? "Estorno/Redução de valor recebido via edição do gerente"
          : "Ajuste de valor recebido via edição do gerente");

      const { error } = await supabase.from("sale_payments").insert({
        sale_number: saleNumber,
        client_document: clientDocument,
        client_name: clientName, // Added client_name
        payment_amount: adjustmentAmount, // Directly use adjustmentAmount (can be negative)
        payment_date: new Date().toISOString().split("T")[0], // Current date
        payment_method: finalPaymentMethod,
        notes: finalNotes,
        collector_id: managerId,
        collector_name: managerName,
        created_at: new Date().toISOString(),
        distribution_details: [], // No specific distribution for an adjustment
        is_agreement: false,
      });

      if (error) {
        console.error("Erro ao registrar ajuste de pagamento:", error);
        throw new Error(
          `Erro ao registrar ajuste de pagamento: ${error.message}`,
        );
      }

      console.log("✅ Ajuste de pagamento registrado com sucesso.");
      invalidatePayments(); // Invalidate cache to force refresh of sale payments
      await fetchSalePayments(false); // Force fresh fetch
    } catch (err) {
      // This catch block handles errors from the entire try block
      console.error("Erro ao processar ajuste de pagamento:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao registrar ajuste de pagamento",
      );
      throw err;
    } finally {
      setGlobalLoading(false);
    }
  };

  const getSalePayments = (
    saleNumber: number,
    clientDocument: string,
  ): SalePayment[] => {
    return salePayments.filter(
      (payment) =>
        payment.saleNumber === saleNumber &&
        payment.clientDocument === clientDocument,
    );
  };

  const calculateSaleBalance = (
    saleNumber: number,
    clientDocument: string,
  ): SaleBalance => {
    const saleInstallments = collections.filter((collection) => {
      if (saleNumber === 0) {
        // Para vendas renegociadas (saleNumber = 0), buscar parcelas sem venda_n
        return !collection.venda_n && collection.documento === clientDocument;
      } else {
        // Para vendas normais, buscar por venda_n
        return (
          collection.venda_n === saleNumber &&
          collection.documento === clientDocument
        );
      }
    });

    const roundTo2Decimals = (num: number) =>
      Math.round((num + Number.EPSILON) * 100) / 100;

    const totalValue = roundTo2Decimals(
      saleInstallments.reduce(
        (sum, inst) => sum + (inst.valor_original || 0),
        0,
      ),
    );
    const totalPaid = roundTo2Decimals(
      saleInstallments.reduce(
        (sum, inst) => sum + (inst.valor_recebido || 0),
        0,
      ),
    );
    const totalDiscount = roundTo2Decimals(
      saleInstallments.reduce((sum, inst) => sum + (inst.desconto || 0), 0),
    );

    const effectiveTotalPaid = totalPaid + totalDiscount;
    const remainingBalance = roundTo2Decimals(totalValue - effectiveTotalPaid);

    let status: "pending" | "partially_paid" | "fully_paid" = "pending";
    if (effectiveTotalPaid === 0) {
      status = "pending";
    } else if (remainingBalance > 0.01) {
      status = "partially_paid";
    } else {
      status = "fully_paid";
    }

    const installmentBreakdown = saleInstallments.map((inst) => {
      const paidValue = inst.valor_recebido || 0;
      const discountValue = inst.desconto || 0;
      const originalValue = inst.valor_original || 0;
      const remainingValue = originalValue - paidValue - discountValue;

      return {
        installmentId: inst.id_parcela,
        originalValue: originalValue,
        paidValue: paidValue,
        remainingValue: roundTo2Decimals(Math.max(0, remainingValue)),
        status: inst.status || "pendente",
      };
    });

    return {
      totalValue,
      totalPaid,
      totalDiscount,
      remainingBalance,
      status,
      installmentBreakdown,
    };
  };

  const getSalesByClient = React.useCallback(
    (clientDocument: string): SaleGroup[] => {
      // Agrupar collections por venda
      const salesMap = new Map<number, Collection[]>();
      const individualInstallments: Collection[] = [];

      collections
        .filter((collection) => collection.documento === clientDocument)
        .forEach((collection) => {
          const saleNumber = collection.venda_n;

          // Se não há número de venda, trata como parcela individual
          if (!saleNumber) {
            individualInstallments.push(collection);
          } else {
            // Agrupa por número de venda
            if (!salesMap.has(saleNumber)) {
              salesMap.set(saleNumber, []);
            }
            salesMap.get(saleNumber)!.push(collection);
          }
        });

      // Converter vendas agrupadas para SaleGroup
      const saleGroups = Array.from(salesMap.entries()).map(
        ([saleNumber, installments]) => {
          // Arredondar para 2 casas decimais para evitar problemas de precisão
          const roundTo2Decimals = (num: number) =>
            Math.round((num + Number.EPSILON) * 100) / 100;
          const totalValue = roundTo2Decimals(
            installments.reduce((sum, inst) => sum + inst.valor_original, 0),
          );
          // Limitar o valor recebido ao valor original para evitar valores negativos
          const totalReceived = roundTo2Decimals(
            Math.min(
              totalValue,
              installments.reduce((sum, inst) => sum + inst.valor_recebido, 0),
            ),
          );
          const pendingValue = Math.max(
            0,
            roundTo2Decimals(totalValue - totalReceived),
          );
          const balance = calculateSaleBalance(saleNumber, clientDocument);
          const payments = getSalePayments(saleNumber, clientDocument);
          return {
            saleNumber: saleNumber || 0, // Ensure saleNumber is always a number
            titleNumber: installments[0]?.numero_titulo || 0,
            description: installments[0]?.descricao || `Venda ${saleNumber}`,
            installments,
            totalValue,
            totalReceived,
            pendingValue,
            saleStatus: balance.status,
            payments,
            clientDocument,
          };
        },
      );

      // Converter parcelas individuais para uma única "Venda Renegociada"
      const renegotiatedSaleGroups =
        individualInstallments.length > 0
          ? [
              {
                saleNumber: 0, // Usar 0 para identificar como renegociada
                titleNumber: individualInstallments[0]?.numero_titulo || 0,
                description: `Renegociada (${individualInstallments.length} parcela${individualInstallments.length !== 1 ? "s" : ""})`,
                installments: individualInstallments,
                totalValue: individualInstallments.reduce(
                  (sum, inst) => sum + inst.valor_original,
                  0,
                ),
                totalReceived: Math.min(
                  individualInstallments.reduce(
                    (sum, inst) => sum + inst.valor_original,
                    0,
                  ),
                  individualInstallments.reduce(
                    (sum, inst) => sum + inst.valor_recebido,
                    0,
                  ),
                ),
                pendingValue: Math.max(
                  0,
                  individualInstallments.reduce(
                    (sum, inst) =>
                      sum +
                      Math.max(0, inst.valor_original - inst.valor_recebido),
                    0,
                  ),
                ),
                saleStatus: (() => {
                  const totalValue = individualInstallments.reduce(
                    (sum, inst) => sum + inst.valor_original,
                    0,
                  );
                  const totalReceived = Math.min(
                    totalValue,
                    individualInstallments.reduce(
                      (sum, inst) => sum + inst.valor_recebido,
                      0,
                    ),
                  );
                  const pendingValue = totalValue - totalReceived;

                  if (totalReceived === 0) return "pending" as const;
                  if (pendingValue <= 0.01) return "fully_paid" as const;
                  return "partially_paid" as const;
                })(),
                payments: getSalePayments(0, clientDocument), // Usar 0 para buscar pagamentos da renegociada
                clientDocument,
              },
            ]
          : [];

      // Retornar vendas agrupadas + venda renegociada
      return [...saleGroups, ...renegotiatedSaleGroups];
    },
    [collections, calculateSaleBalance, getSalePayments],
  );
  // NOVO: Função para pré-carregar dados dos clientes em batch
  const prefetchClientsData = React.useCallback(
    async (clientDocuments: string[]) => {
      try {
        // Filtrar apenas clientes que não estão no cache (usando o REF para ter o valor mais atualizado sem loop)
        const clientsToFetch = clientDocuments.filter(
          (doc) => !clientDataCacheRef.current.has(doc),
        );

        if (clientsToFetch.length === 0) {
          return;
        }

        console.log(
          `🔄 Pré-carregando dados de ${clientsToFetch.length} clientes em batch...`,
        );

        // ⭐ SOLUÇÃO ROBUSTA: Tentar .in() primeiro, se falhar usar OR
        let clientesData: any[] | null = null;
        let error: any = null;

        try {
          // Tentar com .in() primeiro
          const result = await supabase
            .from("clientes")
            .select("documento, created_at")
            .in("documento", clientsToFetch);

          clientesData = result.data;
          error = result.error;

          if (error) {
            console.warn(
              "⚠️ .in() falhou, tentando com OR query:",
              error.message,
            );

            // Fallback: usar OR com eq
            let query = supabase
              .from("clientes")
              .select("documento, created_at");

            // Construir query com OR manualmente
            const orConditions = clientsToFetch
              .map((doc) => `documento.eq.${doc}`)
              .join(",");
            const fallbackResult = await query.or(orConditions);

            clientesData = fallbackResult.data;
            error = fallbackResult.error;
          }
        } catch (queryError) {
          console.error("❌ Erro na query:", queryError);
          error = queryError;
        }

        if (error) {
          console.error("❌ Erro ao pré-carregar clientes:", error);
          // Mesmo com erro, marcar para evitar loop
          setClientDataCache((prev) => {
            const next = new Map(prev);
            clientsToFetch.forEach((doc) => {
              if (!next.has(doc)) next.set(doc, { error: true });
            });
            return next;
          });
          return;
        }

        // Criar um Map para acesso rápido - documento -> dados do cliente
        const clientesMap = new Map(
          (clientesData || []).map((c) => [c.documento, c]),
        );

        const newEntries = new Map();
        const clientGroups = getClientGroups();

        clientsToFetch.forEach((doc) => {
          const clienteInfo = clientesMap.get(doc);
          const clientGroup = clientGroups.find((g) => g.document === doc);

          if (!clientGroup) {
            newEntries.set(doc, { empty: true });
            return;
          }

          const clientSales = getSalesByClient(doc);
          const totalPending = clientSales.reduce(
            (sum, sale) => sum + sale.pendingValue,
            0,
          );

          const overdueCount = clientSales.reduce((sum, sale) => {
            return (
              sum +
              sale.installments.filter((inst) => {
                const pending =
                  (inst.valor_original || 0) - (inst.valor_recebido || 0);
                if (pending <= 0) return false;

                if (
                  inst.dias_em_atraso !== null &&
                  inst.dias_em_atraso !== undefined &&
                  inst.dias_em_atraso > 0
                ) {
                  return true;
                }

                const overdueDays = calculateOverdueDays(
                  inst.data_vencimento || "",
                );
                return overdueDays > 0;
              }).length
            );
          }, 0);

          const addressHistory = activeAddressHistory.find(
            (h) => h.cliente_documento === doc,
          );

          let addressUpdateDays: number | undefined;
          if (addressHistory?.created_at) {
            const updateDate = new Date(addressHistory.created_at);
            const today = new Date();
            const todayMidnight = new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
            );
            const updateDateMidnight = new Date(
              updateDate.getFullYear(),
              updateDate.getMonth(),
              updateDate.getDate(),
            );
            const diffTime = Math.abs(
              todayMidnight.getTime() - updateDateMidnight.getTime(),
            );
            addressUpdateDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          }

          const currentAddress = addressHistory
            ? `${addressHistory.logradouro || ""}, ${addressHistory.numero || "s/n"}`
            : clientGroup.address;

          const currentNumber = addressHistory
            ? addressHistory.numero || "s/n"
            : clientGroup.number || "s/n";

          const currentNeighborhood = addressHistory
            ? addressHistory.bairro || ""
            : clientGroup.neighborhood;

          const currentCity = addressHistory
            ? addressHistory.cidade || ""
            : clientGroup.city;

          const currentComplemento = addressHistory
            ? addressHistory.complemento || ""
            : clientGroup.complemento;

          const result = {
            name: clientGroup.client,
            document: clientGroup.document,
            apelido: clientGroup.apelido,
            address: currentAddress,
            number: currentNumber,
            neighborhood: currentNeighborhood,
            city: currentCity,
            complemento: currentComplemento,
            phone: clientGroup.phone,
            mobile: clientGroup.mobile,
            totalPendingValue: totalPending,
            overdueCount: overdueCount,
            addressUpdateDays,
            created_at: clienteInfo?.created_at,
          };

          newEntries.set(doc, result);
        });

        // Atualizar cache usando atualização funcional para evitar dependência direta
        setClientDataCache((prev) => {
          const next = new Map(prev);
          newEntries.forEach((v, k) => next.set(k, v));
          return next;
        });
      } catch (error) {
        console.error("❌ Erro ao pré-carregar dados dos clientes:", error);
      }
    },
    [
      activeAddressHistory,
      getClientGroups,
      getSalesByClient,
      supabase,
    ],
  );

  const scheduleVisit = async (
    visitData: Omit<ScheduledVisit, "id" | "createdAt" | "updatedAt">,
  ): Promise<ScheduledVisit> => {
    // If offline, add to queue and update UI locally
    if (!isOnline) {
      const tempId = `offline_${crypto.randomUUID()}`;
      const newVisit: ScheduledVisit = {
        ...visitData,
        id: tempId,
        status: "pending_sync", // Marcar como pendente de sincronização
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add to local state immediately for UI responsiveness
      setScheduledVisits((prev) => [...prev, newVisit]);

      // Add to offline queue for later sync
      addToOfflineQueue({
        type: "SCHEDULE_VISIT",
        data: visitData,
      });

      return newVisit;
    }

    // If online, proceed with Supabase insert
    try {
      console.log("Online: Agendando visita no Supabase:", visitData);

      const { data, error } = await supabase
        .from("scheduled_visits")
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
            overdue_count: visitData.overdueCount,
            scheduled_by_manager_id: visitData.scheduled_by_manager_id,
            reschedule_count: 0, // Initialize rescheduleCount to 0
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Erro ao inserir visita no Supabase:", error);
        throw error;
      }

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
        dataVisitaRealizada: data.data_visita_realizada,
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
        cancellationRejectionReason: data.cancellation_rejection_reason,
        rescheduleCount: data.reschedule_count, // Include rescheduleCount
        rescheduledTo: data.rescheduled_to,
        // Fronteira DB->dominio: colunas nullable mapeadas para campos opcionais
      } as ScheduledVisit;

      // Update local state
      setScheduledVisits((prev) => [...prev, newVisit]);

      // Invalidate cache
      invalidateVisits();

      console.log("Visita agendada com sucesso no Supabase:", newVisit.id);
      return newVisit;
    } catch (error) {
      console.error("Erro ao agendar visita:", error);
      throw error;
    }
  };

  const updateVisitStatus = async (
    visitId: string,
    status: ScheduledVisit["status"],
    notes?: string,
  ) => {
    try {
      console.log("Atualizando status da visita:", visitId, status);

      const currentVisit = scheduledVisits.find((visit) => visit.id === visitId);
      const clientDocument = currentVisit?.clientDocument;
      const isTransferToInternal = status === "nao_encontrado";
      // Para múltiplos internos, não atribuir automaticamente - deixar para o gerente decidir
      // const internalCollectorId = isTransferToInternal
      //   ? users.find((u) => u.type === "internal_collector")?.id || null
      //   : null;

      // Tentar atualizar no Supabase
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      // Se o status for "realizada" ou "nao_encontrado", sempre definir a data atual como data da visita realizada
      if (status === "realizada" || status === "nao_encontrado") {
        updateData.data_visita_realizada = new Date()
          .toISOString()
          .split("T")[0];
      }

      // Se estiver offline, adicionar à fila e retornar
      if (!isOnline) {
        console.log(
          "Offline: Adicionando atualização de status de visita à fila",
        );
        addToOfflineQueue({
          type: "UPDATE_VISIT_STATUS",
          data: { visitId, status, notes },
        });
        // A atualização local do estado já acontece abaixo, fora deste bloco
      } else {
        // Se estiver online, tentar atualizar no Supabase
        const { error } = await supabase
          .from("scheduled_visits")
          .update(updateData)
          .eq("id", visitId);

        if (error) {
          console.error(
            "Erro ao atualizar visita no Supabase. Adicionando à fila offline.",
            error,
          );
          // Se a atualização online falhar, adicionar à fila para tentar mais tarde
          addToOfflineQueue({
            type: "UPDATE_VISIT_STATUS",
            data: { visitId, status, notes },
          });
        } else if (isTransferToInternal && clientDocument) {
          const collectionUpdate: any = {
            situacao: "Aguardando Interno",
            user_id: null, // Remove do cobrador externo para que volte à "fila" geral de atribuição
          };
          // Não atribuir automaticamente a um internal_collector específico
          // Deixar para o gerente decidir qual interno ficará responsável
          // if (internalCollectorId) {
          //   collectionUpdate.user_id = internalCollectorId;
          // }

          const { error: collectionError } = await supabase
            .from("BANCO_DADOS")
            .update(collectionUpdate)
            .eq("documento", clientDocument);

          if (collectionError) {
            console.error(
              "Erro ao transferir cobranças para Cobrança Interna:",
              collectionError,
            );
          } else {
            console.log(
              "Cobranças transferidas para Cobrança Interna para",
              clientDocument,
            );
          }
        }
      }

      // Atualizar estado local
      setScheduledVisits((prev) =>
        prev.map((visit) =>
          visit.id === visitId
            ? {
                ...visit,
                status,
                notes: notes || visit.notes,
                updatedAt: new Date().toISOString(),
                // Se o status for "realizada" ou "nao_encontrado", definir a data atual como data da visita realizada
                ...((status === "realizada" || status === "nao_encontrado") && {
                  dataVisitaRealizada: new Date().toISOString().split("T")[0],
                }),
              }
            : visit,
        ),
      );

      if (isTransferToInternal && clientDocument) {
        setCollections((prev) =>
          prev.map((collection) =>
            collection.documento === clientDocument
              ? {
                  ...collection,
                  situacao: "Cobrança Interna",
                  // Não definir user_id automaticamente - deixar para o gerente atribuir
                  // user_id: internalCollectorId || collection.user_id,
                }
              : collection,
          ),
        );
      }

      // Invalidate cache
      invalidateVisits();

      console.log("Status da visita atualizado com sucesso");
    } catch (error) {
      console.error("Erro ao atualizar status da visita:", error);
      throw error;
    }
  };

  const requestVisitCancellation = async (visitId: string, reason: string) => {
    try {
      console.log("Solicitando cancelamento da visita:", visitId, reason);

      // Tentar atualizar no Supabase
      const updateData = {
        status: "cancelamento_solicitado" as const,
        cancellation_request_date: new Date().toISOString(),
        cancellation_request_reason: reason,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("scheduled_visits")
        .update(updateData)
        .eq("id", visitId);

      if (error) {
        // Não atualizar o estado local quando a escrita no banco falha: manter
        // local e banco em sincronia evita solicitações fantasmas/duplicadas.
        console.error("Erro ao solicitar cancelamento no Supabase:", error);
        throw error;
      }

      // Atualizar estado local
      setScheduledVisits((prev) =>
        prev.map((visit) =>
          visit.id === visitId
            ? {
                ...visit,
                status: "cancelamento_solicitado",
                cancellationRequestDate: new Date().toISOString(),
                cancellationRequestReason: reason,
                updatedAt: new Date().toISOString(),
              }
            : visit,
        ),
      );

      // Invalidate cache
      invalidateVisits();

      // Disparar evento para notificar outros componentes (e.g., VisitTracking)
      window.dispatchEvent(
        new CustomEvent("visitCancellationRequested", {
          detail: { visitId, reason },
        }),
      );

      console.log("Solicitação de cancelamento enviada com sucesso");
    } catch (error) {
      console.error("Erro ao solicitar cancelamento:", error);
      throw error;
    }
  };

  const approveVisitCancellation = async (
    visitId: string,
    managerId: string,
  ) => {
    try {
      console.log("Aprovando cancelamento da visita:", visitId);

      const updateData = {
        status: "cancelada" as const,
        cancellation_approved_by: managerId,
        cancellation_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("scheduled_visits")
        .update(updateData)
        .eq("id", visitId);

      if (error) {
        console.error("Erro ao aprovar cancelamento no Supabase:", error);
        throw error;
      }

      // Atualizar estado local
      setScheduledVisits((prev) =>
        prev.map((visit) =>
          visit.id === visitId
            ? {
                ...visit,
                status: "cancelada",
                cancellationApprovedBy: managerId,
                cancellationApprovedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : visit,
        ),
      );

      // Invalidate cache
      invalidateVisits();

      console.log("Cancelamento aprovado com sucesso");
    } catch (error) {
      console.error("Erro ao aprovar cancelamento:", error);
      throw error;
    }
  };

  const rejectVisitCancellation = async (
    visitId: string,
    managerId: string,
    rejectionReason: string,
  ) => {
    try {
      console.log("Rejeitando cancelamento da visita:", visitId);

      const updateData = {
        status: "agendada" as const,
        cancellation_rejected_by: managerId,
        cancellation_rejected_at: new Date().toISOString(),
        cancellation_rejection_reason: rejectionReason,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("scheduled_visits")
        .update(updateData)
        .eq("id", visitId);

      if (error) {
        console.error("Erro ao rejeitar cancelamento no Supabase:", error);
        throw error;
      }

      // Atualizar estado local
      setScheduledVisits((prev) =>
        prev.map((visit) =>
          visit.id === visitId
            ? {
                ...visit,
                status: "agendada",
                cancellationRejectedBy: managerId,
                cancellationRejectedAt: new Date().toISOString(),
                cancellationRejectionReason: rejectionReason,
                updatedAt: new Date().toISOString(),
              }
            : visit,
        ),
      );

      // Invalidate cache
      invalidateVisits();

      console.log("Cancelamento rejeitado com sucesso");
    } catch (error) {
      console.error("Erro ao rejeitar cancelamento:", error);
      throw error;
    }
  };

  const getPendingCancellationRequests = React.useCallback(() => {
    return scheduledVisits.filter(
      (visit) => visit.status === "cancelamento_solicitado",
    );
  }, [scheduledVisits]);

  const getCancellationHistory = (days: number = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return scheduledVisits
      .filter((visit) => {
        // Incluir visitas que foram aprovadas ou rejeitadas nos últimos X dias
        const hasApproval =
          visit.cancellationApprovedAt &&
          new Date(visit.cancellationApprovedAt) >= cutoffDate;
        const hasRejection =
          visit.cancellationRejectedAt &&
          new Date(visit.cancellationRejectedAt) >= cutoffDate;

        return hasApproval || hasRejection;
      })
      .sort((a, b) => {
        // Ordenar por data mais recente primeiro
        const dateA = new Date(
          a.cancellationApprovedAt || a.cancellationRejectedAt || 0,
        );
        const dateB = new Date(
          b.cancellationApprovedAt || b.cancellationRejectedAt || 0,
        );
        return dateB.getTime() - dateA.getTime();
      });
  };

  const getVisitsByDate = (date: string, collectorId?: string) => {
    return scheduledVisits.filter((visit) => {
      const matchesDate = visit.scheduledDate === date;
      const matchesCollector =
        !collectorId || visit.collectorId === collectorId;
      return matchesDate && matchesCollector;
    });
  };

  const getClientDataForVisit = React.useCallback(
    async (clientDocument: string) => {
      console.log("🔍 getClientDataForVisit called for:", clientDocument);

      // Check cache first
      const cachedData = clientDataCache.get(clientDocument);
      if (cachedData) {
        console.log("💾 Cache hit for client:", clientDocument);
        return cachedData;
      }

      console.log("🌐 Cache miss, fetching data for client:", clientDocument);

      const clientGroups = getClientGroups();
      const clientGroup = clientGroups.find(
        (group) => group.document === clientDocument,
      );

      if (!clientGroup) return null;

      const clientSales = getSalesByClient(clientDocument);
      const totalPending = clientSales.reduce(
        (sum, sale) => sum + sale.pendingValue,
        0,
      );

      // Calcular dias em atraso considerando formato brasileiro DD/MM/YYYY
      const calculateOverdueDays = (dueDateStr: string): number => {
        if (!dueDateStr) return 0;

        try {
          let dueDate: Date;

          // Limpar a string de data
          const cleanDateStr = dueDateStr.trim();

          // Verificar se a data está no formato DD/MM/YYYY (brasileiro)
          if (cleanDateStr.includes("/")) {
            const parts = cleanDateStr.split("/");
            if (parts.length === 3) {
              const [day, month, year] = parts;
              // Converter para números e validar
              const dayNum = parseInt(day, 10);
              const monthNum = parseInt(month, 10);
              const yearNum = parseInt(year, 10);

              if (
                dayNum >= 1 &&
                dayNum <= 31 &&
                monthNum >= 1 &&
                monthNum <= 12 &&
                yearNum >= 1900
              ) {
                dueDate = new Date(yearNum, monthNum - 1, dayNum);
              } else {
                console.warn("Data brasileira inválida:", cleanDateStr);
                return 0;
              }
            } else {
              console.warn(
                "Formato de data brasileiro inválido:",
                cleanDateStr,
              );
              return 0;
            }
          } else if (cleanDateStr.includes("-")) {
            // Formato ISO (YYYY-MM-DD) ou americano (MM-DD-YYYY)
            const parts = cleanDateStr.split("-");
            if (parts.length === 3) {
              // Assumir formato ISO se o primeiro elemento tem 4 dígitos
              if (parts[0].length === 4) {
                dueDate = new Date(cleanDateStr);
              } else {
                // Formato americano MM-DD-YYYY
                const [month, day, year] = parts;
                dueDate = new Date(
                  parseInt(year, 10),
                  parseInt(month, 10) - 1,
                  parseInt(day, 10),
                );
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
            console.warn("Data inválida após parsing:", cleanDateStr);
            return 0;
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dueDate.setHours(0, 0, 0, 0);

          const diffTime = today.getTime() - dueDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          return Math.max(0, diffDays);
        } catch (error) {
          console.error("Erro ao calcular dias em atraso:", error, dueDateStr);
          return 0;
        }
      };

      const overdueCount = clientSales.reduce((sum, sale) => {
        return (
          sum +
          sale.installments.filter((inst) => {
            const pending =
              (inst.valor_original || 0) - (inst.valor_recebido || 0);
            if (pending <= 0) return false;

            // Primeiro, tentar usar o campo dias_em_atraso se existir e for válido
            if (
              inst.dias_em_atraso !== null &&
              inst.dias_em_atraso !== undefined &&
              inst.dias_em_atraso > 0
            ) {
              return true;
            }

            // Caso contrário, calcular baseado na data_vencimento
            const overdueDays = calculateOverdueDays(
              inst.data_vencimento || "",
            );
            return overdueDays > 0;
          }).length
        );
      }, 0);

      const addressHistory = activeAddressHistory.find(
        (h) => h.cliente_documento === clientDocument,
      );
      let addressUpdateDays: number | undefined;

      if (addressHistory?.created_at) {
        const updateDate = new Date(addressHistory.created_at);
        const today = new Date();

        // Reset time for accurate day calculation
        const todayMidnight = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        const updateDateMidnight = new Date(
          updateDate.getFullYear(),
          updateDate.getMonth(),
          updateDate.getDate(),
        );

        const diffTime = Math.abs(
          todayMidnight.getTime() - updateDateMidnight.getTime(),
        );
        addressUpdateDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      const currentAddress = addressHistory
        ? `${addressHistory.logradouro || ""}, ${addressHistory.numero || "s/n"}`
        : clientGroup.address;

      const currentNumber = addressHistory
        ? addressHistory.numero || "s/n"
        : clientGroup.number || "s/n";

      const currentNeighborhood = addressHistory
        ? addressHistory.bairro || ""
        : clientGroup.neighborhood;

      const currentCity = addressHistory
        ? addressHistory.cidade || ""
        : clientGroup.city;

      const currentComplemento = addressHistory
        ? addressHistory.complemento || ""
        : clientGroup.complemento;

      // Fetch created_at from clientes table
      const { data: clienteData } = await supabase
        .from("clientes")
        .select("created_at")
        .eq("documento", clientDocument)
        .single();

      const result = {
        name: clientGroup.client,
        document: clientGroup.document,
        apelido: clientGroup.apelido,
        address: currentAddress,
        number: currentNumber,
        neighborhood: currentNeighborhood,
        city: currentCity,
        complemento: currentComplemento,
        phone: clientGroup.phone,
        mobile: clientGroup.mobile,
        totalPendingValue: totalPending,
        overdueCount: overdueCount,
        addressUpdateDays,
        created_at: clienteData?.created_at,
      };

      // Cache the result
      setClientDataCache((prev) => new Map(prev).set(clientDocument, result));

      return result;
    },
    [getClientGroups, getSalesByClient, activeAddressHistory],
  );

  // Function to clear client data cache for a specific client
  const invalidateClientDataCache = (clientDocument: string) => {
    setClientDataCache((prev) => {
      const newCache = new Map(prev);
      newCache.delete(clientDocument);
      return newCache;
    });
  };

  // Função para atualizar visitas agendadas após processamento de pagamentos
  const updateScheduledVisitsAfterPayment = async (clientDocument: string) => {
    try {
      console.log("=== INÍCIO updateScheduledVisitsAfterPayment ===");
      console.log("Cliente:", clientDocument);

      // Buscar dados atualizados do cliente
      const clientData = await getClientDataForVisit(clientDocument);
      console.log("Dados do cliente recalculados:", clientData);

      if (!clientData) {
        console.log("❌ Dados do cliente não encontrados:", clientDocument);
        return;
      }

      // Buscar visitas agendadas deste cliente
      const clientVisits = scheduledVisits.filter(
        (visit) =>
          visit.clientDocument === clientDocument &&
          visit.status === "agendada",
      );

      console.log(`Visitas agendadas encontradas: ${clientVisits.length}`);
      clientVisits.forEach((visit) => {
        console.log(
          `- Visita ${visit.id}: Pendente atual: R$ ${visit.totalPendingValue}, Atraso atual: ${visit.overdueCount}`,
        );
      });

      if (clientVisits.length === 0) {
        console.log(
          "❌ Nenhuma visita agendada encontrada para o cliente:",
          clientDocument,
        );
        return;
      }

      // Atualizar cada visita agendada no Supabase e estado local
      for (const visit of clientVisits) {
        const updateData = {
          total_pending_value: clientData.totalPendingValue,
          overdue_count: clientData.overdueCount,
          updated_at: new Date().toISOString(),
        };

        console.log(`📝 Atualizando visita ${visit.id}:`);
        console.log(
          `   - Pendente: R$ ${visit.totalPendingValue} → R$ ${clientData.totalPendingValue}`,
        );
        console.log(
          `   - Atraso: ${visit.overdueCount} → ${clientData.overdueCount}`,
        );

        // Atualizar no Supabase
        const { error } = await supabase
          .from("scheduled_visits")
          .update(updateData)
          .eq("id", visit.id);

        if (error) {
          console.error("❌ Erro ao atualizar visita no Supabase:", error);
        } else {
          console.log("✅ Visita atualizada no Supabase com sucesso");
        }

        // Atualizar estado local
        setScheduledVisits((prev) => {
          const updated = prev.map((v) =>
            v.id === visit.id
              ? {
                  ...v,
                  totalPendingValue: clientData.totalPendingValue,
                  overdueCount: clientData.overdueCount,
                  updatedAt: new Date().toISOString(),
                }
              : v,
          );
          console.log("✅ Estado local atualizado");
          return updated;
        });

        // Invalidate cache
        invalidateVisits();
        invalidateClientDataCache(clientDocument);
      }

      console.log(
        "✅ Visitas agendadas atualizadas com sucesso para cliente:",
        clientDocument,
      );
      console.log("=== FIM updateScheduledVisitsAfterPayment ===");
    } catch (error) {
      console.error("Erro ao atualizar visitas agendadas:", error);
    }
  };

  const rescheduleVisit = async (
    visitId: string,
    newDate: string,
    newTime?: string,
    reason?: string,
  ) => {
    try {
      console.log("Reagendando visita:", visitId, newDate, newTime);

      // Buscar o estado ATUAL da visita no banco. Não confiar apenas no estado
      // local (scheduledVisits), que pode estar defasado entre abas/dispositivos
      // e permitir que o mesmo reagendamento seja disparado mais de uma vez.
      const { data: latestVisitData, error: fetchError } = await supabase
        .from("scheduled_visits")
        .select("status, reschedule_count")
        .eq("id", visitId)
        .single();

      if (fetchError) {
        console.error(
          "Erro ao buscar dados da visita para reagendamento:",
          fetchError,
        );
        throw fetchError;
      }

      // Validar contra o status REAL do banco. Só é possível reagendar uma
      // visita que ainda esteja "agendada"; qualquer outro estado (já
      // reagendada, cancelada, realizada, etc.) significa que a operação já
      // foi concluída e seguir adiante criaria uma visita duplicada.
      if (latestVisitData?.status !== "agendada") {
        throw new Error(
          `Esta visita não pode ser reagendada (status atual: ${latestVisitData?.status}). Atualize a lista e tente novamente.`,
        );
      }

      const currentRescheduleCount = latestVisitData?.reschedule_count || 0;
      const newRescheduleCount = currentRescheduleCount + 1;

      // Buscar visita atual para manter histórico (demais campos vêm do estado local)
      const currentVisit = scheduledVisits.find((v) => v.id === visitId);
      if (!currentVisit) {
        throw new Error("Visita não encontrada no estado local");
      }

      // Montar nota com informações do reagendamento
      const formatBrazilianDate = (date: string, time?: string) => {
        const [year, month, day] = date.split("-");
        const formattedDate = `${day}/${month}/${year}`;
        if (time) {
          const [hours, minutes] = time.split(":");
          return `${formattedDate} ${hours}:${minutes}`;
        }
        return formattedDate;
      };

      // Função para formatar datas existentes em notas antigas
      const formatExistingNotes = (notes: string) => {
        return (
          notes
            // Formatar notas com formato antigo (YYYY-MM-DD HH:mm:ss)
            .replace(
              /Reagendado de (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) para (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/g,
              (_, fromDate, fromTime, toDate, toTime) => {
                const formattedFrom = formatBrazilianDate(
                  fromDate,
                  fromTime.substring(0, 5),
                );
                const formattedTo = formatBrazilianDate(
                  toDate,
                  toTime.substring(0, 5),
                );
                return `• Reagendado de ${formattedFrom} para ${formattedTo}`;
              },
            )
            // Adicionar dots em notas que já estão no formato brasileiro mas sem dots
            .replace(/^Reagendado de/gm, "• Reagendado de")
            // Remover dots duplicados
            .replace(/^• • Reagendado de/gm, "• Reagendado de")
        );
      };

      const fromDateTime = formatBrazilianDate(
        currentVisit.scheduledDate,
        currentVisit.scheduledTime,
      );
      const toDateTime = formatBrazilianDate(newDate, newTime);

      const rescheduleNote = `• Reagendado de ${fromDateTime} para ${toDateTime}${reason ? `. Motivo: ${reason}` : ""}`;

      // Atualizar notas formatando as existentes e adicionando a nova
      let updatedNotes = rescheduleNote;
      if (currentVisit.notes) {
        const formattedExistingNotes = formatExistingNotes(currentVisit.notes);
        updatedNotes = `${formattedExistingNotes}\n${rescheduleNote}`;
      }

      // Pré-checagem: o cliente já tem uma visita ATIVA na data de destino?
      // Se sim, abortamos ANTES de mexer na visita original, evitando deixá-la
      // "órfã" (marcada como reagendada sem uma nova visita criada) — já que o
      // índice único do banco rejeitaria o INSERT de qualquer forma.
      const { data: conflictRows, error: conflictError } = await supabase
        .from("scheduled_visits")
        .select("id")
        .eq("collector_id", currentVisit.collectorId)
        .eq("client_document", currentVisit.clientDocument)
        .eq("scheduled_date", newDate)
        .eq("status", "agendada")
        .neq("id", visitId);

      if (conflictError) {
        console.error(
          "Erro ao verificar conflito de data no reagendamento:",
          conflictError,
        );
        throw conflictError;
      }

      if (conflictRows && conflictRows.length > 0) {
        throw new Error(
          "Este cliente já possui uma visita agendada nessa data. Escolha outra data.",
        );
      }

      // Em vez de atualizar a visita existente, vamos:
      // 1. Marcar a visita original como "reagendada"
      // 2. Criar uma nova visita com a nova data

      // Primeiro, atualizar a visita original para status "reagendada"
      const originalUpdateData = {
        status: "reagendada",
        rescheduled_to: newDate, // Campo adicionado na migração
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
        reschedule_count: newRescheduleCount,
      };

      // UPDATE condicional ao status "agendada": funciona como uma trava
      // atômica. Em caso de corrida (duas tentativas simultâneas, retry após
      // falha de rede, evento disparado duas vezes), apenas UMA operação
      // consegue alterar a linha; as demais recebem 0 linhas afetadas e abortam
      // ANTES do INSERT, impedindo a criação de visitas duplicadas.
      const { data: claimedRows, error: originalError } = await supabase
        .from("scheduled_visits")
        .update(originalUpdateData)
        .eq("id", visitId)
        .eq("status", "agendada")
        .select("id");

      if (originalError) {
        console.error("Erro ao marcar visita original como reagendada:", originalError);
        throw originalError;
      }

      if (!claimedRows || claimedRows.length === 0) {
        // Outra operação já reagendou esta visita nesse intervalo: não criar
        // duplicata. O estado local será corrigido no próximo fetch.
        throw new Error(
          "Esta visita já foi reagendada por outra operação. Atualize a lista.",
        );
      }

      // Agora, criar uma nova visita com a nova data
      const newVisitData = {
        collector_id: currentVisit.collectorId,
        client_document: currentVisit.clientDocument,
        client_name: currentVisit.clientName,
        scheduled_date: newDate,
        scheduled_time: newTime || null,
        status: "agendada",
        notes: `Visita reagendada de ${fromDateTime}${reason ? `. Motivo: ${reason}` : ""}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reschedule_count: 0, // Nova visita começa com 0
        rescheduled_from_id: visitId, // Vínculo rastreável com a visita de origem
        scheduled_by_manager_id: currentVisit.scheduled_by_manager_id,
        // Copiar dados do cliente
        client_address: currentVisit.clientAddress,
        client_number: currentVisit.clientNumber,
        client_neighborhood: currentVisit.clientNeighborhood,
        client_city: currentVisit.clientCity,
        total_pending_value: currentVisit.totalPendingValue,
        overdue_count: currentVisit.overdueCount,
      };

      const { data: newVisit, error: newVisitError } = await supabase
        .from("scheduled_visits")
        .insert(newVisitData)
        .select()
        .single();

      if (newVisitError) {
        console.error("Erro ao criar nova visita reagendada:", newVisitError);
        // A original já foi marcada como "reagendada" no passo anterior. Como a
        // nova visita não pôde ser criada, revertemos a original para
        // "agendada" (best-effort) para não deixá-la órfã.
        const { error: revertError } = await supabase
          .from("scheduled_visits")
          .update({
            status: "agendada",
            rescheduled_to: currentVisit.rescheduledTo ?? null,
            reschedule_count: currentRescheduleCount,
            notes: currentVisit.notes ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", visitId);
        if (revertError) {
          console.error(
            "Falha ao reverter visita original após erro no reagendamento:",
            revertError,
          );
        }
        throw newVisitError;
      }

      // Fechar o vínculo rastreável: a visita original aponta para a nova por ID.
      // (rescheduled_to continua preenchido com a data por compatibilidade.)
      const { error: linkError } = await supabase
        .from("scheduled_visits")
        .update({ rescheduled_to_id: newVisit.id })
        .eq("id", visitId);

      if (linkError) {
        // Não é crítico para o reagendamento em si; apenas registrar.
        console.error("Erro ao vincular visita original à nova:", linkError);
      }

      // Atualizar estado local: marcar original como reagendada e adicionar nova
      setScheduledVisits((prev) => {
        const updated = prev.map((visit) =>
          visit.id === visitId
            ? {
                ...visit,
                status: "reagendada" as const,
                rescheduledTo: newDate,
                notes: updatedNotes,
                updatedAt: new Date().toISOString(),
                rescheduleCount: newRescheduleCount,
              }
            : visit,
        );
        // Adicionar a nova visita
        updated.push({
          id: newVisit.id,
          collectorId: newVisit.collector_id,
          clientDocument: newVisit.client_document,
          clientName: newVisit.client_name,
          scheduledDate: newVisit.scheduled_date,
          scheduledTime: newVisit.scheduled_time,
          status: newVisit.status,
          notes: newVisit.notes,
          createdAt: newVisit.created_at,
          updatedAt: newVisit.updated_at,
          rescheduleCount: newVisit.reschedule_count,
          scheduled_by_manager_id: newVisit.scheduled_by_manager_id,
          clientAddress: newVisit.client_address,
          clientNumber: newVisit.client_number,
          clientNeighborhood: newVisit.client_neighborhood,
          clientCity: newVisit.client_city,
          totalPendingValue: newVisit.total_pending_value,
          overdueCount: newVisit.overdue_count,
        } as ScheduledVisit);
        console.log("Estado local atualizado. Visitas:", updated.length);
        return updated;
      });

      // Invalidate cache
      invalidateVisits();

      console.log("Visita reagendada com sucesso");
    } catch (error) {
      console.error("Erro ao reagendar visita:", error);
      throw error;
    }
  };

  const value: CollectionContextType = {
    collections,
    users,
    salePayments,
    scheduledVisits,
    monthlyGoals,
    allowedVisitDates,
    loading,
    error,
    isOnline,
    fetchCollections,
    fetchUsers,
    fetchSalePayments,
    fetchAllowedVisitDates,
    refreshData,
    refreshCollections,
    updateCollection,
    assignCollectorToClients,
    removeCollectorFromClients,
    addAttempt,
    addUser,
    updateUser,
    deleteUser,
    setMonthlyGoal,
    getDashboardStats,
    getCollectorPerformance,
    getCollectorCollections,
    getClientGroups,
    getFilteredCollections,
    getAvailableStores,
    // Sale payment methods
    processSalePayment,
    processGeneralPayment,
    recordPaymentAdjustment, // Added
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
    deleteSalesFromClient,
    bulkDeleteClients,
    deleteClient,
    updateScheduledVisitsAfterPayment,
    // NOVOS CAMPOS PARA OTIMIZAÇÃO:
    prefetchClientsData,
    clientDataCache,
  };

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
};
