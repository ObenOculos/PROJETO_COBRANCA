import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Users,
  AlertCircle,
  Filter,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Award,
  HandCoins,
  Briefcase,
  CircleSlash,
  Scale,
  Building2,
  Zap,
  Globe,
  FileText,
  FileSpreadsheet,
  Eye,
  Copy,
  Phone,
  Check,
  Minus,
} from "lucide-react";
import { useCollection } from "../contexts/CollectionContext";
import { Collection, isCollectorType, ClientGroup } from "../types";
import { createPortal } from "react-dom";
import ClientDetailModal from "./dashboard/ClientDetailModal";
import { countVendas, resolveSaleKey } from "../filters/sales";
import { getClientPending } from "../filters/clientStatus";
import { formatCurrency, formatDate } from "../utils/formatters";
import { parseAndNormalizeDate } from "../filters/dates";
import { clientMatchesFilters, ClientFilters } from "../filters/predicates";
import { computeClientFacets } from "../filters/facets";
import FilterPanel from "./filters/FilterPanel";
import FilterPills from "./filters/FilterPills";
import {
  FilterValues,
  agingRangeToDueRange,
  dueToAgingSet,
  agingLabel,
  PAYMENT_STATUS_PILLS,
} from "../filters/filterConfig";
import type { PillPatch } from "./filters/FilterPills";
import {
  lastVisitOutcomeByClient,
  visitOutcomeLabel,
} from "../config/visitOutcomes";
import {
  lastVisitStatusByClient,
  visitStatusLabel,
  todayLocalStr,
} from "../config/visitStatus";
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
  | "loja"
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

/**
 * Indicadores de situação, em ORDEM DE PRECEDÊNCIA.
 *
 * Um cliente pode ter parcelas em situações diferentes (ex.: título novo
 * importado depois de o cliente já ter mudado de fase). O badge mostra a
 * PRIMEIRA situação desta lista presente em qualquer parcela — por isso a ordem
 * é significativa e não deve ser reordenada por conveniência visual.
 *
 * "Falecido" vem primeiro por ser encerramento: sobrepõe qualquer fase de
 * cobrança em que o cliente estivesse. As demais seguem a ordem do funil
 * (campo → interna → terceirizada → jurídica).
 *
 * Nova situação: acrescente aqui e em ALL_SITUACOES (src/config/profiles).
 */
const SITUACAO_INDICATORS: {
  situacao: string;
  icon: typeof HandCoins;
  label: string;
  className: string;
}[] = [
  {
    situacao: "Falecido",
    icon: CircleSlash,
    label: "Falecido",
    className: "bg-slate-200 text-slate-700",
  },
  {
    situacao: "Em mãos",
    icon: HandCoins,
    label: "Em mãos",
    className: "bg-blue-100 text-blue-800",
  },
  {
    situacao: "Em tratamento",
    icon: Briefcase,
    label: "Em tratamento",
    className: "bg-yellow-100 text-yellow-800",
  },
  {
    situacao: "Cobrança Interna",
    icon: Building2,
    label: "Cobrança Interna",
    className: "bg-purple-100 text-purple-800",
  },
  {
    situacao: "Aguardando Interno",
    icon: AlertCircle,
    label: "Aguardando Interno",
    className: "bg-orange-100 text-orange-800",
  },
  {
    situacao: "Cobrança Terceirizada",
    icon: Globe,
    label: "Cobrança Terceirizada",
    className: "bg-red-100 text-red-800",
  },
  {
    situacao: "Aguardando Terceirizado",
    icon: Zap,
    label: "Aguardando Terceirizado",
    className: "bg-rose-100 text-rose-700",
  },
  {
    situacao: "Cobrança Jurídica",
    icon: Scale,
    label: "Cobrança Jurídica",
    className: "bg-amber-100 text-amber-800",
  },
  {
    situacao: "Aguardando Jurídico",
    icon: Scale,
    label: "Aguardando Jurídico",
    className: "bg-yellow-100 text-yellow-700",
  },
];

// Helper function para obter indicador de situação
const getSituacaoIndicator = (collections: Collection[]) => {
  const presentes = new Set(
    collections.map((c) => c.situacao).filter((s): s is string => Boolean(s)),
  );

  const match = SITUACAO_INDICATORS.find((i) => presentes.has(i.situacao));
  if (match) {
    return { icon: match.icon, label: match.label, className: match.className };
  }

  // Todas as parcelas com situação vazia
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

  // Situação desconhecida (fora do catálogo): sem badge.
  return null;
};

// Conta a quantidade de vendas distintas de um cliente.
// Parcelas sem venda_n são renegociadas e contam como UMA única venda
// (mesma regra usada em getSalesByClient/getClientGroups no contexto).
interface ClientAssignmentProps {
  onViewClient?: (clientIdentifier: string) => void;
  /** Filtro de cobrador inicial (ex.: clique na notificacao "sem cobrador"). */
  initialAssignmentFilter?: "with_collector" | "without_collector";
}

