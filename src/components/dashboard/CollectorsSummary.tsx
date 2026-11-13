import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Info,
  Wallet,
  Users,
  CalendarClock,
  Repeat,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Table2,
  Check,
  Gauge,
  PhoneCall,
  UserX,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { isCollectorType, UserType } from "../../types";
import { useAtendimentosPeriodo } from "../../hooks/useAtendimentosPeriodo";
import SummaryCard from "../common/SummaryCard";
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
import SaidasSemAcaoModal from "./SaidasSemAcao";
import { useSaidasSemAcao } from "../../hooks/useSaidasSemAcao";

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
  // Clientes da carteira sem proximo contato/visita marcado. Vale para
  // todos os perfis: na carteira o agendamento continua existindo (passo
  // "Proximo contato" do Atender e "Agendar em massa" do gestor).
  semAgendamentoClientes: number;
  // No periodo [dateFrom, dateTo].
  // Atendimentos registrados (collection_attempts: Atender, Fila, pagamento,
  // venda cancelada). Contados por CLIENTE, nunca por titulo (um registro
  // grava uma linha por titulo) nem por dia: cliente atendido 3 vezes = 1.
  clientesAtendidos: number;
  clientesConversaram: number;
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
  | "clientesAtendidos"
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
    clientesAtendidos: (r) => r.clientesAtendidos,
    agendadasQtd: (r) => r.agendadasQtd,
    realizadasQtd: (r) => r.realizadasQtd,
    reagendadasQtd: (r) => r.reagendadasQtd,
    naoEncontradoQtd: (r) => r.naoEncontradoQtd,
    reincidentesQtd: (r) => r.reincidentes.length,
  };

// Sentinelas para "Tudo": faixa larga o bastante pra cobrir qualquer registro
// real sem precisar de um caso especial "sem filtro" nas comparacoes de string.
const ALL_TIME_FROM = "2000-01-01";
// 9999 e nao 2099: o ERP tem vencimento digitado errado (ex.: ano 2245), e
// com teto menor "Tudo" deixava a parcela fora de "Vence no periodo" mas
// dentro de "A vencer" -- os dois nao batiam.
const ALL_TIME_TO = "9999-12-31";

// Segmentacao tonal: Financeiro (parcelas de BANCO_DADOS) sempre no cinza mais
// claro, Agenda (scheduledVisits) no cinza um pouco mais escuro — mesma dupla
// de tons em todo lugar que separa os dois dominios (totais, cards, tabela),
// pra reforcar visualmente a independencia entre eles sem depender so do texto.
const TONE_FINANCEIRO = "bg-gray-50 dark:bg-white/[0.03]";
const TONE_AGENDA = "bg-gray-100/80 dark:bg-white/[0.07]";
// Atendimentos (collection_attempts): o que o cobrador de fato registrou,
// independente de ter havido agendamento antes.
const TONE_ATENDIMENTO = "bg-indigo-50/70 dark:bg-indigo-900/10";

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

