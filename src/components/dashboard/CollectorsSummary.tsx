import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Info,
  Wallet,
  Users,
  AlertTriangle,
  CalendarClock,
  CalendarCheck2,
  RotateCcw,
  SearchX,
  UserX,
  Repeat,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Table2,
  Check,
  Gauge,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { isCollectorType, UserType, ClienteForaDaFaixa } from "../../types";
import { USER_TYPE_LABELS, isWalletCollectorType } from "../../config/profiles";
import {
  isVisitOverdue,
  lastVisitStatusByClient,
  visitEffectiveDate,
  todayLocalStr,
  REMARCACOES_REINCIDENTE,
  ReincidenteCliente,
} from "../../config/visitStatus";
import { hasInstallmentBalance } from "../../filters/clientStatus";
import { toYYYYMMDD } from "../../filters/dates";
import { formatCurrency, calculateOverdueDays } from "../../utils/formatters";
import ContactScheduler from "./ContactScheduler";

interface CollectorRow {
  id: string;
  name: string;
  type: UserType;
  // Situacao atual (nao depende do periodo escolhido).
  clientesCarteira: number;
  valorCarteira: number;
  vencidaQtd: number;
  vencidaValor: number;
  emAtrasoVisitas: number;
  semAgendamentoClientes: number;
  // No periodo [dateFrom, dateTo].
  previstaQtd: number;
  previstaValor: number;
  aReceberQtd: number;
  aReceberValor: number;
  recebidoPeriodo: number;
  agendadasQtd: number;
  agendadasValor: number;
  realizadasQtd: number;
  reagendadasQtd: number;
  reagendadasValor: number;
  naoEncontradoQtd: number;
  naoEncontradoValor: number;
  reincidentes: ReincidenteCliente[];
}

type PresetKey = "month-atual" | "today" | "week" | "month30" | "all";

// Chaves pelas quais a tabela/cards podem ser ordenados (clicando no titulo
// da coluna). "reincidentesQtd" nao e campo direto de CollectorRow (e o
// tamanho do array `reincidentes`), por isso o getter dedicado por chave em
// vez de indexar row[key] direto.
type SortKey =
  | "name"
  | "valorCarteira"
  | "vencidaValor"
  | "previstaValor"
  | "aReceberValor"
  | "recebidoPeriodo"
  | "emAtrasoVisitas"
  | "semAgendamentoClientes"
  | "agendadasQtd"
  | "realizadasQtd"
  | "reagendadasQtd"
  | "naoEncontradoQtd"
  | "reincidentesQtd";

const SORT_GETTERS: Record<SortKey, (row: CollectorRow) => number | string> =
  {
    name: (r) => r.name,
    valorCarteira: (r) => r.valorCarteira,
    vencidaValor: (r) => r.vencidaValor,
    previstaValor: (r) => r.previstaValor,
    aReceberValor: (r) => r.aReceberValor,
    recebidoPeriodo: (r) => r.recebidoPeriodo,
    emAtrasoVisitas: (r) => r.emAtrasoVisitas,
    semAgendamentoClientes: (r) => r.semAgendamentoClientes,
    agendadasQtd: (r) => r.agendadasQtd,
    realizadasQtd: (r) => r.realizadasQtd,
    reagendadasQtd: (r) => r.reagendadasQtd,
    naoEncontradoQtd: (r) => r.naoEncontradoQtd,
    reincidentesQtd: (r) => r.reincidentes.length,
  };

// Sentinelas para "Tudo": faixa larga o bastante pra cobrir qualquer registro
// real sem precisar de um caso especial "sem filtro" nas comparacoes de string.
const ALL_TIME_FROM = "2000-01-01";
const ALL_TIME_TO = "2099-12-31";

// Segmentacao tonal: Financeiro (parcelas de BANCO_DADOS) sempre no cinza mais
// claro, Agenda (scheduledVisits) no cinza um pouco mais escuro — mesma dupla
// de tons em todo lugar que separa os dois dominios (totais, cards, tabela),
// pra reforcar visualmente a independencia entre eles sem depender so do texto.
const TONE_FINANCEIRO = "bg-gray-50 dark:bg-white/[0.03]";
const TONE_AGENDA = "bg-gray-100/80 dark:bg-white/[0.07]";

// Atalhos do filtro de periodo. "Mes atual" e o padrao pedido pelo gestor —
// cobre a pergunta mais comum sem exigir configuracao. "Tudo" remove o filtro
// de periodo pra mostrar o total geral, sem recorte de data.
const RANGE_PRESETS: { key: PresetKey; label: string }[] = [
  { key: "month-atual", label: "Mês atual" },
  { key: "today", label: "Hoje" },
  { key: "week", label: "7 dias" },
  { key: "month30", label: "30 dias" },
  { key: "all", label: "Tudo" },
];

const addDaysStr = (base: string, days: number): string => {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

/** Primeiro dia do mes de uma data YYYY-MM-DD. */
const monthStart = (base: string): string => `${base.slice(0, 7)}-01`;

/** Ultimo dia do mes de uma data YYYY-MM-DD. Usa so getters UTC (ver CLAUDE.md
 * sobre nao misturar data local/UTC). */
const monthEnd = (base: string): string => {
  const [y, m] = base.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

/** dd/mm/aaaa a partir de uma string YYYY-MM-DD, sem passar por Date (ver CLAUDE.md). */
const toBr = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const StatTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  periodHint?: string;
  tone?: "neutral" | "red" | "amber" | "green" | "blue";
  size?: "md" | "lg";
}> = ({
  icon: Icon,
  label,
  value,
  sub,
  periodHint,
  tone = "neutral",
  size = "md",
}) => {
  const toneClasses: Record<string, string> = {
    neutral: "text-gray-700 dark:text-dark-text",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    green: "text-green-600 dark:text-green-400",
    blue: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="min-w-0 rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 min-w-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      {periodHint && (
        <div className="text-[9px] font-normal text-gray-400 dark:text-dark-text-secondary opacity-70 truncate">
          {periodHint}
        </div>
      )}
      <div
        className={`mt-1 font-bold truncate ${size === "lg" ? "text-xl" : "text-base"} ${toneClasses[tone]}`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary truncate">
          {sub}
        </div>
      )}
    </div>
  );
};

