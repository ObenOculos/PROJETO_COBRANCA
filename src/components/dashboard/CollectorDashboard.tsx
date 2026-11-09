import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { USER_TYPE_LABELS, isWalletCollectorType } from "../../config/profiles";
import {
  Target,
  Clock,
  CheckCircle,
  Users,
  Calendar,
  Trophy,
  Diamond,
  Medal,
  Award,
  Flame,
  Sun,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  Zap,
  Rocket,
  ThumbsUp,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Settings,
  Handshake,
  Copy,
  Check,
  Phone,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  CalendarClock,
  CalendarX,
} from "lucide-react";
import FilterBar from "../common/FilterBar";
import { CollectionTable, CollectionTableRef } from "./CollectionTable";
import RouteMap from "./RouteMap";
import VisitScheduler from "./VisitScheduler";
import RadialApprovalChart from "./RadialApprovalChart";
import TabTransition from "../common/TabTransition";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { formatCurrency, calculateOverdueDays } from "../../utils/formatters";
import { FilterOptions, ClientGroup, User, ScheduledVisit } from "../../types";
import { Notification } from "../../contexts/NotificationContext";
import { resolveSaleKey } from "../../filters/sales";
import {
  hasOpenBalance,
  hasInstallmentBalance,
  clientMaxOverdueDays,
  clientOverdueAmount,
  clientReferenceStore,
} from "../../filters/clientStatus";
import { abrirWhatsApp } from "../../utils/whatsapp";
import {
  priorityBucket,
  PRIORITY_COLOR_CLASSES,
  URGENTE_SAIDA_CARTEIRA_DIAS,
  diasAteSairDasRegras,
} from "../../filters/priority";
import {
  SEM_CONTATO_DIAS,
  countsTowardVisitsGoal,
} from "../../config/collectionAttempts";

import LogContactModal from "./LogContactModal";
import CancelContactModal from "./CancelContactModal";
import ContactScheduler from "./ContactScheduler";
import ClientDetailModal from "./ClientDetailModal";
import AcordoModal from "./AcordoModal";
import AcordoDetailModal from "./AcordoDetailModal";

// Lucide so tem icones genericos (sem logos de marca); o WhatsApp precisa
// do glifo reconhecivel pro botao de contato, entao fica inline em vez de
// puxar um pacote so por isso.
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38a9.88 9.88 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.47 17.5 2 12.04 2zm5.84 14.19c-.25.7-1.45 1.33-2 1.42-.52.08-1.17.11-1.89-.12-.44-.14-1-.32-1.72-.63-3.03-1.31-5-4.37-5.15-4.57-.15-.2-1.23-1.63-1.23-3.11 0-1.48.78-2.21 1.06-2.51.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.86 2.08.93 2.23.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.31.4-.45.54-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.76-.88.96-1.18.2-.3.4-.25.68-.15.28.1 1.77.84 2.07.99.3.15.5.22.57.35.08.13.08.73-.17 1.43z" />
  </svg>
);
import { todayLocalStr, isVisitOverdue } from "../../config/visitStatus";

const toDate = (dateInput: string | Date | null | undefined): Date | null => {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return new Date(dateInput);
  if (typeof dateInput === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return new Date(dateInput + "T00:00:00");
    }
  }
  return new Date(dateInput);
};

const INITIAL_CARD_IDS = [
  "clients",
  "sales",
  "visits",
  "schedulesByCity",
  "clientsByCity",
];

// Busca em lotes porque .in() tem limite pratico de tamanho de URL/query.
const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// As 7 categorias da agenda priorizada, nesta ordem de precedência (ver
// useMemo em InternalCollectorWallet) — cada cliente cai numa só.
// "urgente" (Clientes urgentes — perto de sair da faixa de atraso do
// cobrador, ver collector_overdue_ranges) é a única exceção: fica de fora
// dessa exclusividade de proposito, porque responde uma pergunta diferente
// ("vou perder este cliente da carteira?") das outras 7, que respondem "o
// que eu faco agora?" — um cliente pode aparecer ali E em outra categoria.
type AgendaSubTab =
  | "agendados"
  | "promessas"
  | "quebrado"
  | "urgente"
  | "critico"
  | "alerta"
  | "medio"
  | "semContato"
  | "tratamento";

interface AgendaCategoriaConfig {
  key: AgendaSubTab;
  label: string;
  icon: React.ReactNode;
  /** Classe do pill quando esta e a aba ativa. */
  activeClass: string;
  accentBorderClass: string;
  groups: ClientGroup[];
  emptyMessage: string;
}

// Colunas ordenaveis, compartilhadas pela tabela da Carteira completa e
// pelas listas da Agenda (mesmo cabecalho nos dois, ver WalletTableHead).
type WalletSortKey =
  | "cliente"
  | "ultimaInteracao"
  | "retorno"
  | "atraso"
  | "valorPendente";

interface SortableThProps {
  label: string;
  sortKeyName: WalletSortKey;
  align?: "left" | "center" | "right";
  widthClass?: string;
  activeKey: WalletSortKey | null;
  dir: "asc" | "desc";
  onSort: (key: WalletSortKey) => void;
}

