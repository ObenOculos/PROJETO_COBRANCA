import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Users,
  AlertCircle,
  Filter,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Award,
  HandCoins,
  Briefcase,
  CircleSlash,
  Building2,
  Zap,
  Globe,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { useCollection } from "../contexts/CollectionContext";
import { supabase } from "../lib/supabase";
import { Collection, isCollectorType } from "../types";
import { countVendas } from "../filters/sales";
import { getClientPending } from "../filters/clientStatus";
import { formatCurrency, formatDate } from "../utils/formatters";
import { parseAndNormalizeDate } from "../filters/dates";
import { clientMatchesFilters } from "../filters/predicates";
import FilterPanel from "./filters/FilterPanel";
import FilterPills from "./filters/FilterPills";
import {
  FilterValues,
  agingToDueRange,
  dueToAging,
  agingLabel,
} from "../filters/filterConfig";
import * as XLSX from "xlsx";
import BulkAssignmentModal from "./BulkAssignmentModal";
import AssignmentReportModal from "./dashboard/AssignmentReportModal";

const MONTHS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const monthLabel = (date: Date) =>
  `${MONTHS_PT[date.getMonth()]}/${date.getFullYear()}`;

type SortField =
  | "cliente"
  | "vendas"
  | "parcelas"
  | "cidade"
  | "pendente"
  | "cobrador";

interface ClientWithCollections {
  cliente: string;
  documento: string;
  apelido?: string;
  uniqueKey: string; // Adicionado para identificar clientes de forma única (documento ou nome)
  collections: Collection[];
  collectorId?: string;
  collectorName?: string;
  cidade?: string;
  bairro?: string;
}

// Helper function para obter indicador de situação
const getSituacaoIndicator = (collections: Collection[]) => {
  // Verificar se tem alguma parcela "Em mãos"
  const hasEmMaos = collections.some((c) => c.situacao === "Em mãos");
  if (hasEmMaos) {
    return {
      icon: HandCoins,
      label: "Em mãos",
      className: "bg-blue-100 text-blue-800",
    };
  }

  // Verificar se tem alguma parcela "Em tratamento"
  const hasEmTratamento = collections.some(
    (c) => c.situacao === "Em tratamento",
  );
  if (hasEmTratamento) {
    return {
      icon: Briefcase,
      label: "Em tratamento",
      className: "bg-yellow-100 text-yellow-800",
    };
  }

  // Verificar se tem alguma parcela "Cobrança Interna"
  const hasCobrancaInterna = collections.some(
    (c) => c.situacao === "Cobrança Interna",
  );
  if (hasCobrancaInterna) {
    return {
      icon: Building2,
      label: "Cobrança Interna",
      className: "bg-purple-100 text-purple-800",
    };
  }

  // Verificar se tem alguma parcela "Aguardando Interno"
  const hasAguardandoInterno = collections.some(
    (c) => c.situacao === "Aguardando Interno",
  );
  if (hasAguardandoInterno) {
    return {
      icon: AlertCircle,
      label: "Aguardando Interno",
      className: "bg-orange-100 text-orange-800",
    };
  }

  // Verificar se tem alguma parcela "Cobrança Terceirizada"
  const hasCobrancaTerceirizada = collections.some(
    (c) => c.situacao === "Cobrança Terceirizada",
  );
  if (hasCobrancaTerceirizada) {
    return {
      icon: Globe,
      label: "Cobrança Terceirizada",
      className: "bg-red-100 text-red-800",
    };
  }

  // Verificar se tem alguma parcela "Aguardando Terceirizado"
  const hasAguardandoTerceirizado = collections.some(
    (c) => c.situacao === "Aguardando Terceirizado",
  );
  if (hasAguardandoTerceirizado) {
    return {
      icon: Zap,
      label: "Aguardando Terceirizado",
      className: "bg-rose-100 text-rose-700",
    };
  }

  // Verificar se todas as parcelas têm situação vazia
  const allEmpty = collections.every(
    (c) => !c.situacao || c.situacao.trim() === "",
  );
  if (allEmpty) {
    return {
      icon: CircleSlash,
      label: "Vazio",
      className: "bg-gray-100 text-gray-600",
    };
  }

  // Se tem mix de situações ou outras situações
  return null;
};

// Conta a quantidade de vendas distintas de um cliente.
// Parcelas sem venda_n são renegociadas e contam como UMA única venda
// (mesma regra usada em getSalesByClient/getClientGroups no contexto).
interface ClientAssignmentProps {
  onViewClient?: (clientIdentifier: string) => void;
}

