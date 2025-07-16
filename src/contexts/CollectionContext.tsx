import React, { createContext, useContext, useState, useEffect } from "react";
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
  ScheduledVisit,
} from "../types";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useLoading } from "./LoadingContext";
import { useOffline } from "../hooks/useOffline";

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
  const { user } = useAuth();
  const { setLoading: setGlobalLoading } = useLoading();
  const { isOnline, addToOfflineQueue } = useOffline();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [collectorStores, setCollectorStores] = useState<CollectorStore[]>([]);
  const [salePayments, setSalePayments] = useState<SalePayment[]>([]);
  const [scheduledVisits, setScheduledVisits] = useState<ScheduledVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Função para atualizar apenas as collections sem recarregar tudo
  const refreshCollections = async () => {
    try {
      console.log("Atualizando collections em tempo real...");
      await fetchCollections();
    } catch (error) {
      console.error("Erro ao atualizar collections:", error);
    }
  };

  useEffect(() => {
    let realtimeChannel: any = null;

    if (user) {
      console.log("Usuário logado, carregando dados...");
      setGlobalLoading(true, "Carregando dados do sistema...");

      const fetchData = async () => {
        try {
          await Promise.all([
            fetchUsers(),
            fetchCollectorStores(),
            fetchSalePayments(),
            fetchScheduledVisits(),
          ]);

          // Now fetch collections, which can use the updated collectorStores state
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
            // Atualizar apenas as collections quando houver mudanças
            refreshCollections();
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
            fetchSalePayments();
          },
        )
        .subscribe((status) => {
          console.log("Status da conexão em tempo real:", status);
        });
    } else {
      console.log("Usuário não logado, limpando dados...");
      setCollections([]);
      setUsers([]);
      setCollectorStores([]);
      setSalePayments([]);
      setScheduledVisits([]);
      setLoading(false);
      setGlobalLoading(false);
    }

    // Cleanup: remover listener quando o componente for desmontado ou usuário mudar
    return () => {
      if (realtimeChannel) {
        console.log("Removendo listener em tempo real...");
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [user]);

  const fetchCollections = async () => {
    try {
      setError(null);

      console.log("Buscando dados da tabela BANCO_DADOS...");

      let query = supabase.from("BANCO_DADOS").select("*");

      if (user?.type === "collector") {
        const assignedStores = getCollectorStores(user.id);
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
      console.log("Collections carregadas:", transformedData.length);
    } catch (err) {
      console.error("Erro ao carregar collections:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
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
        type: user.type as "manager" | "collector",
        createdAt: user.created_at || new Date().toISOString(),
      }));

      setUsers(transformedUsers);
      console.log("Usuários carregados:", transformedUsers.length);
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
    }
  };

  const fetchCollectorStores = async () => {
    try {
      console.log("Buscando atribuições de lojas...");

      const { data, error: supabaseError } = await supabase
        .from("collector_stores")
        .select("*")
        .order("created_at", { ascending: true });

      if (supabaseError) {
        console.error("Erro ao buscar collector_stores:", supabaseError);
        throw supabaseError;
      }

      const transformedStores: CollectorStore[] = (data || []).map((store) => ({
        id: store.id,
        collectorId: store.collector_id,
        storeName: store.store_name,
        createdAt: store.created_at || new Date().toISOString(),
      }));

      setCollectorStores(transformedStores);
      console.log("Atribuições de lojas carregadas:", transformedStores.length);
    } catch (err) {
      console.error("Erro ao carregar collector stores:", err);
    }
  };

  const updateCollection = async (id: number, updates: Partial<Collection>) => {
    try {
      // Converter updates para formato do banco
      const dbUpdates: any = {};

      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.valor_recebido !== undefined)
        dbUpdates.valor_recebido = updates.valor_recebido.toString();
      if (updates.data_de_recebimento !== undefined)
        dbUpdates.data_de_recebimento = updates.data_de_recebimento;
      if (updates.obs !== undefined) dbUpdates.obs = updates.obs;
      if (updates.user_id !== undefined) dbUpdates.user_id = updates.user_id;

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

  const assignCollectorToStore = async (
    collectorId: string,
    storeName: string,
  ) => {
    try {
      console.log("Atribuindo loja ao cobrador:", { collectorId, storeName });

      // Verificar se a atribuição já existe
      const existingAssignment = collectorStores.find(
        (cs) => cs.collectorId === collectorId && cs.storeName === storeName,
      );

      if (existingAssignment) {
        console.log("Atribuição já existe");
        setError("Esta loja já está atribuída a este cobrador");
        return;
      }

      const { error: supabaseError } = await supabase
        .from("collector_stores")
        .insert({
          collector_id: collectorId,
          store_name: storeName,
        })
        .select();

      if (supabaseError) {
        console.error("Erro do Supabase ao atribuir loja:", supabaseError);
        throw supabaseError;
      }

      // Loja atribuída com sucesso

      // Recarregar as atribuições
      await fetchCollectorStores();
      console.log("Loja atribuída com sucesso");
      setError(null);
    } catch (err) {
      console.error("Erro ao atribuir loja ao cobrador:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao atribuir loja ao cobrador",
      );
    }
  };

  const removeCollectorFromStore = async (
    collectorId: string,
    storeName: string,
  ) => {
    try {
      console.log("Removendo loja do cobrador:", { collectorId, storeName });

      const { error: supabaseError } = await supabase
        .from("collector_stores")
        .delete()
        .eq("collector_id", collectorId)
        .eq("store_name", storeName);

      if (supabaseError) {
        console.error("Erro do Supabase ao remover loja:", supabaseError);
        throw supabaseError;
      }

      await fetchCollectorStores();
      console.log("Loja removida com sucesso");
      setError(null);
    } catch (err) {
      console.error("Erro ao remover loja do cobrador:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao remover loja do cobrador",
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

      await fetchUsers();
    } catch (err) {
      console.error("Erro ao adicionar usuário:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao adicionar usuário",
      );
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

      await fetchUsers();
    } catch (err) {
      console.error("Erro ao atualizar usuário:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao atualizar usuário",
      );
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

      await fetchUsers();
    } catch (err) {
      console.error("Erro ao deletar usuário:", err);
      setError(err instanceof Error ? err.message : "Erro ao deletar usuário");
    }
  };

  const getFilteredCollections = (
    filters: FilterOptions,
    userType: "manager" | "collector",
    collectorId?: string,
  ): Collection[] => {
    let filtered = collections;

    // Filtrar por cobrador se o usuário for cobrador
    if (userType === "collector" && collectorId) {
      // Obter lojas atribuídas a este cobrador
      const assignedStores = getCollectorStores(collectorId);
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

        // Handle Brazilian format DD/MM/YYYY
        if (cleanDateStr.includes("/")) {
          const parts = cleanDateStr.split("/");
          if (parts.length === 3) {
            const [day, month, year] = parts;
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
          const valorRecebido = c.valor_recebido || 0;
          const valorOriginal = c.valor_original || 0;

          let realStatus: string;

          if (valorRecebido === 0) {
            realStatus = "pendente";
          } else if (valorRecebido >= valorOriginal) {
            realStatus = "pago";
          } else {
            realStatus = "parcial";
          }

          if (c.status) {
            const status = c.status.toLowerCase();
            if (
              [
                "recebido",
                "pago",
                "paid",
                "received",
                "quitado",
                "finalizado",
              ].includes(status)
            ) {
              realStatus = "pago";
            } else if (
              [
                "parcialmente_pago",
                "parcialmente pago",
                "pago parcial",
                "partial",
                "parcial",
              ].includes(status)
            ) {
              realStatus = "parcial";
            } else {
              realStatus = "pendente";
            }
          }

          return realStatus === filters.status?.toLowerCase();
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
      filtered = filtered.filter((c) => {
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
      filtered = filtered.filter(
        (c) =>
          c.cliente?.toLowerCase().includes(searchLower) ||
          c.documento?.toLowerCase().includes(searchLower) ||
          c.numero_titulo?.toString().includes(searchLower) ||
          c.venda_n?.toString().includes(searchLower) ||
          c.id_parcela?.toString().includes(searchLower),
      );
    }

    return filtered;
  };

  const getClientGroups = (collectorId?: string): ClientGroup[] => {
    let filteredCollections = collections;

    if (collectorId) {
      const assignedStores = getCollectorStores(collectorId);
      filteredCollections = collections.filter(
        (c) =>
          c.user_id === collectorId ||
          assignedStores.includes(c.nome_da_loja || ""),
      );
    }

    const clientMap = new Map<string, ClientGroup>();
    let skippedCollectionsCount = 0;

    filteredCollections.forEach((collection) => {
      // Group strictly by 'documento' (CPF) as the unique identifier.
      const clientId = collection.documento?.trim();

      if (!clientId) {
        skippedCollectionsCount++;
        return; // Skip collections without a document.
      }

      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          clientId,
          client: collection.cliente || "Cliente sem nome",
          document: clientId,
          phone: collection.telefone || undefined,
          mobile: collection.celular || undefined,
          address: collection.endereco || "",
          number: collection.numero || "",
          neighborhood: collection.bairro || "",
          city: collection.cidade || "",
          state: collection.estado || "",
          sales: [],
          totalValue: 0,
          totalReceived: 0,
          pendingValue: 0,
        });
      }

      const clientGroup = clientMap.get(clientId)!;

      // Group by sale number (venda_n)
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

      if (saleGroup) {
        saleGroup.installments.push(collection);

        const roundTo2Decimals = (num: number) =>
          Math.round((num + Number.EPSILON) * 100) / 100;

        saleGroup.totalValue = roundTo2Decimals(
          saleGroup.totalValue + collection.valor_original,
        );
        saleGroup.totalReceived = roundTo2Decimals(
          saleGroup.totalReceived + collection.valor_recebido,
        );

        const pendingForThisInstallment = roundTo2Decimals(
          collection.valor_original - collection.valor_recebido,
        );
        if (pendingForThisInstallment > 0.01) {
          saleGroup.pendingValue = roundTo2Decimals(
            saleGroup.pendingValue + pendingForThisInstallment,
          );
        }
      }

      const roundTo2Decimals = (num: number) =>
        Math.round((num + Number.EPSILON) * 100) / 100;

      clientGroup.totalValue = roundTo2Decimals(
        clientGroup.totalValue + collection.valor_original,
      );
      clientGroup.totalReceived = roundTo2Decimals(
        clientGroup.totalReceived + collection.valor_recebido,
      );
    });

    // Calculate pendingValue for each clientGroup and saleGroup after all collections are processed
    clientMap.forEach((clientGroup) => {
      const roundTo2Decimals = (num: number) =>
        Math.round((num + Number.EPSILON) * 100) / 100;

      clientGroup.sales.forEach((saleGroup) => {
        saleGroup.pendingValue = roundTo2Decimals(
          saleGroup.totalValue - saleGroup.totalReceived,
        );
      });

      clientGroup.pendingValue = roundTo2Decimals(
        clientGroup.totalValue - clientGroup.totalReceived,
      );
    });

    if (skippedCollectionsCount > 0) {
      console.warn(
        `[getClientGroups] Skipped ${skippedCollectionsCount} collection entries because they were missing a 'documento'.`,
      );
    }

    return Array.from(clientMap.values()).sort((a, b) =>
      a.client.localeCompare(b.client),
    );
  };

  const getDashboardStats = (): DashboardStats => {
    const totalPending = collections.filter(
      (c) => c.status?.toLowerCase() === "pendente",
    ).length;
    const totalOverdue = collections.filter(
      (c) => c.dias_em_atraso && c.dias_em_atraso > 0,
    ).length;
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
    const collectorsCount = users.filter((u) => u.type === "collector").length;

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
    const collectors = users.filter((u) => u.type === "collector");

    return collectors.map((collector) => {
      const assignedStores = getCollectorStores(collector.id);
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
        sale.totalValue += collection.valor_original;
        sale.receivedValue += collection.valor_recebido;
        sale.installments.push(collection);
      });

      // Determinar status das vendas
      salesMap.forEach((sale) => {
        const pendingValue = Math.max(0, sale.totalValue - sale.receivedValue);
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
      const totalAmount = salesArray.reduce((sum, s) => sum + s.totalValue, 0);
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
  };

  const getCollectorCollections = (collectorId: string): Collection[] => {
    const assignedStores = getCollectorStores(collectorId);
    return collections.filter(
      (c) =>
        c.user_id === collectorId ||
        assignedStores.includes(c.nome_da_loja || ""),
    );
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

  const getCollectorStores = (collectorId: string): string[] => {
    return collectorStores
      .filter((cs) => cs.collectorId === collectorId)
      .map((cs) => cs.storeName);
  };

  const refreshData = async () => {
    setGlobalLoading(true, "Atualizando dados...");
    try {
      await Promise.all([
        fetchCollections(),
        fetchUsers(),
        fetchCollectorStores(),
        fetchSalePayments(),
        fetchScheduledVisits(),
      ]);
    } finally {
      setGlobalLoading(false);
    }
  };

  const refreshDataExceptVisits = async () => {
    setGlobalLoading(true, "Atualizando dados...");
    try {
      await Promise.all([
        fetchCollections(),
        fetchUsers(),
        fetchCollectorStores(),
        fetchSalePayments(),
      ]);
    } finally {
      setGlobalLoading(false);
    }
  };

  const assignCollectorToClients = async (
    collectorId: string,
    clientIdentifiers: { document?: string; clientName?: string }[],
  ) => {
    try {
      // setGlobalLoading(true, 'Atribuindo clientes ao cobrador...'); // Moved to ClientAssignment.tsx
      setLoading(true);

      console.log(
        `Iniciando atribuição de ${clientIdentifiers.length} clientes ao cobrador ${collectorId}`,
      );

      const batchSize = 200;
      let totalParcelasAtualizadas = 0;

      for (let i = 0; i < clientIdentifiers.length; i += batchSize) {
        const batch = clientIdentifiers.slice(i, i + batchSize);
        console.log(
          `Processando lote ${Math.floor(i / batchSize) + 1}: ${batch.length} identificadores`,
        );

        const documentBatch = batch
          .filter((id) => id.document)
          .map((id) => id.document);
        const clientNameBatch = batch
          .filter((id) => !id.document && id.clientName)
          .map((id) => id.clientName);

        let parcelas: { id_parcela: number }[] = [];
        let fetchError: any = null;

        if (documentBatch.length > 0) {
          const { data, error } = await supabase
            .from("BANCO_DADOS")
            .select("id_parcela")
            .in("documento", documentBatch);
          if (error) fetchError = error;
          if (data) parcelas = parcelas.concat(data);
        }

        if (clientNameBatch.length > 0 && !fetchError) {
          const { data, error } = await supabase
            .from("BANCO_DADOS")
            .select("id_parcela")
            .in("cliente", clientNameBatch);
          if (error) fetchError = error;
          if (data) parcelas = parcelas.concat(data);
        }

        if (fetchError) {
          console.error("Erro ao buscar parcelas do lote:", fetchError);
          throw fetchError;
        }

        if (!parcelas || parcelas.length === 0) {
          console.warn(
            `Nenhuma parcela encontrada para este lote de ${batch.length} clientes`,
          );
          continue;
        }

        console.log(`Encontradas ${parcelas.length} parcelas para este lote`);

        const { error: updateError } = await supabase
          .from("BANCO_DADOS")
          .update({ user_id: collectorId })
          .in(
            "id_parcela",
            parcelas.map((p) => p.id_parcela),
          );

        if (updateError) {
          console.error("Erro ao atualizar parcelas do lote:", updateError);
          throw updateError;
        }

        totalParcelasAtualizadas += parcelas.length;
        console.log(
          `Lote processado com sucesso. Total de parcelas atualizadas até agora: ${totalParcelasAtualizadas}`,
        );
      }

      // await refreshData(); // Moved outside the loop
      await refreshData(); // Moved outside the loop
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
  ) => {
    try {
      // setGlobalLoading(true, 'Removendo cobrador dos clientes...'); // Moved to ClientAssignment.tsx
      setLoading(true);
      console.log(`Removendo cobrador de ${clientIdentifiers.length} clientes`);

      const batchSize = 200;
      let totalParcelasAtualizadas = 0;

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

        let parcelas: { id_parcela: number }[] = [];
        let fetchError: any = null;

        if (documentBatch.length > 0) {
          const { data, error } = await supabase
            .from("BANCO_DADOS")
            .select("id_parcela")
            .in("documento", documentBatch);
          if (error) fetchError = error;
          if (data) parcelas = parcelas.concat(data);
        }

        if (clientNameBatch.length > 0 && !fetchError) {
          const { data, error } = await supabase
            .from("BANCO_DADOS")
            .select("id_parcela")
            .in("cliente", clientNameBatch);
          if (error) fetchError = error;
          if (data) parcelas = parcelas.concat(data);
        }

        if (fetchError) {
          console.error("Erro ao buscar parcelas do lote:", fetchError);
          throw fetchError;
        }

        if (!parcelas || parcelas.length === 0) {
          console.warn(
            `Nenhuma parcela encontrada para este lote de ${batch.length} clientes`,
          );
          continue;
        }

        console.log(`Encontradas ${parcelas.length} parcelas para este lote`);

        const { error: updateError } = await supabase
          .from("BANCO_DADOS")
          .update({ user_id: null })
          .in(
            "id_parcela",
            parcelas.map((p) => p.id_parcela),
          );

        if (updateError) {
          console.error("Erro ao atualizar parcelas do lote:", updateError);
          throw updateError;
        }

        totalParcelasAtualizadas += parcelas.length;
        console.log(
          `Lote processado com sucesso. Total de parcelas atualizadas até agora: ${totalParcelasAtualizadas}`,
        );
      }

      // await refreshData(); // Moved outside the loop
      await refreshData(); // Moved outside the loop
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

  const fetchSalePayments = async () => {
    try {
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
      const convertedPayments: SalePayment[] = (payments || []).map(
        (payment) => ({
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
          distributionDetails: payment.distribution_details || [],
        }),
      );

      setSalePayments(convertedPayments);
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

  // Algoritmo de distribuição de pagamento
  const distributeSalePayment = (
    installments: Collection[],
    paymentAmount: number,
  ): {
    updatedInstallments: Collection[];
    distributionDetails: PaymentDistribution[];
  } => {
    console.log(
      "Distribuindo pagamento:",
      paymentAmount,
      "entre",
      installments.length,
      "parcelas",
    );

    // 1. Filtrar apenas parcelas pendentes
    const pendingInstallments = installments.filter(
      (inst) => inst.valor_recebido < inst.valor_original,
    );

    if (pendingInstallments.length === 0) {
      return { updatedInstallments: installments, distributionDetails: [] };
    }

    // 2. Ordenar por prioridade (vencidas primeiro, depois por data)
    const sortedInstallments = [...pendingInstallments].sort((a, b) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const aDate = new Date(a.data_vencimento || "");
      const bDate = new Date(b.data_vencimento || "");
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
    const roundTo2Decimals = (num: number) =>
      Math.round((num + Number.EPSILON) * 100) / 100;

    for (const installment of sortedInstallments) {
      if (remainingPayment <= 0.01) break; // Parar se restante for <= 1 centavo

      const pendingAmount = roundTo2Decimals(
        installment.valor_original - installment.valor_recebido,
      );
      const paymentForThisInstallment = roundTo2Decimals(
        Math.min(remainingPayment, pendingAmount),
      );

      if (paymentForThisInstallment > 0.01) {
        // Só processar se valor for > 1 centavo
        // Encontrar e atualizar a parcela no array
        const installmentIndex = updatedInstallments.findIndex(
          (inst) => inst.id_parcela === installment.id_parcela,
        );

        if (installmentIndex !== -1) {
          const newValueReceived = roundTo2Decimals(
            updatedInstallments[installmentIndex].valor_recebido +
              paymentForThisInstallment,
          );
          const remainingValue = roundTo2Decimals(
            updatedInstallments[installmentIndex].valor_original -
              newValueReceived,
          );

          updatedInstallments[installmentIndex] = {
            ...updatedInstallments[installmentIndex],
            valor_recebido: newValueReceived,
            status:
              remainingValue <= 0.01 // Considera pago se restante for <= 1 centavo
                ? "recebido"
                : "parcialmente_pago",
            data_de_recebimento: new Date().toISOString().split("T")[0],
          };

          distributionDetails.push({
            installmentId: installment.id_parcela,
            originalAmount: pendingAmount,
            appliedAmount: paymentForThisInstallment,
            installmentStatus:
              updatedInstallments[installmentIndex].status || "pendente",
          });

          remainingPayment = roundTo2Decimals(
            remainingPayment - paymentForThisInstallment,
          );
        }
      }
    }

    console.log("Distribuição concluída. Valor restante:", remainingPayment);
    console.log("Detalhes da distribuição:", distributionDetails);

    return { updatedInstallments, distributionDetails };
  };

  const processSalePayment = async (
    payment: SalePaymentInput,
    collectorId: string,
  ) => {
    try {
      setLoading(true);
      console.log("Processando pagamento de venda:", payment);

      // 1. Buscar todas as parcelas da venda para o cliente
      const saleInstallments = collections.filter(
        (collection) =>
          collection.venda_n === payment.saleNumber &&
          collection.documento === payment.clientDocument,
      );

      if (saleInstallments.length === 0) {
        throw new Error("Nenhuma parcela encontrada para esta venda e cliente");
      }

      console.log("Parcelas encontradas:", saleInstallments.length);

      // 2. Distribuir o pagamento
      const { updatedInstallments, distributionDetails } =
        distributeSalePayment(saleInstallments, payment.paymentAmount);

      // 3. Verificar se está offline
      if (!isOnline) {
        console.log("Modo offline: Adicionando pagamento à fila");
        
        // Adicionar à fila offline
        addToOfflineQueue({
          type: 'DISTRIBUTE_PAYMENT',
          data: {
            saleNumber: payment.saleNumber,
            clientDocument: payment.clientDocument,
            paymentAmount: payment.paymentAmount,
            paymentMethod: payment.paymentMethod,
            notes: payment.notes,
            collectorId: collectorId,
            distributionDetails: distributionDetails
          }
        });

        // Atualizar estado local imediatamente para melhor UX
        setCollections((prevCollections) =>
          prevCollections.map((collection) => {
            const updatedInstallment = updatedInstallments.find(
              (inst) => inst.id_parcela === collection.id_parcela,
            );
            return updatedInstallment || collection;
          }),
        );

        // Mostrar mensagem de sucesso offline
        console.log("✅ Pagamento adicionado à fila offline");
        setLoading(false);
        return;
      }

      // 4. Atualizar no banco de dados (apenas quando online)
      for (const installment of updatedInstallments) {
        const originalInstallment = saleInstallments.find(
          (inst) => inst.id_parcela === installment.id_parcela,
        );

        // Se houve mudança, atualizar no banco
        if (
          originalInstallment &&
          (originalInstallment.valor_recebido !== installment.valor_recebido ||
            originalInstallment.status !== installment.status)
        ) {
          const { error } = await supabase
            .from("BANCO_DADOS")
            .update({
              valor_recebido: installment.valor_recebido,
              status: installment.status,
              data_de_recebimento: installment.data_de_recebimento,
            })
            .eq("id_parcela", installment.id_parcela);

          if (error) {
            console.error("Erro ao atualizar parcela:", error);
            throw error;
          }
        }
      }

      // 4. Registrar o pagamento na tabela sale_payments
      const collector = users.find((u) => u.id === collectorId);
      const client = saleInstallments[0]; // Usar primeira parcela para obter dados do cliente

      const paymentRecord = {
        sale_number: payment.saleNumber,
        client_document: payment.clientDocument,
        client_name: client?.cliente || "Cliente não informado",
        payment_amount: payment.paymentAmount,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: payment.paymentMethod,
        notes: payment.notes || "",
        collector_id: collectorId,
        collector_name: collector?.name || "Cobrador não encontrado",
        distribution_details: distributionDetails,
        store_name: client?.nome_da_loja || null,
      };

      const { data: insertedPayment, error: paymentError } = await supabase
        .from("sale_payments")
        .insert(paymentRecord)
        .select()
        .single();

      if (paymentError) {
        console.error(
          "Erro ao registrar pagamento na tabela sale_payments:",
          paymentError,
        );
        // Não falhar se não conseguir registrar o histórico, apenas logar
      } else {
        console.log(
          "✅ Pagamento registrado na tabela sale_payments:",
          insertedPayment,
        );
      }

      // 5. Atualizar estado local das collections imediatamente
      setCollections((prevCollections) =>
        prevCollections.map((collection) => {
          const updatedInstallment = updatedInstallments.find(
            (inst) => inst.id_parcela === collection.id_parcela,
          );
          return updatedInstallment || collection;
        }),
      );

      // 6. Atualizar dados do banco (refresh collections apenas)
      await refreshDataExceptVisits();

      // 7. Atualizar visitas agendadas do cliente com dados refreshed
      await updateScheduledVisitsAfterPayment(payment.clientDocument);
    } catch (err) {
      console.error("Erro ao processar pagamento de venda:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao processar pagamento",
      );
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
    collectorId: string,
  ) => {
    try {
      setLoading(true);
      console.log(
        "Processando pagamento geral do cliente:",
        clientDocument,
        "Valor:",
        paymentAmount,
      );

      // 1. Buscar todas as parcelas pendentes do cliente
      console.log("Total de collections no contexto:", collections.length);
      console.log("Buscando parcelas para cliente:", clientDocument);

      const clientInstallments = collections.filter(
        (collection) =>
          collection.documento === clientDocument &&
          collection.valor_recebido < collection.valor_original,
      );

      console.log(
        "Parcelas encontradas para o cliente:",
        clientInstallments.length,
      );

      if (clientInstallments.length === 0) {
        throw new Error(
          `Nenhuma parcela pendente encontrada para o cliente ${clientDocument}`,
        );
      }

      console.log("Parcelas pendentes encontradas:", clientInstallments.length);

      // 2. Ordenar por prioridade (vencidas primeiro, depois por data de vencimento)
      const sortedInstallments = clientInstallments.sort((a, b) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const aDate = new Date(a.data_vencimento || "");
        const bDate = new Date(b.data_vencimento || "");
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
      let allSalePayments: any[] = [];

      for (const installment of sortedInstallments) {
        if (remainingPayment <= 0) break;

        const pendingAmount =
          installment.valor_original - installment.valor_recebido;
        const paymentForThisInstallment = Math.min(
          remainingPayment,
          pendingAmount,
        );

        if (paymentForThisInstallment > 0) {
          const newReceivedAmount =
            installment.valor_recebido + paymentForThisInstallment;

          const updatedInstallment: Collection = {
            ...installment,
            valor_recebido: newReceivedAmount,
            status:
              newReceivedAmount >= installment.valor_original
                ? "recebido"
                : "parcialmente_pago",
            data_de_recebimento:
              newReceivedAmount >= installment.valor_original
                ? new Date().toISOString().split("T")[0]
                : installment.data_de_recebimento,
          };

          updatedInstallments.push(updatedInstallment);

          distributionDetails.push({
            installmentId: installment.id_parcela,
            saleNumber: installment.venda_n,
            installmentNumber: installment.parcela,
            originalAmount: pendingAmount,
            appliedAmount: paymentForThisInstallment,
            installmentStatus: updatedInstallment.status,
          });

          remainingPayment -= paymentForThisInstallment;
        }
      }

      // 4. Verificar se está offline
      if (!isOnline) {
        console.log("Modo offline: Adicionando pagamento geral à fila");
        
        // Agrupar por venda para criar registros de pagamento separados
        const salesMap = new Map<number, any>();
        
        distributionDetails.forEach((detail) => {
          if (!salesMap.has(detail.saleNumber)) {
            salesMap.set(detail.saleNumber, {
              saleNumber: detail.saleNumber,
              clientDocument: clientDocument,
              paymentAmount: 0,
              paymentMethod: paymentMethod,
              notes: notes,
              collectorId: collectorId,
              distributionDetails: []
            });
          }
          
          const sale = salesMap.get(detail.saleNumber);
          sale.paymentAmount += detail.appliedAmount;
          sale.distributionDetails.push({
            installmentId: detail.installmentId,
            originalAmount: detail.originalAmount,
            appliedAmount: detail.appliedAmount,
            installmentStatus: detail.installmentStatus
          });
        });
        
        // Adicionar cada venda à fila offline
        for (const salePayment of salesMap.values()) {
          addToOfflineQueue({
            type: 'DISTRIBUTE_PAYMENT',
            data: salePayment
          });
        }

        // Atualizar estado local imediatamente para melhor UX
        setCollections((prevCollections) =>
          prevCollections.map((collection) => {
            const updatedInstallment = updatedInstallments.find(
              (inst) => inst.id_parcela === collection.id_parcela,
            );
            return updatedInstallment || collection;
          }),
        );

        console.log("✅ Pagamento geral adicionado à fila offline");
        setLoading(false);
        return;
      }

      // 5. Atualizar no banco de dados (apenas quando online)
      console.log(
        "Atualizando",
        updatedInstallments.length,
        "parcelas no banco de dados...",
      );
      for (const installment of updatedInstallments) {
        console.log(
          "Atualizando parcela",
          installment.id_parcela,
          "valor recebido:",
          installment.valor_recebido,
        );

        const { error: updateError } = await supabase
          .from("BANCO_DADOS")
          .update({
            valor_recebido: installment.valor_recebido,
            status: installment.status,
            data_de_recebimento: installment.data_de_recebimento,
          })
          .eq("id_parcela", installment.id_parcela);

        if (updateError) {
          console.error(
            "Erro ao atualizar parcela",
            installment.id_parcela,
            ":",
            updateError,
          );
          throw updateError;
        }
      }

      // 6. Registrar o pagamento geral na tabela sale_payments
      try {
        const collector = users.find((u) => u.id === collectorId);
        const client = updatedInstallments[0]; // Usar primeira parcela para obter dados do cliente

        const affectedSales = [
          ...new Set(distributionDetails.map((d) => d.saleNumber)),
        ];

        for (const saleNumber of affectedSales) {
          const saleDistribution = distributionDetails.filter(
            (d) => d.saleNumber === saleNumber,
          );
          const salePaymentAmount = saleDistribution.reduce(
            (sum, d) => sum + d.appliedAmount,
            0,
          );

          const paymentRecord = {
            sale_number: saleNumber,
            client_document: clientDocument,
            client_name: client?.cliente || "Cliente não informado",
            payment_amount: salePaymentAmount,
            payment_date: new Date().toISOString().split("T")[0],
            payment_method: paymentMethod,
            notes: `Pagamento geral do cliente. ${notes}`.trim(),
            collector_id: collectorId,
            collector_name: collector?.name || "Cobrador não encontrado",
            distribution_details: saleDistribution,
            store_name: client?.nome_da_loja || null,
          };

          const { data: insertedPayment, error: paymentError } = await supabase
            .from("sale_payments")
            .insert(paymentRecord)
            .select()
            .single();

          if (paymentError) {
            console.error(
              "Erro ao registrar pagamento na tabela sale_payments:",
              paymentError,
            );
            // Não falhar se não conseguir registrar o histórico, apenas logar
          } else {
            console.log(
              "✅ Pagamento registrado na tabela sale_payments:",
              insertedPayment,
            );
          }
        }
      } catch (historyError) {
        console.warn(
          "Erro ao registrar histórico de pagamento (não crítico):",
          historyError,
        );
      }

      // 6. Atualizar estado local das collections imediatamente
      setCollections((prevCollections) =>
        prevCollections.map((collection) => {
          const updatedInstallment = updatedInstallments.find(
            (inst) => inst.id_parcela === collection.id_parcela,
          );
          return updatedInstallment || collection;
        }),
      );

      // 7. Atualizar dados do banco (refresh collections apenas)
      await refreshDataExceptVisits();

      // 8. Atualizar visitas agendadas do cliente com dados refreshed
      await updateScheduledVisitsAfterPayment(clientDocument);

      console.log("✅ Pagamento geral processado com sucesso!");
    } catch (err) {
      console.error("Erro ao processar pagamento geral:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao processar pagamento geral",
      );
      throw err;
    } finally {
      setLoading(false);
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

    // Arredondar para 2 casas decimais para evitar problemas de precisão
    const roundTo2Decimals = (num: number) =>
      Math.round((num + Number.EPSILON) * 100) / 100;

    const totalValue = roundTo2Decimals(
      saleInstallments.reduce((sum, inst) => sum + inst.valor_original, 0),
    );
    // Limitar o valor pago ao valor original para evitar valores negativos
    const totalPaid = roundTo2Decimals(
      Math.min(
        totalValue,
        saleInstallments.reduce((sum, inst) => sum + inst.valor_recebido, 0),
      ),
    );
    const remainingBalance = roundTo2Decimals(totalValue - totalPaid);

    let status: "pending" | "partially_paid" | "fully_paid" = "pending";
    if (totalPaid === 0) {
      status = "pending";
    } else if (remainingBalance <= 0.01) {
      // Considera pago se restante for <= 1 centavo
      status = "fully_paid";
    } else {
      status = "partially_paid";
    }

    const installmentBreakdown = saleInstallments.map((inst) => ({
      installmentId: inst.id_parcela,
      originalValue: inst.valor_original,
      paidValue: Math.min(inst.valor_original, inst.valor_recebido), // Limitar valor pago ao valor original
      remainingValue: roundTo2Decimals(
        Math.max(0, inst.valor_original - inst.valor_recebido),
      ),
      status: inst.status || "pendente",
    }));

    return {
      totalValue,
      totalPaid,
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
            saleNumber,
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

  // Scheduled Visits Functions
  const fetchScheduledVisits = async () => {
    try {
      console.log("Buscando visitas agendadas...");

      const { data, error: supabaseError } = await supabase
        .from("scheduled_visits")
        .select("*")
        .order("scheduled_date", { ascending: true });

      if (supabaseError) {
        console.error("Erro ao buscar visitas agendadas:", supabaseError);

        // Se a tabela não existir, mostrar instruções para criar
        if (
          supabaseError.message.includes(
            'relation "scheduled_visits" does not exist',
          )
        ) {
          console.error(
            "Tabela scheduled_visits não existe. Verifique a estrutura do banco de dados.",
          );
          // Estrutura de tabela necessária não encontrada
        }

        // Usar sistema local como fallback
        setScheduledVisits([]);
        return;
      }

      const transformedVisits: ScheduledVisit[] = (data || []).map((visit) => ({
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
      }));

      setScheduledVisits(transformedVisits);
      console.log("Visitas agendadas carregadas:", transformedVisits.length);
    } catch (err) {
      console.error("Erro ao carregar visitas agendadas:", err);
      // Fallback para sistema local
      setScheduledVisits([]);
    }
  };

  const scheduleVisit = async (
    visitData: Omit<ScheduledVisit, "id" | "createdAt">,
  ) => {
    try {
      console.log("Agendando visita:", visitData);

      // Tentar inserir no Supabase
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
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Erro ao inserir visita no Supabase:", error);

        // Fallback para sistema local
        const newVisit: ScheduledVisit = {
          ...visitData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
        };

        setScheduledVisits((prev) => [...prev, newVisit]);
        console.log("Visita agendada localmente:", newVisit);
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
        cancellationRejectionReason: data.cancellation_rejection_reason,
      };

      // Atualizar estado local
      setScheduledVisits((prev) => [...prev, newVisit]);
      // Visita agendada com sucesso

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

      // Tentar atualizar no Supabase
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      // Se o status for "realizada", sempre definir a data atual como data da visita realizada
      if (status === "realizada") {
        updateData.data_visita_realizada = new Date()
          .toISOString()
          .split("T")[0];
      }

      const { error } = await supabase
        .from("scheduled_visits")
        .update(updateData)
        .eq("id", visitId);

      if (error) {
        console.error("Erro ao atualizar visita no Supabase:", error);
        // Continuar com atualização local mesmo se falhar no Supabase
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
                // Se o status for "realizada", definir a data atual como data da visita realizada
                ...(status === "realizada" && {
                  dataVisitaRealizada: new Date().toISOString().split("T")[0],
                }),
              }
            : visit,
        ),
      );

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
        console.error("Erro ao solicitar cancelamento no Supabase:", error);
        // Continuar com atualização local mesmo se falhar no Supabase
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

      console.log("Cancelamento rejeitado com sucesso");
    } catch (error) {
      console.error("Erro ao rejeitar cancelamento:", error);
      throw error;
    }
  };

  const getPendingCancellationRequests = () => {
    return scheduledVisits.filter(
      (visit) => visit.status === "cancelamento_solicitado",
    );
  };

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

  const getVisitsByCollector = (collectorId: string) => {
    return scheduledVisits.filter((visit) => visit.collectorId === collectorId);
  };

  const getClientDataForVisit = (clientDocument: string) => {
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
            console.warn("Formato de data brasileiro inválido:", cleanDateStr);
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
          const overdueDays = calculateOverdueDays(inst.data_vencimento || "");
          return overdueDays > 0;
        }).length
      );
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
      overdueCount: overdueCount,
    };
  };

  // Função para atualizar visitas agendadas após processamento de pagamentos
  const updateScheduledVisitsAfterPayment = async (clientDocument: string) => {
    try {
      console.log("=== INÍCIO updateScheduledVisitsAfterPayment ===");
      console.log("Cliente:", clientDocument);

      // Buscar dados atualizados do cliente
      const clientData = getClientDataForVisit(clientDocument);
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

      // Buscar visita atual para manter histórico
      const currentVisit = scheduledVisits.find((v) => v.id === visitId);
      if (!currentVisit) {
        throw new Error("Visita não encontrada");
      }

      // Montar nota com informações do reagendamento
      const rescheduleNote = `Reagendado de ${currentVisit.scheduledDate} ${currentVisit.scheduledTime || ""} para ${newDate} ${newTime || ""}${reason ? `. Motivo: ${reason}` : ""}`;

      // Atualizar notas concatenando com as existentes
      const updatedNotes = currentVisit.notes
        ? `${currentVisit.notes}\n${rescheduleNote}`
        : rescheduleNote;

      // Tentar atualizar no Supabase
      const updateData = {
        scheduled_date: newDate,
        scheduled_time: newTime || null,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("scheduled_visits")
        .update(updateData)
        .eq("id", visitId);

      if (error) {
        console.error("Erro ao reagendar visita no Supabase:", error);
        // Continuar com atualização local mesmo se falhar no Supabase
      }

      // Atualizar estado local
      setScheduledVisits((prev) =>
        prev.map((visit) =>
          visit.id === visitId
            ? {
                ...visit,
                scheduledDate: newDate,
                scheduledTime: newTime || visit.scheduledTime,
                notes: updatedNotes,
                updatedAt: new Date().toISOString(),
              }
            : visit,
        ),
      );

      console.log("Visita reagendada com sucesso");
    } catch (error) {
      console.error("Erro ao reagendar visita:", error);
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
    updateScheduledVisitsAfterPayment,
  };

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
};