const fmtNum = (n: number): string => n.toLocaleString("pt-BR");

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
  const [sortKey, setSortKey] = useState<SortKey>("valorCarteira");
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

  // Atendimentos do periodo (collection_attempts). O CollectionContext nao
  // carrega essa tabela, entao a tela busca sozinha a cada troca de periodo.
  // Sem isto, a coluna "Realizadas" (scheduled_visits) era o unico sinal de
  // trabalho do cobrador de carteira -- e ela so conta contato que estava
  // agendado, o que quase nunca acontece na Fila de Cobranca.
  // Titulo -> documento ja conhecido no contexto (evita reconsultar
  // BANCO_DADOS); lido por ref para a busca nao rodar de novo a cada
  // recarga de `collections`.
  const docByParcelaRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const m = docByParcelaRef.current;
    collections.forEach((c) => {
      if (c.id_parcela != null && c.documento) {
        m.set(String(c.id_parcela), c.documento);
      }
    });
  }, [collections]);

  const { atendimentos, erro: atendimentosErro } = useAtendimentosPeriodo(
    dateFrom,
    dateTo,
    docByParcelaRef,
  );

  // Carteira automatica (item 55): clientes que sairam da faixa do cobrador
  // sem acao dele, no periodo. Numero no card/linha do cobrador; o clique
  // abre a lista, onde o gestor pode devolver os clientes ao cobrador.
  const { porCobrador: saidasPorCobrador, recarregar: recarregarSaidas } =
    useSaidasSemAcao(dateFrom, dateTo);
  const [saidasCobradorId, setSaidasCobradorId] = useState<string | null>(
    null,
  );
  const saidasCobrador = saidasCobradorId
    ? (users.find((u) => u.id === saidasCobradorId) ?? null)
    : null;
  const qtdSaidas = (id: string) => saidasPorCobrador.get(id)?.length ?? 0;

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

        const atend = atendimentos?.get(collector.id);

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
          clientesAtendidos: atend?.clientes ?? 0,
          clientesConversaram: atend?.conversaram ?? 0,
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
    atendimentos,
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
          // Clientes somados por cobrador: o mesmo cliente atendido por dois
          // cobradores conta para cada um (cada um fez o seu atendimento).
          clientesAtendidos: acc.clientesAtendidos + r.clientesAtendidos,
          clientesConversaram: acc.clientesConversaram + r.clientesConversaram,
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
          clientesAtendidos: 0,
          clientesConversaram: 0,
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

  // Atendimentos vem de uma busca a parte: enquanto carrega (ou se falhar)
  // nao mostra 0, que pareceria "nao atendeu ninguem".
  const atendimentosValor = (n: number): string =>
    atendimentosErro ? "erro" : atendimentos === null ? "…" : String(n);
  const atendimentosSub = (conversaram: number): string =>
    atendimentosErro
      ? "falha ao carregar"
      : atendimentos === null
        ? "carregando"
        : `${conversaram} ${conversaram === 1 ? "conversou" : "conversaram"}`;

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
                  <strong>Carteira</strong>, <strong>Atrasados</strong> e{" "}
                  <strong>Sem agendamento</strong> mostram a situação de
                  hoje. O resto vale para o período escolhido.
                  <br />
                  <strong>Clientes atendidos</strong>: cada cliente conta uma
                  vez, mesmo atendido várias vezes. Embaixo, com quantos o
                  cobrador conseguiu conversar.
                  <br />
                  <strong>Feitos</strong>: só o que estava agendado.
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
          // Um card por pergunta do gestor: numero principal em destaque e o
          // detalhe em linhas curtas embaixo (antes eram 3 faixas com 12
          // blocos soltos).
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <SummaryCard
              icon={Wallet}
              title="Carteira"
              value={formatCurrency(totals.valorCarteira, false)}
              caption={`${fmtNum(totals.clientesCarteira)} clientes`}
              rows={[
                {
                  label: "Vencido",
                  value: formatCurrency(totals.vencidaValor, false),
                  tone: "red",
                },
                {
                  label: "A vencer",
                  value: formatCurrency(
                    totals.previstaValor + totals.aReceberValor,
                    false,
                  ),
                },
              ]}
            />
            <SummaryCard
              icon={Wallet}
              title="Recebido no período"
              value={formatCurrency(totals.recebidoPeriodo, false)}
              valueTone="green"
              caption={previstaPeriodHint}
              rows={[
                {
                  label: "Ainda vence no período",
                  value: formatCurrency(totals.previstaValor, false),
                },
              ]}
            />
            <SummaryCard
              icon={PhoneCall}
              title="Clientes atendidos"
              value={atendimentosValor(totals.clientesAtendidos)}
              valueTone="blue"
              caption="no período (cada cliente conta 1 vez)"
              rows={[
                {
                  label: "Conseguiu conversar",
                  value: atendimentosValor(totals.clientesConversaram),
                },
              ]}
            />
            <SummaryCard
              icon={CalendarClock}
              title="Agenda"
              value={fmtNum(totals.emAtrasoVisitas)}
              valueTone={totals.emAtrasoVisitas > 0 ? "red" : "neutral"}
              caption="agendamentos atrasados"
              rows={[
                {
                  label: "Agendados",
                  value: fmtNum(totals.agendadasQtd),
                },
                {
                  label: "Feitos",
                  value: fmtNum(totals.realizadasQtd),
                },
                {
                  label: "Remarcados",
                  value: fmtNum(totals.reagendadasQtd),
                },
                {
                  label: "Não encontrado",
                  value: fmtNum(totals.naoEncontradoQtd),
                },
                {
                  label: "Clientes sem agendamento",
                  value: fmtNum(totals.semAgendamentoClientes),
                },
                {
                  label: "Remarcados 3x ou mais",
                  value: fmtNum(totals.reincidentesQtd),
                  tone: totals.reincidentesQtd > 0 ? "amber" : undefined,
                },
              ]}
            />
          </div>
        )}
      </div>

      {viewMode === "cards" ? (
        // Com 1 cobrador so, o card usa a largura toda em vez de ficar
        // espremido num terco da tela — nao ha mais ninguem pra formar grid.
        // Mesmos 4 blocos da Visao geral (Carteira, Recebido, Clientes
        // atendidos, Agenda), so que por cobrador.
        <div
          className={
            rows.length === 1
              ? "grid grid-cols-1 gap-4"
              : "grid grid-cols-1 lg:grid-cols-2 gap-4"
          }
        >
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="flex-shrink-0 mt-0.5 flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 dark:bg-dark-bg text-[10px] font-bold text-gray-500 dark:text-dark-text-secondary">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 dark:text-dark-text truncate">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {USER_TYPE_LABELS[row.type]}
                    </div>
                  </div>
                </div>
                {isWalletCollectorType(row.type) && (
                  <button
                    type="button"
                    onClick={() => setScheduleContactCollectorId(row.id)}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Agendar em massa
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <SummaryCard
                  icon={Wallet}
                  title="Carteira"
                  value={formatCurrency(row.valorCarteira, false)}
                  caption={`${fmtNum(row.clientesCarteira)} clientes`}
                  rows={[
                    {
                      label: "Vencido",
                      value: formatCurrency(row.vencidaValor, false),
                      tone: "red",
                    },
                    {
                      label: "A vencer",
                      value: formatCurrency(
                        row.previstaValor + row.aReceberValor,
                        false,
                      ),
                    },
                    ...(isWalletCollectorType(row.type)
                      ? [
                          {
                            label: "Saíram sem ação",
                            value: fmtNum(qtdSaidas(row.id)),
                            tone:
                              qtdSaidas(row.id) > 0
                                ? ("red" as const)
                                : undefined,
                            onClick:
                              qtdSaidas(row.id) > 0
                                ? () => setSaidasCobradorId(row.id)
                                : undefined,
                            hint: "Clientes que passaram da faixa no período sem nenhuma ação do cobrador. Clique para ver e devolver.",
                          },
                        ]
                      : []),
                  ]}
                />
                <SummaryCard
                  icon={Wallet}
                  title="Recebido no período"
                  value={formatCurrency(row.recebidoPeriodo, false)}
                  valueTone="green"
                  rows={[
                    {
                      label: "Ainda vence no período",
                      value: formatCurrency(row.previstaValor, false),
                    },
                  ]}
                />
                <SummaryCard
                  icon={PhoneCall}
                  title="Clientes atendidos"
                  value={atendimentosValor(row.clientesAtendidos)}
                  valueTone="blue"
                  rows={[
                    {
                      label: "Conseguiu conversar",
                      value: atendimentosValor(row.clientesConversaram),
                    },
                  ]}
                />
                <SummaryCard
                  icon={CalendarClock}
                  title="Agenda"
                  value={fmtNum(row.emAtrasoVisitas)}
                  valueTone={row.emAtrasoVisitas > 0 ? "red" : "neutral"}
                  caption="agendamentos atrasados"
                  rows={[
                    { label: "Agendados", value: fmtNum(row.agendadasQtd) },
                    { label: "Feitos", value: fmtNum(row.realizadasQtd) },
                    { label: "Remarcados", value: fmtNum(row.reagendadasQtd) },
                    {
                      label: "Não encontrado",
                      value: fmtNum(row.naoEncontradoQtd),
                    },
                    {
                      label: "Clientes sem agendamento",
                      value: fmtNum(row.semAgendamentoClientes),
                    },
                  ]}
                />
              </div>

              {row.reincidentes.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedReincidente((cur) =>
                        cur === row.id ? null : row.id,
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:opacity-80"
                  >
                    <Repeat className="h-3.5 w-3.5" />
                    {row.reincidentes.length}{" "}
                    {row.reincidentes.length === 1
                      ? "cliente remarcado"
                      : "clientes remarcados"}{" "}
                    3x ou mais
                    {expandedReincidente === row.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {expandedReincidente === row.id && (
                    <ul className="mt-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                      {row.reincidentes.map((r) => (
                        <li key={r.document} className="flex justify-between">
                          <span>{r.name}</span>
                          <span className="font-semibold">{r.count}x</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}

          {rows.length === 0 && (
            <div className="col-span-full bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border px-6 py-12 text-center text-sm text-gray-400 dark:text-dark-text-secondary">
              Nenhum cobrador encontrado para esse filtro.
            </div>
          )}
        </div>
      ) : (
        // Tabela: as mesmas perguntas da Visao geral, uma coluna cada; o
        // detalhe vai na linha de baixo da celula. Antes eram 15 colunas.
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[9px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-wider">
                <th className="px-3 py-1.5 bg-gray-50 dark:bg-dark-bg/50" />
                <th className="px-3 py-1.5 bg-gray-50 dark:bg-dark-bg/50" />
                <th
                  colSpan={2}
                  className={`px-3 py-1.5 text-center border-l border-gray-200 dark:border-dark-border ${TONE_FINANCEIRO}`}
                >
                  Dinheiro
                </th>
                <th
                  className={`px-3 py-1.5 text-center border-l border-gray-200 dark:border-dark-border ${TONE_ATENDIMENTO}`}
                >
                  Atendimento
                </th>
                <th
                  colSpan={5}
                  className={`px-3 py-1.5 text-center border-l border-gray-200 dark:border-dark-border ${TONE_AGENDA}`}
                >
                  Agenda
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
                  active={sortKey === "recebidoPeriodo"}
                  dir={sortDir}
                  onClick={() => toggleSort("recebidoPeriodo")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_FINANCEIRO}`}
                >
                  Recebido
                </SortTh>
                <SortTh
                  active={sortKey === "clientesAtendidos"}
                  dir={sortDir}
                  onClick={() => toggleSort("clientesAtendidos")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap border-l border-gray-200 dark:border-dark-border ${TONE_ATENDIMENTO}`}
                >
                  Clientes atendidos
                </SortTh>
                <SortTh
                  active={sortKey === "emAtrasoVisitas"}
                  dir={sortDir}
                  onClick={() => toggleSort("emAtrasoVisitas")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap border-l border-gray-200 dark:border-dark-border ${TONE_AGENDA}`}
                >
                  Atrasados
                </SortTh>
                <SortTh
                  active={sortKey === "agendadasQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("agendadasQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Agendados
                </SortTh>
                <SortTh
                  active={sortKey === "realizadasQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("realizadasQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Feitos
                </SortTh>
                <SortTh
                  active={sortKey === "reagendadasQtd"}
                  dir={sortDir}
                  onClick={() => toggleSort("reagendadasQtd")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Remarcados
                </SortTh>
                <SortTh
                  active={sortKey === "semAgendamentoClientes"}
                  dir={sortDir}
                  onClick={() => toggleSort("semAgendamentoClientes")}
                  className={`px-3 py-2.5 text-right whitespace-nowrap ${TONE_AGENDA}`}
                >
                  Sem agendamento
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
                    {qtdSaidas(row.id) > 0 && (
                      <button
                        type="button"
                        onClick={() => setSaidasCobradorId(row.id)}
                        title="Clientes que passaram da faixa no período sem nenhuma ação do cobrador. Clique para ver e devolver."
                        className="mt-1 flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        <UserX className="h-3 w-3" />
                        {fmtNum(qtdSaidas(row.id))} saíram sem ação
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap border-l border-gray-100 dark:border-dark-border/40">
                    <div className="font-semibold">
                      {formatCurrency(row.valorCarteira, false)}
                    </div>
                    <div className="text-[10px] text-red-500 dark:text-red-400">
                      {formatCurrency(row.vencidaValor, false)} vencido
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {formatCurrency(
                        row.previstaValor + row.aReceberValor,
                        false,
                      )}{" "}
                      a vencer
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(row.recebidoPeriodo, false)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {formatCurrency(row.previstaValor, false)} ainda vence
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap border-l border-gray-100 dark:border-dark-border/40">
                    <div className="font-semibold text-blue-600 dark:text-blue-400">
                      {atendimentosValor(row.clientesAtendidos)}
                    </div>
                    {(row.clientesAtendidos > 0 ||
                      atendimentos === null ||
                      atendimentosErro) && (
                      <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                        {atendimentosSub(row.clientesConversaram)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap border-l border-gray-100 dark:border-dark-border/40">
                    <span
                      className={`font-semibold ${row.emAtrasoVisitas > 0 ? "text-red-600 dark:text-red-400" : ""}`}
                    >
                      {fmtNum(row.emAtrasoVisitas)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                    {fmtNum(row.agendadasQtd)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">
                      {fmtNum(row.realizadasQtd)}
                    </div>
                    {row.naoEncontradoQtd > 0 && (
                      <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                        {fmtNum(row.naoEncontradoQtd)} não encontrado
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="font-semibold">
                      {fmtNum(row.reagendadasQtd)}
                    </div>
                    {row.reincidentes.length > 0 && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400">
                        {row.reincidentes.length}{" "}
                        {row.reincidentes.length === 1
                          ? "cliente"
                          : "clientes"}{" "}
                        3x ou mais
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                    {fmtNum(row.semAgendamentoClientes)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
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

      {saidasCobrador && (
        <SaidasSemAcaoModal
          cobrador={saidasCobrador}
          saidas={saidasPorCobrador.get(saidasCobrador.id) ?? []}
          users={users}
          onClose={() => setSaidasCobradorId(null)}
          onDevolvido={recarregarSaidas}
        />
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