export const ClientAssignment = React.memo(({ onViewClient }: ClientAssignmentProps) => {
  const {
    collections,
    users,
  } = useCollection();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(
    new Set(),
  );
  const [showReport, setShowReport] = useState(false);

  // Novos filtros
  const [filterCollector, setFilterCollector] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>(""); // 'with_collector', 'without_collector', ''
  const [filterCity, setFilterCity] = useState<string>("");
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>("");
  const [filterStore, setFilterStore] = useState<string>("");
  const [filterSituacao, setFilterSituacao] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [includeWithoutDate, setIncludeWithoutDate] = useState(false);
  // Filtros equivalentes aos da Cobranca (status de pagamento, lancamento, valor).
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterLaunchFrom, setFilterLaunchFrom] = useState<string>("");
  const [filterLaunchTo, setFilterLaunchTo] = useState<string>("");
  const [filterMinAmount, setFilterMinAmount] = useState<number | undefined>(
    undefined,
  );
  const [filterMaxAmount, setFilterMaxAmount] = useState<number | undefined>(
    undefined,
  );
  // O atalho de atraso e derivado do vencimento (filterDateFrom/filterDateTo),
  // fonte unica — nao ha estado proprio de "aging".
  const filterAging = dueToAging(filterDateFrom, filterDateTo);
  // Filtro "Criado em": intervalo de datas sobre clientes.created_at (data em
  // que o cliente foi inserido pela primeira vez no banco).
  const [filterCreatedFrom, setFilterCreatedFrom] = useState<string>("");
  const [filterCreatedTo, setFilterCreatedTo] = useState<string>("");

  // "Cliente novo" = registro inserido pela primeira vez na tabela `clientes`
  // (mesma fonte de verdade do badge "Novo" das visitas agendadas:
  // clientes.created_at). Carregamos o mapa documento -> created_at de TODOS os
  // clientes uma unica vez (paginado) e reutilizamos tanto no card "Novos
  // Clientes" quanto no filtro "Criado em". Independe de titulos/cobrador.
  const [clientCreatedAtMap, setClientCreatedAtMap] = useState<
    Map<string, Date>
  >(new Map());

  useEffect(() => {
    let cancelled = false;

    const loadCreatedAt = async () => {
      const map = new Map<string, Date>();
      const PAGE = 1000;
      let from = 0;

      // Paginacao: o Supabase limita ~1000 linhas por requisicao.
      while (!cancelled) {
        const { data, error } = await supabase
          .from("clientes")
          .select("documento, created_at")
          .range(from, from + PAGE - 1);

        if (error) {
          console.error("Erro ao carregar created_at dos clientes:", error);
          break;
        }
        if (!data || data.length === 0) break;

        for (const row of data) {
          if (row.documento && row.created_at) {
            map.set(row.documento, new Date(row.created_at));
          }
        }

        if (data.length < PAGE) break;
        from += PAGE;
      }

      if (!cancelled) setClientCreatedAtMap(map);
    };

    loadCreatedAt();
    return () => {
      cancelled = true;
    };
  }, []);

  // Conjuntos de documentos criados no mes atual e no mes anterior, derivados
  // do mapa acima -- usados pelo card "Novos Clientes" (mes atual vs anterior).
  const newClientDocs = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    const current = new Set<string>();
    const previous = new Set<string>();
    clientCreatedAtMap.forEach((created, doc) => {
      if (created >= currentMonthStart) current.add(doc);
      else if (created >= prevMonthStart && created <= prevMonthEnd)
        previous.add(doc);
    });
    return { current, previous };
  }, [clientCreatedAtMap]);
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Ordenação CUMULATIVA (estilo Excel): o ULTIMO clique vira o critério
  // principal (indice 0); os anteriores viram desempate, na ordem em que estavam.
  // Clicar na coluna que ja e a principal alterna asc -> desc -> remove.
  const [sortKeys, setSortKeys] = useState<
    { field: SortField; direction: "asc" | "desc" }[]
  >([]);
  const handleSort = (field: SortField) => {
    setSortKeys((keys) => {
      const existing = keys.find((k) => k.field === field);
      const rest = keys.filter((k) => k.field !== field);
      // Nova coluna -> entra como principal (asc).
      if (!existing) return [{ field, direction: "asc" }, ...rest];
      // Ja e a principal -> alterna direcao; se ja era desc, remove da ordenacao.
      if (keys[0]?.field === field) {
        return existing.direction === "asc"
          ? [{ field, direction: "desc" }, ...rest]
          : rest;
      }
      // Era desempate -> promove a principal mantendo a direcao atual.
      return [existing, ...rest];
    });
    setCurrentPage(1);
  };
  const sortIndicator = (field: SortField) => {
    const idx = sortKeys.findIndex((k) => k.field === field);
    if (idx === -1) return "";
    const arrow = sortKeys[idx].direction === "asc" ? "▲" : "▼";
    return sortKeys.length > 1 ? ` ${arrow}${idx + 1}` : ` ${arrow}`;
  };

  const [maxButtons, setMaxButtons] = useState(
    typeof window !== "undefined" && window.innerWidth < 640 ? 2 : 5,
  );

  useEffect(() => {
    const handleResize = () => {
      setMaxButtons(window.innerWidth < 640 ? 2 : 5);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const collectors = users.filter(
    (user) => isCollectorType(user.type),
  );

  // Obter opções únicas para filtros
  const clientsData = useMemo(() => {
    const getCollectorForCollection = (
      collection: Collection,
    ): { collectorId?: string; collectorName?: string } => {
      if (collection.user_id) {
        const collector = users.find((u) => u.id === collection.user_id);
        return {
          collectorId: collection.user_id,
          collectorName: collector?.name,
        };
      }

      return { collectorId: undefined, collectorName: undefined };
    };

    const clientsMap = new Map<string, ClientWithCollections>();

    collections.forEach((collection) => {
      const key = (collection.documento || collection.cliente || "").trim();

      if (!key) {
        console.warn("Collection sem documento ou nome válido:", collection);
        return;
      }

      if (!clientsMap.has(key)) {
        const { collectorId, collectorName } =
          getCollectorForCollection(collection);

        clientsMap.set(key, {
          cliente: collection.cliente || "Cliente sem nome",
          documento: collection.documento || "",
          apelido: collection.apelido || undefined,
          uniqueKey: key,
          collections: [],
          collectorId: collectorId,
          collectorName: collectorName,
          cidade: collection.cidade || undefined,
          bairro: collection.bairro || undefined,
        });
      } else {
        const existingClient = clientsMap.get(key)!;
        if (!existingClient.collectorId) {
          const { collectorId, collectorName } =
            getCollectorForCollection(collection);
          if (collectorId) {
            existingClient.collectorId = collectorId;
            existingClient.collectorName = collectorName;
          }
        }
        if (!existingClient.apelido && collection.apelido) {
          existingClient.apelido = collection.apelido;
        }
      }

      clientsMap.get(key)!.collections.push(collection);
    });

    return Array.from(clientsMap.values());
  }, [collections, users]);

  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    clientsData.forEach((client) => {
      if (client.cidade) cities.add(client.cidade);
    });
    return Array.from(cities).sort();
  }, [clientsData]);

  const availableNeighborhoods = useMemo(() => {
    const neighborhoods = new Set<string>();
    clientsData.forEach((client) => {
      if (client.bairro && (!filterCity || client.cidade === filterCity)) {
        neighborhoods.add(client.bairro);
      }
    });
    return Array.from(neighborhoods).sort();
  }, [clientsData, filterCity]);

  const availableStores = useMemo(() => {
    const stores = new Set<string>();
    clientsData.forEach((client) => {
      client.collections.forEach((collection) => {
        if (collection.nome_da_loja) stores.add(collection.nome_da_loja);
      });
    });
    return Array.from(stores).sort();
  }, [clientsData]);

  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (searchTerm) {
      chips.push({
        label: `Busca: "${searchTerm}"`,
        onClear: () => setSearchTerm(""),
      });
    }
    if (filterCollector) {
      const collector = collectors.find((c) => c.id === filterCollector);
      chips.push({
        label: `Cobrador: ${collector?.name || "Desconhecido"}`,
        onClear: () => setFilterCollector(""),
      });
    }
    if (filterStatus) {
      const statusLabel =
        filterStatus === "with_collector" ? "Com Cobrador" : "Sem Cobrador";
      chips.push({
        label: `Status: ${statusLabel}`,
        onClear: () => setFilterStatus(""),
      });
    }
    if (filterCity) {
      chips.push({
        label: `Cidade: ${filterCity}`,
        onClear: () => setFilterCity(""),
      });
    }
    if (filterNeighborhood) {
      chips.push({
        label: `Bairro: ${filterNeighborhood}`,
        onClear: () => setFilterNeighborhood(""),
      });
    }
    if (filterStore) {
      chips.push({
        label: `Loja: ${filterStore}`,
        onClear: () => setFilterStore(""),
      });
    }
    if (filterSituacao) {
      const situacaoLabel =
        filterSituacao === "empty" ? "Vazio" : filterSituacao;
      chips.push({
        label: `Situação: ${situacaoLabel}`,
        onClear: () => setFilterSituacao(""),
      });
    }
    if (filterAging) {
      // Vencimento controlado por um atalho de atraso: mostra o atalho, nao a data.
      chips.push({
        label: `Atraso: ${agingLabel(filterAging)}`,
        onClear: () => {
          setFilterDateFrom("");
          setFilterDateTo("");
        },
      });
    } else {
      if (filterDateFrom) {
        chips.push({
          label: `De: ${filterDateFrom}`,
          onClear: () => setFilterDateFrom(""),
        });
      }
      if (filterDateTo) {
        chips.push({
          label: `Até: ${filterDateTo}`,
          onClear: () => setFilterDateTo(""),
        });
      }
    }
    if (includeWithoutDate && (filterDateFrom || filterDateTo)) {
      chips.push({
        label: `Incluir sem data`,
        onClear: () => setIncludeWithoutDate(false),
      });
    }
    if (filterPaymentStatus) {
      chips.push({
        label: `Pagamento: ${filterPaymentStatus}`,
        onClear: () => setFilterPaymentStatus(""),
      });
    }
    if (filterLaunchFrom) {
      chips.push({
        label: `Lançado de: ${filterLaunchFrom}`,
        onClear: () => setFilterLaunchFrom(""),
      });
    }
    if (filterLaunchTo) {
      chips.push({
        label: `Lançado até: ${filterLaunchTo}`,
        onClear: () => setFilterLaunchTo(""),
      });
    }
    if (filterMinAmount != null) {
      chips.push({
        label: `Valor mín: ${filterMinAmount}`,
        onClear: () => setFilterMinAmount(undefined),
      });
    }
    if (filterMaxAmount != null) {
      chips.push({
        label: `Valor máx: ${filterMaxAmount}`,
        onClear: () => setFilterMaxAmount(undefined),
      });
    }
    if (filterCreatedFrom) {
      chips.push({
        label: `Criado de: ${filterCreatedFrom}`,
        onClear: () => setFilterCreatedFrom(""),
      });
    }
    if (filterCreatedTo) {
      chips.push({
        label: `Criado até: ${filterCreatedTo}`,
        onClear: () => setFilterCreatedTo(""),
      });
    }

    return chips;
  }, [
    searchTerm,
    filterCollector,
    filterStatus,
    filterCity,
    filterNeighborhood,
    filterStore,
    filterSituacao,
    filterPaymentStatus,
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
    filterLaunchFrom,
    filterLaunchTo,
    filterMinAmount,
    filterMaxAmount,
    filterCreatedFrom,
    filterCreatedTo,
    collectors,
  ]);

  const filteredClients = useMemo(() => {
    // Filtros aplicados pelo motor compartilhado (src/filters/predicates).
    // O vocabulario "status de atribuicao" (com/sem cobrador) mora em
    // `assignment`, distinto do status de pagamento (src/filters/clientStatus).
    return clientsData.filter((client) =>
      clientMatchesFilters(
        client,
        {
          search: searchTerm,
          collector: filterCollector,
          assignment: filterStatus as
            | ""
            | "with_collector"
            | "without_collector",
          city: filterCity,
          neighborhood: filterNeighborhood,
          store: filterStore,
          situacao: filterSituacao,
          paymentStatus: filterPaymentStatus,
          dueFrom: filterDateFrom,
          dueTo: filterDateTo,
          includeWithoutDue: includeWithoutDate,
          launchFrom: filterLaunchFrom,
          launchTo: filterLaunchTo,
          minAmount: filterMinAmount,
          maxAmount: filterMaxAmount,
          createdFrom: filterCreatedFrom,
          createdTo: filterCreatedTo,
        },
        clientCreatedAtMap,
      ),
    );
  }, [
    clientsData,
    searchTerm,
    filterCollector,
    filterStatus,
    filterCity,
    filterNeighborhood,
    filterStore,
    filterSituacao,
    filterPaymentStatus,
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
    filterLaunchFrom,
    filterLaunchTo,
    filterMinAmount,
    filterMaxAmount,
    filterCreatedFrom,
    filterCreatedTo,
    clientCreatedAtMap,
  ]);

  // Ao mudar o filtro (muda o conjunto), volta p/ a 1a pagina e LIMPA a selecao —
  // a selecao vale sempre para o conjunto filtrado atual (nunca clientes de fora).
  useEffect(() => {
    setCurrentPage(1);
    setSelectedClients(new Set());
  }, [filteredClients]);

  // Ordenação cumulativa: aplica os critérios na ordem em que foram clicados.
  const sortedClients = useMemo(() => {
    if (sortKeys.length === 0) return filteredClients;
    const valueOf = (
      client: ClientWithCollections,
      field: SortField,
    ): string | number => {
      switch (field) {
        case "cliente":
          return (client.cliente || "").toLowerCase();
        case "cidade":
          return (client.cidade || "").toLowerCase();
        case "cobrador":
          return (client.collectorName || "").toLowerCase();
        case "vendas":
          return countVendas(client.collections);
        case "parcelas":
          return client.collections.length;
        case "pendente":
          return getClientPending(client.collections);
        default:
          return 0;
      }
    };
    return [...filteredClients].sort((a, b) => {
      for (const { field, direction } of sortKeys) {
        const av = valueOf(a, field);
        const bv = valueOf(b, field);
        let cmp = 0;
        if (typeof av === "string" && typeof bv === "string") {
          cmp = av.localeCompare(bv);
        } else {
          cmp = (av as number) - (bv as number);
        }
        if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [filteredClients, sortKeys]);

  // Clientes da página atual
  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedClients.slice(startIndex, endIndex);
  }, [sortedClients, currentPage, itemsPerPage]);

  // Informações da paginação
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startItem =
    filteredClients.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(currentPage * itemsPerPage, filteredClients.length);

  const handleSelectAll = () => {
    const currentPageUniqueKeys = paginatedClients.map((c) => c.uniqueKey);
    const allCurrentPageSelected = currentPageUniqueKeys.every((key) =>
      selectedClients.has(key),
    );

    if (allCurrentPageSelected) {
      // Remover todos da página atual
      const newSelected = new Set(selectedClients);
      currentPageUniqueKeys.forEach((key) => newSelected.delete(key));
      setSelectedClients(newSelected);
    } else {
      // Adicionar todos da página atual
      const newSelected = new Set(selectedClients);
      currentPageUniqueKeys.forEach((key) => newSelected.add(key));
      setSelectedClients(newSelected);
    }
  };

  const handleSelectAllFiltered = () => {
    if (selectedClients.size === filteredClients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(filteredClients.map((c) => c.uniqueKey)));
    }
  };

  const handleSelectClient = (uniqueKey: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(uniqueKey)) {
      newSelected.delete(uniqueKey);
    } else {
      newSelected.add(uniqueKey);
    }
    setSelectedClients(newSelected);
  };

  const handleExportToExcel = () => {
    // 1. Planilha 1: Clientes (Resumo)
    const clientRows = filteredClients.map((client) => {
      const totalValue = client.collections.reduce((sum, c) => sum + c.valor_original, 0);
      const receivedValue = client.collections.reduce((sum, c) => sum + c.valor_recebido, 0);
      const pendingValue = getClientPending(client.collections);
      const situacao = getSituacaoIndicator(client.collections);

      return {
        "Cliente": client.cliente ? client.cliente.toUpperCase() : "",
        "Documento": client.documento || "",
        "Apelido": client.apelido ? client.apelido.toUpperCase() : "",
        "Cidade": client.cidade || "",
        "Bairro": client.bairro || "",
        "Cobrador": client.collectorName || "Sem Cobrador",
        "Qtd Vendas": countVendas(client.collections),
        "Qtd Parcelas": client.collections.length,
        "Total Original (R$)": totalValue,
        "Total Recebido (R$)": receivedValue,
        "Total Pendente (R$)": pendingValue,
        "Situação Geral": situacao ? situacao.label : "-",
      };
    });

    const clientWS = XLSX.utils.json_to_sheet(clientRows);

    // Set widths for clients sheet
    clientWS["!cols"] = [
      { wch: 35 }, // Cliente
      { wch: 18 }, // Documento
      { wch: 20 }, // Apelido
      { wch: 18 }, // Cidade
      { wch: 18 }, // Bairro
      { wch: 25 }, // Cobrador
      { wch: 12 }, // Qtd Vendas
      { wch: 12 }, // Qtd Parcelas
      { wch: 20 }, // Total Original
      { wch: 20 }, // Total Recebido
      { wch: 20 }, // Total Pendente
      { wch: 18 }, // Situação Geral
    ];

    // 2. Planilha 2: Detalhamento de Parcelas
    const installmentRows: any[] = [];
    filteredClients.forEach((client) => {
      client.collections.forEach((col) => {
        const pending = col.valor_original - col.valor_recebido;
        installmentRows.push({
          "Cliente": client.cliente ? client.cliente.toUpperCase() : "",
          "Documento": client.documento || "",
          "ID Parcela": col.id_parcela,
          "Loja": col.nome_da_loja || "",
          "Venda Nº": col.venda_n || "-",
          "Nº Título": col.numero_titulo || "-",
          "Parcela": col.parcela || "-",
          "Data Lançamento": col.data_lancamento ? formatDate(col.data_lancamento) : "-",
          "Data Vencimento": col.data_vencimento ? formatDate(col.data_vencimento) : "-",
          "Data Recebimento": col.data_de_recebimento ? formatDate(col.data_de_recebimento) : "-",
          "Valor Original (R$)": col.valor_original,
          "Valor Recebido (R$)": col.valor_recebido,
          "Valor Pendente (R$)": pending,
          "Dias em Atraso": col.dias_em_atraso || 0,
          "Situação da Parcela": col.situacao || "-",
          "Cobrador": client.collectorName || "Sem Cobrador",
          "Observação": col.obs || "",
        });
      });
    });

    const installmentWS = XLSX.utils.json_to_sheet(installmentRows);

    // Set widths for installments sheet
    installmentWS["!cols"] = [
      { wch: 35 }, // Cliente
      { wch: 18 }, // Documento
      { wch: 12 }, // ID Parcela
      { wch: 15 }, // Loja
      { wch: 10 }, // Venda Nº
      { wch: 12 }, // Nº Título
      { wch: 10 }, // Parcela
      { wch: 16 }, // Data Lançamento
      { wch: 16 }, // Data Vencimento
      { wch: 16 }, // Data Recebimento
      { wch: 20 }, // Valor Original
      { wch: 20 }, // Valor Recebido
      { wch: 20 }, // Valor Pendente
      { wch: 14 }, // Dias em Atraso
      { wch: 20 }, // Situação da Parcela
      { wch: 25 }, // Cobrador
      { wch: 30 }, // Observação
    ];

    // 3. Create Workbook and save
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, clientWS, "Resumo por Cliente");
    XLSX.utils.book_append_sheet(wb, installmentWS, "Parcelas Detalhadas");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Relatorio_Clientes_Filtrados_${dateStr}.xlsx`);
  };

  const hasActiveFilters = activeFilterChips.length > 0;

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    const totalClients = clientsData.length;
    const assignedClients = clientsData.filter((c) => c.collectorId).length;
    const unassignedClients = totalClients - assignedClients;
    
    // Valor em aberto (considera desconto, mesma regra do status do cliente).
    const totalPendingValue = clientsData.reduce(
      (sum, client) => sum + getClientPending(client.collections),
      0,
    );

    // Novos clientes (Mês Atual vs Mês Anterior) com base na existência prévia
    // na tabela `clientes` (created_at), não em títulos/data_lancamento.
    const newClientsMonth = clientsData.filter((client) =>
      newClientDocs.current.has(client.documento),
    ).length;

    const prevMonthCount = clientsData.filter((client) =>
      newClientDocs.previous.has(client.documento),
    ).length;

    const assignmentRate = totalClients > 0 ? (assignedClients / totalClients) * 100 : 0;

    return {
      totalClients,
      assignedClients,
      unassignedClients,
      totalPendingValue,
      newClientsMonth,
      prevMonthCount,
      assignmentRate,
    };
  }, [clientsData, newClientDocs]);

  // Calculate filtered overview statistics
  const filteredStats = useMemo(() => {
    const totalFiltered = filteredClients.length;
    const assignedFiltered = filteredClients.filter((c) => c.collectorId).length;
    const unassignedFiltered = totalFiltered - assignedFiltered;
    
    const totalPendingFiltered = filteredClients.reduce(
      (sum, client) => sum + getClientPending(client.collections),
      0,
    );

    // Novos clientes filtrados (Mês Atual vs Mês Anterior) — mesma fonte de
    // verdade (tabela `clientes`/created_at), respeitando o conjunto filtrado.
    const newClientsFiltered = filteredClients.filter((client) =>
      newClientDocs.current.has(client.documento),
    ).length;

    const prevMonthFiltered = filteredClients.filter((client) =>
      newClientDocs.previous.has(client.documento),
    ).length;

    return {
      totalFiltered,
      assignedFiltered,
      unassignedFiltered,
      totalPendingFiltered,
      newClientsFiltered,
      prevMonthFiltered,
    };
  }, [filteredClients, newClientDocs]);

  // Debug info para datas (remover em produção)
  useEffect(() => {
    if (filterDateFrom || filterDateTo) {
      console.log("=== DEBUG FILTRO DE DATA ===");
      console.log("Filtros ativos:", {
        filterDateFrom,
        filterDateTo,
        includeWithoutDate,
      });
      console.log("Total de clientes filtrados:", filteredClients.length);

      // Analisar algumas datas para debug
      const sampleDates = new Set<string>();
      let validCount = 0;
      let invalidCount = 0;

      clientsData.slice(0, 100).forEach((client) => {
        client.collections.forEach((col) => {
          if (col.data_vencimento) {
            sampleDates.add(col.data_vencimento);
            const parsed = parseAndNormalizeDate(col.data_vencimento);
            if (parsed) validCount++;
            else invalidCount++;
          }
        });
      });

      console.log(
        "Amostra de datas (primeiras 10):",
        Array.from(sampleDates).slice(0, 10),
      );
      console.log("Datas válidas/inválidas na amostra:", {
        validCount,
        invalidCount,
      });
    }
  }, [
    filterDateFrom,
    filterDateTo,
    includeWithoutDate,
    filteredClients,
    clientsData,
  ]);

  // Calcular estatísticas para o card principal
  const mainStats = useMemo(() => {
    const total = hasActiveFilters
      ? filteredStats.totalFiltered
      : overviewStats.totalClients;
    const assigned = hasActiveFilters
      ? filteredStats.assignedFiltered
      : overviewStats.assignedClients;
    const newClients = hasActiveFilters
      ? filteredStats.newClientsFiltered
      : overviewStats.newClientsMonth;
    const prevMonth = hasActiveFilters
      ? filteredStats.prevMonthFiltered
      : overviewStats.prevMonthCount;
    const pendingValue = hasActiveFilters
      ? filteredStats.totalPendingFiltered
      : overviewStats.totalPendingValue;

    // Total de vendas (mesma base de clientes que o total: filtrada ou geral).
    const baseClients = hasActiveFilters ? filteredClients : clientsData;
    const totalSales = baseClients.reduce(
      (sum, c) => sum + countVendas(c.collections),
      0,
    );

    const assignmentRate = total > 0 ? (assigned / total) * 100 : 0;

    return {
      total,
      totalSales,
      assigned,
      unassigned: total - assigned,
      newClients,
      prevMonth,
      pendingValue,
      assignmentRate,
    };
  }, [hasActiveFilters, filteredStats, overviewStats, filteredClients, clientsData]);

  // Rótulos explícitos dos períodos comparados no card "Novos Clientes".
  const now = new Date();
  const currentMonthLabel = monthLabel(now);
  const prevMonthLabel = monthLabel(
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
  );

  // Clique nos cards aplica/remove (toggle) o filtro correspondente.
  const currentMonthStartStr = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const isNewClientsFilterActive =
    filterCreatedFrom === currentMonthStartStr && !filterCreatedTo;
  const isPendingFilterActive = filterStatus === "without_collector";
  const isAllActive =
    !filterStatus && !filterCreatedFrom && !filterCreatedTo && !filterDateFrom;

  const currentVision = useMemo(() => {
    if (isPendingFilterActive) return "pending";
    if (filterStatus === "with_collector") return "assigned";
    if (isNewClientsFilterActive) return "new";
    return "all";
  }, [isPendingFilterActive, filterStatus, isNewClientsFilterActive]);

  const handleToggleNewClientsFilter = () => {
    if (isNewClientsFilterActive) {
      setFilterCreatedFrom("");
    } else {
      setFilterCreatedFrom(currentMonthStartStr);
      setFilterCreatedTo("");
    }
    setCurrentPage(1);
  };

  const handleShowAll = () => {
    setFilterStatus("");
    setFilterCreatedFrom("");
    setFilterCreatedTo("");
    setFilterDateFrom("");
    setCurrentPage(1);
  };

  const handleTogglePendingFilter = () => {
    setFilterStatus(isPendingFilterActive ? "" : "without_collector");
    setCurrentPage(1);
  };

  // Limpa todos os filtros (reutilizado pelo painel, pelos chips e pelos cards).
  const clearAllFilters = () => {
    setSearchTerm("");
    setFilterCollector("");
    setFilterStatus("");
    setFilterCity("");
    setFilterNeighborhood("");
    setFilterStore("");
    setFilterSituacao("");
    setFilterPaymentStatus("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setIncludeWithoutDate(false);
    setFilterLaunchFrom("");
    setFilterLaunchTo("");
    setFilterMinAmount(undefined);
    setFilterMaxAmount(undefined);
    setFilterCreatedFrom("");
    setFilterCreatedTo("");
    setCurrentPage(1);
  };

  // Valores e adaptador consumidos pelo FilterPanel compartilhado. O vocabulario
  // de atribuicao (com/sem cobrador) vai em `assignment`; o de localizacao mantem
  // a dependencia cidade -> bairro como regra desta tela.
  const filterPanelValues: Partial<FilterValues> = {
    assignment: filterStatus,
    paymentStatus: filterPaymentStatus,
    city: filterCity,
    neighborhood: filterNeighborhood,
    store: filterStore,
    situacao: filterSituacao,
    dueFrom: filterDateFrom,
    dueTo: filterDateTo,
    launchFrom: filterLaunchFrom,
    launchTo: filterLaunchTo,
    minAmount: filterMinAmount,
    maxAmount: filterMaxAmount,
    aging: filterAging,
    createdFrom: filterCreatedFrom,
    createdTo: filterCreatedTo,
  };

  const handleFilterPanelChange = (patch: Partial<FilterValues>) => {
    if ("assignment" in patch) setFilterStatus(patch.assignment ?? "");
    if ("paymentStatus" in patch)
      setFilterPaymentStatus(patch.paymentStatus ?? "");
    if ("city" in patch) {
      setFilterCity(patch.city ?? "");
      setFilterNeighborhood(""); // dependencia: trocar cidade reseta o bairro
    }
    if ("neighborhood" in patch) setFilterNeighborhood(patch.neighborhood ?? "");
    if ("store" in patch) setFilterStore(patch.store ?? "");
    if ("situacao" in patch) setFilterSituacao(patch.situacao ?? "");
    if ("dueFrom" in patch) setFilterDateFrom(patch.dueFrom ?? "");
    if ("dueTo" in patch) setFilterDateTo(patch.dueTo ?? "");
    if ("launchFrom" in patch) setFilterLaunchFrom(patch.launchFrom ?? "");
    if ("launchTo" in patch) setFilterLaunchTo(patch.launchTo ?? "");
    if ("minAmount" in patch) setFilterMinAmount(patch.minAmount);
    if ("maxAmount" in patch) setFilterMaxAmount(patch.maxAmount);
    // Pill de atraso escreve no proprio vencimento (de/ate): cada faixa vira um
    // intervalo de datas; desmarcar limpa ambos.
    if ("aging" in patch) {
      if (patch.aging) {
        const { dueFrom, dueTo } = agingToDueRange(patch.aging);
        setFilterDateFrom(dueFrom);
        setFilterDateTo(dueTo);
      } else {
        setFilterDateFrom("");
        setFilterDateTo("");
      }
    }
    if ("createdFrom" in patch) setFilterCreatedFrom(patch.createdFrom ?? "");
    if ("createdTo" in patch) setFilterCreatedTo(patch.createdTo ?? "");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 text-gray-700 dark:text-dark-text">
      {/* Header */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl shrink-0">
            <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight leading-none">
              Atribuição de Cobradores
            </h2>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary mt-1 tracking-wide">
              {hasActiveFilters ? "Visão Filtrada" : "Gestão de Carteira"}
            </p>
          </div>
        </div>
      </div>

      {/* Grid de Cards Executivos — Scroll horizontal em mobile com padding vertical para evitar corte de sombras */}
      <div className="flex overflow-x-auto pt-3 pb-5 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 custom-scrollbar snap-x">
        {/* Card: Total de Clientes */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleShowAll}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleShowAll();
            }
          }}
          title="Mostrar todos os clientes (limpar filtros)"
          className={`min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all snap-start cursor-pointer ${
            isAllActive
              ? "border-blue-500 ring-2 ring-blue-500/10"
              : "border-gray-100 dark:border-dark-border"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            {mainStats.unassigned > 0 && (
              <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md tracking-wide border border-amber-100 dark:border-amber-900/30">
                {mainStats.unassigned} Pendentes
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Total Clientes</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{mainStats.total}</p>
            <p className="text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary mt-0.5">
              <span className="text-gray-600 dark:text-dark-text font-semibold">{mainStats.totalSales}</span> vendas
            </p>
          </div>
        </div>

        {/* Card: Novos Clientes */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggleNewClientsFilter}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleToggleNewClientsFilter();
            }
          }}
          title={`Filtrar clientes criados em ${currentMonthLabel}`}
          className={`min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all snap-start cursor-pointer ${
            isNewClientsFilterActive
              ? "border-green-500 ring-2 ring-green-500/10"
              : "border-gray-100 dark:border-dark-border"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            {mainStats.prevMonth > 0 ? (
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md tracking-wide border ${
                mainStats.newClients >= mainStats.prevMonth 
                  ? 'text-green-700 bg-green-50 border-green-150 dark:text-green-400 dark:bg-green-900/20 dark:border-green-900/30' 
                  : 'text-amber-700 bg-amber-50 border-amber-150 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/30'
              }`}>
                {mainStats.newClients >= mainStats.prevMonth ? '▲ +' : '▼ '}{((mainStats.newClients / mainStats.prevMonth - 1) * 100).toFixed(0)}%
              </span>
            ) : (
              <span className="text-[9px] font-semibold text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20 px-2 py-0.5 rounded-md tracking-wide border border-green-100 dark:border-green-900/30">
                {currentMonthLabel}
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Novos Clientes</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{mainStats.newClients}</p>
              <p className="text-[9px] font-semibold text-gray-400 tracking-tight shrink-0">{currentMonthLabel}</p>
            </div>
            <p className="text-[10px] font-medium text-gray-400 dark:text-dark-text-secondary mt-0.5 tracking-tight">
              {prevMonthLabel}: <span className="text-gray-600 dark:text-dark-text font-semibold">{mainStats.prevMonth}</span>
            </p>
          </div>
        </div>

        {/* Card: Valor em Aberto */}
        <div className="min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow snap-start">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
              <HandCoins className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Valor em Aberto</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-450 tracking-tight">{formatCurrency(mainStats.pendingValue)}</p>
          </div>
        </div>

        {/* Card: Taxa de Atribuição */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleTogglePendingFilter}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleTogglePendingFilter();
            }
          }}
          title="Filtrar clientes pendentes (sem cobrador)"
          className={`min-w-[240px] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all snap-start cursor-pointer ${
            isPendingFilterActive
              ? "border-amber-500 ring-2 ring-amber-500/10"
              : "border-gray-100 dark:border-dark-border"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
              <Award className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md tracking-wide border ${
              mainStats.assignmentRate > 90
                ? 'text-green-700 bg-green-50 border-green-100 dark:text-green-400 dark:bg-green-900/20 dark:border-green-900/30'
                : 'text-amber-700 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/30'
            }`}>
              {mainStats.assignmentRate > 90 ? 'Excelente' : 'Ajustar'}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">Taxa Atribuição</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">{mainStats.assignmentRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Unificada */}
      <div className="bg-white dark:bg-dark-bg-secondary p-3 rounded-2xl border border-gray-150/80 dark:border-dark-border shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Busca */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-405 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, apelido ou documento..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-gray-450"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-2.5 shrink-0">
          {/* Dropdown Visão */}
          <div className="relative flex-1 sm:flex-none">
            <select
              value={currentVision}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "all") {
                  handleShowAll();
                } else if (val === "pending") {
                  setFilterStatus("without_collector");
                  setFilterCollector("");
                  setFilterDateFrom("");
                  setFilterCreatedFrom("");
                  setFilterCreatedTo("");
                } else if (val === "assigned") {
                  setFilterStatus("with_collector");
                  setFilterCollector("");
                  setFilterDateFrom("");
                  setFilterCreatedFrom("");
                  setFilterCreatedTo("");
                } else if (val === "new") {
                  // Mesma regra do card "Novos": createdFrom = inicio do mes e
                  // createdTo vazio, para que currentVision detecte "new" e o
                  // select reflita/limpe corretamente.
                  setFilterCreatedFrom(currentMonthStartStr);
                  setFilterCreatedTo("");
                  setFilterStatus("");
                  setFilterCollector("");
                  setFilterDateFrom("");
                }
              }}
              className="w-full sm:w-[155px] pl-3 pr-8 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-xs font-semibold text-gray-600 dark:text-dark-text tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer appearance-none"
            >
              <option value="all">Visão: Todos</option>
              <option value="pending">Visão: Pendentes</option>
              <option value="assigned">Visão: Atribuídos</option>
              <option value="new">Visão: Novos</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <Filter className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Dropdown Cobrador */}
          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterCollector}
              onChange={(e) => setFilterCollector(e.target.value)}
              className="w-full sm:w-[195px] pl-3 pr-8 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-xs font-semibold text-gray-600 dark:text-dark-text tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer appearance-none"
            >
              <option value="">Cobrador: Todos</option>
              {collectors.map((collector) => (
                <option key={collector.id} value={collector.id}>
                  Cobrador: {collector.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Botão Relatório */}
          <button
            onClick={() => setShowReport(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all border bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-150 dark:hover:bg-dark-bg-tertiary flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="Relatório de atribuições"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Relatório</span>
          </button>

          {/* Botão Avançado */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all border flex items-center justify-center gap-1.5 whitespace-nowrap ${
              showFilters || hasActiveFilters
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Filtros {hasActiveFilters && `(${activeFilterChips.length})`}</span>
          </button>
        </div>
        </div>

        {/* Atalhos rápidos: status de pagamento + faixa de atraso */}
        <FilterPills
          values={{ paymentStatus: filterPaymentStatus, aging: filterAging }}
          onChange={handleFilterPanelChange}
          showPaymentStatus
          excludePaymentStatus={["cancelado"]}
          showAging
        />

        {/* Filtros Colapsáveis (painel compartilhado) */}
        {showFilters && (
          <FilterPanel
            context="assignment"
            values={filterPanelValues}
            onChange={handleFilterPanelChange}
            onClear={clearAllFilters}
            onClose={() => setShowFilters(false)}
            excludePaymentStatus={["cancelado"]}
            options={{
              cities: availableCities,
              neighborhoods: availableNeighborhoods,
              stores: availableStores,
            }}
          />
        )}
      </div>

      {/* Client List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-dark-text tracking-tight">
              Lista de Clientes
            </h3>
            <p className="text-[10px] sm:text-xs font-semibold text-gray-400 tracking-wide">
              {filteredClients.length} registros filtrados
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleSelectAll}
              className="flex-1 sm:flex-none px-3 py-2 text-[10px] font-semibold tracking-wide border border-gray-250 dark:border-dark-border dark:text-dark-text rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg/50 transition-all"
            >
              {paginatedClients.every((c) => selectedClients.has(c.uniqueKey))
                ? "Desmarcar Página"
                : "Marcar Página"}
            </button>
            {filteredClients.length > itemsPerPage && (
              <button
                onClick={handleSelectAllFiltered}
                className="flex-1 sm:flex-none px-3 py-2 text-[10px] font-semibold tracking-wide bg-blue-50/70 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/30 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all whitespace-nowrap"
              >
                Tudo ({filteredClients.length})
              </button>
            )}
            
            {/* Espaçamento / Gap */}
            <div className="w-px h-5 bg-gray-200 dark:bg-dark-border mx-1 hidden sm:block" />
            
            <button
              onClick={handleExportToExcel}
              title="Exportar para Excel"
              className="flex-1 sm:flex-none px-3 py-2 text-[10px] font-semibold tracking-wide bg-green-50/70 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100/50 dark:border-green-900/30 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-all flex items-center justify-center gap-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Exportar</span>
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50/50 dark:bg-dark-bg/25 rounded-xl border border-gray-150/40 dark:border-dark-border/40">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide pl-1.5 mr-1">
              Filtros ativos:
            </span>
            {activeFilterChips.map((chip, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text border border-gray-200 dark:border-dark-border rounded-lg shadow-sm"
              >
                <span>{chip.label}</span>
                <button
                  onClick={chip.onClear}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-dark-bg transition-all ml-1"
                  title="Remover filtro"
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              onClick={clearAllFilters}
              className="ml-auto text-[10px] font-bold text-red-500 hover:text-red-600 hover:underline px-2 transition-colors"
            >
              Limpar Todos
            </button>
          </div>
        )}

        {/* Visualização em Tabela (Desktop) */}
        <div className="hidden md:block bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-dark-bg border-b border-gray-100 dark:border-dark-border">
                  <th className="px-6 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={paginatedClients.length > 0 && paginatedClients.every((c) => selectedClients.has(c.uniqueKey))}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg"
                    />
                  </th>
                  <th onClick={() => handleSort("cliente")} className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors">Cliente / Documento{sortIndicator("cliente")}</th>
                  <th onClick={() => handleSort("vendas")} className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide text-center cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors">Vendas{sortIndicator("vendas")}</th>
                  <th onClick={() => handleSort("parcelas")} className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide text-center cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors">Parcelas{sortIndicator("parcelas")}</th>
                  <th onClick={() => handleSort("cobrador")} className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors">Status / Cobrador{sortIndicator("cobrador")}</th>
                  <th onClick={() => handleSort("cidade")} className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors">Localização{sortIndicator("cidade")}</th>
                  <th onClick={() => handleSort("pendente")} className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide text-right cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors">Valores{sortIndicator("pendente")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {paginatedClients.map((client) => {
                  const totalValue = client.collections.reduce((sum, c) => sum + c.valor_original, 0);
                  const pendingValue = getClientPending(client.collections);
                  const situacao = getSituacaoIndicator(client.collections);

                  return (
                    <tr
                      key={client.uniqueKey}
                      className={`hover:bg-gray-50/50 dark:hover:bg-dark-bg transition-colors cursor-pointer group ${
                        selectedClients.has(client.uniqueKey) ? "bg-blue-50/30 dark:bg-blue-900/10" : ""
                      }`}
                      onClick={() => handleSelectClient(client.uniqueKey)}
                    >
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedClients.has(client.uniqueKey)}
                          onChange={() => handleSelectClient(client.uniqueKey)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg"
                        />
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewClient?.(client.documento || client.cliente);
                            }}
                            title={`Ver cobranças de ${client.cliente}`}
                            className="text-left text-sm font-semibold text-gray-900 dark:text-dark-text truncate max-w-[250px] hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                          >
                            {client.cliente}
                          </button>
                          <span className="text-[10px] font-medium text-gray-450 tracking-tight mt-0.5">{client.documento}</span>
                          {client.apelido && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">"{client.apelido}"</span>}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30">
                          {countVendas(client.collections)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border border-gray-150 dark:border-dark-border">
                          {client.collections.length}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex flex-col gap-1.5">
                          {client.collectorName ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-450 border border-green-100/50 dark:border-green-900/30 tracking-wide w-fit">
                              {client.collectorName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-450 border border-amber-100/50 dark:border-amber-900/30 tracking-wide w-fit">
                              Sem Cobrador
                            </span>
                          )}
                          {situacao && (
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold tracking-tight w-fit ${situacao.className} border border-current/25 opacity-90`}>
                              <situacao.icon className="h-3 w-3" />
                              {situacao.label}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center text-[11px] font-medium text-gray-500 dark:text-dark-text-secondary">
                          <MapPin className="h-3.5 w-3.5 mr-1.5 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[180px]">
                            {client.bairro && client.cidade ? `${client.bairro}, ${client.cidade}` : client.cidade || client.bairro || "-"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-red-600 dark:text-red-400 tracking-tight">{formatCurrency(pendingValue)}</span>
                          <span className="text-[10px] font-semibold text-gray-400 tracking-tight">Total: {formatCurrency(totalValue)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visualização em Cards (Mobile) — Refinada */}
        <div className="md:hidden space-y-3">
          {paginatedClients.map((client) => {
            const isWithoutCollector = !client.collectorId;
            const totalValue = client.collections.reduce((sum, c) => sum + c.valor_original, 0);
            const pendingValue = getClientPending(client.collections);
            const situacao = getSituacaoIndicator(client.collections);
            const isSelected = selectedClients.has(client.uniqueKey);

            return (
              <div
                key={client.uniqueKey}
                className={`bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border transition-all duration-200 cursor-pointer relative ${
                  isSelected 
                    ? "ring-2 ring-blue-500/20 border-blue-500 bg-blue-50/5 shadow-md" 
                    : isWithoutCollector 
                      ? "border-amber-200 dark:border-amber-900/20 bg-amber-50/5" 
                      : "border-gray-100 dark:border-dark-border"
                }`}
                onClick={() => handleSelectClient(client.uniqueKey)}
              >
                <div className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center h-5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectClient(client.uniqueKey)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4.5 w-4.5 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewClient?.(client.documento || client.cliente);
                            }}
                            className="text-left text-[13px] font-semibold text-gray-900 dark:text-dark-text truncate tracking-tight leading-tight hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                          >
                            {client.cliente}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[9px] font-medium text-gray-455 leading-none">{client.documento}</p>
                            {client.apelido && (
                              <span className="text-[9px] text-blue-600 dark:text-blue-400 font-semibold leading-none truncate max-w-[100px]">
                                "{client.apelido}"
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[13px] font-semibold text-red-650 dark:text-red-400 tracking-tight leading-tight">
                            {formatCurrency(pendingValue)}
                          </p>
                          <p className="text-[8px] font-semibold text-gray-400 tracking-tight leading-none">
                            T: {formatCurrency(totalValue)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 items-center">
                        {client.collectorName ? (
                          <span className="px-2 py-0.5 rounded-md text-[8px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100/55 tracking-wide">
                            {client.collectorName}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[8px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-150/55 tracking-wide">
                            Sem Cobrador
                          </span>
                        )}
                        {situacao && (
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-semibold border border-current/25 ${situacao.className} opacity-90`}>
                            <situacao.icon className="h-2.5 w-2.5" />
                            {situacao.label}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-[9px] font-medium text-gray-400 tracking-tight ml-auto">
                          <span className="bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded-md text-indigo-700 dark:text-indigo-400 font-semibold">
                            {countVendas(client.collections)}V
                          </span>
                          <span className="bg-gray-50 dark:bg-dark-bg px-1.5 py-0.5 rounded-md text-gray-600 dark:text-dark-text-secondary">
                            {client.collections.length}P
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gray-50 dark:border-dark-border/40 flex items-center justify-between">
                        <div className="flex items-center text-[9px] font-medium text-gray-400 tracking-tight">
                          <MapPin className="h-2.5 w-2.5 mr-1 text-gray-300" />
                          <span className="truncate max-w-[180px]">{client.bairro ? `${client.bairro}, ` : ""}{client.cidade || "-"}</span>
                        </div>
                        <ChevronRight className="h-3 w-3 text-gray-300" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty State */}
      {filteredClients.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum cliente encontrado
          </h3>
          <p className="text-gray-600">
            {hasActiveFilters
              ? "Tente ajustar los filtros de busca."
              : "Não há clientes cadastrados no sistema."}
          </p>
        </div>
      )}

      {/* Controles de Paginação — Estilo Dashboard */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-dark-bg-secondary mt-4 border border-gray-100 dark:border-dark-border px-4 py-3 sm:px-6 sm:py-3.5 rounded-2xl shadow-sm text-gray-700 dark:text-dark-text">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-lg text-[10px] font-semibold tracking-wide border border-blue-100 dark:border-blue-900/30">
                Pág {currentPage}/{totalPages}
              </div>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide hidden sm:inline">
                Exibindo {startItem}–{endItem} de {filteredClients.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pt-2 pb-3 sm:pt-0 sm:pb-0 sm:overflow-visible custom-scrollbar">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="flex items-center px-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-[10px] font-semibold tracking-wide text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span className="hidden sm:inline">Início</span>
                <span className="sm:hidden">«</span>
              </button>

              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex items-center px-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-[10px] font-semibold tracking-wide text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(maxButtons, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= maxButtons) pageNum = i + 1;
                  else if (currentPage <= Math.ceil(maxButtons / 2)) pageNum = i + 1;
                  else if (currentPage >= totalPages - Math.floor(maxButtons / 2)) pageNum = totalPages - maxButtons + 1 + i;
                  else pageNum = currentPage - Math.floor(maxButtons / 2) + i;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 flex items-center justify-center text-[11px] font-semibold rounded-xl transition-all border ${
                        pageNum === currentPage
                          ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                          : "bg-gray-50 dark:bg-dark-bg border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center px-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-[10px] font-semibold tracking-wide text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span className="hidden sm:inline">Próxima</span>
                <ChevronRight className="h-3.5 w-3.5 sm:ml-1" />
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="flex items-center px-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-[10px] font-semibold tracking-wide text-gray-600 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span className="hidden sm:inline">Fim</span>
                <span className="sm:hidden">»</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Ação Contextual — Mais compacta em mobile */}
      <div className={`fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 transform w-[95%] sm:w-auto ${selectedClients.size > 0 ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
        <div className="bg-gray-900 dark:bg-dark-bg-secondary text-white p-2 sm:px-4 sm:py-3 rounded-2xl shadow-2xl flex items-center justify-between sm:justify-start gap-2 sm:gap-6 border border-gray-700 dark:border-dark-border overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 pr-2 sm:pr-6 border-r border-gray-700 dark:border-dark-border">
            <div className="bg-blue-600 text-white w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-xs sm:text-sm">
              {selectedClients.size}
            </div>
            <span className="text-[10px] sm:text-sm font-black text-gray-300 tracking-wide whitespace-nowrap hidden min-[400px]:inline">
              {selectedClients.size === 1 ? 'Selecionado' : 'Selecionados'}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setSelectedClients(new Set())}
              className="px-3 py-2 text-[10px] sm:text-sm font-black text-gray-400 hover:text-white transition-colors tracking-wide"
            >
              Limpar
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <span className="text-[10px] sm:text-sm font-black tracking-wide whitespace-nowrap">
                Atribuir
              </span>
            </button>
          </div>
        </div>
      </div>

      <BulkAssignmentModal
        isOpen={showBulkModal}
        onClose={() => { setShowBulkModal(false); setSelectedClients(new Set()); }}
        selectedClients={selectedClients}
        clientsData={clientsData}
        collectors={collectors}
        onComplete={() => setSelectedClients(new Set())}
      />

      <AssignmentReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        users={users}
      />
    </div>
  );
});