const SortableTh: React.FC<SortableThProps> = ({
  label,
  sortKeyName,
  align = "left",
  widthClass,
  activeKey,
  dir,
  onSort,
}) => (
  <th
    className={`px-6 py-4 cursor-pointer select-none hover:text-indigo-600 transition-colors ${
      align === "center" ? "text-center" : align === "right" ? "text-right" : ""
    } ${widthClass ?? ""}`}
    onClick={() => onSort(sortKeyName)}
  >
    <span
      className={`inline-flex items-center gap-1 ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      {label}
      {activeKey === sortKeyName &&
        (dir === "asc" ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        ))}
    </span>
  </th>
);

interface WalletTableHeadProps {
  sortKey: WalletSortKey | null;
  sortDir: "asc" | "desc";
  onSort: (key: WalletSortKey) => void;
}

// Cabecalho clicavel reusado pela tabela de "Carteira completa" e pela lista
// de cada categoria da Agenda -- mesmas colunas nos dois lugares, um so JSX.
const WalletTableHead: React.FC<WalletTableHeadProps> = ({
  sortKey,
  sortDir,
  onSort,
}) => (
  <thead>
    <tr className="bg-gray-50/50 dark:bg-dark-bg-secondary text-[11px] font-bold text-gray-400 tracking-wide">
      <SortableTh
        label="Cliente"
        sortKeyName="cliente"
        widthClass="w-96"
        activeKey={sortKey}
        dir={sortDir}
        onSort={onSort}
      />
      <SortableTh
        label="Última Interação"
        sortKeyName="ultimaInteracao"
        activeKey={sortKey}
        dir={sortDir}
        onSort={onSort}
      />
      <SortableTh
        label="Retorno"
        sortKeyName="retorno"
        activeKey={sortKey}
        dir={sortDir}
        onSort={onSort}
      />
      <SortableTh
        label="Atraso"
        sortKeyName="atraso"
        align="center"
        activeKey={sortKey}
        dir={sortDir}
        onSort={onSort}
      />
      <SortableTh
        label="Valor Pendente"
        sortKeyName="valorPendente"
        align="right"
        activeKey={sortKey}
        dir={sortDir}
        onSort={onSort}
      />
      <th className="px-6 py-4 text-right">Ações</th>
    </tr>
  </thead>
);

interface InternalCollectorWalletProps {
  clientGroups: any[];
  user: any;
  monthlyGoals: any[];
  myCollections: any[];
  onOpenLog: (client: any) => void;
  onOpenDetail: (client: any) => void;
  onOpenAcordo: (client: ClientGroup) => void;
  onCancelContact: (visit: ScheduledVisit) => void;
}

const InternalCollectorWallet: React.FC<InternalCollectorWalletProps> = ({
  clientGroups,
  user,
  monthlyGoals,
  myCollections,
  onOpenLog,
  onOpenDetail,
  onOpenAcordo,
  onCancelContact,
}) => {
  const {
    getAcordoAtivoDoCliente,
    getAcordoQuebradoDoCliente,
    getFilteredCollections,
    salePayments,
    collectorOverdueRanges,
    acordoAtivoOverdueMap,
    acordos,
    scheduledVisits,
  } = useCollection();

  // Contato (ligacao/whatsapp) agendado em aberto, por cliente -- equivalente
  // ao agendamento do cobrador externo, mas so os canais de carteira (visita
  // presencial e do VisitScheduler, nao aparece aqui). No maximo 1 por
  // cliente (uniq_active_visit_per_client ja garante isso no banco).
  const scheduledContactByDocument = useMemo(() => {
    const map = new Map<string, ScheduledVisit>();
    scheduledVisits.forEach((v) => {
      if (
        v.collectorId === user?.id &&
        v.channel &&
        v.channel !== "presencial" &&
        v.status === "agendada"
      ) {
        map.set(v.clientDocument, v);
      }
    });
    return map;
  }, [scheduledVisits, user?.id]);
  const [walletTab, setWalletTab] = useState<"agenda" | "carteira">("agenda");
  const [agendaSubTab, setAgendaSubTab] = useState<AgendaSubTab>("promessas");
  // Modo foco: oculta os cards de desempenho (Recuperação do Mês, Total de
  // Clientes etc.) pra sobrar só a lista de trabalho. Preferencia pessoal de
  // tela, guardada no navegador -- nao sincroniza entre dispositivos.
  const [focusMode, setFocusMode] = useState(() => {
    try {
      return localStorage.getItem("wallet_focus_mode") === "1";
    } catch {
      return false;
    }
  });
  const toggleFocusMode = () => {
    setFocusMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("wallet_focus_mode", next ? "1" : "0");
      } catch {
        // armazenamento indisponivel (aba anonima, etc.) -- so nao persiste
      }
      return next;
    });
  };
  // Filtro único (Agenda e Carteira completa usam o mesmo), reaproveitando o
  // motor do FilterBar/getFilteredCollections da tela de Cobrança -- ele
  // filtra por título; aqui a tabela é por cliente, então o resultado vira
  // um conjunto de documentos usado pra recortar openClientGroups.
  const [walletFilters, setWalletFilters] = useState<FilterOptions>({});

  // Numero do acordo (prefixo do id, mesmo formato do Termo em PDF -- ver
  // src/utils/termoAcordo.ts) buscavel pelo MESMO campo de busca da carteira,
  // igual a pesquisar o CPF do cliente: um termo de 6+ caracteres que bate
  // com o prefixo de algum acordo vira a busca pelo documento do cliente
  // daquele acordo -- o cliente aparece na lista normal (com o badge "Em
  // acordo" de sempre), sem indicador/UI diferenciado.
  const walletFiltersParaFiltragem = useMemo(() => {
    const termo = (walletFilters.search || "").trim().toUpperCase();
    if (termo.length < 6) return walletFilters;
    const acordoMatch = acordos.find((a) => a.id.toUpperCase().startsWith(termo));
    if (!acordoMatch) return walletFilters;
    return { ...walletFilters, search: acordoMatch.clientDocument };
  }, [walletFilters, acordos]);

  const [currentPage, setCurrentPage] = useState(1);
  const [copiedDoc, setCopiedDoc] = useState<string | null>(null);
  const itemsPerPage = 10;

  const copyDocument = (document: string) => {
    navigator.clipboard.writeText(document);
    setCopiedDoc(document);
    setTimeout(() => setCopiedDoc((prev) => (prev === document ? null : prev)), 1500);
  };

  // Ultimo contato registrado por cliente (collection_attempts, ver
  // LogContactModal.tsx). Antes lia de scheduled_visits (visita falsa com
  // status "realizada") -- buscado a parte aqui porque o CollectionContext
  // nao carrega collection_attempts globalmente, so sob demanda por titulo
  // (CollectionModal).
  const [attemptsByCollection, setAttemptsByCollection] = useState<
    Record<
      string,
      {
        date: string;
        result: string;
        notes: string | null;
        nextActionDate: string | null;
      }
    >
  >({});

  useEffect(() => {
    const ids = Array.from(
      new Set(
        (myCollections || [])
          .filter((c) => hasInstallmentBalance(c))
          .map((c) => c.id_parcela?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (ids.length === 0) {
      setAttemptsByCollection({});
      return;
    }
    let cancelled = false;
    (async () => {
      const map: Record<
        string,
        {
          date: string;
          result: string;
          notes: string | null;
          nextActionDate: string | null;
        }
      > = {};
      for (const batch of chunk(ids, 300)) {
        const { data, error } = await supabase
          .from("collection_attempts")
          .select("collection_id, date, result, notes, next_action_date, created_at")
          .in("collection_id", batch)
          .order("created_at", { ascending: false });
        if (error) {
          console.error("Erro ao buscar últimos contatos da carteira:", error);
          continue;
        }
        (data || []).forEach((row) => {
          if (!map[row.collection_id]) {
            map[row.collection_id] = {
              date: row.date,
              result: row.result,
              notes: row.notes,
              nextActionDate: row.next_action_date,
            };
          }
        });
      }
      if (!cancelled) setAttemptsByCollection(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [myCollections]);

  // Pagamento de parcela de acordo registrado por ESTE cobrador neste mes.
  // Nao vem de `salePayments` (sale_payments) -- registrar_pagamento_acordo
  // so grava em acordo_pagamentos e espelha o saldo em BANCO_DADOS, nunca
  // cria linha em sale_payments (migration 20261031000001). Sem somar isto
  // aparte, "Recuperacao do Mes" ficaria sem o que vem de acordo.
  const [acordoPagamentosMes, setAcordoPagamentosMes] = useState(0);
  useEffect(() => {
    if (!user?.id) {
      setAcordoPagamentosMes(0);
      return;
    }
    let cancelled = false;
    const mesAtual = todayLocalStr().slice(0, 7);
    (async () => {
      // data_pagamento aqui e sempre YYYY-MM-DD (gravada via todayLocalStr
      // no AcordoDetailModal, nunca o texto livre de BANCO_DADOS), entao
      // comparar por prefixo do mes e seguro.
      const { data, error } = await supabase
        .from("acordo_pagamentos")
        .select("valor_pago, data_pagamento")
        .eq("collector_id", user.id)
        .gte("data_pagamento", `${mesAtual}-01`);
      if (error) {
        console.error("Erro ao buscar pagamentos de acordo do mês:", error);
        return;
      }
      if (!cancelled) {
        setAcordoPagamentosMes(
          (data || [])
            .filter((p) => p.data_pagamento.startsWith(mesAtual))
            .reduce((sum, p) => sum + Number(p.valor_pago), 0),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const lastContacts = useMemo(() => {
    const map: Record<
      string,
      { note: string; date: Date; result: string; nextActionDate: string | null }
    > = {};
    (myCollections || []).forEach((c) => {
      if (!c.documento || !c.id_parcela) return;
      const attempt = attemptsByCollection[c.id_parcela.toString()];
      if (!attempt) return;
      const date = new Date(attempt.date + "T00:00:00");
      const current = map[c.documento];
      if (!current || date > current.date) {
        map[c.documento] = {
          note: attempt.notes || "",
          date,
          result: attempt.result,
          nextActionDate: attempt.nextActionDate,
        };
      }
    });
    return map;
  }, [myCollections, attemptsByCollection]);

  // Lista de trabalho: so quem ainda deve. Quem quitou segue atribuido e conta
  // no recebido (meta), mas sai da carteira.
  const openClientGroups = useMemo(
    () => clientGroups.filter((g) => hasOpenBalance(g.pendingValue)),
    [clientGroups],
  );

  // Mesmo motor de filtro do FilterBar (titulo a titulo) pra Agenda e
  // Carteira completa -- recortado de volta pra cliente via o conjunto de
  // documentos que sobrou.
  const walletFilteredGroups = useMemo(() => {
    const matchedCollections = getFilteredCollections(
      walletFiltersParaFiltragem,
      user?.type || "collector",
      user?.id,
    );
    const matchedDocs = new Set(
      matchedCollections
        .map((c) => c.documento?.trim())
        .filter((d): d is string => Boolean(d)),
    );
    return openClientGroups.filter((g) => matchedDocs.has(g.document));
  }, [openClientGroups, walletFiltersParaFiltragem, getFilteredCollections, user]);

  // Regras vigentes DESTE cobrador (faixa x lojas, pode haver varias -- ver
  // collector_overdue_ranges, cadastradas em Distribuicao da carteira). Sem
  // regra com teto, "Clientes urgentes" fica vazia -- nao ha "perto de sair"
  // sem um limite definido.
  const minhasRegras = useMemo(
    // Pausada (inativa) tambem conta: ela segura os clientes que o cobrador
    // ja tem (migration 20261106000010), so nao entrega clientes novos.
    () => collectorOverdueRanges.filter((r) => r.collectorId === user?.id),
    [collectorOverdueRanges, user?.id],
  );
  const temRegraComTeto = minhasRegras.some((r) => r.maxDias != null);

  // Clientes urgentes: dentro da MINHA faixa mas a poucos dias do teto dela
  // (URGENTE_SAIDA_CARTEIRA_DIAS). "Sem nenhuma acao" reusa lastContacts
  // (mesma fonte do balde "Sem contato") -- ausencia de entrada ali so
  // acontece quando nenhum titulo em aberto do cliente tem uma unica
  // tentativa registrada, exatamente o que o pedido original definiu.
  const { urgentes, urgenteInfoByDocument } = useMemo(() => {
    const info = new Map<string, { diasRestantes: number; semAcao: boolean }>();
    if (!temRegraComTeto) {
      return { urgentes: [] as ClientGroup[], urgenteInfoByDocument: info };
    }
    const ranked: { group: ClientGroup; diasRestantes: number }[] = [];
    walletFilteredGroups.forEach((group) => {
      const atraso = clientMaxOverdueDays(group, acordoAtivoOverdueMap);
      const diasRestantes = diasAteSairDasRegras(
        minhasRegras,
        atraso,
        clientReferenceStore(group),
      );
      if (diasRestantes == null || diasRestantes > URGENTE_SAIDA_CARTEIRA_DIAS)
        return;
      info.set(group.document, {
        diasRestantes,
        semAcao: !lastContacts[group.document],
      });
      ranked.push({ group, diasRestantes });
    });
    ranked.sort((a, b) => a.diasRestantes - b.diasRestantes);
    return {
      urgentes: ranked.map((r) => r.group),
      urgenteInfoByDocument: info,
    };
  }, [
    walletFilteredGroups,
    minhasRegras,
    temRegraComTeto,
    lastContacts,
    acordoAtivoOverdueMap,
  ]);

  // Ordenacao clicavel no cabecalho, compartilhada pela Carteira completa e
  // pelas categorias da Agenda (mesmas colunas, mesmo header -- ver
  // WalletTableHead). Nula = ordem padrao (precedencia da Agenda / vinda do
  // filtro na Carteira completa).
  const [sortKey, setSortKey] = useState<WalletSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: WalletSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedWalletFilteredGroups = useMemo(() => {
    if (!sortKey) return walletFilteredGroups;
    const valueFor = (g: ClientGroup): number | string => {
      switch (sortKey) {
        case "cliente":
          return (g.client || "").toLowerCase();
        case "ultimaInteracao":
          return lastContacts[g.document]?.date?.getTime() ?? -Infinity;
        case "retorno":
          return lastContacts[g.document]?.nextActionDate ?? "";
        case "atraso":
          return clientMaxOverdueDays(g, acordoAtivoOverdueMap);
        case "valorPendente":
          return g.pendingValue;
        default:
          return "";
      }
    };
    return [...walletFilteredGroups].sort((a, b) => {
      const va = valueFor(a);
      const vb = valueFor(b);
      const cmp =
        typeof va === "string" || typeof vb === "string"
          ? String(va).localeCompare(String(vb))
          : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [walletFilteredGroups, sortKey, sortDir, lastContacts, acordoAtivoOverdueMap]);

  // Agenda priorizada: cada cliente cai em UMA só categoria (a de maior
  // precedencia), quem sobra vai pra "Em tratamento" (nao fica invisivel
  // mais). Ordem pensada pelo que é mais acionável agora: uma promessa
  // vencendo ou um acordo quebrado é alguém esperando contato; atraso por
  // faixa (90/60/30 — mesmos limiares de priorityBucket, que já usa o maior
  // atraso entre as parcelas em aberto = o do boleto vencido mais antigo)
  // vem depois; silêncio e "tudo em dia" por último.
  const today = todayLocalStr();
  const todayDate = new Date(today + "T00:00:00");

  // Acompanhamento diario dos contatos agendados (ligacao/whatsapp) deste
  // cobrador -- mesma proposta do Acompanhamento de Visitas do externo, só
  // que aqui é a visão do próprio cobrador sobre o dia, não a do gestor
  // (essa fica em VisitTracking.tsx).
  const dailyContactStats = useMemo(() => {
    const mine = scheduledVisits.filter(
      (v) =>
        v.collectorId === user?.id && v.channel && v.channel !== "presencial",
    );
    return {
      agendadosHoje: mine.filter(
        (v) => v.status === "agendada" && v.scheduledDate === today,
      ).length,
      atrasados: mine.filter((v) => isVisitOverdue(v, today)).length,
      concluidosHoje: mine.filter(
        (v) => v.status === "realizada" && v.dataVisitaRealizada === today,
      ).length,
      reagendadosHoje: mine.filter(
        (v) =>
          v.status === "reagendada" &&
          v.updatedAt &&
          todayLocalStr(new Date(v.updatedAt)) === today,
      ).length,
    };
  }, [scheduledVisits, user?.id, today]);

  const {
    agendados,
    promessas,
    acordosQuebrados,
    criticos,
    alertas,
    medios,
    semContato,
    emTratamento,
  } = useMemo(() => {
    const claimed = new Set<string>();
    const agendados: ClientGroup[] = [];
    const promessas: ClientGroup[] = [];
    const acordosQuebrados: ClientGroup[] = [];
    const criticos: ClientGroup[] = [];
    const alertas: ClientGroup[] = [];
    const medios: ClientGroup[] = [];
    const semContato: ClientGroup[] = [];
    const emTratamento: ClientGroup[] = [];

    const claim = (list: ClientGroup[], group: ClientGroup) => {
      list.push(group);
      claimed.add(group.document);
    };

    // Maior precedencia: o cobrador se comprometeu com uma data/hora pra
    // este contato (LogContactModal, "Atender"), diferente de promessa (compromisso
    // do CLIENTE) -- so entra aqui quando chegou o dia ou passou.
    sortedWalletFilteredGroups.forEach((group) => {
      const contato = scheduledContactByDocument.get(group.document);
      if (contato && contato.scheduledDate <= today) claim(agendados, group);
    });
    sortedWalletFilteredGroups.forEach((group) => {
      if (claimed.has(group.document)) return;
      const nextActionDate = lastContacts[group.document]?.nextActionDate;
      if (nextActionDate && nextActionDate <= today) claim(promessas, group);
    });
    sortedWalletFilteredGroups.forEach((group) => {
      if (claimed.has(group.document)) return;
      if (getAcordoQuebradoDoCliente(group.document))
        claim(acordosQuebrados, group);
    });
    sortedWalletFilteredGroups.forEach((group) => {
      if (claimed.has(group.document)) return;
      const bucket = priorityBucket(clientMaxOverdueDays(group, acordoAtivoOverdueMap));
      if (bucket === "critical") claim(criticos, group);
      else if (bucket === "high") claim(alertas, group);
      else if (bucket === "medium") claim(medios, group);
    });
    sortedWalletFilteredGroups.forEach((group) => {
      if (claimed.has(group.document)) return;
      const last = lastContacts[group.document];
      const diasSemContato = last
        ? Math.floor((todayDate.getTime() - last.date.getTime()) / 86400000)
        : Infinity;
      if (diasSemContato > SEM_CONTATO_DIAS) claim(semContato, group);
    });
    // Resto: ja tem contato recente, nao esta em nenhuma faixa de atraso que
    // exija atencao agora e nao tem acordo quebrado — "ja sendo cuidado".
    sortedWalletFilteredGroups.forEach((group) => {
      if (claimed.has(group.document)) return;
      claim(emTratamento, group);
    });

    return {
      agendados,
      promessas,
      acordosQuebrados,
      criticos,
      alertas,
      medios,
      semContato,
      emTratamento,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sortedWalletFilteredGroups,
    scheduledContactByDocument,
    lastContacts,
    getAcordoQuebradoDoCliente,
    acordoAtivoOverdueMap,
    today,
  ]);

  // Ao digitar uma busca, tenta manter o cobrador DENTRO da Agenda: as 7
  // categorias acima (exceto "urgente", que nao e exclusiva -- ver comentario
  // la em cima) particionam TODO o conjunto filtrado, entao um termo que
  // isola um unico cliente (ex.: CPF ou numero de acordo) cai inteiro numa
  // unica categoria -- pula pra ela (ex.: "Em tratamento") em vez de deixar
  // a busca parecer vazia na aba atual. Se a busca espalhar clientes por
  // mais de uma categoria (ou nao achar ninguem), cai pra Carteira completa,
  // que mostra a lista inteira de uma vez. So reage a busca MUDAR -- nao a
  // cada recalculo das categorias (ex.: ordenacao), senao o cobrador seria
  // chutado de volta toda hora com uma busca ainda digitada.
  useEffect(() => {
    if (!(walletFilters.search || "").trim()) return;
    // Na Carteira completa a busca ja aparece direto na lista (igual CPF) --
    // so remaneja de aba/subaba quando o cobrador esta na Agenda.
    if (walletTab !== "agenda") return;
    const categoriasExclusivas: { key: AgendaSubTab; groups: ClientGroup[] }[] = [
      { key: "agendados", groups: agendados },
      { key: "promessas", groups: promessas },
      { key: "quebrado", groups: acordosQuebrados },
      { key: "critico", groups: criticos },
      { key: "alerta", groups: alertas },
      { key: "medio", groups: medios },
      { key: "semContato", groups: semContato },
      { key: "tratamento", groups: emTratamento },
    ];
    const comResultado = categoriasExclusivas.filter((c) => c.groups.length > 0);
    if (comResultado.length === 1) {
      setAgendaSubTab(comResultado[0].key);
    } else {
      setWalletTab("carteira");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletFilters.search]);

  const agendaCategorias: AgendaCategoriaConfig[] = useMemo(
    () => [
      {
        key: "agendados",
        label: "Agendados para hoje",
        icon: <CalendarClock className="w-4 h-4" />,
        activeClass: "bg-purple-600 text-white",
        accentBorderClass: "border-l-purple-400 dark:border-l-purple-600",
        groups: agendados,
        emptyMessage: "Nenhum contato agendado para hoje ou atrasado.",
      },
      {
        key: "promessas",
        label: "Promessas vencendo",
        icon: <Clock className="w-4 h-4" />,
        activeClass: "bg-indigo-600 text-white",
        accentBorderClass: "border-l-indigo-400 dark:border-l-indigo-600",
        groups: promessas,
        emptyMessage: "Nenhuma promessa vencendo hoje ou atrasada.",
      },
      {
        key: "quebrado",
        label: "Acordo quebrado",
        icon: <AlertCircle className="w-4 h-4" />,
        activeClass: "bg-red-600 text-white",
        accentBorderClass: "border-l-red-400 dark:border-l-red-600",
        groups: acordosQuebrados,
        emptyMessage: "Nenhum acordo quebrado.",
      },
      {
        key: "urgente",
        label: "Clientes urgentes",
        icon: <AlertTriangle className="w-4 h-4" />,
        activeClass: "bg-pink-600 text-white",
        accentBorderClass: "border-l-pink-400 dark:border-l-pink-600",
        groups: urgentes,
        emptyMessage:
          temRegraComTeto
            ? "Nenhum cliente perto de sair da sua faixa de atraso."
            : "Sua faixa de atraso ainda não foi configurada pelo gestor.",
      },
      {
        key: "critico",
        label: "Crítico (+90 dias)",
        icon: <Flame className="w-4 h-4" />,
        activeClass: "bg-orange-600 text-white",
        accentBorderClass: "border-l-orange-400 dark:border-l-orange-600",
        groups: criticos,
        emptyMessage: "Nenhum cliente crítico (+90 dias).",
      },
      {
        key: "alerta",
        label: "Alerta (60-90 dias)",
        icon: <Flame className="w-4 h-4" />,
        activeClass: "bg-amber-500 text-white",
        accentBorderClass: "border-l-amber-400 dark:border-l-amber-600",
        groups: alertas,
        emptyMessage: "Nenhum cliente em alerta (60-90 dias).",
      },
      {
        key: "medio",
        label: "Médio (30-60 dias)",
        icon: <CalendarRange className="w-4 h-4" />,
        activeClass: "bg-yellow-500 text-white",
        accentBorderClass: "border-l-yellow-400 dark:border-l-yellow-600",
        groups: medios,
        emptyMessage: "Nenhum cliente no atraso médio (30-60 dias).",
      },
      {
        key: "semContato",
        label: `Sem contato (${SEM_CONTATO_DIAS}+ dias)`,
        icon: <CalendarDays className="w-4 h-4" />,
        activeClass: "bg-gray-600 text-white",
        accentBorderClass: "border-l-gray-300 dark:border-l-gray-600",
        groups: semContato,
        emptyMessage: "Nenhum cliente sem contato.",
      },
      {
        key: "tratamento",
        label: "Em tratamento",
        icon: <CheckCircle className="w-4 h-4" />,
        activeClass: "bg-green-600 text-white",
        accentBorderClass: "border-l-green-400 dark:border-l-green-600",
        groups: emTratamento,
        emptyMessage: "Nenhum cliente em tratamento.",
      },
    ],
    [
      agendados,
      promessas,
      acordosQuebrados,
      urgentes,
      temRegraComTeto,
      criticos,
      alertas,
      medios,
      semContato,
      emTratamento,
    ],
  );

  const categoriaAtiva =
    agendaCategorias.find((c) => c.key === agendaSubTab) ?? agendaCategorias[0];

  useEffect(() => {
    setCurrentPage(1);
  }, [walletFilters, walletTab, sortKey, sortDir]);

  // Carteira completa: diretório com todo mundo em aberto, não só quem
  // sobrou da agenda — é a visão de "navegar tudo" que a Agenda não dá.
  const totalPages = Math.ceil(walletFilteredGroups.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    return sortedWalletFilteredGroups.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage,
    );
  }, [sortedWalletFilteredGroups, currentPage]);

  const stats = useMemo(() => {
    const mesAtual = todayLocalStr().slice(0, 7);
    // Recuperado POR ESTE COBRADOR neste mes -- nao o valor_recebido da
    // carteira inteira (isso soma a vida toda do titulo, pagamento organico
    // do cliente incluso, sem ligacao com o trabalho do cobrador). Soma
    // sale_payments que ele mesmo registrou (pagamento normal) +
    // acordo_pagamentos que ele mesmo registrou (nao passa por sale_payments,
    // ver efeito de acordoPagamentosMes acima), os dois dentro do mes atual.
    const totalReceived =
      salePayments
        .filter(
          (p) =>
            p.collectorId === user?.id && p.paymentDate.startsWith(mesAtual),
        )
        .reduce((sum, p) => sum + p.paymentAmount, 0) + acordoPagamentosMes;
    const totalPending = walletFilteredGroups.reduce(
      (sum, g) => sum + g.pendingValue,
      0,
    );
    const goal = monthlyGoals.find(
      (g) => g.user_id === user?.id && g.month.startsWith(mesAtual),
    );
    // Sem fallback fixo: meta nao cadastrada mostra "sem meta" em vez de
    // comparar o recuperado contra um numero arbitrario (R$100mil) que o
    // gestor nunca definiu -- isso inflava a barra de progresso sem sentido.
    const hasGoal = !!goal && goal.payments_goal > 0;
    const targetValue = goal?.payments_goal ?? 0;
    const remaining = Math.max(0, targetValue - totalReceived);

    let critical = 0,
      high = 0;
    myCollections.forEach((c) => {
      const isPending = hasInstallmentBalance(c);
      if (isPending) {
        const bucket = priorityBucket(calculateOverdueDays(c.data_vencimento));
        if (bucket === "critical") critical++;
        else if (bucket === "high") high++;
      }
    });

    return {
      totalClients: walletFilteredGroups.length,
      totalPending,
      totalReceived,
      progress: hasGoal
        ? Math.min((totalReceived / targetValue) * 100, 100)
        : 0,
      hasGoal,
      targetValue,
      remaining,
      critical,
      high,
    };
  }, [
    walletFilteredGroups,
    myCollections,
    monthlyGoals,
    user?.id,
    salePayments,
    acordoPagamentosMes,
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text">
              Central de{" "}
              {USER_TYPE_LABELS[user?.type as keyof typeof USER_TYPE_LABELS] ??
                "Cobrança"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
              Gestão de carteira ativa e recuperação de crédito.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
              <span className="block text-xs text-red-600 dark:text-red-400 font-medium">
                Críticos (+90d)
              </span>
              <span className="text-lg font-bold text-red-700 dark:text-red-300">
                {stats.critical}
              </span>
            </div>
            <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-900/30">
              <span className="block text-xs text-orange-600 dark:text-orange-400 font-medium">
                Alerta (+60d)
              </span>
              <span className="text-lg font-bold text-orange-700 dark:text-orange-300">
                {stats.high}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleFocusMode}
              title={
                focusMode
                  ? "Sair do modo foco (mostrar cards)"
                  : "Modo foco (ocultar cards de desempenho)"
              }
              className={`p-2.5 rounded-xl border transition-colors ${
                focusMode
                  ? "text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-900/30"
                  : "text-gray-400 border-gray-200 dark:border-dark-border hover:text-indigo-600 hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
              }`}
            >
              {focusMode ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {!focusMode && (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600">
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              Recuperação do Mês
            </p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">
            {formatCurrency(stats.totalReceived)}
          </p>
          {stats.hasGoal ? (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-gray-500">
                  Meta: {formatCurrency(stats.targetValue)}
                </span>
                <span className="text-indigo-600">
                  {stats.progress.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-dark-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600"
                  style={{ width: `${stats.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {stats.remaining > 0
                  ? `Faltam ${formatCurrency(stats.remaining)} para a meta`
                  : "Meta atingida"}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-gray-400">
              Meta do mês ainda não definida pelo gestor.
            </p>
          )}
        </div>
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              Total de Clientes
            </p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">
            {stats.totalClients}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600">
              <Zap className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              Volume em Aberto
            </p>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {formatCurrency(stats.totalPending)}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600">
              <Target className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium text-gray-500">Ticket Médio</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">
            {formatCurrency(
              stats.totalClients > 0
                ? stats.totalPending / stats.totalClients
                : 0,
            )}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            Volume em aberto ÷ clientes na carteira
          </p>
        </div>
      </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-3 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-purple-600 shrink-0" />
          <div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Agendados hoje
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-dark-text leading-tight">
              {dailyContactStats.agendadosHoje}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Atrasados
            </p>
            <p className="text-lg font-bold text-red-600 leading-tight">
              {dailyContactStats.atrasados}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Concluídos hoje
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-dark-text leading-tight">
              {dailyContactStats.concluidosHoje}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Reagendados hoje
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-dark-text leading-tight">
              {dailyContactStats.reagendadosHoje}
            </p>
          </div>
        </div>
      </div>

      <FilterBar
        filters={walletFilters}
        onFilterChange={setWalletFilters}
        userType={user?.type || "collector"}
        context="collectionsCollector"
        searchPlaceholder="Buscar cliente, CPF, cidade ou nº do acordo..."
        showStatusPills={false}
        collapsible
        leading={
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setWalletTab("agenda")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                walletTab === "agenda"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
              }`}
            >
              <Rocket className="w-4 h-4" />
              Agenda
            </button>
            <button
              type="button"
              onClick={() => setWalletTab("carteira")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                walletTab === "carteira"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
              }`}
            >
              <Users className="w-4 h-4" />
              Carteira completa
            </button>
          </div>
        }
      />

      {walletTab === "agenda" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {agendaCategorias.map((categoria) => (
              <button
                key={categoria.key}
                type="button"
                onClick={() => setAgendaSubTab(categoria.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors ${
                  agendaSubTab === categoria.key
                    ? categoria.activeClass
                    : "bg-white dark:bg-dark-bg text-gray-500 border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
                }`}
              >
                {categoria.icon}
                {categoria.label}
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    agendaSubTab === categoria.key
                      ? "bg-white/20"
                      : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-secondary"
                  }`}
                >
                  {categoria.groups.length}
                </span>
              </button>
            ))}
          </div>
          <AgendaSection
            accentBorderClass={categoriaAtiva.accentBorderClass}
            groups={categoriaAtiva.groups}
            emptyMessage={categoriaAtiva.emptyMessage}
            lastContacts={lastContacts}
            getAcordoAtivoDoCliente={getAcordoAtivoDoCliente}
            copiedDoc={copiedDoc}
            copyDocument={copyDocument}
            user={user}
            onOpenDetail={onOpenDetail}
            onOpenLog={onOpenLog}
            onOpenAcordo={onOpenAcordo}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            urgenteInfoByDocument={urgenteInfoByDocument}
            scheduledContactByDocument={scheduledContactByDocument}
            onCancelContact={onCancelContact}
          />
        </>
      ) : (
        <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-dark-border">
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Carteira completa
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <WalletTableHead
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {paginatedClients.length > 0 ? (
                  paginatedClients.map((group) => (
                    <ClientQueueRow
                      key={group.clientId}
                      group={group}
                      lastContact={lastContacts[group.document]}
                      acordoAtivo={!!getAcordoAtivoDoCliente(group.document)}
                      copiedDoc={copiedDoc}
                      copyDocument={copyDocument}
                      user={user}
                      onOpenDetail={onOpenDetail}
                      onOpenLog={onOpenLog}
                      onOpenAcordo={onOpenAcordo}
                      urgenteInfo={urgenteInfoByDocument.get(group.document)}
                      scheduledContact={scheduledContactByDocument.get(group.document)}
                      onCancelContact={onCancelContact}
                    />
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-sm text-gray-500"
                    >
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50/30 dark:bg-dark-bg-secondary/30">
              <p className="text-xs text-gray-500">
                Mostrando {paginatedClients.length} de{" "}
                {walletFilteredGroups.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  <span className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-lg text-xs font-bold">
                    {currentPage}
                  </span>
                  <span className="text-xs text-gray-400 px-1">de</span>
                  <span className="text-xs text-gray-600 dark:text-dark-text font-bold">
                    {totalPages}
                  </span>
                </div>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const handleWhatsApp = (
  client: Pick<ClientGroup, "client" | "mobile" | "phone">,
  user: { name?: string } | null | undefined,
  valorEmAtraso: number,
) => {
  const phone = client.mobile || client.phone || "";
  // Botao fica desabilitado quando o cliente nao tem telefone (ver render
  // acima); sem numero, abrirWhatsApp so ignora -- sem dialog nativo.
  // Valor da mensagem = so o que ja venceu (clientOverdueAmount), nao o
  // total em aberto com parcelas a vencer.
  const assunto =
    valorEmAtraso > 0.01
      ? `sua pendência em atraso de ${formatCurrency(valorEmAtraso)}`
      : "suas parcelas em aberto";
  abrirWhatsApp(
    phone,
    `Olá ${client.client}, sou o ${user?.name} do setor de cobrança. Gostaria de falar sobre ${assunto}. Podemos conversar?`,
  );
};

const handleCall = (client: Pick<ClientGroup, "mobile" | "phone">) => {
  const phone = (client.mobile || client.phone || "").replace(/\D/g, "");
  if (!phone) return;
  window.open(`tel:${phone}`, "_self");
};

interface ClientQueueRowProps {
  group: ClientGroup;
  lastContact:
    | { note: string; date: Date; result: string; nextActionDate: string | null }
    | undefined;
  acordoAtivo: boolean;
  copiedDoc: string | null;
  copyDocument: (document: string) => void;
  user: User | null;
  onOpenDetail: (client: ClientGroup) => void;
  onOpenLog: (client: ClientGroup) => void;
  onOpenAcordo: (client: ClientGroup) => void;
  /** Presente quando o cliente esta perto de sair da faixa de atraso do
   * cobrador (ver urgentes/urgenteInfoByDocument em InternalCollectorWallet).
   * Mostrado em qualquer aba, nao so "Clientes urgentes" -- e informacao
   * util onde quer que o cobrador veja esse cliente. */
  urgenteInfo?: { diasRestantes: number; semAcao: boolean };
  /** Contato (ligacao/whatsapp) agendado em aberto deste cliente, se houver. */
  scheduledContact?: ScheduledVisit;
  onCancelContact: (visit: ScheduledVisit) => void;
}

// Linha da agenda/fila de atendimento, reusada em cada secao priorizada
// (ver docs/plans — redesenho da carteira, etapa 3) e em "Resto da
// carteira". Extraida da tabela unica original pra nao repetir o JSX em
// cada secao.
const ClientQueueRow: React.FC<ClientQueueRowProps> = ({
  group,
  lastContact,
  acordoAtivo,
  copiedDoc,
  copyDocument,
  user,
  onOpenDetail,
  onOpenLog,
  onOpenAcordo,
  urgenteInfo,
  scheduledContact,
  onCancelContact,
}) => {
  const { acordoAtivoOverdueMap } = useCollection();
  const maxAtraso = clientMaxOverdueDays(group, acordoAtivoOverdueMap);
  const phoneValue = group.mobile || group.phone;
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  // saleNumber 0 = parcela avulsa (sem numero_titulo nem venda_n, ver
  // resolveSaleKey em filters/sales.ts) -- na pratica, titulo que nasceu de
  // uma renegociacao em vez de vir com numero de venda do ERP.
  const saleLabels = Array.from(
    new Set((group.sales ?? []).map((s) => s.saleNumber)),
  ).map((n) => (n ? `#${n}` : "#Renegociada"));
  return (
    <>
    <tr className="group hover:bg-gray-50/80 dark:hover:bg-dark-bg-secondary transition-colors cursor-pointer">
      <td className="px-6 py-4 w-96 max-w-96" onClick={() => onOpenDetail(group)}>
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="block truncate font-bold text-gray-900 dark:text-dark-text group-hover:text-indigo-600 transition-colors"
            title={group.client}
          >
            {group.client}
          </span>
          {group.apelido && (
            <span
              className="block truncate text-xs text-blue-600 dark:text-blue-400"
              title={group.apelido}
            >
              <span className="text-gray-500 dark:text-dark-text-secondary">
                Apelido:{" "}
              </span>
              {group.apelido}
            </span>
          )}
          {group.razaoSocial && (
            <span
              className="block truncate text-xs text-gray-600 dark:text-dark-text-secondary"
              title={`Razão social: ${group.razaoSocial}`}
            >
              <span className="text-gray-500 dark:text-dark-text-secondary">
                Razão social:{" "}
              </span>
              {group.razaoSocial}
            </span>
          )}
          {saleLabels.length > 0 && (
            <span
              className="block truncate text-[11px] text-gray-400"
              title={saleLabels.join(", ")}
            >
              <span className="text-gray-500 dark:text-dark-text-secondary">
                Venda(s):{" "}
              </span>
              {saleLabels.join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-400 min-w-0">
            <span className="truncate">
              <span className="text-gray-500 dark:text-dark-text-secondary">
                CPF/CNPJ:{" "}
              </span>
              {group.document}
              {group.codigoErp && (
                <span title="Código do cliente no Ciclone">
                  {" "}
                  · Cód. {group.codigoErp}
                </span>
              )}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyDocument(group.document);
              }}
              title={copiedDoc === group.document ? "Copiado!" : "Copiar documento"}
              className={`p-0.5 rounded transition-colors shrink-0 ${
                copiedDoc === group.document
                  ? "text-green-600"
                  : "text-gray-300 hover:text-indigo-600"
              }`}
            >
              {copiedDoc === group.document ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </span>
          {acordoAtivo && (
            <span className="w-fit px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
              Em acordo
            </span>
          )}
          {urgenteInfo && (
            <span
              className={`w-fit px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                urgenteInfo.semAcao
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-pink-50 text-pink-600 border-pink-100"
              }`}
            >
              {urgenteInfo.semAcao ? "Sem nenhuma ação — " : ""}
              Faltam {urgenteInfo.diasRestantes}{" "}
              {urgenteInfo.diasRestantes === 1 ? "dia" : "dias"} na carteira
            </span>
          )}
          {scheduledContact && (
            <span
              className={`w-fit inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                isVisitOverdue(scheduledContact)
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-purple-50 text-purple-600 border-purple-100"
              }`}
            >
              <CalendarClock className="w-3 h-3" />
              {scheduledContact.channel === "whatsapp" ? "WhatsApp" : "Ligação"}
              {": "}
              {new Date(
                scheduledContact.scheduledDate + "T00:00:00",
              ).toLocaleDateString("pt-BR")}
              {scheduledContact.scheduledTime
                ? ` ${scheduledContact.scheduledTime}`
                : ""}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 max-w-xs" onClick={() => onOpenDetail(group)}>
        {lastContact ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
              {new Date(lastContact.date).toLocaleDateString("pt-BR")}
            </span>
            <p className="text-xs text-gray-600 dark:text-dark-text-secondary line-clamp-2 italic">
              "{lastContact.note}"
            </p>
          </div>
        ) : (
          <span className="text-xs text-gray-300 italic">Sem registros</span>
        )}
      </td>
      <td className="px-6 py-4" onClick={() => onOpenDetail(group)}>
        {lastContact?.nextActionDate ? (
          <span className="inline-flex items-center gap-1 w-fit px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
            <Clock className="w-3 h-3" />
            Retorno:{" "}
            {new Date(
              lastContact.nextActionDate + "T00:00:00",
            ).toLocaleDateString("pt-BR")}
          </span>
        ) : (
          <span className="text-xs text-gray-300 italic">—</span>
        )}
      </td>
      <td className="px-6 py-4 text-center" onClick={() => onOpenDetail(group)}>
        <span
          className={`inline-block whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold ${PRIORITY_COLOR_CLASSES[priorityBucket(maxAtraso)]}`}
        >
          {maxAtraso} dias
        </span>
      </td>
      <td className="px-6 py-4 text-right" onClick={() => onOpenDetail(group)}>
        <div className="flex flex-col">
          <span className="font-bold text-red-600 dark:text-red-400">
            {formatCurrency(group.pendingValue)}
          </span>
          <span className="text-[10px] text-gray-400">
            Total: {formatCurrency(group.totalValue)}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPhoneModal(true);
            }}
            disabled={!phoneValue}
            title={phoneValue ? "Telefone" : "Cliente sem telefone"}
            className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all border border-indigo-100 disabled:opacity-40 disabled:hover:bg-indigo-50 disabled:hover:text-indigo-600 disabled:cursor-not-allowed"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleWhatsApp(
                group,
                user,
                clientOverdueAmount(group, acordoAtivoOverdueMap),
              );
            }}
            disabled={!(group.mobile || group.phone)}
            title={group.mobile || group.phone ? "Chamar no WhatsApp" : "Cliente sem telefone"}
            className="p-2 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-xl transition-all border border-green-100 disabled:opacity-40 disabled:hover:bg-green-50 disabled:hover:text-green-600 disabled:cursor-not-allowed"
          >
            <WhatsAppIcon className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenLog(group);
            }}
            className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all border border-blue-100"
            title="Atender (registrar contato / agendar próximo)"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenAcordo(group);
            }}
            className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white rounded-xl transition-all border border-amber-100"
            title="Negociar / Acordo"
          >
            <Handshake className="w-4 h-4" />
          </button>
          {/* Agendar/remarcar fica dentro do "Atender" (LogContactModal, etapa
              2); cancelar continua aqui, e uma acao a parte com motivo. */}
          {scheduledContact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelContact(scheduledContact);
              }}
              className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all border border-red-100"
              title="Cancelar contato agendado"
            >
              <CalendarX className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
    {showPhoneModal &&
      phoneValue &&
      createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm"
          onClick={() => setShowPhoneModal(false)}
        >
          <div
            className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary">
              <h3 className="font-bold text-gray-900 dark:text-dark-text">
                {group.client}
              </h3>
              <button
                onClick={() => setShowPhoneModal(false)}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text text-center">
                {phoneValue}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => copyDocument(phoneValue)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text font-bold text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  {copiedDoc === phoneValue ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copiedDoc === phoneValue ? "Copiado!" : "Copiar"}
                </button>
                <button
                  onClick={() => handleCall(group)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  Ligar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

const AGENDA_PREVIEW_COUNT = 5;

interface AgendaSectionProps {
  accentBorderClass: string;
  groups: ClientGroup[];
  emptyMessage: string;
  lastContacts: Record<
    string,
    { note: string; date: Date; result: string; nextActionDate: string | null }
  >;
  getAcordoAtivoDoCliente: (clientDocument: string) => unknown;
  copiedDoc: string | null;
  copyDocument: (document: string) => void;
  user: User | null;
  onOpenDetail: (client: ClientGroup) => void;
  onOpenLog: (client: ClientGroup) => void;
  onOpenAcordo: (client: ClientGroup) => void;
  sortKey: WalletSortKey | null;
  sortDir: "asc" | "desc";
  onSort: (key: WalletSortKey) => void;
  urgenteInfoByDocument: Map<string, { diasRestantes: number; semAcao: boolean }>;
  scheduledContactByDocument: Map<string, ScheduledVisit>;
  onCancelContact: (visit: ScheduledVisit) => void;
}

// Conteudo da categoria ativa da agenda priorizada: borda colorida conforme
// a urgencia, paginacao propria (AGENDA_PREVIEW_COUNT por pagina). O
// titulo/icone/contagem ja aparecem no pill da aba (ver agendaCategorias em
// InternalCollectorWallet) -- aqui o cabecalho ordenavel (mesmo da Carteira
// completa, ver WalletTableHead) + a lista, ou o aviso de categoria vazia.
const AgendaSection: React.FC<AgendaSectionProps> = ({
  accentBorderClass,
  groups,
  emptyMessage,
  lastContacts,
  getAcordoAtivoDoCliente,
  copiedDoc,
  copyDocument,
  user,
  onOpenDetail,
  onOpenLog,
  onOpenAcordo,
  sortKey,
  sortDir,
  onSort,
  urgenteInfoByDocument,
  scheduledContactByDocument,
  onCancelContact,
}) => {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [groups]);

  if (groups.length === 0) {
    return (
      <div
        className={`bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border border-l-4 ${accentBorderClass} shadow-sm p-8 text-center text-sm text-gray-400`}
      >
        {emptyMessage}
      </div>
    );
  }

  const totalPages = Math.ceil(groups.length / AGENDA_PREVIEW_COUNT);
  const visible = groups.slice(
    (page - 1) * AGENDA_PREVIEW_COUNT,
    page * AGENDA_PREVIEW_COUNT,
  );

  return (
    <div
      className={`bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border border-l-4 ${accentBorderClass} shadow-sm overflow-hidden`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <WalletTableHead sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {visible.map((group) => (
              <ClientQueueRow
                key={group.clientId}
                group={group}
                lastContact={lastContacts[group.document]}
                acordoAtivo={!!getAcordoAtivoDoCliente(group.document)}
                copiedDoc={copiedDoc}
                copyDocument={copyDocument}
                user={user}
                onOpenDetail={onOpenDetail}
                onOpenLog={onOpenLog}
                onOpenAcordo={onOpenAcordo}
                urgenteInfo={urgenteInfoByDocument.get(group.document)}
                scheduledContact={scheduledContactByDocument.get(group.document)}
                onCancelContact={onCancelContact}
              />
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="p-3 border-t border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50/30 dark:bg-dark-bg-secondary/30">
          <p className="text-xs text-gray-500">
            Mostrando {visible.length} de {groups.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <div className="flex items-center gap-1">
              <span className="w-7 h-7 flex items-center justify-center bg-indigo-600 text-white rounded-lg text-xs font-bold">
                {page}
              </span>
              <span className="text-xs text-gray-400 px-1">de</span>
              <span className="text-xs text-gray-600 dark:text-dark-text font-bold">
                {totalPages}
              </span>
            </div>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface CollectorDashboardProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

interface CardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  cardId: string;
  minimized: boolean;
  onToggleMinimize: (cardId: string) => void;
}

const Card: React.FC<CardProps> = ({
  title,
  icon: Icon,
  children,
  cardId,
  minimized,
  onToggleMinimize,
}) => {
  return (
    <div
      className={`bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 transition-all duration-300 ease-in-out ${minimized ? "h-20 overflow-hidden" : ""}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 bg-purple-500 rounded-2xl`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-dark-text transition-colors duration-300">
            {title}
          </h3>
        </div>
        <button
          onClick={() => onToggleMinimize(cardId)}
          className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-dark-bg-secondary transition-colors duration-300"
        >
          {minimized ? (
            <ChevronDown className="w-4 h-4 text-gray-600 dark:text-dark-text-secondary" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-600 dark:text-dark-text-secondary" />
          )}
        </button>
      </div>
      {!minimized && children}
    </div>
  );
};

const CollectorDashboard: React.FC<CollectorDashboardProps> = ({
  activeTab: externalActiveTab,
  onTabChange,
}) => {
  const { user } = useAuth();
  const {
    getCollectorCollections,
    getFilteredCollections,
    getClientGroups,
    getVisitsByCollector,
    salePayments,
    monthlyGoals,
    getAcordoAtivoDoCliente,
    scheduledVisits,
  } = useCollection();
  const collectionTableRef = useRef<CollectionTableRef>(null);

  // Estados para modais (centralizados para evitar problemas de stacking context)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedClientForLog, setSelectedClientForLog] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedClientForDetail, setSelectedClientForDetail] =
    useState<any>(null);
  const [isAcordoModalOpen, setIsAcordoModalOpen] = useState(false);
  const [selectedClientForAcordo, setSelectedClientForAcordo] =
    useState<ClientGroup | null>(null);
  const [selectedAcordoId, setSelectedAcordoId] = useState<string | null>(
    null,
  );
  // Cancelamento direto (sem aprovacao) de um contato agendado -- item 16,
  // docs/PROGRESSO.md. Visita presencial usa outro fluxo (com aprovacao do
  // gestor, ver requestVisitCancellation/VisitScheduler).
  const [cancelContactVisit, setCancelContactVisit] =
    useState<ScheduledVisit | null>(null);
  // Contato agendado ATIVO do cliente aberto no LogContactModal, se houver --
  // o registro decide o desfecho dele (concluir ou remarcar) na mesma
  // transacao (ver LogContactModal.linkedVisit / RPC registrar_contato).
  const linkedVisit = selectedClientForLog
    ? scheduledVisits.find(
        (v) =>
          v.clientDocument === selectedClientForLog.document &&
          v.collectorId === user?.id &&
          v.channel &&
          v.channel !== "presencial" &&
          v.status === "agendada",
      )
    : undefined;

  // Usa a aba externa se fornecida, senão gerencia internamente
  const internalActiveTab: "overview" | "collections" | "route" | "visits" =
    (localStorage.getItem("collectorActiveTab") as any) || "overview";

  const activeTab = externalActiveTab || internalActiveTab;

  const [filters, setFilters] = useState<FilterOptions>({});
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [showFilterBar, setShowFilterBar] = useState(false);

  // Clique em notificacao: o App ja trocou a aba; aqui so os filtros da
  // Minha Carteira (ex.: so clientes em atraso, vencimentos de hoje).
  useEffect(() => {
    const listener = (e: Event) => {
      const filtros = (e as CustomEvent<Notification>).detail?.destino?.filtros;
      if (!filtros) return;
      setFilters(filtros);
      setShowFilterBar(true);
    };
    window.addEventListener("notificationClick", listener);
    return () => window.removeEventListener("notificationClick", listener);
  }, []);
  const [isAutoSliding, setIsAutoSliding] = useState(true);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllSchedules, setShowAllSchedules] = useState(false);

  const [cardOrder, setCardOrder] = useState<string[]>(INITIAL_CARD_IDS);
  const [visibleCards, setVisibleCards] = useState<string[]>(INITIAL_CARD_IDS);
  const [isCustomizeMenuOpen, setIsCustomizeMenuOpen] = useState(false);
  const [minimizedCards, setMinimizedCards] = useState<string[]>([]);

  // Configuração dos slides para mobile
  const mobileSlides = [
    { id: "daily", title: "Hoje", icon: Sun, color: "yellow" },
    { id: "weekly", title: "Esta Semana", icon: CalendarDays, color: "blue" },
    { id: "monthly", title: "Este Mês", icon: CalendarRange, color: "purple" },
  ];

  // Auto-slide effect
  useEffect(() => {
    if (!isAutoSliding || activeTab !== "overview") return;

    const interval = setInterval(() => {
      setCurrentSlideIndex((prevIndex) => {
        // Volta para o primeiro slide após o último
        return prevIndex === mobileSlides.length - 1 ? 0 : prevIndex + 1;
      });
    }, 5000); // 5 segundos

    return () => clearInterval(interval);
  }, [isAutoSliding, activeTab, mobileSlides.length]);

  // Função para pausar e reiniciar auto-slide
  const pauseAutoSlide = () => {
    setIsAutoSliding(false);
    // Reinicia após 10 segundos de inatividade
    setTimeout(() => {
      setIsAutoSliding(true);
    }, 10000);
  };

  // Funções de controle do slide
  const handleTouchStart = (e: React.TouchEvent) => {
    pauseAutoSlide();
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentSlideIndex < mobileSlides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
    if (isRightSwipe && currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const goToSlide = (index: number) => {
    pauseAutoSlide();
    setCurrentSlideIndex(index);
  };

  // Funções para calcular métricas por período
  const getMetricsByPeriod = (payments: any[], visits: any[]) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthStr = todayLocalStr(now).slice(0, 7); // "YYYY-MM"

    // Find the goal for the current month
    const currentMonthGoal = monthlyGoals.find(
      (g) => g.user_id === user?.id && g.month.startsWith(currentMonthStr),
    );

    // Define default goals
    const defaultGoals = {
      visits: 200,
      payments: 100000,
    };

    const monthlyVisitsGoal =
      currentMonthGoal?.visits_goal ?? defaultGoals.visits;
    const monthlyPaymentsGoal =
      currentMonthGoal?.payments_goal ?? defaultGoals.payments;

    // Derive daily and weekly goals from monthly
    const goals = {
      daily: {
        visits: Math.ceil(monthlyVisitsGoal / 22), // Assuming 22 working days
        payments: Math.ceil(monthlyPaymentsGoal / 22),
      },
      weekly: {
        visits: Math.ceil(monthlyVisitsGoal / 4),
        payments: Math.ceil(monthlyPaymentsGoal / 4),
      },
      monthly: {
        visits: monthlyVisitsGoal,
        payments: monthlyPaymentsGoal,
      },
    };

    // Filtrar pagamentos do cobrador atual
    const collectorPayments = payments.filter(
      (p) => p.collectorId === user?.id,
    );

    // Função para comparar datas (apenas dia)
    const isSameDay = (d1: Date | string, d2: Date | string) => {
      const date1 = toDate(d1);
      const date2 = toDate(d2);
      if (!date1 || !date2) return false;
      return todayLocalStr(date1) === todayLocalStr(date2);
    };

    const today = new Date();

    const dailyPayments = collectorPayments.filter((p) =>
      isSameDay(p.paymentDate, today),
    );

    // Meta do cobrador de carteira (interno/terceirizado/jurídico) conta
    // CONTATO EFETIVO (conseguiu falar com o cliente), não toda tentativa --
    // diferente do externo, onde "realizada" já é a visita feita, qualquer
    // desfecho. Ver countsTowardVisitsGoal (config/collectionAttempts).
    const isWalletCollectorGoal = isWalletCollectorType(user?.type);
    const countsAsRealizada = (v: ScheduledVisit) =>
      countsTowardVisitsGoal(v, isWalletCollectorGoal);

    const todayVisits = visits.filter((v) => {
      if (!countsAsRealizada(v)) return false;
      const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
      return isSameDay(dateToCheck, today);
    });

    // Calcular métricas reais
    const metrics = {
      daily: {
        visits: todayVisits.length,
        payments: dailyPayments.reduce((sum, p) => sum + p.paymentAmount, 0),
      },
      weekly: {
        visits: visits.filter((v) => {
          if (!countsAsRealizada(v)) return false;
          const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
          const visitDate = toDate(dateToCheck);
          return visitDate && visitDate >= startOfWeek;
        }).length,
        payments: collectorPayments
          .filter((p) => {
            const paymentDate = toDate(p.paymentDate);
            return paymentDate && paymentDate >= startOfWeek;
          })
          .reduce((sum, p) => sum + p.paymentAmount, 0),
      },
      monthly: {
        visits: visits.filter((v) => {
          if (!countsAsRealizada(v)) return false;
          const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
          const visitDate = toDate(dateToCheck);
          return visitDate && visitDate >= startOfMonth;
        }).length,
        payments: collectorPayments
          .filter((p) => {
            const paymentDate = toDate(p.paymentDate);
            return paymentDate && paymentDate >= startOfMonth;
          })
          .reduce((sum, p) => sum + p.paymentAmount, 0),
      },
    };

    return { metrics, goals };
  };

  // Funções para gamificação
  const getPerformanceLevel = (current: number, goal: number) => {
    const percentage = goal > 0 ? (current / goal) * 100 : 0;
    if (percentage >= 100)
      return {
        icon: Trophy,
        name: "Lendário",
        color: "text-yellow-500",
        bgColor: "bg-yellow-50",
      };
    if (percentage >= 90)
      return {
        icon: Diamond,
        name: "Diamante",
        color: "text-blue-500",
        bgColor: "bg-blue-50",
      };
    if (percentage >= 70)
      return {
        icon: Award,
        name: "Ouro",
        color: "text-yellow-600",
        bgColor: "bg-yellow-50",
      };
    if (percentage >= 50)
      return {
        icon: Medal,
        name: "Prata",
        color: "text-gray-500",
        bgColor: "bg-gray-50",
      };
    if (percentage >= 30)
      return {
        icon: ThumbsUp,
        name: "Bronze",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
      };
    return {
      icon: Flame,
      name: "Iniciante",
      color: "text-red-500",
      bgColor: "bg-red-50",
    };
  };

  const getMotivationalMessage = (current: number, goal: number) => {
    const percentage = goal > 0 ? (current / goal) * 100 : 0;
    if (percentage >= 100)
      return { text: "Incrível! Meta superada!", icon: Rocket };
    if (percentage >= 90)
      return { text: "Quase lá! Última tacada!", icon: Zap };
    if (percentage >= 70)
      return { text: "Excelente progresso!", icon: TrendingUp };
    if (percentage >= 50) return { text: "No caminho certo!", icon: ThumbsUp };
    if (percentage >= 30) return { text: "Vamos acelerar!", icon: Zap };
    return { text: "Hora de começar!", icon: Target };
  };

  // Card Content Components
  const ClientsCardContent = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-orange-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Pendentes
          </span>
        </div>
        <span className="font-medium text-orange-600 dark:text-orange-400 transition-colors duration-300">
          {stats.clientsWithPending}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Em dia
          </span>
        </div>
        <span className="font-medium text-green-600 dark:text-green-400 transition-colors duration-300">
          {stats.clients - stats.clientsWithPending}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3 text-blue-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Total de Clientes
          </span>
        </div>
        <span className="font-medium text-blue-600 dark:text-blue-400 transition-colors duration-300">
          {stats.clients}
        </span>
      </div>

      <div className="pt-2 border-t border-gray-100 dark:border-dark-border transition-colors duration-300">
        <div className="text-xs text-gray-500 dark:text-dark-text-secondary transition-colors duration-300">
          {stats.pending} vendas pendentes
        </div>
      </div>
    </div>
  );

  const SalesCardContent = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Finalizadas
          </span>
        </div>
        <span className="font-medium text-green-600 dark:text-green-400 transition-colors duration-300">
          {stats.completed}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-yellow-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Parciais
          </span>
        </div>
        <span className="font-medium text-yellow-600 dark:text-yellow-400 transition-colors duration-300">
          {stats.partial}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-orange-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Pendentes
          </span>
        </div>
        <span className="font-medium text-orange-600 dark:text-orange-400 transition-colors duration-300">
          {stats.pending}
        </span>
      </div>

      <div className="pt-2 border-t border-gray-100 dark:border-dark-border transition-colors duration-300">
        <div className="text-xs text-gray-500 dark:text-dark-text-secondary transition-colors duration-300">
          {stats.total > 0
            ? ((stats.completed / stats.total) * 100).toFixed(1)
            : 0}
          % concluídas
        </div>
      </div>
    </div>
  );

  const VisitsCardContent = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <Sun className="w-3 h-3 text-yellow-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Hoje
          </span>
        </div>
        <span className="font-medium text-yellow-600 dark:text-yellow-400 transition-colors duration-300">
          {stats.visitStats.today}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Realizadas
          </span>
        </div>
        <span className="font-medium text-green-600 dark:text-green-400 transition-colors duration-300">
          {stats.visitStats.completed}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-blue-500" />
          <span className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-300">
            Agendadas
          </span>
        </div>
        <span className="font-medium text-blue-600 dark:text-blue-400 transition-colors duration-300">
          {stats.visitStats.scheduled}
        </span>
      </div>

      <div className="pt-2 border-t border-gray-100 dark:border-dark-border transition-colors duration-300">
        <div className="text-xs text-gray-500 dark:text-dark-text-secondary transition-colors duration-300">
          {stats.visitStats.scheduled + stats.visitStats.completed} visitas no
          total
        </div>
      </div>
    </div>
  );

  const ClientsByCityCardContent = () => {
    const sortedCities = useMemo(() => {
      return Object.entries(clientsByCity).sort(
        ([, countA], [, countB]) => countB - countA,
      );
    }, [clientsByCity]);

    const visibleCities = showAllCities
      ? sortedCities
      : sortedCities.slice(0, 4);

    const handleCityClick = (city: string) => {
      setFilters((prevFilters) => ({ ...prevFilters, city: city }));
      if (onTabChange) {
        onTabChange("collections");
      }
    };

    return (
      <>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {visibleCities.map(([city, count]) => (
            <button
              key={city}
              onClick={() => handleCityClick(city)}
              className="bg-gray-50 dark:bg-dark-bg-secondary p-2 rounded-lg text-center border border-gray-200 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              <div className="font-bold text-gray-800 dark:text-dark-text">
                {count}
              </div>
              <div className="text-gray-600 dark:text-dark-text-secondary">
                {city}
              </div>
            </button>
          ))}
        </div>
        {sortedCities.length > 10 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAllCities(!showAllCities)}
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center justify-center w-full"
            >
              {showAllCities ? "Mostrar Menos" : "Mostrar Mais"}
              {showAllCities ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </button>
          </div>
        )}
      </>
    );
  };

  const SchedulesByCityCardContent = () => {
    const sortedSchedules = useMemo(() => {
      return Object.entries(schedulesByCity).sort(
        ([, dataA], [, dataB]) => dataB.count - dataA.count,
      );
    }, [schedulesByCity]);

    const visibleSchedules = showAllSchedules
      ? sortedSchedules
      : sortedSchedules.slice(0, 4);

    return (
      <>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {visibleSchedules.map(([city, data]) => (
            <div
              key={city}
              className="bg-gray-50 dark:bg-dark-bg-secondary p-2 rounded-lg text-center border border-gray-200 dark:border-dark-border"
            >
              <div className="font-bold text-gray-800 dark:text-dark-text">
                {data.count}
              </div>
              <div className="text-gray-600 dark:text-dark-text-secondary">
                {city}
              </div>
            </div>
          ))}
        </div>
        {sortedSchedules.length > 4 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAllSchedules(!showAllSchedules)}
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center justify-center w-full"
            >
              {showAllSchedules ? "Mostrar Menos" : "Mostrar Mais"}
              {showAllSchedules ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </button>
          </div>
        )}
      </>
    );
  };

  // getCollectorCollections/getFilteredCollections/getClientGroups/
  // getVisitsByCollector sao fabricas memoizadas no contexto (useMemo com
  // deps em `collections`/`scheduledVisits`): a referencia delas muda quando
  // os dados mudam. Sem elas nas deps aqui, este useMemo so recalcula quando
  // `user?.id` muda (ex.: relogin) — uma atribuicao, um pagamento de acordo
  // etc. atualizam `collections` no contexto, mas a carteira exibida ficava
  // presa no resultado antigo ate um F5 forcar tudo a remontar do zero.
  const myCollections = useMemo(
    () => getCollectorCollections(user?.id || ""),
    [user?.id, getCollectorCollections],
  );
  const filteredCollections = useMemo(
    () => getFilteredCollections(filters, "collector", user?.id),
    [filters, user?.id, getFilteredCollections],
  );
  const clientGroups = useMemo(
    () => getClientGroups(user?.id),
    [user?.id, getClientGroups],
  );
  // Carteira ativa (quem ainda deve). clientGroups completo continua indo para
  // as metricas de recebido.
  const openClientGroups = useMemo(
    () => clientGroups.filter((g) => hasOpenBalance(g.pendingValue)),
    [clientGroups],
  );
  const myVisits = useMemo(
    () => getVisitsByCollector(user?.id || ""),
    [user?.id, getVisitsByCollector],
  );
  // Perfis de carteira (sem rota/visitas em campo): Interno, Terceirizado e Jurídico.
  const isWalletCollector =
    user?.type === "internal_collector" ||
    user?.type === "third_party_collector" ||
    user?.type === "legal_collector";

  // Calcular métricas gamificadas
  const { metrics: periodMetrics, goals } = useMemo(
    () => getMetricsByPeriod(salePayments, myVisits),
    [salePayments, myVisits, monthlyGoals, user, getMetricsByPeriod],
  );

  // Simplified logic - group by sale to count correctly
  const salesMap = useMemo(() => {
    const map = new Map<
      string,
      {
        totalValue: number;
        receivedValue: number;
        discountValue: number;
        isPending: boolean;
        clientDocument: string;
      }
    >();

    myCollections.forEach((collection) => {
      const saleKey = `${resolveSaleKey(collection)}-${collection.documento}`;
      if (!map.has(saleKey)) {
        map.set(saleKey, {
          totalValue: 0,
          receivedValue: 0,
          discountValue: 0,
          isPending: false,
          clientDocument: collection.documento || "",
        });
      }

      const sale = map.get(saleKey)!;
      sale.totalValue =
        Number(sale.totalValue) + Number(collection.valor_original);
      sale.receivedValue =
        Number(sale.receivedValue) + Number(collection.valor_recebido);
      sale.discountValue =
        Number(sale.discountValue) + Number(collection.desconto || 0);
    });

    // Desconto quita junto com o recebido (mesma regra de
    // getClientPaymentStatus/calculateSaleBalance) — sem isso, venda quitada
    // com desconto ficava presa em "pendente" e derrubava a conversão de quem
    // negociou com desconto.
    map.forEach((sale) => {
      const pendingAmount =
        sale.totalValue - sale.receivedValue - sale.discountValue;
      sale.isPending = pendingAmount > 0.01; // Consider amounts > 1 cent as pending
    });

    return map;
  }, [myCollections]);

  const clientsByCity = useMemo(() => {
    return openClientGroups.reduce(
      (acc, group) => {
        const city = group.city || "Sem cidade";
        acc[city] = (acc[city] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [openClientGroups]);

  const schedulesByCity = useMemo(() => {
    const scheduled = myVisits.filter((v) => v.status === "agendada");
    return scheduled.reduce(
      (acc, visit) => {
        const city = visit.clientCity || "Sem cidade";
        if (!acc[city]) {
          acc[city] = { count: 0, dates: new Set<string>() };
        }
        acc[city].count++;
        acc[city].dates.add(visit.scheduledDate);
        return acc;
      },
      {} as Record<string, { count: number; dates: Set<string> }>,
    );
  }, [myVisits]);

  const stats = useMemo(() => {
    const salesArray = Array.from(salesMap.values());
    const completedSales = salesArray.filter((s) => !s.isPending);
    const partialSales = salesArray.filter(
      (s) => s.isPending && s.receivedValue > 0,
    );
    const fullyPendingSales = salesArray.filter(
      (s) => s.isPending && s.receivedValue <= 0,
    );

    // Count unique clients with pending sales (this includes partial and fully pending)
    const clientsWithPending = new Set(
      salesArray
        .filter((s) => s.isPending)
        .map((s) => s.clientDocument)
        .filter(Boolean),
    ).size;

    // Calcular métricas de visitas
    const today = new Date();
    const todayStr = todayLocalStr(today);

    const visitStats = {
      today: myVisits.filter((v) => {
        // Para visitas agendadas, usar scheduled_date
        // Para visitas realizadas, usar data_visita_realizada se existir
        if (v.status === "agendada") {
          return v.scheduledDate === todayStr;
        } else if (v.status === "realizada" && v.dataVisitaRealizada) {
          return v.dataVisitaRealizada === todayStr;
        }
        return false;
      }).length,
      scheduled: myVisits.filter((v) => v.status === "agendada").length,
      completed: myVisits.filter((v) => v.status === "realizada").length,
    };

    return {
      total: salesMap.size,
      clients: clientGroups.length,
      pending: fullyPendingSales.length,
      partial: partialSales.length,
      completed: completedSales.length,
      clientsWithPending: clientsWithPending,
      visits: visitStats.scheduled,
      visitStats: visitStats,
      totalAmount: salesArray.reduce((sum, s) => sum + s.totalValue, 0),
      receivedAmount: salesArray.reduce((sum, s) => sum + s.receivedValue, 0),
    };
  }, [salesMap, clientGroups, myVisits]);

  const handleToggleMinimize = (cardId: string) => {
    setMinimizedCards((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId],
    );
  };

  const renderTabContent = () => {
    const dashboardCards = [
      {
        id: "clients",
        Component: ClientsCardContent,
        title: "Clientes",
        icon: Users,
      },
      {
        id: "sales",
        Component: SalesCardContent,
        title: "Vendas",
        icon: Target,
      },
      {
        id: "visits",
        Component: VisitsCardContent,
        title: "Visitas",
        icon: Calendar,
      },
    ];

    // Cards separados para evitar conflito com o slider
    const cityCards = [
      {
        id: "schedulesByCity",
        Component: SchedulesByCityCardContent,
        title: "Agendamentos por Cidade",
        icon: Calendar,
      },
      {
        id: "clientsByCity",
        Component: ClientsByCityCardContent,
        title: "Clientes por Cidade",
        icon: Users,
      },
    ];

    const orderedAndVisibleCards = cardOrder
      .map((id) => dashboardCards.find((c) => c.id === id))
      .filter((c) => c && visibleCards.includes(c.id));

    const orderedAndVisibleCityCards = cardOrder
      .map((id) => cityCards.find((c) => c.id === id))
      .filter((c) => c && visibleCards.includes(c.id));

    const renderInternalWallet = () => (
      <InternalCollectorWallet
        clientGroups={clientGroups}
        user={user}
        monthlyGoals={monthlyGoals}
        myCollections={myCollections}
        onOpenLog={(client) => {
          setSelectedClientForLog(client);
          setIsLogModalOpen(true);
        }}
        onOpenDetail={(client) => {
          setSelectedClientForDetail(client);
          setIsDetailModalOpen(true);
        }}
        onOpenAcordo={(client) => {
          const ativo = getAcordoAtivoDoCliente(client.document);
          if (ativo) {
            setSelectedAcordoId(ativo.id);
          } else {
            setSelectedClientForAcordo(client);
            setIsAcordoModalOpen(true);
          }
        }}
        onCancelContact={setCancelContactVisit}
      />
    );

    switch (activeTab) {
      case "overview":
        if (isWalletCollector) {
          return renderInternalWallet();
        }

        return (
          <div className="space-y-6">
            {/* Customize Button */}
            <div className="flex mb-4">
              <button
                onClick={() => setIsCustomizeMenuOpen(!isCustomizeMenuOpen)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-dark-text-secondary bg-white dark:bg-dark-bg px-4 py-2 rounded-2xl border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-secondary transition-colors duration-300"
              >
                <Settings className="w-4 h-4" />
                <span>Personalizar</span>
              </button>
            </div>

            {/* Customize Menu */}
            {isCustomizeMenuOpen && (
              <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 mb-4 transition-colors duration-300">
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-3 transition-colors duration-300">
                  Personalizar Cards
                </h3>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-gray-700 dark:text-dark-text-secondary transition-colors duration-300">
                    Ordem e Visibilidade
                  </h4>
                  {cardOrder.map((cardId, index) => {
                    const card = [...dashboardCards, ...cityCards].find(
                      (c) => c.id === cardId,
                    );
                    if (!card) return null;

                    return (
                      <div
                        key={card.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-dark-bg-secondary transition-colors duration-300"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={visibleCards.includes(card.id)}
                            onChange={() => {
                              if (visibleCards.includes(card.id)) {
                                setVisibleCards(
                                  visibleCards.filter((id) => id !== card.id),
                                );
                              } else {
                                setVisibleCards([...visibleCards, card.id]);
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-800 dark:text-dark-text transition-colors duration-300">
                            {card.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (index > 0) {
                                const newOrder = [...cardOrder];
                                const temp = newOrder[index];
                                newOrder[index] = newOrder[index - 1];
                                newOrder[index - 1] = temp;
                                setCardOrder(newOrder);
                              }
                            }}
                            disabled={index === 0}
                            className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
                          >
                            <ChevronUp className="w-4 h-4 text-gray-600 dark:text-dark-text-secondary" />
                          </button>
                          <button
                            onClick={() => {
                              if (index < cardOrder.length - 1) {
                                const newOrder = [...cardOrder];
                                const temp = newOrder[index];
                                newOrder[index] = newOrder[index + 1];
                                newOrder[index + 1] = temp;
                                setCardOrder(newOrder);
                              }
                            }}
                            disabled={index === cardOrder.length - 1}
                            className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
                          >
                            <ChevronDown className="w-4 h-4 text-gray-600 dark:text-dark-text-secondary" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Enhanced Mobile Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
              {orderedAndVisibleCards.map((card) => {
                if (!card) return null;
                const { Component, ...rest } = card;
                return (
                  <div
                    key={card.id}
                    className="transition duration-300 hover:scale-105"
                  >
                    <Card
                      {...rest}
                      cardId={card.id}
                      minimized={minimizedCards.includes(card.id)}
                      onToggleMinimize={handleToggleMinimize}
                    >
                      <Component />
                    </Card>
                  </div>
                );
              })}
            </div>

            {/* City Cards Section - Separated to avoid slider conflicts */}
            {orderedAndVisibleCityCards.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orderedAndVisibleCityCards.map((card) => {
                  if (!card) return null;
                  const { Component, ...rest } = card;
                  return (
                    <div
                      key={card.id}
                      className="transition duration-300 hover:scale-105"
                    >
                      <Card
                        {...rest}
                        cardId={card.id}
                        minimized={minimizedCards.includes(card.id)}
                        onToggleMinimize={handleToggleMinimize}
                      >
                        <Component />
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Métricas Gamificadas */}
            <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border overflow-hidden">
              {/* Header */}
              <div className="bg-gray-50 dark:bg-dark-bg-secondary p-4 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 dark:bg-dark-bg-tertiary rounded-2xl">
                      <Target className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900 dark:text-dark-text">
                        Metas
                      </h2>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-dark-text-secondary bg-white dark:bg-dark-bg px-3 py-1 rounded-lg border border-gray-200 dark:border-dark-border">
                    <div className="font-medium">
                      {new Date().toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Layout Desktop: Grid 3x2 */}
                <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4">
                  {/* Coluna Hoje */}
                  <div className="bg-white dark:bg-dark-bg rounded-lg p-4 border border-gray-200 dark:border-dark-border">
                    <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2 justify-center">
                      <Sun className="w-5 h-5 text-yellow-500" />
                      Hoje
                    </h3>
                    <div className="space-y-6">
                      <RadialApprovalChart
                        current={periodMetrics.daily.visits}
                        goal={goals.daily.visits}
                        title="Visitas Realizadas"
                        showValues={true}
                        isCurrency={false}
                        level={getPerformanceLevel(
                          periodMetrics.daily.visits,
                          goals.daily.visits,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.daily.visits,
                          goals.daily.visits,
                        )}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.daily.payments}
                        goal={goals.daily.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(
                          periodMetrics.daily.payments,
                          goals.daily.payments,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.daily.payments,
                          goals.daily.payments,
                        )}
                      />
                    </div>
                  </div>

                  {/* Coluna Esta Semana */}
                  <div className="bg-white dark:bg-dark-bg rounded-lg p-4 border border-gray-200 dark:border-dark-border">
                    <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2 justify-center">
                      <CalendarDays className="w-5 h-5 text-blue-500" />
                      Esta Semana
                    </h3>
                    <div className="space-y-6">
                      <RadialApprovalChart
                        current={periodMetrics.weekly.visits}
                        goal={goals.weekly.visits}
                        title="Visitas Realizadas"
                        showValues={true}
                        isCurrency={false}
                        level={getPerformanceLevel(
                          periodMetrics.weekly.visits,
                          goals.weekly.visits,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.weekly.visits,
                          goals.weekly.visits,
                        )}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.weekly.payments}
                        goal={goals.weekly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(
                          periodMetrics.weekly.payments,
                          goals.weekly.payments,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.weekly.payments,
                          goals.weekly.payments,
                        )}
                      />
                    </div>
                  </div>

                  {/* Coluna Este Mês */}
                  <div className="bg-white dark:bg-dark-bg rounded-lg p-4 border border-gray-200 dark:border-dark-border">
                    <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2 justify-center">
                      <CalendarRange className="w-5 h-5 text-purple-500" />
                      Este Mês
                    </h3>
                    <div className="space-y-6">
                      <RadialApprovalChart
                        current={periodMetrics.monthly.visits}
                        goal={goals.monthly.visits}
                        title="Visitas Realizadas"
                        showValues={true}
                        isCurrency={false}
                        level={getPerformanceLevel(
                          periodMetrics.monthly.visits,
                          goals.monthly.visits,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.monthly.visits,
                          goals.monthly.visits,
                        )}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.monthly.payments}
                        goal={goals.monthly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(
                          periodMetrics.monthly.payments,
                          goals.monthly.payments,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.monthly.payments,
                          goals.monthly.payments,
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Layout Mobile: Slides */}
                <div className="lg:hidden">
                  <div
                    className="relative overflow-hidden"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div
                      className="flex transition-transform duration-300 ease-in-out"
                      style={{
                        transform: `translateX(-${currentSlideIndex * 100}%)`,
                      }}
                    >
                      {mobileSlides.map((slide) => {
                        const metrics =
                          slide.id === "daily"
                            ? periodMetrics.daily
                            : slide.id === "weekly"
                              ? periodMetrics.weekly
                              : periodMetrics.monthly;
                        const goalsPeriod =
                          slide.id === "daily"
                            ? goals.daily
                            : slide.id === "weekly"
                              ? goals.weekly
                              : goals.monthly;
                        const Icon = slide.icon;

                        return (
                          <div key={slide.id} className="w-full flex-shrink-0">
                            <div className="bg-white dark:bg-dark-bg rounded-lg p-3 border border-gray-200 dark:border-dark-border">
                              <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                                <Icon
                                  className={`w-5 h-5 ${
                                    slide.color === "yellow"
                                      ? "text-yellow-500"
                                      : slide.color === "blue"
                                        ? "text-blue-500"
                                        : "text-purple-500"
                                  }`}
                                />
                                {slide.title}
                              </h3>
                              <div className="grid grid-cols-1 gap-2">
                                <RadialApprovalChart
                                  current={metrics.visits}
                                  goal={goalsPeriod.visits}
                                  title="Visitas Realizadas"
                                  showValues={true}
                                  isCurrency={false}
                                  level={getPerformanceLevel(
                                    metrics.visits,
                                    goalsPeriod.visits,
                                  )}
                                  motivationalMessage={getMotivationalMessage(
                                    metrics.visits,
                                    goalsPeriod.visits,
                                  )}
                                />
                                <RadialApprovalChart
                                  current={metrics.payments}
                                  goal={goalsPeriod.payments}
                                  title="Valor Recebido"
                                  showValues={true}
                                  isCurrency={true}
                                  level={getPerformanceLevel(
                                    metrics.payments,
                                    goalsPeriod.payments,
                                  )}
                                  motivationalMessage={getMotivationalMessage(
                                    metrics.payments,
                                    goalsPeriod.payments,
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Indicadores de navegação */}
                  <div className="flex justify-center mt-3 space-x-2">
                    {mobileSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        onClick={() => goToSlide(index)}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          index === currentSlideIndex
                            ? "w-8 bg-indigo-600 dark:bg-indigo-500"
                            : "w-2 bg-gray-300 dark:bg-dark-bg-tertiary hover:bg-gray-400 dark:hover:bg-dark-border"
                        }`}
                        aria-label={`Ir para ${slide.title}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "collections":
        if (isWalletCollector) {
          return renderInternalWallet();
        }

        return (
          <div>
            {showFilterBar && (
              <FilterBar
                filters={filters}
                onFilterChange={setFilters}
                userType={user?.type || "collector"}
              />
            )}
            <CollectionTable
              ref={collectionTableRef}
              collections={filteredCollections}
              userType={user?.type || "collector"}
              showGrouped={true}
              collectorId={user?.id}
              showFilterBar={showFilterBar}
              onToggleFilterBar={() => setShowFilterBar(!showFilterBar)}
            />
          </div>
        );

      case "route":
        if (isWalletCollector) {
          return renderInternalWallet();
        }
        return <RouteMap clientGroups={getClientGroups(user?.id)} />;

      case "visits":
        if (isWalletCollector) {
          return renderInternalWallet();
        }
        return <VisitScheduler />;

      case "contact-schedule":
        if (!isWalletCollector || !user?.id) return null;
        return <ContactScheduler collectorId={user.id} />;

      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-16 pt-16 lg:pt-16">
      {/* Tab Content */}
      <TabTransition activeKey={activeTab}>{renderTabContent()}</TabTransition>

      {/* Modais Globais (fora do TabTransition para evitar conflitos de stacking context) */}
      {isLogModalOpen && selectedClientForLog && (
        <LogContactModal
          client={selectedClientForLog}
          linkedVisit={linkedVisit}
          onClose={() => {
            setIsLogModalOpen(false);
            setSelectedClientForLog(null);
          }}
          onSuccess={() => {
            setIsLogModalOpen(false);
            setSelectedClientForLog(null);
            // Opcional: recarregar dados ou mostrar notificação
          }}
        />
      )}

      {cancelContactVisit && (
        <CancelContactModal
          visit={cancelContactVisit}
          onClose={() => setCancelContactVisit(null)}
          onSuccess={() => setCancelContactVisit(null)}
        />
      )}

      {isDetailModalOpen && selectedClientForDetail && (
        <ClientDetailModal
          clientGroup={selectedClientForDetail}
          userType={user?.type || "collector"}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedClientForDetail(null);
          }}
        />
      )}

      {isAcordoModalOpen && selectedClientForAcordo && (
        <AcordoModal
          client={selectedClientForAcordo}
          onClose={() => {
            setIsAcordoModalOpen(false);
            setSelectedClientForAcordo(null);
          }}
          onSuccess={() => {
            setIsAcordoModalOpen(false);
            setSelectedClientForAcordo(null);
          }}
        />
      )}

      {selectedAcordoId && (
        <AcordoDetailModal
          acordoId={selectedAcordoId}
          onClose={() => setSelectedAcordoId(null)}
        />
      )}
    </div>
  );
};

export default CollectorDashboard;