const Badge: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  unit?: string;
  money?: string;
  tone?: "neutral" | "red" | "amber";
  onClick?: () => void;
}> = ({
  icon: Icon,
  label,
  value,
  unit,
  money,
  tone = "neutral",
  onClick,
}) => {
  const toneClasses: Record<string, string> = {
    neutral:
      "bg-gray-100 text-gray-600 dark:bg-dark-bg dark:text-dark-text-secondary",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left ${toneClasses[tone]} ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-medium">{label}</span>
        <span className="text-xs font-bold">
          {value}
          {unit ? ` ${unit}` : ""}
        </span>
        {money && <span className="text-[10px] opacity-70">{money}</span>}
      </span>
    </Tag>
  );
};

/** Titulo de coluna clicavel pra ordenar a tabela, com seta indicando a
 * coluna/direcao ativa. */
const SortTh: React.FC<{
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}> = ({ active, dir, onClick, className = "", children }) => (
  <th
    onClick={onClick}
    className={`cursor-pointer select-none hover:text-gray-600 dark:hover:text-dark-text ${className}`}
  >
    <span className="inline-flex items-center gap-0.5">
      {children}
      {active &&
        (dir === "desc" ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        ))}
    </span>
  </th>
);

const CollectorsSummary: React.FC = () => {
  const {
    users,
    collections,
    scheduledVisits,
    salePayments,
    monthlyGoals,
    managerCollectorLinks,
  } = useCollection();
  const { user: currentUser } = useAuth();

  const today = todayLocalStr();
  const [dateFrom, setDateFrom] = useState(monthStart(today));
  const [dateTo, setDateTo] = useState(monthEnd(today));
  const [activePreset, setActivePreset] = useState<PresetKey | "">(
    "month-atual",
  );
  const [expandedReincidente, setExpandedReincidente] = useState<
    string | null
  >(null);
  // Agendamento em massa de contato (ligação/WhatsApp) pro gestor, sem
  // precisar logar como o cobrador -- ver ContactScheduler.
  const [scheduleContactCollectorId, setScheduleContactCollectorId] =
    useState<string | null>(null);
  // Tabela e melhor pra comparar/rankear muitos cobradores (a lista ja vem
  // ordenada por vencidaValor); Cards fica melhor pra olhar 1-2 em detalhe —
  // por isso o padrao (sem preferencia salva) e Tabela.
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => {
    const saved = localStorage.getItem("collectorsSummaryViewMode");
    return saved === "cards" ? "cards" : "table";
  });
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  // "Visao geral" e sempre colapsavel, em qualquer contexto (1 cobrador ou
  // vários) — o botao no cabecalho funciona igual nos dois casos. Só o
  // VALOR PADRAO muda: comeca fechada quando sobra 1 só (ver efeito abaixo,
  // apos `rows`), porque af os totais seriam identicos ao card/linha unica.
  const [overviewOpen, setOverviewOpen] = useState(true);
  const prevSingleRef = useRef(false);
  // Carteira automatica por faixa de atraso (etapas 7/8 da iniciativa de
  // metas/vinculo/carteira automatica): consulta sob demanda (nao carrega
  // sozinho) porque clientes_fora_da_faixa() varre todo cliente atribuido
  // a um cobrador com faixa cadastrada -- mesma cautela de outras cargas
  // pesadas do gestor neste projeto (ver collectionsRequested).
  const [faixaOpen, setFaixaOpen] = useState(false);
  const [foraDaFaixa, setForaDaFaixa] = useState<ClienteForaDaFaixa[] | null>(
    null,
  );
  const [loadingForaDaFaixa, setLoadingForaDaFaixa] = useState(false);
  const [saidasNoPeriodo, setSaidasNoPeriodo] = useState<
    | {
        documento: string;
        clienteNome: string | null;
        cobradorAnteriorId: string | null;
        assignedAt: string;
      }[]
    | null
  >(null);

  const consultarCarteiraAutomatica = async () => {
    setLoadingForaDaFaixa(true);
    try {
      const [foraRes, saidasRes] = await Promise.all([
        supabase.rpc("clientes_fora_da_faixa"),
        supabase
          .from("atribuicoes_historico")
          .select("documento, cliente_nome, cobrador_anterior_id, assigned_at")
          // fora_da_faixa = automacao antiga (nunca ligada);
          // distribuicao_regra = Distribuicao da carteira. So quem SAIU de
          // um cobrador (entrada de quem estava sem cobrador nao conta).
          .in("motivo", ["fora_da_faixa", "distribuicao_regra"])
          .not("cobrador_anterior_id", "is", null)
          .gte("assigned_at", `${dateFrom}T00:00:00`)
          .lte("assigned_at", `${dateTo}T23:59:59`)
          .order("assigned_at", { ascending: false }),
      ]);

      if (foraRes.error) throw foraRes.error;
      if (saidasRes.error) throw saidasRes.error;

      setForaDaFaixa(
        (foraRes.data ?? []).map((r) => ({
          documento: r.documento,
          cliente: r.cliente,
          collectorId: r.collector_id,
          collectorName: r.collector_name,
          atrasoAtual: r.atraso_atual,
          faixaMin: r.faixa_min,
          faixaMax: r.faixa_max,
          diasExcedidos: r.dias_excedidos,
          bloqueadoPor: r.bloqueado_por,
        })),
      );
      setSaidasNoPeriodo(
        (saidasRes.data ?? []).map((r) => ({
          documento: r.documento,
          clienteNome: r.cliente_nome,
          cobradorAnteriorId: r.cobrador_anterior_id,
          assignedAt: r.assigned_at,
        })),
      );
    } catch (err) {
      console.error("Erro ao consultar carteira automática por faixa:", err);
    } finally {
      setLoadingForaDaFaixa(false);
    }
  };
  // Conjunto dos EXCLUIDOS (nao dos selecionados). Vazio = nada excluido =
  // todos aparecem; cheio (todo allCollectors) = todos excluidos = nenhum
  // aparece. Essa inversao deixa representar os 3 estados (todos/parcial/
  // nenhum) sem ambiguidade — com "selecionados" o conjunto vazio nao
  // consegue distinguir "todos" de "nenhum".
  const [excludedCollectorIds, setExcludedCollectorIds] = useState<
    Set<string>
  >(new Set());
  const [collectorMenuOpen, setCollectorMenuOpen] = useState(false);
  const collectorMenuRef = useRef<HTMLDivElement>(null);
  // Ordenacao (clicavel no titulo da coluna, tabela e cards compartilham).
  // Padrao: pior situacao primeiro, igual ao comportamento anterior fixo.
  const [sortKey, setSortKey] = useState<SortKey>("vencidaValor");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      // Nome comeca de A->Z (asc) por ser o mais intuitivo pra texto; os
      // demais comecam do maior valor (desc, "pior"/"mais" primeiro).
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  useEffect(() => {
    localStorage.setItem("collectorsSummaryViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        collectorMenuRef.current &&
        !collectorMenuRef.current.contains(e.target as Node)
      ) {
        setCollectorMenuOpen(false);
      }
    };
    if (collectorMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [collectorMenuOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    };
    if (infoOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [infoOpen]);

  const applyPreset = (key: PresetKey) => {
    setActivePreset(key);
    if (key === "month-atual") {
      setDateFrom(monthStart(today));
      setDateTo(monthEnd(today));
      return;
    }
    if (key === "all") {
      setDateFrom(ALL_TIME_FROM);
      setDateTo(ALL_TIME_TO);
      return;
    }
    const daysByKey: Record<"today" | "week" | "month30", number> = {
      today: 0,
      week: 7,
      month30: 30,
    };
    setDateFrom(today);
    setDateTo(addDaysStr(today, daysByKey[key]));
  };

  const inPeriod = (dateStr: string | undefined | null): boolean =>
    !!dateStr && dateStr >= dateFrom && dateStr <= dateTo;

  const lastVisitStatus = useMemo(
    () => lastVisitStatusByClient(scheduledVisits),
    [scheduledVisits],
  );

  const allCollectors = useMemo(
    () => users.filter((u) => isCollectorType(u.type) && u.active !== false),
    [users],
  );

  const toggleCollector = (id: string) => {
    setExcludedCollectorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Alterna entre "todos" (nada excluido) e "nenhum" (todos excluidos) —
  // parte de qualquer estado parcial, sempre cai num dos dois extremos.
  const toggleSelectAll = () => {
    setExcludedCollectorIds((prev) =>
      prev.size === 0 ? new Set(allCollectors.map((c) => c.id)) : new Set(),
    );
  };

  const isCollectorChecked = (id: string) => !excludedCollectorIds.has(id);

  const rows = useMemo<CollectorRow[]>(() => {
    const collectors = allCollectors.filter(
      (c) => !excludedCollectorIds.has(c.id),
    );

    return collectors
      .map((collector) => {
        const myCollections = collections.filter(
          (c) => c.user_id === collector.id,
        );

        const clientesCarteiraSet = new Set<string>();
        let valorCarteira = 0;
        let vencidaQtd = 0;
        let vencidaValor = 0;
        let previstaQtd = 0;
        let previstaValor = 0;
        let aReceberQtd = 0;
        let aReceberValor = 0;

        myCollections.forEach((c) => {
          if (!hasInstallmentBalance(c)) return;
          const saldo =
            (c.valor_original || 0) -
            (c.valor_recebido || 0) -
            (c.desconto || 0);
          if (c.documento) clientesCarteiraSet.add(c.documento);
          valorCarteira += saldo;

          // data_vencimento vem de BANCO_DADOS (coluna text; ~29% das linhas
          // em DD/MM/YYYY misturado com YYYY-MM-DD, ver filters/dates.ts) —
          // nunca comparar a string crua com today/dateFrom/dateTo (CLAUDE.md).
          const venc = toYYYYMMDD(c.data_vencimento);
          // Vencida: ja passou, independe do filtro de periodo (e "agora").
          // Mesma regra de "vencido" usada em CollectorDashboard/CollectionTable/
          // EnhancedStoreManagement (calculateOverdueDays > 0).
          // Prevista: dentro do periodo escolhido E ainda nao venceu — respeita
          // tanto dateFrom quanto dateTo, mesmo quando o periodo e so futuro.
          if (calculateOverdueDays(c.data_vencimento) > 0) {
            vencidaQtd++;
            vencidaValor += saldo;
          } else if (venc && venc >= dateFrom && venc <= dateTo) {
            previstaQtd++;
            previstaValor += saldo;
          } else {
            aReceberQtd++;
            aReceberValor += saldo;
          }
        });

        const recebidoPeriodo = salePayments
          .filter(
            (p) => p.collectorId === collector.id && inPeriod(p.paymentDate),
          )
          .reduce((sum, p) => sum + p.paymentAmount, 0);

        const myVisits = scheduledVisits.filter(
          (v) => v.collectorId === collector.id,
        );

        // Em atraso: situacao atual (visita aberta com data ja passada), nao
        // filtra por periodo — e um alerta de "agora", nao do intervalo.
        const emAtrasoVisitas = myVisits.filter((v) =>
          isVisitOverdue(v),
        ).length;

        const semAgendamentoClientes = Array.from(
          clientesCarteiraSet,
        ).filter((doc) => lastVisitStatus.get(doc) !== "agendada").length;

        let agendadasQtd = 0;
        let agendadasValor = 0;
        let realizadasQtd = 0;
        let reagendadasQtd = 0;
        let reagendadasValor = 0;
        let naoEncontradoQtd = 0;
        let naoEncontradoValor = 0;
        const remarcacoesPorCliente = new Map<
          string,
          { name: string; count: number }
        >();

        myVisits.forEach((v) => {
          if (!inPeriod(visitEffectiveDate(v))) return;
          const titleValue = Number(v.totalPendingValue || 0);
          if (v.status === "agendada" && !isVisitOverdue(v)) {
            agendadasQtd++;
            agendadasValor += titleValue;
          }
          if (v.status === "realizada") realizadasQtd++;
          if (v.status === "nao_encontrado") {
            naoEncontradoQtd++;
            naoEncontradoValor += titleValue;
          }
          if (v.status === "reagendada") {
            reagendadasQtd++;
            reagendadasValor += titleValue;
            if (v.clientDocument) {
              const atual = remarcacoesPorCliente.get(v.clientDocument);
              remarcacoesPorCliente.set(v.clientDocument, {
                name: atual?.name || v.clientName || v.clientDocument,
                count: (atual?.count ?? 0) + 1,
              });
            }
          }
        });

        const reincidentes: ReincidenteCliente[] = Array.from(
          remarcacoesPorCliente.entries(),
        )
          .filter(([, v]) => v.count >= REMARCACOES_REINCIDENTE)
          .map(([document, v]) => ({ document, name: v.name, count: v.count }))
          .sort((a, b) => b.count - a.count);

        return {
          id: collector.id,
          name: collector.name,
          type: collector.type,
          clientesCarteira: clientesCarteiraSet.size,
          valorCarteira,
          vencidaQtd,
          vencidaValor,
          emAtrasoVisitas,
          semAgendamentoClientes,
          previstaQtd,
          previstaValor,
          aReceberQtd,
          aReceberValor,
          recebidoPeriodo,
          agendadasQtd,
          agendadasValor,
          realizadasQtd,
          reagendadasQtd,
          reagendadasValor,
          naoEncontradoQtd,
          naoEncontradoValor,
          reincidentes,
        };
      })
      .sort((a, b) => {
        const va = SORT_GETTERS[sortKey](a);
        const vb = SORT_GETTERS[sortKey](b);
        const cmp =
          typeof va === "string" || typeof vb === "string"
            ? String(va).localeCompare(String(vb), "pt-BR")
            : va - vb;
        return sortDir === "asc" ? cmp : -cmp;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allCollectors,
    excludedCollectorIds,
    collections,
    scheduledVisits,
    salePayments,
    lastVisitStatus,
    dateFrom,
    dateTo,
    today,
    sortKey,
    sortDir,
  ]);

  // Colapsa "Visao geral" sozinha na TRANSICAO pra 1 cobrador so (nao soca o
  // dedo do usuario: se ele reabrir manualmente enquanto ainda for so 1, o
  // efeito nao roda de novo — só reage a mudanca de "nao-1" pra "1").
  useEffect(() => {
    const isSingleNow = rows.length === 1;
    if (isSingleNow && !prevSingleRef.current) {
      setOverviewOpen(false);
    }
    prevSingleRef.current = isSingleNow;
  }, [rows.length]);

  // Cards globais: soma simples dos cobradores visiveis no momento (respeita
  // filtro de cobrador E de periodo, porque reusa `rows` ja filtrado/calculado
  // — nao ha uma segunda logica de agregacao para divergir da primeira).
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          clientesCarteira: acc.clientesCarteira + r.clientesCarteira,
          valorCarteira: acc.valorCarteira + r.valorCarteira,
          vencidaQtd: acc.vencidaQtd + r.vencidaQtd,
          vencidaValor: acc.vencidaValor + r.vencidaValor,
          emAtrasoVisitas: acc.emAtrasoVisitas + r.emAtrasoVisitas,
          semAgendamentoClientes:
            acc.semAgendamentoClientes + r.semAgendamentoClientes,
          previstaQtd: acc.previstaQtd + r.previstaQtd,
          previstaValor: acc.previstaValor + r.previstaValor,
          aReceberQtd: acc.aReceberQtd + r.aReceberQtd,
          aReceberValor: acc.aReceberValor + r.aReceberValor,
          recebidoPeriodo: acc.recebidoPeriodo + r.recebidoPeriodo,
          agendadasQtd: acc.agendadasQtd + r.agendadasQtd,
          agendadasValor: acc.agendadasValor + r.agendadasValor,
          realizadasQtd: acc.realizadasQtd + r.realizadasQtd,
          reagendadasQtd: acc.reagendadasQtd + r.reagendadasQtd,
          reagendadasValor: acc.reagendadasValor + r.reagendadasValor,
          naoEncontradoQtd: acc.naoEncontradoQtd + r.naoEncontradoQtd,
          naoEncontradoValor: acc.naoEncontradoValor + r.naoEncontradoValor,
          reincidentesQtd: acc.reincidentesQtd + r.reincidentes.length,
        }),
        {
          clientesCarteira: 0,
          valorCarteira: 0,
          vencidaQtd: 0,
          vencidaValor: 0,
          emAtrasoVisitas: 0,
          semAgendamentoClientes: 0,
          previstaQtd: 0,
          previstaValor: 0,
          aReceberQtd: 0,
          aReceberValor: 0,
          recebidoPeriodo: 0,
          agendadasQtd: 0,
          agendadasValor: 0,
          realizadasQtd: 0,
          reagendadasQtd: 0,
          reagendadasValor: 0,
          naoEncontradoQtd: 0,
          naoEncontradoValor: 0,
          reincidentesQtd: 0,
        },
      ),
    [rows],
  );

  // Meta da equipe do gestor logado: soma das metas mensais (monthly_goals)
  // dos cobradores atualmente vinculados a ele (manager_collector_links),
  // contra o recuperado por eles no MES ATUAL -- sempre mes atual, nao o
  // periodo escolhido no filtro acima (meta e mensal por natureza; um
  // periodo arbitrario nao bate com "meta do mes"). Nao e bonificacao/
  // comissao (isso fica pra depois, decisao do usuario) -- so visibilidade.
  const teamGoal = useMemo(() => {
    if (!currentUser || currentUser.type !== "manager") return null;
    const mesAtual = today.slice(0, 7);
    const teamCollectorIds = new Set(
      managerCollectorLinks
        .filter((l) => l.managerId === currentUser.id)
        .map((l) => l.collectorId),
    );
    if (teamCollectorIds.size === 0) return null;

    const targetValue = monthlyGoals
      .filter(
        (g) => teamCollectorIds.has(g.user_id) && g.month.startsWith(mesAtual),
      )
      .reduce((sum, g) => sum + (g.payments_goal || 0), 0);
    const actualValue = salePayments
      .filter(
        (p) =>
          teamCollectorIds.has(p.collectorId) &&
          p.paymentDate.startsWith(mesAtual),
      )
      .reduce((sum, p) => sum + p.paymentAmount, 0);

    if (targetValue <= 0) return null;

    return {
      collectorCount: teamCollectorIds.size,
      targetValue,
      actualValue,
      progress: Math.min((actualValue / targetValue) * 100, 100),
      remaining: Math.max(0, targetValue - actualValue),
    };
  }, [currentUser, managerCollectorLinks, monthlyGoals, salePayments, today]);

  const collectorFilterLabel =
    excludedCollectorIds.size === 0
      ? "Todos os cobradores"
      : excludedCollectorIds.size >= allCollectors.length
        ? "Nenhum cobrador"
        : `${allCollectors.length - excludedCollectorIds.size} de ${allCollectors.length} cobradores`;

  // Legenda curta do periodo filtrado, pra lembrar o usuario o que "Vence no
  // periodo" esta considerando sem precisar olhar o filtro la em cima.
  const previstaPeriodHint =
    activePreset === "all" ? "sem limite" : `${toBr(dateFrom)}–${toBr(dateTo)}`;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
            <ClipboardList className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            Resumo por Cobrador
            <div className="relative ml-1.5" ref={infoRef}>
              <button
                onClick={() => setInfoOpen((v) => !v)}
                className="text-gray-300 hover:text-blue-600 dark:text-dark-text-secondary dark:hover:text-blue-400"
                aria-label="O que significa cada número"
              >
                <Info className="h-4 w-4" />
              </button>
              {infoOpen && (
                <div className="absolute z-20 mt-2 w-72 rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-xs font-normal normal-case text-blue-700 dark:text-blue-300 shadow-lg">
                  <strong>Carteira, Vencida, Em atraso</strong> e{" "}
                  <strong>Sem agendamento</strong> são a situação de agora; os
                  demais valem só pro período selecionado.{" "}
                  <strong>Financeiro</strong> e <strong>Agenda</strong> são
                  independentes — parcela e visita não precisam coincidir.
                </div>
              )}
            </div>
          </h2>

          <div className="flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              className={`flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-all touch-manipulation ${
                viewMode === "cards"
                  ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
              Cards
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-all touch-manipulation ${
                viewMode === "table"
                  ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
              }`}
            >
              <Table2 className="h-3.5 w-3.5 mr-1.5" />
              Tabela
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => applyPreset(preset.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors touch-manipulation ${
                activePreset === preset.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
              }`}
            >
              {preset.label}
            </button>
          ))}

          <div className="relative" ref={collectorMenuRef}>
            <button
              onClick={() => setCollectorMenuOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors touch-manipulation ${
                excludedCollectorIds.size > 0
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              {collectorFilterLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {collectorMenuOpen && (
              <div className="absolute z-20 mt-1 w-64 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary shadow-lg p-2">
                <button
                  onClick={toggleSelectAll}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  {excludedCollectorIds.size === 0
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-dark-border/40" />
                {allCollectors.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg cursor-pointer"
                  >
                    <span
                      className={`flex items-center justify-center h-4 w-4 rounded border ${
                        isCollectorChecked(c.id)
                          ? "bg-blue-600 border-blue-600"
                          : "border-gray-300 dark:border-dark-border"
                      }`}
                    >
                      {isCollectorChecked(c.id) && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </span>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={isCollectorChecked(c.id)}
                      onChange={() => toggleCollector(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100 dark:border-dark-border/40">
          <span className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
            Período personalizado:
          </span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-text-secondary">
            De
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setActivePreset("");
              }}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-text-secondary">
            Até
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => {
                setDateTo(e.target.value);
                setActivePreset("");
              }}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text"
            />
          </label>
          <span className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
            {activePreset === "all"
              ? "(sem filtro de período — todos os registros)"
              : `(${toBr(dateFrom)} até ${toBr(dateTo)})`}
          </span>
        </div>
      </div>

      {teamGoal && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border-2 border-indigo-100 dark:border-indigo-900/40 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 dark:text-dark-text">
              Meta da equipe (mês atual)
            </span>
            <span className="text-xs font-normal text-gray-400 dark:text-dark-text-secondary">
              {teamGoal.collectorCount}{" "}
              {teamGoal.collectorCount === 1 ? "cobrador" : "cobradores"}
            </span>
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-gray-500">
              {formatCurrency(teamGoal.actualValue, false)} de{" "}
              {formatCurrency(teamGoal.targetValue, false)}
            </span>
            <span className="text-indigo-600">
              {teamGoal.progress.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-dark-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600"
              style={{ width: `${teamGoal.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {teamGoal.remaining > 0
              ? `Faltam ${formatCurrency(teamGoal.remaining, false)} para a meta da equipe`
              : "Meta da equipe atingida"}
          </p>
        </div>
      )}

      {/* Carteira automatica por faixa de atraso: so leitura -- quem saiu
          das regras do proprio cobrador e quem ja foi movido no periodo
          (atribuicoes_historico). Mover de fato e na tela Distribuicao da
          carteira (simular -> aplicar). */}
      {currentUser?.type === "manager" && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border-2 border-pink-100 dark:border-pink-900/40 p-4 space-y-3">
          <button
            onClick={() => setFaixaOpen((o) => !o)}
            className="w-full flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-dark-text"
          >
            <AlertTriangle className="h-4 w-4 text-pink-600 dark:text-pink-400" />
            Carteira automática por faixa de atraso
            {faixaOpen ? (
              <ChevronUp className="h-3.5 w-3.5 ml-auto text-gray-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 ml-auto text-gray-400" />
            )}
          </button>

          {faixaOpen && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  Consulta sob demanda -- varre todo cliente atribuído a um
                  cobrador com faixa cadastrada.
                </p>
                <button
                  onClick={consultarCarteiraAutomatica}
                  disabled={loadingForaDaFaixa}
                  className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs font-bold hover:bg-pink-700 disabled:opacity-50"
                >
                  {loadingForaDaFaixa ? "Consultando..." : "Consultar"}
                </button>
              </div>

              {foraDaFaixa && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 dark:text-dark-text-secondary">
                    Perto de sair da carteira agora ({foraDaFaixa.length})
                  </p>
                  {foraDaFaixa.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      Nenhum cliente ultrapassou a faixa do próprio cobrador.
                    </p>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 dark:border-dark-border rounded-lg">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 dark:bg-dark-bg text-gray-500">
                          <tr>
                            <th className="px-3 py-2 font-bold">Cliente</th>
                            <th className="px-3 py-2 font-bold">Cobrador</th>
                            <th className="px-3 py-2 font-bold text-center">
                              Atraso
                            </th>
                            <th className="px-3 py-2 font-bold text-center">
                              Faixa
                            </th>
                            <th className="px-3 py-2 font-bold text-center">
                              Excedeu por
                            </th>
                            <th className="px-3 py-2 font-bold">Situação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                          {[...foraDaFaixa]
                            .sort((a, b) => {
                              if (!!a.bloqueadoPor !== !!b.bloqueadoPor) {
                                return a.bloqueadoPor ? 1 : -1;
                              }
                              return (b.diasExcedidos ?? 0) - (a.diasExcedidos ?? 0);
                            })
                            .map((c) => (
                              <tr key={c.documento}>
                                <td className="px-3 py-2 font-medium text-gray-800 dark:text-dark-text">
                                  {c.cliente ?? c.documento}
                                </td>
                                <td className="px-3 py-2 text-gray-500">
                                  {c.collectorName ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {c.atrasoAtual} dias
                                </td>
                                <td className="px-3 py-2 text-center text-gray-400">
                                  {c.faixaMin != null
                                    ? `${c.faixaMin}–${c.faixaMax}`
                                    : "Loja fora das regras"}
                                </td>
                                <td className="px-3 py-2 text-center font-bold text-pink-600">
                                  {c.diasExcedidos != null
                                    ? `+${c.diasExcedidos} dias`
                                    : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  {c.bloqueadoPor ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
                                      {c.bloqueadoPor === "acordo_ativo"
                                        ? "Travado: acordo ativo"
                                        : "Travado: visita agendada"}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-600 border border-pink-100">
                                      Fora da regra
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {saidasNoPeriodo && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 dark:text-dark-text-secondary">
                    Saíram da carteira por faixa no período ({saidasNoPeriodo.length})
                  </p>
                  {saidasNoPeriodo.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      Nenhuma saída automática registrada no período.
                    </p>
                  ) : (
                    <ul className="text-xs divide-y divide-gray-100 dark:divide-dark-border border border-gray-100 dark:border-dark-border rounded-lg">
                      {saidasNoPeriodo.map((s) => (
                        <li
                          key={`${s.documento}-${s.assignedAt}`}
                          className="px-3 py-2 flex items-center justify-between"
                        >
                          <span className="font-medium text-gray-800 dark:text-dark-text">
                            {s.clienteNome ?? s.documento}
                          </span>
                          <span className="text-gray-400">
                            {new Date(s.assignedAt).toLocaleDateString("pt-BR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Visao geral: soma de todos os cobradores visiveis no momento. Fica
          visivel nos dois modos (Cards e Tabela), conforme pedido. O
          cabecalho (com o botao de colapsar) e sempre o mesmo, com 1
          cobrador ou com varios — só o valor PADRAO de `overviewOpen` muda
          (comeca fechada ao cair pra 1 so, ver efeito acima; o usuario pode
          abrir/fechar manualmente depois, em qualquer contagem). */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border-2 border-blue-100 dark:border-blue-900/40 p-4 space-y-3">
        <button
          onClick={() => setOverviewOpen((o) => !o)}
          className="w-full flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-dark-text"
        >
          <Gauge className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Visão geral
          <span className="text-xs font-normal text-gray-400 dark:text-dark-text-secondary">
            ({rows.length}{" "}
            {rows.length === 1 ? "cobrador" : "cobradores"})
          </span>
          {overviewOpen ? (
            <ChevronUp className="h-3.5 w-3.5 ml-auto text-gray-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 ml-auto text-gray-400" />
          )}
        </button>

        {overviewOpen && (
        <>
        <div className="space-y-2">
          <div
            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary ${TONE_FINANCEIRO}`}
          >
            Financeiro (parcelas)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile
              icon={Wallet}
              label="Carteira"
              value={formatCurrency(totals.valorCarteira, false)}
              sub={`${totals.clientesCarteira} clientes`}
              size="lg"
            />
            <StatTile
              icon={AlertTriangle}
              label="Vencida"
              value={formatCurrency(totals.vencidaValor, false)}
              sub={`${totals.vencidaQtd} parcelas`}
              tone="red"
              size="lg"
            />
            <StatTile
              icon={CalendarCheck2}
              label="Vence no período"
              value={formatCurrency(totals.previstaValor, false)}
              sub={`${totals.previstaQtd} parcelas`}
              periodHint={previstaPeriodHint}
              tone="amber"
              size="lg"
            />
            <StatTile
              icon={Wallet}
              label="Recebido"
              value={formatCurrency(totals.recebidoPeriodo, false)}
              tone="green"
              size="lg"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div
            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary ${TONE_AGENDA}`}
          >
            Agenda (visitas/contatos)
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              icon={CalendarClock}
              label="Em atraso"
              value={totals.emAtrasoVisitas}
              unit="agendamentos"
              tone={totals.emAtrasoVisitas > 0 ? "red" : "neutral"}
            />
            <Badge
              icon={UserX}
              label="Sem agendamento"
              value={totals.semAgendamentoClientes}
              unit="clientes"
            />
            <Badge
              icon={CalendarCheck2}
              label="Agendamentos"
              value={totals.agendadasQtd}
              unit="agendamentos"
              money={formatCurrency(totals.agendadasValor, false)}
            />
            <Badge
              icon={Users}
              label="Realizadas"
              value={totals.realizadasQtd}
              unit="agendamentos"
            />
            <Badge
              icon={RotateCcw}
              label="Reagendamentos"
              value={totals.reagendadasQtd}
              unit="agendamentos"
              money={formatCurrency(totals.reagendadasValor, false)}
            />
            <Badge
              icon={SearchX}
              label="Não encontrado"
              value={totals.naoEncontradoQtd}
              unit="agendamentos"
              money={formatCurrency(totals.naoEncontradoValor, false)}
            />
            <Badge
              icon={Repeat}
              label="Reincidências"
              value={totals.reincidentesQtd}
              unit="clientes"
              tone={totals.reincidentesQtd > 0 ? "amber" : "neutral"}
            />
          </div>
        </div>
        </>
        )}
      </div>

      {viewMode === "cards" ? (
        // Com 1 cobrador so, o card usa a largura toda em vez de ficar
        // espremido num terco da tela — nao ha mais ninguem pra formar grid.
        <div
          className={
            rows.length === 1
              ? "grid grid-cols-1 gap-4"
              : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          }
        >
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5 flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 dark:bg-dark-bg text-[10px] font-bold text-gray-500 dark:text-dark-text-secondary">
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-bold text-gray-900 dark:text-dark-text">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {USER_TYPE_LABELS[row.type]}
                    </div>
                    {isWalletCollectorType(row.type) && (
                      <button
                        type="button"
                        onClick={() => setScheduleContactCollectorId(row.id)}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                      >
                        <CalendarClock className="h-3 w-3" />
                        Agendar em massa
                      </button>
                    )}
                  </div>
                </div>
                {row.vencidaValor > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    vencida
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <StatTile
                    icon={Wallet}
                    label="Carteira"
                    value={formatCurrency(row.valorCarteira, false)}
                    sub={`${row.clientesCarteira} clientes`}
                    size="lg"
                  />
                  <StatTile
                    icon={AlertTriangle}
                    label="Vencida"
                    value={formatCurrency(row.vencidaValor, false)}
                    sub={`${row.vencidaQtd} parcelas`}
                    tone="red"
                    size="lg"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    icon={CalendarClock}
                    label="Em atraso"
                    value={row.emAtrasoVisitas}
                    unit="agendamentos"
                    tone={row.emAtrasoVisitas > 0 ? "red" : "neutral"}
                  />
                  <Badge
                    icon={UserX}
                    label="Sem agendamento"
                    value={row.semAgendamentoClientes}
                    unit="clientes"
                    tone="neutral"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 dark:border-dark-border/40 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <StatTile
                    icon={CalendarCheck2}
                    label="Vence no período"
                    value={formatCurrency(row.previstaValor, false)}
                    sub={`${row.previstaQtd} parc.`}
                    periodHint={previstaPeriodHint}
                    tone="amber"
                  />
                  <StatTile
                    icon={Wallet}
                    label="A receber"
                    value={formatCurrency(row.aReceberValor, false)}
                    sub={`${row.aReceberQtd} parc.`}
                    tone="blue"
                  />
                  <StatTile
                    icon={Wallet}
                    label="Recebido"
                    value={formatCurrency(row.recebidoPeriodo, false)}
                    tone="green"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    icon={CalendarCheck2}
                    label="Agendamentos"
                    value={row.agendadasQtd}
                    unit="agendamentos"
                    money={formatCurrency(row.agendadasValor, false)}
                  />
                  <Badge
                    icon={Users}
                    label="Realizadas"
                    value={row.realizadasQtd}
                    unit="agendamentos"
                  />
                  <Badge
                    icon={RotateCcw}
                    label="Reagendamentos"
                    value={row.reagendadasQtd}
                    unit="agendamentos"
                    money={formatCurrency(row.reagendadasValor, false)}
                  />
                  <Badge
                    icon={SearchX}
                    label="Não encontrado"
                    value={row.naoEncontradoQtd}
                    unit="agendamentos"
                    money={formatCurrency(row.naoEncontradoValor, false)}
                  />
                  <Badge
                    icon={Repeat}
                    label="Reincidências"
                    value={row.reincidentes.length}
                    unit="clientes"
                    tone={row.reincidentes.length > 0 ? "amber" : "neutral"}
                    onClick={
                      row.reincidentes.length > 0
                        ? () =>
                            setExpandedReincidente((cur) =>
                              cur === row.id ? null : row.id,
                            )
                        : undefined
                    }
                  />
                  {row.reincidentes.length > 0 &&
                    (expandedReincidente === row.id ? (
                      <ChevronUp className="h-3.5 w-3.5 text-gray-400 self-center" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 self-center" />
                    ))}
                </div>
                {expandedReincidente === row.id && (
                  <ul className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                    {row.reincidentes.map((r) => (
                      <li key={r.document} className="flex justify-between">
                        <span>{r.name}</span>
                        <span className="font-semibold">{r.count}x</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="col-span-full bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border px-6 py-12 text-center text-sm text-gray-400 dark:text-dark-text-secondary">
              Nenhum cobrador encontrado para esse filtro.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[9px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-wider">
                <th className="px-3 py-1.5 bg-gray-50 dark:bg-dark-bg/50" />
                <th className="px-3 py-1.5 bg-gray-50 dark:bg-dark-bg/50" />
                <th
                  colSpan={5}
                  className={`px-3 py-1.5 text-center border-l border-gray-200 dark:border-dark-border ${TONE_FINANCEIRO}`}
                >
                  Financeiro (parcelas)
                </th>
                <th
                  colSpan={7}
                  className={`px-3 py-1.5 text-center border-l border-gray-200 dark:border-dark-border ${TONE_AGENDA}`}
                >
                  Agenda (visitas/contatos)
                </th>
              </tr>
              <tr className="border-b border-gray-100 dark:border-dark-border/40 text-[10px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-wider">
                <th className="px-2 py-2.5 text-center whitespace-nowrap bg-gray-50 dark:bg-dark-bg/50">
                  #
                </th>
                <SortTh
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => toggleSort("name")}
                  className="px-3 py-2.5 text-left whitespace-nowrap bg-gray-50 dark:bg-dark-bg/50"
                >
                  Cobrador
                </SortTh>
                <SortTh
                  active={sortKey === "valorCarteira"}
                  dir={sortDir}
                  onClick={() => toggleSort("valorCarteira")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap border-l border-gray-200 dark:border-dark-border ${TONE_FINANCEIRO}`}
                >
                  Carteira
                </SortTh>
                <SortTh
                  active={sortKey === "vencidaValor"}
                  dir={sortDir}
                  onClick={() => toggleSort("vencidaValor")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_FINANCEIRO}`}
                >
                  Vencida
                </SortTh>
                <SortTh
                  active={sortKey === "previstaValor"}
                  dir={sortDir}
                  onClick={() => toggleSort("previstaValor")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_FINANCEIRO}`}
                >
                  Vence no período
                </SortTh>
                <SortTh
                  active={sortKey === "aReceberValor"}
                  dir={sortDir}
                  onClick={() => toggleSort("aReceberValor")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_FINANCEIRO}`}
                >
                  A receber
                </SortTh>
                <SortTh
                  active={sortKey === "recebidoPeriodo"}
                  dir={sortDir}
                  onClick={() => toggleSort("recebidoPeriodo")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_FINANCEIRO}`}
                >
                  Recebido
                </SortTh>
                <SortTh
                  active={sortKey === "emAtrasoVisitas"}
                  dir={sortDir}
                  onClick={() => toggleSort("emAtrasoVisitas")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap border-l border-gray-200 dark:border-dark-border ${TONE_AGENDA}`}
                >
                  Em atraso
                </SortTh>
                <SortTh
                  active={sortKey === "semAgendamentoClientes"}
                  dir={sortDir}
                  onClick={() => toggleSort("semAgendamentoClientes")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Sem agend.
                </SortTh>
                <SortTh
                  active={sortKey === "agendadasQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("agendadasQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Agend.
                </SortTh>
                <SortTh
                  active={sortKey === "realizadasQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("realizadasQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Realiz.
                </SortTh>
                <SortTh
                  active={sortKey === "reagendadasQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("reagendadasQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Reagend.
                </SortTh>
                <SortTh
                  active={sortKey === "naoEncontradoQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("naoEncontradoQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Não enc.
                </SortTh>
                <SortTh
                  active={sortKey === "reincidentesQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("reincidentesQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Reincid.
                </SortTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border/20 text-gray-700 dark:text-dark-text">
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className="hover:bg-gray-50/50 dark:hover:bg-dark-bg/25 transition-colors"
                >
                  <td className="px-2 py-3 text-center text-[10px] text-gray-400 dark:text-dark-text-secondary whitespace-nowrap">
                    {index + 1}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="font-medium text-gray-900 dark:text-dark-text">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {USER_TYPE_LABELS[row.type]}
                    </div>
                    {isWalletCollectorType(row.type) && (
                      <button
                        type="button"
                        onClick={() => setScheduleContactCollectorId(row.id)}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                      >
                        <CalendarClock className="h-3 w-3" />
                        Agendar em massa
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap border-l border-gray-100 dark:border-dark-border/40">
                    <div className="font-semibold">
                      {formatCurrency(row.valorCarteira, false)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {row.clientesCarteira} clientes
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(row.vencidaValor, false)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {row.vencidaQtd} parcelas
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold text-amber-600 dark:text-amber-400">
                      {formatCurrency(row.previstaValor, false)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {row.previstaQtd} parcelas
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(row.aReceberValor, false)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {row.aReceberQtd} parcelas
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(row.recebidoPeriodo, false)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap border-l border-gray-100 dark:border-dark-border/40">
                    <div className="font-semibold">{row.emAtrasoVisitas}</div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {isWalletCollectorType(row.type)
                        ? "contatos"
                        : "visitas"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">
                      {row.semAgendamentoClientes}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      clientes
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">{row.agendadasQtd}</div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {formatCurrency(row.agendadasValor, false)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">{row.realizadasQtd}</div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {isWalletCollectorType(row.type)
                        ? "contatos"
                        : "visitas"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">{row.reagendadasQtd}</div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {formatCurrency(row.reagendadasValor, false)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">{row.naoEncontradoQtd}</div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {formatCurrency(row.naoEncontradoValor, false)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">
                      {row.reincidentes.length}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      clientes
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={14}
                    className="px-3 py-10 text-center text-sm text-gray-400 dark:text-dark-text-secondary"
                  >
                    Nenhum cobrador encontrado para esse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {scheduleContactCollectorId && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setScheduleContactCollectorId(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ContactScheduler
              collectorId={scheduleContactCollectorId}
              onClose={() => setScheduleContactCollectorId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectorsSummary;