interface SelectionIndicatorProps {
  checked: boolean;
  partial?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const SelectionIndicator = ({ checked, partial, onClick }: SelectionIndicatorProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-1 dark:focus:ring-offset-dark-bg ${
        checked
          ? "bg-blue-600 border border-blue-600 text-white scale-105 shadow-sm shadow-blue-500/25"
          : partial
          ? "bg-blue-50 border border-blue-400 text-blue-600 dark:bg-blue-900/20 dark:border-blue-500"
          : "bg-white border border-gray-300 dark:bg-dark-bg dark:border-dark-border text-transparent hover:border-blue-400 dark:hover:border-blue-500 hover:scale-105"
      }`}
      aria-checked={checked ? "true" : partial ? "mixed" : "false"}
      role="checkbox"
    >
      {checked ? (
        <Check className="h-3.5 w-3.5 stroke-[3.5] animate-in zoom-in-75 duration-100" />
      ) : partial ? (
        <Minus className="h-3 w-3 stroke-[3.5]" />
      ) : null}
    </button>
  );
};

export const ClientAssignment = React.memo(
  ({ onViewClient, initialAssignmentFilter }: ClientAssignmentProps) => {
    const {
      collections,
      users,
      getClientGroups,
      scheduledVisits,
      clientesRegistry,
    } = useCollection();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClientGroup, setSelectedClientGroup] =
      useState<ClientGroup | null>(null);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);

    const handleOpenClientModal = (documento: string, clienteName: string) => {
      const cGroups = getClientGroups();
      const group = cGroups.find(
        (cg) => cg.document === (documento || "").trim(),
      );
      if (group) {
        setSelectedClientGroup(group);
        setIsClientModalOpen(true);
      } else {
        onViewClient?.(documento || clienteName);
      }
    };
    const [selectedClients, setSelectedClients] = useState<Set<string>>(
      new Set(),
    );
    const [showReport, setShowReport] = useState(false);

    // Novos filtros
    const [filterCollector, setFilterCollector] = useState<string>("");
    const [filterStatus, setFilterStatus] = useState<string>(
      initialAssignmentFilter ?? "",
    ); // 'with_collector', 'without_collector', ''
    const [filterCity, setFilterCity] = useState<string>("");
    const [filterNeighborhood, setFilterNeighborhood] = useState<string>("");
    const [filterStore, setFilterStore] = useState<string>("");
    const [filterSituacao, setFilterSituacao] = useState<string>("");
    // Observacao da ultima visita realizada (ex.: "spc") — ver config/visitOutcomes.
    const [filterVisitOutcome, setFilterVisitOutcome] = useState<string>("");
    // Status da ultima visita (ex.: "nao_encontrado") — ver config/visitStatus.
    const [filterVisitStatus, setFilterVisitStatus] = useState<string>("");
    const [filterDateFrom, setFilterDateFrom] = useState<string>("");
    const [filterDateTo, setFilterDateTo] = useState<string>("");
    const [includeWithoutDate, setIncludeWithoutDate] = useState(false);
    // Filtros equivalentes aos da Cobranca (status de pagamento, lancamento, valor).
    // Status de pagamento e multi-select: lista de valores (pago/parcial/pendente).
    const [filterPaymentStatuses, setFilterPaymentStatuses] = useState<
      string[]
    >([]);
    const [filterLaunchFrom, setFilterLaunchFrom] = useState<string>("");
    const [filterLaunchTo, setFilterLaunchTo] = useState<string>("");
    const [filterMinAmount, setFilterMinAmount] = useState<number | undefined>(
      undefined,
    );
    const [filterMaxAmount, setFilterMaxAmount] = useState<number | undefined>(
      undefined,
    );
    // Os atalhos de atraso sao derivados do vencimento (filterDateFrom/filterDateTo),
    // fonte unica — nao ha estado proprio de "aging". Multi-select: varias faixas
    // contiguas viram um unico intervalo (ex.: 0-30 + 31-60 => 0-60).
    const filterAgings = dueToAgingSet(filterDateFrom, filterDateTo);
    // Filtro "Criado em": intervalo de datas sobre clientes.created_at (data em
    // que o cliente foi inserido pela primeira vez no banco).
    const [filterCreatedFrom, setFilterCreatedFrom] = useState<string>("");
    const [filterCreatedTo, setFilterCreatedTo] = useState<string>("");

    // "Cliente novo" = registro inserido pela primeira vez na tabela `clientes`
    // (mesma fonte de verdade do badge "Novo" das visitas agendadas:
    // clientes.created_at). Derivamos os mapas do `clientesRegistry` do
    // contexto, que ja varre a tabela uma unica vez para o app inteiro -- antes
    // esta tela fazia a propria varredura completa, em paralelo com a do
    // contexto. Independe de titulos/cobrador.
    const clientCreatedAtMap = useMemo(() => {
      const map = new Map<string, Date>();
      clientesRegistry.forEach((cliente, documento) => {
        if (cliente.created_at) map.set(documento, new Date(cliente.created_at));
      });
      return map;
    }, [clientesRegistry]);

    // Mapa documento -> data de nascimento (ISO). Usado na exportacao do Excel.
    const clientBirthDateMap = useMemo(() => {
      const map = new Map<string, string>();
      clientesRegistry.forEach((cliente, documento) => {
        if (cliente.data_nascimento) map.set(documento, cliente.data_nascimento);
      });
      return map;
    }, [clientesRegistry]);

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
    // Mobile: recolhe controles/pills/painel atrás de um chevron (desktop sempre visível).
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

    // Modal states
    const [showBulkModal, setShowBulkModal] = useState(false);

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Ordenação simples da Lista de Clientes: cada coluna ordena de forma
    // independente. Clicar numa coluna ordena por ela (asc); clicar de novo inverte.
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const handleSort = (field: SortField) => {
      if (sortField === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
      setCurrentPage(1);
    };
    const sortIndicator = (field: SortField) =>
      sortField === field ? (sortDirection === "asc" ? " ▲" : " ▼") : "";

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

    const collectors = users.filter((user) => isCollectorType(user.type));

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
          // O apelido nao precisa mais ser "cacado" entre as parcelas: ele vem
          // do cadastro (tabela `clientes`), igual em todas elas.
        }

        clientsMap.get(key)!.collections.push(collection);
      });

      return Array.from(clientsMap.values());
    }, [collections, users]);

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
      if (filterVisitOutcome) {
        chips.push({
          label: `Observação: ${visitOutcomeLabel(filterVisitOutcome)}`,
          onClear: () => setFilterVisitOutcome(""),
        });
      }
      if (filterVisitStatus) {
        chips.push({
          label: `Visita: ${visitStatusLabel(filterVisitStatus)}`,
          onClear: () => setFilterVisitStatus(""),
        });
      }
      if (filterAgings.length > 0) {
        // Vencimento controlado por atalhos de atraso: mostra as faixas, nao a data.
        // Remover uma faixa recalcula o intervalo a partir das restantes.
        filterAgings.forEach((bandVal) => {
          chips.push({
            label: `Atraso: ${agingLabel(bandVal)}`,
            onClear: () => {
              const next = filterAgings.filter((v) => v !== bandVal);
              const { dueFrom, dueTo } = agingRangeToDueRange(next);
              setFilterDateFrom(dueFrom);
              setFilterDateTo(dueTo);
            },
          });
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
      filterPaymentStatuses.forEach((ps) => {
        const psLabel =
          PAYMENT_STATUS_PILLS.find((p) => p.value === ps)?.label ?? ps;
        chips.push({
          label: `Pagamento: ${psLabel}`,
          onClear: () =>
            setFilterPaymentStatuses((prev) => prev.filter((s) => s !== ps)),
        });
      });
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
      filterVisitOutcome,
      filterVisitStatus,
      filterPaymentStatuses,
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

    // Conjunto atual de filtros no vocabulario do motor compartilhado
    // (src/filters/predicates). Fonte unica reutilizada pela filtragem da lista
    // e pelo faceting dos dropdowns. O "status de atribuicao" (com/sem cobrador)
    // mora em `assignment`, distinto do status de pagamento (clientStatus).
    const currentClientFilters = useMemo<ClientFilters>(
      () => ({
        search: searchTerm,
        collector: filterCollector,
        assignment: filterStatus as "" | "with_collector" | "without_collector",
        city: filterCity,
        neighborhood: filterNeighborhood,
        store: filterStore,
        situacao: filterSituacao,
        visitOutcome: filterVisitOutcome,
        visitStatus: filterVisitStatus,
        paymentStatus: filterPaymentStatuses,
        dueFrom: filterDateFrom,
        dueTo: filterDateTo,
        includeWithoutDue: includeWithoutDate,
        launchFrom: filterLaunchFrom,
        launchTo: filterLaunchTo,
        minAmount: filterMinAmount,
        maxAmount: filterMaxAmount,
        createdFrom: filterCreatedFrom,
        createdTo: filterCreatedTo,
      }),
      [
        searchTerm,
        filterCollector,
        filterStatus,
        filterCity,
        filterNeighborhood,
        filterStore,
        filterSituacao,
        filterVisitOutcome,
        filterVisitStatus,
        filterPaymentStatuses,
        filterDateFrom,
        filterDateTo,
        includeWithoutDate,
        filterLaunchFrom,
        filterLaunchTo,
        filterMinAmount,
        filterMaxAmount,
        filterCreatedFrom,
        filterCreatedTo,
      ],
    );

    // Dados auxiliares indexados por documento, derivados das visitas ja
    // carregadas no contexto (sem round-trip) e reutilizados pela filtragem e
    // pelo faceting.
    const filterLookups = useMemo(
      () => ({
        createdAt: clientCreatedAtMap,
        lastVisitOutcome: lastVisitOutcomeByClient(scheduledVisits),
        lastVisitStatus: lastVisitStatusByClient(scheduledVisits),
      }),
      [clientCreatedAtMap, scheduledVisits],
    );

    const filteredClients = useMemo(() => {
      return clientsData.filter((client) =>
        clientMatchesFilters(client, currentClientFilters, filterLookups),
      );
    }, [clientsData, currentClientFilters, filterLookups]);

    // Opcoes dos dropdowns dependentes (faceting): cada lista mostra apenas os
    // valores compativeis com os demais filtros ativos. Ver src/filters/facets.
    const facetOptions = useMemo(
      () =>
        computeClientFacets(clientsData, currentClientFilters, filterLookups),
      [clientsData, currentClientFilters, filterLookups],
    );

    // Assinatura dos filtros: muda SO quando o usuario altera um filtro/busca, e
    // nao quando os dados mudam (ex.: atribuicao otimista). Assim, ao mudar o
    // filtro volta p/ a 1a pagina e limpa a selecao; ao atribuir um cliente, a
    // pagina/scroll/selecao sao preservados (fluxo continuo).
    const filterSignature = JSON.stringify({
      searchTerm,
      filterCollector,
      filterStatus,
      filterCity,
      filterNeighborhood,
      filterStore,
      filterSituacao,
      filterVisitOutcome,
      filterVisitStatus,
      filterPaymentStatuses,
      filterDateFrom,
      filterDateTo,
      includeWithoutDate,
      filterLaunchFrom,
      filterLaunchTo,
      filterMinAmount,
      filterMaxAmount,
      filterCreatedFrom,
      filterCreatedTo,
    });

    useEffect(() => {
      setCurrentPage(1);
      setSelectedClients(new Set());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterSignature]);

    // Se a lista encolher (ex.: clientes saem da visao "Sem Cobrador" apos serem
    // atribuidos), mantem a pagina dentro do intervalo valido — sem voltar a 1a.
    useEffect(() => {
      const pages = Math.max(
        1,
        Math.ceil(filteredClients.length / itemsPerPage),
      );
      if (currentPage > pages) setCurrentPage(pages);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredClients.length, itemsPerPage]);

    // Ordenação por uma única coluna (clique no cabeçalho).
    const sortedClients = useMemo(() => {
      if (!sortField) return filteredClients;
      const dir = sortDirection === "asc" ? 1 : -1;
      const valueOf = (client: ClientWithCollections): string | number => {
        switch (sortField) {
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
          case "loja": {
            const clientStores = Array.from(
              new Set(
                client.collections.map((c) => c.nome_da_loja).filter(Boolean),
              ),
            );
            return (clientStores.join(", ") || "").toLowerCase();
          }
          case "pendente":
            return getClientPending(client.collections);
          default:
            return 0;
        }
      };
      return [...filteredClients].sort((a, b) => {
        const av = valueOf(a);
        const bv = valueOf(b);
        if (typeof av === "string" && typeof bv === "string") {
          return av.localeCompare(bv) * dir;
        }
        return ((av as number) - (bv as number)) * dir;
      });
    }, [filteredClients, sortField, sortDirection]);

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
    const endItem = Math.min(
      currentPage * itemsPerPage,
      filteredClients.length,
    );

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

    // Estado -> sigla (UF). Aceita valor ja abreviado (2 letras) ou nome completo.
    const UF_MAP: Record<string, string> = {
      ACRE: "AC",
      ALAGOAS: "AL",
      AMAPA: "AP",
      AMAZONAS: "AM",
      BAHIA: "BA",
      CEARA: "CE",
      "DISTRITO FEDERAL": "DF",
      "ESPIRITO SANTO": "ES",
      GOIAS: "GO",
      MARANHAO: "MA",
      "MATO GROSSO": "MT",
      "MATO GROSSO DO SUL": "MS",
      "MINAS GERAIS": "MG",
      PARA: "PA",
      PARAIBA: "PB",
      PARANA: "PR",
      PERNAMBUCO: "PE",
      PIAUI: "PI",
      "RIO DE JANEIRO": "RJ",
      "RIO GRANDE DO NORTE": "RN",
      "RIO GRANDE DO SUL": "RS",
      RONDONIA: "RO",
      RORAIMA: "RR",
      "SANTA CATARINA": "SC",
      "SAO PAULO": "SP",
      SERGIPE: "SE",
      TOCANTINS: "TO",
    };

    const toUF = (estado?: string | null): string => {
      if (!estado) return "";
      const raw = estado.trim();
      if (raw.length === 2) return raw.toUpperCase();
      const key = raw.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return UF_MAP[key] ?? raw;
    };

    // Todos os telefones distintos do cliente, direto do cadastro.
    // Antes isto varria TODAS as parcelas do cliente, porque cada uma podia
    // ter um telefone diferente; hoje os quatro campos vivem numa linha so
    // de `clientes` (migration 20260904000002). A deduplicacao continua:
    // telefone e celular podem repetir o mesmo numero.
    const getClientPhones = (documento: string): string[] => {
      const cadastro = clientesRegistry.get((documento || "").trim());
      if (!cadastro) return [];

      const seen = new Set<string>();
      const phones: string[] = [];
      for (const raw of [
        cadastro.telefone,
        cadastro.celular,
        cadastro.celular1,
        cadastro.celular2,
      ]) {
        const phone = (raw || "").trim();
        if (!phone) continue;
        const key = phone.replace(/\D/g, "") || phone.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        phones.push(phone);
      }
      return phones;
    };

    const handleExportToExcel = () => {
      // 1. Planilha 1: Clientes (Resumo)
      // Uma coluna por telefone: "Telefone 1", "Telefone 2", ...
      const clientPhoneLists = filteredClients.map((client) =>
        getClientPhones(client.documento),
      );
      const phoneColumnCount = clientPhoneLists.reduce(
        (max, phones) => Math.max(max, phones.length),
        1,
      );
      const phoneColumns = Array.from(
        { length: phoneColumnCount },
        (_, i) => `Telefone ${i + 1}`,
      );

      const clientRows = filteredClients.map((client, clientIndex) => {
        const totalValue = client.collections.reduce(
          (sum, c) => sum + c.valor_original,
          0,
        );
        const receivedValue = client.collections.reduce(
          (sum, c) => sum + c.valor_recebido,
          0,
        );
        const pendingValue = getClientPending(client.collections);
        const situacao = getSituacaoIndicator(client.collections);
        const firstCol = client.collections[0];
        const clientStores = Array.from(
          new Set(
            client.collections.map((c) => c.nome_da_loja).filter(Boolean),
          ),
        );

        const birthDate = clientBirthDateMap.get(client.documento);

        return {
          Cliente: client.cliente ? client.cliente.toUpperCase() : "",
          Documento: client.documento || "",
          "Data de Nascimento": birthDate ? formatDate(birthDate) : "",
          Apelido: client.apelido ? client.apelido.toUpperCase() : "",
          ...Object.fromEntries(
            phoneColumns.map((label, i) => [
              label,
              clientPhoneLists[clientIndex][i] || "",
            ]),
          ),
          CEP: firstCol?.cep || "",
          Cidade: client.cidade || "",
          Estado: toUF(firstCol?.estado),
          Bairro: client.bairro || "",
          Cobrador: client.collectorName || "Sem Cobrador",
          Loja: clientStores.join(", ") || "—",
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
        { wch: 18 }, // Data de Nascimento
        { wch: 20 }, // Apelido
        ...phoneColumns.map(() => ({ wch: 16 })), // Telefone 1..N
        { wch: 12 }, // CEP
        { wch: 18 }, // Cidade
        { wch: 8 }, // Estado
        { wch: 18 }, // Bairro
        { wch: 25 }, // Cobrador
        { wch: 18 }, // Loja
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
            Cliente: client.cliente ? client.cliente.toUpperCase() : "",
            Documento: client.documento || "",
            "ID Parcela": col.id_parcela,
            Loja: col.nome_da_loja || "",
            "Venda Nº": resolveSaleKey(col) || "-",
            "Nº Título": col.numero_titulo || "-",
            Parcela: col.parcela || "-",
            "Data Lançamento": col.data_lancamento
              ? formatDate(col.data_lancamento)
              : "-",
            "Data Vencimento": col.data_vencimento
              ? formatDate(col.data_vencimento)
              : "-",
            "Data Recebimento": col.data_de_recebimento
              ? formatDate(col.data_de_recebimento)
              : "-",
            "Valor Original (R$)": col.valor_original,
            "Valor Recebido (R$)": col.valor_recebido,
            "Valor Pendente (R$)": pending,
            "Dias em Atraso": col.dias_em_atraso || 0,
            "Situação da Parcela": col.situacao || "-",
            Cobrador: client.collectorName || "Sem Cobrador",
            Observação: col.obs || "",
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

      const dateStr = todayLocalStr();
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

      const assignmentRate =
        totalClients > 0 ? (assignedClients / totalClients) * 100 : 0;

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
      const assignedFiltered = filteredClients.filter(
        (c) => c.collectorId,
      ).length;
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
    }, [
      hasActiveFilters,
      filteredStats,
      overviewStats,
      filteredClients,
      clientsData,
    ]);

    // Rótulos explícitos dos períodos comparados no card "Novos Clientes".
    const now = new Date();
    const currentMonthLabel = monthLabel(now);

    // Clique nos cards aplica/remove (toggle) o filtro correspondente.
    const currentMonthStartStr = todayLocalStr(new Date(now.getFullYear(), now.getMonth(), 1));
    const isNewClientsFilterActive =
      filterCreatedFrom === currentMonthStartStr && !filterCreatedTo;
    const isPendingFilterActive = filterStatus === "without_collector";
    const isAllActive =
      !filterStatus &&
      !filterCreatedFrom &&
      !filterCreatedTo &&
      !filterDateFrom;

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
      setFilterVisitOutcome("");
      setFilterVisitStatus("");
      setFilterPaymentStatuses([]);
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
      city: filterCity,
      neighborhood: filterNeighborhood,
      store: filterStore,
      situacao: filterSituacao,
      visitOutcome: filterVisitOutcome,
      visitStatus: filterVisitStatus,
      dueFrom: filterDateFrom,
      dueTo: filterDateTo,
      launchFrom: filterLaunchFrom,
      launchTo: filterLaunchTo,
      minAmount: filterMinAmount,
      maxAmount: filterMaxAmount,
      // aging fica nas pills (multi-select); o painel nao renderiza esse campo.
      createdFrom: filterCreatedFrom,
      createdTo: filterCreatedTo,
    };

    const handleFilterPanelChange = (patch: Partial<FilterValues>) => {
      if ("assignment" in patch) setFilterStatus(patch.assignment ?? "");
      if ("city" in patch) {
        setFilterCity(patch.city ?? "");
        setFilterNeighborhood(""); // dependencia: trocar cidade reseta o bairro
      }
      if ("neighborhood" in patch)
        setFilterNeighborhood(patch.neighborhood ?? "");
      if ("store" in patch) setFilterStore(patch.store ?? "");
      if ("situacao" in patch) setFilterSituacao(patch.situacao ?? "");
      if ("visitOutcome" in patch)
        setFilterVisitOutcome(patch.visitOutcome ?? "");
      if ("visitStatus" in patch) setFilterVisitStatus(patch.visitStatus ?? "");
      if ("dueFrom" in patch) setFilterDateFrom(patch.dueFrom ?? "");
      if ("dueTo" in patch) setFilterDateTo(patch.dueTo ?? "");
      if ("launchFrom" in patch) setFilterLaunchFrom(patch.launchFrom ?? "");
      if ("launchTo" in patch) setFilterLaunchTo(patch.launchTo ?? "");
      if ("minAmount" in patch) setFilterMinAmount(patch.minAmount);
      if ("maxAmount" in patch) setFilterMaxAmount(patch.maxAmount);
      // Atraso nao vem pelo painel (mora nas pills -> handlePillsChange).
      if ("createdFrom" in patch) setFilterCreatedFrom(patch.createdFrom ?? "");
      if ("createdTo" in patch) setFilterCreatedTo(patch.createdTo ?? "");
      setCurrentPage(1);
    };

    // Atalhos (pills): status de pagamento e atraso sao multi-select. As faixas de
    // atraso, por serem contiguas, viram um unico intervalo de vencimento (a
    // envoltoria das selecionadas — ex.: 0-30 + 31-60 => vencimento hoje-60..hoje).
    const handlePillsChange = (patch: PillPatch) => {
      if ("paymentStatus" in patch) {
        const v = patch.paymentStatus;
        setFilterPaymentStatuses(Array.isArray(v) ? v : v ? [v] : []);
      }
      if ("aging" in patch) {
        const v = patch.aging;
        const bands = Array.isArray(v) ? v : v ? [v] : [];
        const { dueFrom, dueTo } = agingRangeToDueRange(bands);
        setFilterDateFrom(dueFrom);
        setFilterDateTo(dueTo);
      }
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

        {/* Grid de Cards Executivos — faixa horizontal deslizável no mobile, grid no desktop */}
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory -mx-1 px-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            className={`shrink-0 snap-start min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer ${
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
                <span className="text-[8px] sm:text-[9px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md tracking-wide border border-amber-100 dark:border-amber-900/30 shrink-0">
                  {mainStats.unassigned} Pend.
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">
                Total Clientes
              </p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
                {mainStats.total}
              </p>
              <p className="text-[10px] sm:text-[11px] font-medium text-gray-400 dark:text-dark-text-secondary mt-0.5 truncate">
                <span className="text-gray-600 dark:text-dark-text font-semibold">
                  {mainStats.totalSales}
                </span>{" "}
                vendas
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
            className={`shrink-0 snap-start min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer ${
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
                <span
                  className={`text-[8px] sm:text-[9px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide border shrink-0 ${
                    mainStats.newClients >= mainStats.prevMonth
                      ? "text-green-700 bg-green-50 border-green-150 dark:text-green-400 dark:bg-green-900/20 dark:border-green-900/30"
                      : "text-amber-700 bg-amber-50 border-amber-150 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/30"
                  }`}
                >
                  {mainStats.newClients >= mainStats.prevMonth ? "▲ +" : "▼ "}
                  {(
                    (mainStats.newClients / mainStats.prevMonth - 1) *
                    100
                  ).toFixed(0)}
                  %
                </span>
              ) : (
                <span className="text-[8px] sm:text-[9px] font-semibold text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20 px-1.5 py-0.5 rounded-md tracking-wide border border-green-100 dark:border-green-900/30 shrink-0">
                  {currentMonthLabel}
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">
                Novos Clientes
              </p>
              <div className="flex items-baseline gap-1 mt-0.5 flex-wrap">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
                  {mainStats.newClients}
                </p>
                <p className="text-[8px] sm:text-[9px] font-semibold text-gray-400 tracking-tight shrink-0">
                  {currentMonthLabel}
                </p>
              </div>
              <p className="text-[9px] sm:text-[10px] font-medium text-gray-400 dark:text-dark-text-secondary mt-0.5 tracking-tight truncate">
                Ant:{" "}
                <span className="text-gray-600 dark:text-dark-text font-semibold">
                  {mainStats.prevMonth}
                </span>
              </p>
            </div>
          </div>

          {/* Card: Valor em Aberto */}
          <div className="shrink-0 snap-start min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                <HandCoins className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">
                Valor em Aberto
              </p>
              <p className="text-lg sm:text-2xl font-bold text-indigo-600 dark:text-indigo-450 tracking-tight truncate">
                {formatCurrency(mainStats.pendingValue)}
              </p>
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
            className={`shrink-0 snap-start min-w-[44%] sm:min-w-0 bg-white dark:bg-dark-bg-secondary p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer ${
              isPendingFilterActive
                ? "border-amber-500 ring-2 ring-amber-500/10"
                : "border-gray-100 dark:border-dark-border"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                <Award className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <span
                className={`text-[8px] sm:text-[9px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide border shrink-0 ${
                  mainStats.assignmentRate > 90
                    ? "text-green-700 bg-green-50 border-green-100 dark:text-green-400 dark:bg-green-900/20 dark:border-green-900/30"
                    : "text-amber-700 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/30"
                }`}
              >
                {mainStats.assignmentRate > 90 ? "OK" : "Ajustar"}
              </span>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide mb-1">
                Taxa Atribuição
              </p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight">
                {mainStats.assignmentRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Filtros Unificada */}
        <div className="bg-white dark:bg-dark-bg-secondary p-3 rounded-2xl border border-gray-150/80 dark:border-dark-border shadow-sm space-y-3">
          <div className="flex flex-row flex-wrap items-center gap-3">
            {/* Busca */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-405 pointer-events-none" />
              <input
                type="text"
                id="client-search"
                name="clientSearch"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, apelido ou documento..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-gray-450"
              />
            </div>

            {/* Mobile: chevron que recolhe/expande os demais filtros */}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              aria-label={
                mobileFiltersOpen ? "Recolher filtros" : "Expandir filtros"
              }
              className={`md:hidden px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 shrink-0 transition-all ${
                mobileFiltersOpen || hasActiveFilters
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border"
              }`}
            >
              {hasActiveFilters && (
                <span className="text-xs font-semibold leading-none">
                  {activeFilterChips.length}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}
              />
            </button>

            <div
              className={`${mobileFiltersOpen ? "flex" : "hidden"} md:flex flex-col sm:flex-row items-stretch gap-2.5 w-full md:w-auto md:shrink-0`}
            >
              {/* Dropdown Visão */}
              <div className="relative flex-1 sm:flex-none">
                <select
                  id="vision-filter"
                  name="visionFilter"
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
                  id="collector-filter"
                  name="collectorFilter"
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
                <span>
                  Filtros {hasActiveFilters && `(${activeFilterChips.length})`}
                </span>
              </button>
            </div>
          </div>

          {/* Demais filtros: no mobile ocultos até expandir; no desktop sempre visíveis */}
          <div
            className={`${mobileFiltersOpen ? "block" : "hidden"} md:block space-y-3`}
          >
            {/* Atalhos rápidos: status de pagamento + faixa de atraso */}
            <FilterPills
              paymentStatus={filterPaymentStatuses}
              aging={filterAgings}
              onChange={handlePillsChange}
              showPaymentStatus
              excludePaymentStatus={["cancelado"]}
              showAging
              multiPaymentStatus
              multiAging
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
                  cities: facetOptions.cities,
                  neighborhoods: facetOptions.neighborhoods,
                  stores: facetOptions.stores,
                  situacoes: facetOptions.situacoes,
                }}
              />
            )}
          </div>
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
                    <th className="px-4 py-4 w-10">
                      <div className="flex justify-center">
                        <SelectionIndicator
                          checked={
                            paginatedClients.length > 0 &&
                            paginatedClients.every((c) =>
                              selectedClients.has(c.uniqueKey),
                            )
                          }
                          partial={
                            paginatedClients.some((c) =>
                              selectedClients.has(c.uniqueKey),
                            ) &&
                            !paginatedClients.every((c) =>
                              selectedClients.has(c.uniqueKey),
                            )
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAll();
                          }}
                        />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("cliente")}
                      className="px-3 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors w-[30%] min-w-[240px]"
                    >
                      Cliente / Documento{sortIndicator("cliente")}
                    </th>
                    <th className="px-2 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide text-center select-none w-[8%] min-w-[96px]">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          onClick={() => handleSort("vendas")}
                          className="cursor-pointer hover:text-gray-700 dark:hover:text-dark-text transition-colors"
                        >
                          Vnd{sortIndicator("vendas")}
                        </span>
                        <span className="text-gray-300">/</span>
                        <span
                          onClick={() => handleSort("parcelas")}
                          className="cursor-pointer hover:text-gray-700 dark:hover:text-dark-text transition-colors"
                        >
                          Parc{sortIndicator("parcelas")}
                        </span>
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("loja")}
                      className="px-3 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide text-left cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors w-[15%] min-w-[150px]"
                    >
                      Loja{sortIndicator("loja")}
                    </th>
                    <th
                      onClick={() => handleSort("cobrador")}
                      className="px-3 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors w-[18%] min-w-[160px]"
                    >
                      Status / Cobrador{sortIndicator("cobrador")}
                    </th>
                    <th
                      onClick={() => handleSort("cidade")}
                      className="px-3 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors w-[14%] min-w-[120px]"
                    >
                      Localização{sortIndicator("cidade")}
                    </th>
                    <th
                      onClick={() => handleSort("pendente")}
                      className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary tracking-wide text-right cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text transition-colors w-[15%] min-w-[130px]"
                    >
                      Valores{sortIndicator("pendente")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {paginatedClients.map((client) => {
                    const totalValue = client.collections.reduce(
                      (sum, c) => sum + c.valor_original,
                      0,
                    );
                    const receivedValue = client.collections.reduce(
                      (sum, c) => sum + (c.valor_recebido || 0),
                      0,
                    );
                    const pendingValue = getClientPending(client.collections);
                    const situacao = getSituacaoIndicator(client.collections);
                    const clientStores = Array.from(
                      new Set(
                        client.collections
                          .map((c) => c.nome_da_loja)
                          .filter((s): s is string => Boolean(s)),
                      ),
                    );

                    return (
                      <tr
                        key={client.uniqueKey}
                        className={`hover:bg-gray-50/50 dark:hover:bg-dark-bg transition-colors cursor-pointer group ${
                          selectedClients.has(client.uniqueKey)
                            ? "bg-blue-50/30 dark:bg-blue-900/10"
                            : ""
                        }`}
                        onClick={() => handleSelectClient(client.uniqueKey)}
                      >
                        <td
                          className={`px-4 py-3.5 transition-all duration-200 ${
                            selectedClients.has(client.uniqueKey)
                              ? "border-l-[3px] border-l-blue-600 dark:border-l-blue-500 pl-[13px]"
                              : "border-l-[3px] border-l-transparent pl-[13px]"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-center">
                            <SelectionIndicator
                              checked={selectedClients.has(client.uniqueKey)}
                              onClick={() => handleSelectClient(client.uniqueKey)}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3.5 w-[30%] min-w-[240px] relative">
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenClientModal(
                                  client.documento || "",
                                  client.cliente || "",
                                );
                              }}
                              title={client.cliente || ""}
                              className="text-left text-sm font-semibold text-gray-900 dark:text-dark-text hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors block w-fit max-w-full truncate"
                            >
                              {client.cliente && client.cliente.length > 40
                                ? `${client.cliente.slice(0, 40)}...`
                                : client.cliente}
                            </button>
                            <span className="text-[10px] font-medium text-gray-450 tracking-tight mt-0.5">
                              {client.documento}
                            </span>
                            {client.apelido && (
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                                "{client.apelido}"
                              </span>
                            )}
                          </div>

                          {/* Hover Actions */}
                          <div
                            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-gradient-to-l from-white via-white pl-4 dark:from-dark-bg-secondary dark:via-dark-bg-secondary opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenClientModal(
                                  client.documento || "",
                                  client.cliente || "",
                                )
                              }
                              title="Visualizar Detalhes"
                              className="p-1 rounded bg-gray-50 hover:bg-blue-50 text-gray-400 hover:text-blue-600 dark:bg-dark-bg dark:hover:bg-blue-900/30 dark:text-dark-text-secondary dark:hover:text-blue-400 border border-gray-200 dark:border-dark-border transition-colors"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                            {(() => {
                              // Primeiro telefone do cadastro (getClientPhones
                              // ja resolve a ordem e a deduplicacao).
                              const phoneNumber =
                                getClientPhones(client.documento)[0] ?? "";
                              if (!phoneNumber) return null;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigator.clipboard.writeText(phoneNumber)
                                    }
                                    title={`Copiar Telefone: ${phoneNumber}`}
                                    className="p-1 rounded bg-gray-50 hover:bg-blue-50 text-gray-400 hover:text-blue-600 dark:bg-dark-bg dark:hover:bg-blue-900/30 dark:text-dark-text-secondary dark:hover:text-blue-400 border border-gray-200 dark:border-dark-border transition-colors"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  <a
                                    href={`https://wa.me/55${phoneNumber.replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Conversar no WhatsApp"
                                    className="p-1 rounded bg-gray-50 hover:bg-green-50 text-gray-400 hover:text-green-600 dark:bg-dark-bg dark:hover:bg-green-900/30 dark:text-dark-text-secondary dark:hover:text-green-400 border border-gray-200 dark:border-dark-border transition-colors"
                                  >
                                    <Phone className="h-3 w-3" />
                                  </a>
                                </>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-2 py-3.5 text-center w-[8%] min-w-[96px]">
                          <div className="flex flex-col items-center gap-1">
                            <span
                              title="Vendas"
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30"
                            >
                              {countVendas(client.collections)} V
                            </span>
                            <span
                              title="Parcelas"
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border border-gray-150 dark:border-dark-border"
                            >
                              {client.collections.length} P
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 w-[15%] min-w-[150px]">
                          <div className="flex flex-wrap gap-1 w-full">
                            {clientStores.map((store, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100/30 truncate max-w-[140px]"
                                title={store}
                              >
                                {store}
                              </span>
                            ))}
                            {clientStores.length === 0 && (
                              <span className="text-gray-450 dark:text-dark-text-secondary text-[10px]">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 w-[18%] min-w-[160px]">
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
                              <div
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold tracking-tight w-fit ${situacao.className} border border-current/25 opacity-90`}
                              >
                                <situacao.icon className="h-3 w-3" />
                                {situacao.label}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 w-[14%] min-w-[120px]">
                          <div className="flex items-start text-[11px] font-medium text-gray-500 dark:text-dark-text-secondary whitespace-normal break-words">
                            <MapPin className="h-3.5 w-3.5 mr-1 text-gray-400 shrink-0 mt-0.5" />
                            <span>
                              {client.bairro && client.cidade
                                ? `${client.bairro}, ${client.cidade}`
                                : client.cidade || client.bairro || "-"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right w-[15%] min-w-[130px]">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`text-xs font-bold tracking-tight ${
                                pendingValue >= 2500
                                  ? "text-red-700 dark:text-red-455 flex items-center justify-end gap-1"
                                  : "text-red-600 dark:text-red-500"
                              }`}
                            >
                              {pendingValue >= 2500 && (
                                <span
                                  className="inline-flex shrink-0"
                                  title="Valor Pendente Crítico (>= R$ 2.500)"
                                >
                                  <AlertCircle className="h-3.5 w-3.5 text-red-550" />
                                </span>
                              )}
                              {formatCurrency(pendingValue)}
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                              {formatCurrency(receivedValue)}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                              Total: {formatCurrency(totalValue)}
                            </span>
                            {totalValue > 0 && (
                              <div
                                className="w-24 bg-gray-100 dark:bg-dark-bg/40 h-1 rounded-full overflow-hidden mt-1 ml-auto border border-gray-200/10"
                                title={`Recebido: ${(((totalValue - pendingValue) / totalValue) * 100).toFixed(0)}%`}
                              >
                                {(() => {
                                  const paidPercentage =
                                    ((totalValue - pendingValue) / totalValue) *
                                    100;
                                  return (
                                    <div
                                      className="bg-green-500 h-full rounded-full transition-all duration-300"
                                      style={{
                                        width: `${Math.min(100, Math.max(0, paidPercentage))}%`,
                                      }}
                                      title={`${paidPercentage.toFixed(0)}% recebido`}
                                    />
                                  );
                                })()}
                              </div>
                            )}
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
              const totalValue = client.collections.reduce(
                (sum, c) => sum + c.valor_original,
                0,
              );
              const receivedValue = client.collections.reduce(
                (sum, c) => sum + (c.valor_recebido || 0),
                0,
              );
              const pendingValue = getClientPending(client.collections);
              const situacao = getSituacaoIndicator(client.collections);
              const isSelected = selectedClients.has(client.uniqueKey);
              const clientStores = Array.from(
                new Set(
                  client.collections.map((c) => c.nome_da_loja).filter(Boolean),
                ),
              );
              const storeDisplay = clientStores.join(", ") || "—";

              return (
                <div
                  key={client.uniqueKey}
                  className={`bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border transition-all duration-200 cursor-pointer relative border-l-[4px] ${
                    isSelected
                      ? "border-y-blue-500 border-r-blue-500 border-l-blue-600 dark:border-y-blue-500 dark:border-r-blue-500 dark:border-l-blue-500 bg-blue-50/10 dark:bg-blue-900/5 shadow-md shadow-blue-500/5"
                      : isWithoutCollector
                        ? "border-y-amber-200 border-r-amber-200 border-l-amber-400 dark:border-y-amber-900/20 dark:border-r-amber-900/20 dark:border-l-amber-600 bg-amber-50/5"
                        : "border-gray-100 dark:border-dark-border border-l-transparent"
                  }`}
                  onClick={() => handleSelectClient(client.uniqueKey)}
                >
                  <div className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center h-5" onClick={(e) => e.stopPropagation()}>
                        <SelectionIndicator
                          checked={isSelected}
                          onClick={() => handleSelectClient(client.uniqueKey)}
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenClientModal(
                                  client.documento || "",
                                  client.cliente || "",
                                );
                              }}
                              title={client.cliente || ""}
                              className="text-left text-[13px] font-semibold text-gray-900 dark:text-dark-text hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors block w-fit max-w-full truncate"
                            >
                              {client.cliente && client.cliente.length > 40
                                ? `${client.cliente.slice(0, 40)}...`
                                : client.cliente}
                            </button>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-[9px] font-medium text-gray-455 leading-none">
                                {client.documento}
                              </p>
                              {client.apelido && (
                                <span className="text-[9px] text-blue-600 dark:text-blue-400 font-semibold leading-none truncate max-w-[100px]">
                                  "{client.apelido}"
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 tracking-tight leading-tight">
                              {formatCurrency(pendingValue)}
                            </p>
                            {receivedValue > 0 && (
                              <p className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-tight leading-tight mt-0.5">
                                {formatCurrency(receivedValue)}
                              </p>
                            )}
                            <p className="text-[8px] font-semibold text-slate-500 dark:text-slate-400 tracking-tight leading-none mt-0.5">
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
                            <div
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-semibold border border-current/25 ${situacao.className} opacity-90`}
                            >
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
                            <span className="truncate max-w-[150px]">
                              {client.bairro ? `${client.bairro}, ` : ""}
                              {client.cidade || "-"}
                            </span>
                            {storeDisplay && storeDisplay !== "—" && (
                              <>
                                <span className="mx-1.5 text-gray-300">•</span>
                                <span className="bg-blue-50 dark:bg-blue-900/20 px-1 py-0.5 rounded text-[8px] font-semibold text-blue-700 dark:text-blue-400 border border-blue-100/30 truncate max-w-[100px]">
                                  {storeDisplay}
                                </span>
                              </>
                            )}
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
                <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
                  <span className="text-[9px] text-gray-400 dark:text-dark-text-secondary font-semibold">
                    Exibir:
                  </span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="text-[9px] font-semibold bg-gray-50 dark:bg-dark-bg border border-gray-250 dark:border-dark-border rounded px-1.5 py-0.5 text-gray-700 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
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
                  {Array.from(
                    { length: Math.min(maxButtons, totalPages) },
                    (_, i) => {
                      let pageNum;
                      if (totalPages <= maxButtons) pageNum = i + 1;
                      else if (currentPage <= Math.ceil(maxButtons / 2))
                        pageNum = i + 1;
                      else if (
                        currentPage >=
                        totalPages - Math.floor(maxButtons / 2)
                      )
                        pageNum = totalPages - maxButtons + 1 + i;
                      else
                        pageNum = currentPage - Math.floor(maxButtons / 2) + i;

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
                    },
                  )}
                </div>

                <button
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
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
        <div
          className={`fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 transform w-[95%] sm:w-auto ${
            selectedClients.size > 0 
              ? "translate-y-0 scale-100 opacity-100" 
              : "translate-y-12 scale-95 opacity-0 pointer-events-none"
          }`}
        >
          <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white p-2.5 sm:px-5 sm:py-3.5 rounded-2xl shadow-2xl flex items-center justify-between sm:justify-start gap-3 sm:gap-6 border border-white/10 dark:border-white/5 overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3 pr-3 sm:pr-6 border-r border-white/10 dark:border-white/5">
              <div className="bg-blue-600 text-white w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shadow-md shadow-blue-500/25">
                {selectedClients.size}
              </div>
              <span className="text-[11px] sm:text-sm font-semibold text-white tracking-wide whitespace-nowrap hidden min-[400px]:inline">
                {selectedClients.size === 1 ? "cliente selecionado" : "clientes selecionados"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setSelectedClients(new Set())}
                className="px-3 py-2 text-[11px] sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors tracking-wide underline underline-offset-4 decoration-white/10 hover:decoration-white/30"
              >
                Limpar
              </button>
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0 fill-yellow-400" />
                <span className="text-[11px] sm:text-sm font-semibold tracking-wide whitespace-nowrap">
                  Atribuir Cobrador
                </span>
              </button>
            </div>
          </div>
        </div>

        <BulkAssignmentModal
          isOpen={showBulkModal}
          onClose={() => {
            setShowBulkModal(false);
            setSelectedClients(new Set());
          }}
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

        {isClientModalOpen &&
          selectedClientGroup &&
          createPortal(
            <ClientDetailModal
              clientGroup={selectedClientGroup}
              userType="manager"
              onClose={() => {
                setIsClientModalOpen(false);
                setSelectedClientGroup(null);
              }}
            />,
            document.body,
          )}
      </div>
    );
  },
);
