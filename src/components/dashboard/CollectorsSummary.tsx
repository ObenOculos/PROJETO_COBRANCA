import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PERIODO_PRESETS,
  PeriodoPreset,
  fimDoMes,
  inicioDoMes,
  periodoDoPreset,
} from "../../filters/periodo";
import { buscarComCacheTela, lerCacheTela } from "../../utils/cacheTela";
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
  UserX,
  History,
  Shuffle,
  Handshake,
  CalendarCheck,
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
import {
  hasInstallmentBalance,
  clientMaxOverdueDays,
  clientReferenceStore,
  collectionsBalanceSplit,
  parcelaNoPeriodo,
} from "../../filters/clientStatus";
import {
  diasAteSairDasRegras,
  URGENTE_SAIDA_CARTEIRA_DIAS,
} from "../../filters/priority";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { inadimplenciaDe, formatarInadimplencia } from "../../filters/inadimplencia";
import { Collection, CollectorOverdueRange, SaleGroup } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import ContactScheduler from "./ContactScheduler";
import CollectorPerformanceModal from "./CollectorPerformanceModal";
import VisitScheduler from "./VisitScheduler";
import SaidasSemAcaoModal from "./SaidasSemAcao";
import { useSaidasSemAcao } from "../../hooks/useSaidasSemAcao";
import { useCarteiraMovimentacao } from "../../hooks/useCarteiraMovimentacao";
import { valorRecebidoTotal } from "../../filters/sales";
import { metaDoMes } from "../../filters/metas";

interface CollectorRow {
  id: string;
  name: string;
  type: UserType;
  // Situacao atual (nao depende do periodo escolhido).
  clientesCarteira: number;
  // Cliente com pelo menos 1 titulo vencido dentro do periodo (pior status
  // -- nao soma junto com "em dia", que e clientesCarteira - este numero).
  clientesComAtraso: number;
  valorCarteira: number;
  vencidaQtd: number;
  vencidaValor: number;
  // Inadimplencia (filters/inadimplencia.ts): guarda os dois componentes
  // (nao o %) para a Visao geral poder somar entre cobradores certo -- a
  // media dos percentuais de cada um nao e o percentual do total.
  inadVenceu: number;
  inadNaoPago: number;
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
  // Total de registros no periodo, sem deduplicar por cliente (ver
  // `tentativas` em AtendimentosCobrador).
  acionamentosQtd: number;
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

type PresetKey = PeriodoPreset;

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

// Segmentacao tonal: Financeiro (parcelas de BANCO_DADOS) sempre no cinza mais
// claro, Agenda (scheduledVisits) no cinza um pouco mais escuro — mesma dupla
// de tons em todo lugar que separa os dois dominios (totais, cards, tabela),
// pra reforcar visualmente a independencia entre eles sem depender so do texto.
const TONE_FINANCEIRO = "bg-gray-50 dark:bg-white/[0.03]";
const TONE_AGENDA = "bg-gray-100/80 dark:bg-white/[0.07]";
// Atendimentos (collection_attempts): o que o cobrador de fato registrou,
// independente de ter havido agendamento antes.
const TONE_ATENDIMENTO = "bg-indigo-50/70 dark:bg-indigo-900/10";

// Atalhos do filtro de periodo: fonte unica em filters/periodo (os mesmos da
// Atribuicao de Cobradores). "Mes atual" e o padrao pedido pelo gestor.

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

/** Textos de atendimento por perfil. Externo trabalha por visita
 * (pedido do usuario 2026-11-19: "acionamentos/conversaram" nao faz sentido
 * para ele); os demais por ligacao/WhatsApp. Mesmo numero, nome certo. */
const atendimentoTexto = (visita: boolean) =>
  visita
    ? {
        clientes: "Clientes visitados",
        conversou: "encontrado",
        conversaram: "encontrados",
        registros: "Visitas",
        registrosMin: "visitas",
        registrosHint: "Total de visitas concluídas no período (realizada, não encontrado ou reagendada)",
      }
    : {
        clientes: "Clientes acionados",
        conversou: "conversou",
        conversaram: "conversaram",
        registros: "Acionamentos",
        registrosMin: "acionamentos",
        registrosHint: "Total de registros no período, sem deduplicar por cliente",
      };
const ehExterno = (type: UserType): boolean => type === "collector";

/** Acordos de um cobrador (ou soma de varios) para o card Acordos. */
interface ResumoAcordos {
  ativosQtd: number;
  ativosValor: number;
  feitosQtd: number;
  feitosValor: number;
  cumpridosQtd: number;
  cumpridosValor: number;
  quebradosQtd: number;
  quebradosValor: number;
  recebido: number;
}
const resumoAcordosVazio = (): ResumoAcordos => ({
  ativosQtd: 0,
  ativosValor: 0,
  feitosQtd: 0,
  feitosValor: 0,
  cumpridosQtd: 0,
  cumpridosValor: 0,
  quebradosQtd: 0,
  quebradosValor: 0,
  recebido: 0,
});

/** % de inadimplencia a partir dos componentes somados (nunca a media dos
 * percentuais de cada cobrador -- ver CollectorRow.inadVenceu/inadNaoPago). */
const pctInad = (venceu: number, naoPago: number): number =>
  venceu > 0 ? (naoPago / venceu) * 100 : 0;

/** Faixas da Carteira Automatica como mini cards (pedido do usuario
 * 2026-11-17: melhor leitura que 1 frase corrida com "·"), lado a lado com o
 * valor/legenda do card via a prop `aside` do SummaryCard. Clique expande as
 * lojas da faixa aqui mesmo, embaixo -- sem modal, pra ficar leve. */
const FaixasAlcance: React.FC<{ regras: CollectorOverdueRange[] }> = ({
  regras,
}) => {
  const [expandidaId, setExpandidaId] = useState<string | null>(null);
  const ordenadas = [...regras].sort((x, y) => x.minDias - y.minDias);
  const expandida = ordenadas.find((r) => r.id === expandidaId) ?? null;

  return (
    <div className="sm:mt-0 mt-2">
      <div
        className="text-[11px] font-semibold text-gray-500 dark:text-dark-text-secondary mb-1.5"
        title="Faixas de dias em atraso que a Atribuição Automática usa para dividir estes clientes entre lojas; clique numa faixa para ver quais lojas ela cobre"
      >
        Faixas de atraso × lojas
      </div>
      <div className="flex flex-wrap gap-2">
        {ordenadas.map((r) => {
          const aberta = r.id === expandidaId;
          const qtdLojas = r.lojas?.length ?? 0;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() =>
                setExpandidaId((cur) => (cur === r.id ? null : r.id))
              }
              className={`px-2.5 py-1.5 rounded-lg border shadow-sm text-left transition-colors ${
                aberta
                  ? "border-blue-400 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20"
                  : r.ativa
                    ? "border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary hover:border-blue-300"
                    : "border-amber-300 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10"
              }`}
            >
              <div className="text-[11px] font-bold text-gray-900 dark:text-dark-text whitespace-nowrap">
                {r.minDias}–{r.maxDias ?? "+"} dias
              </div>
              <div className="text-[10px] text-gray-500 dark:text-dark-text-secondary whitespace-nowrap">
                {qtdLojas > 0 ? `${qtdLojas} ${qtdLojas === 1 ? "loja" : "lojas"}` : "todas as lojas"}
                {!r.ativa && " · pausada"}
              </div>
            </button>
          );
        })}
      </div>
      {expandida && (
        <div className="mt-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg px-3 py-2 text-xs text-gray-700 dark:text-dark-text-secondary">
          {expandida.lojas && expandida.lojas.length > 0
            ? expandida.lojas.join(" · ")
            : "Todas as lojas"}
          {!expandida.ativa && (
            <span className="ml-2 font-semibold text-amber-600 dark:text-amber-400">
              Faixa pausada
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const CollectorsSummary: React.FC = () => {
  const {
    users,
    collections,
    scheduledVisits,
    salePayments,
    monthlyGoals,
    managerCollectorLinks,
    collectorOverdueRanges,
    acordoAtivoOverdueMap,
    acordos,
  } = useCollection();
  const { user: currentUser } = useAuth();

  const today = todayLocalStr();
  const [dateFrom, setDateFrom] = useState(inicioDoMes(today));
  const [dateTo, setDateTo] = useState(fimDoMes(today));

  // Item 66, etapa 3: pagamento que o cliente fez na loja/banco, atribuido ao
  // cobrador (pedido dele ou excecao do gestor), credita no "Recebido no
  // período" e nas metas -- mesma lógica do Caixa Diário/Meu desempenho. Lê
  // a view atribuicoes_pagamento_vigentes (valor_vigente = LEAST(valor_aprovado,
  // valor_recebido atual); some se o ERP desfizer a baixa -- migration
  // 20261117000007). Busca uma vez (gestor vê todas via RLS); não refaz a
  // cada novo período.
  // Guardada no cache de tela (2026-11-18): antes cada entrada na aba
  // comecava sem elas e o Recebido/metas "recalculavam" ao chegar. Agora a
  // volta mostra o guardado na hora; na 1a entrada o Recebido fica em "…"
  // ate chegar (nunca um valor sem o pago na loja).
  type AtribuicaoAprovada = { collectorId: string; valor: number; data: string };
  const CHAVE_ATRIBUICOES = "atribuicoesVigentes|todas";
  const [atribuicoesEstado, setAtribuicoesEstado] = useState<
    AtribuicaoAprovada[] | null
  >(() => lerCacheTela<AtribuicaoAprovada[]>(CHAVE_ATRIBUICOES)?.valor ?? null);
  const atribuicoesProntas = atribuicoesEstado !== null;
  const atribuicoesAprovadas = useMemo(
    () => atribuicoesEstado ?? [],
    [atribuicoesEstado],
  );
  useEffect(() => {
    let cancelado = false;
    if (lerCacheTela(CHAVE_ATRIBUICOES)?.fresco) return;
    buscarComCacheTela(CHAVE_ATRIBUICOES, async () => {
      const { data, error } = await supabase
        .from("atribuicoes_pagamento_vigentes")
        .select("solicitado_por_id, valor_vigente, data_pagamento");
      if (error) throw error;
      return (data || [])
        .filter((r) => r.solicitado_por_id && r.data_pagamento)
        .map((r) => ({
          collectorId: r.solicitado_por_id as string,
          valor: Number(r.valor_vigente) || 0,
          data: String(r.data_pagamento).slice(0, 10),
        }));
    })
      .then((lista) => {
        if (!cancelado) setAtribuicoesEstado(lista);
      })
      .catch((error) => {
        console.error(
          "Erro ao buscar pagamentos atribuídos (pago na loja):",
          error,
        );
        // Como antes: segue sem o pago na loja (nao trava em "…").
        if (!cancelado) setAtribuicoesEstado((v) => v ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, []);
  /** Recebido em "…" ate o pago na loja chegar (1a entrada na aba). */
  // Recebido so aparece com as duas buscas prontas (pago na loja e acordo).
  const fmtRecebido = (v: number): string =>
    atribuicoesProntas && acordoPagosProntos ? formatCurrency(v, false) : "…";
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
  // Modal do cobrador (Historico, Pendencias, Carteira) -- veio da antiga
  // tela Desempenho, que saiu do menu (reuniao 16/11, item 4).
  const [detalheCobradorId, setDetalheCobradorId] = useState<string | null>(
    null,
  );
  // Cobrador externo agenda VISITA presencial (VisitScheduler, o mesmo do
  // "Nova Visita" do Acompanhamento); carteira agenda CONTATO
  // (ContactScheduler). Cada tipo so ve o botao do seu canal -- abrir o
  // VisitScheduler para interno criaria visita presencial por engano.
  const [scheduleVisitCollectorId, setScheduleVisitCollectorId] = useState<
    string | null
  >(null);
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
    const { de, ate } = periodoDoPreset(key, today);
    setDateFrom(de);
    setDateTo(ate);
  };

  const inPeriod = (dateStr: string | undefined | null): boolean =>
    !!dateStr && dateStr >= dateFrom && dateStr <= dateTo;

  // Atendimentos do periodo (collection_attempts). O CollectionContext nao
  // carrega essa tabela, entao a tela busca sozinha a cada troca de periodo.
  // Sem isto, a coluna "Realizadas" (scheduled_visits) era o unico sinal de
  // trabalho do cobrador de carteira -- e ela so conta contato que estava
  // agendado, o que quase nunca acontece na Fila de Cobranca.
  const { atendimentos, erro: atendimentosErro } = useAtendimentosPeriodo(
    dateFrom,
    dateTo,
  );

  // Pagamentos de parcela de acordo (acordo_pagamentos). Nao vem de
  // salePayments: registrar_pagamento_acordo grava so em acordo_pagamentos
  // (ver "Recuperacao do Mes" no CollectorDashboard). Entram no Desempenho e
  // na meta desta tela, como ja entravam no Meu desempenho (2026-11-19).
  // Sem duplicidade: (a) nao ha sale_payment para o mesmo dinheiro; (b) a
  // parcela da SSOtica paga na loja vira acordo_pagamentos UMA vez (espelho
  // da importacao, recebido_espelhado); (c) o titulo do acordo pago no ERP
  // nao pode virar "pago na loja" (atribuicao_bloqueio_parcela, migration
  // 20261119000001). Estorno e linha negativa: a soma ja desconta.
  // Busca periodo + mes atual (meta e sempre do mes) e guarda o intervalo:
  // ao trocar de periodo o valor so aparece quando a busca NOVA chega (mesmo
  // cuidado do Meu desempenho, achado 2026-11-18).
  const buscaAcordoDe =
    dateFrom < inicioDoMes(today) ? dateFrom : inicioDoMes(today);
  const buscaAcordoAte = dateTo > fimDoMes(today) ? dateTo : fimDoMes(today);
  const [acordoPagos, setAcordoPagos] = useState<{
    periodo: string;
    linhas: { collectorId: string; valor: number; data: string }[];
  } | null>(null);
  const periodoAtual = `${buscaAcordoDe}|${buscaAcordoAte}`;
  useEffect(() => {
    let cancelado = false;
    const periodo = `${buscaAcordoDe}|${buscaAcordoAte}`;
    (async () => {
      try {
        const brutas = await fetchAllRows<{
          collector_id: string | null;
          valor_pago: number | string;
          data_pagamento: string;
        }>(
          (de, ate) =>
            supabase
              .from("acordo_pagamentos")
              .select("collector_id, valor_pago, data_pagamento")
              .gte("data_pagamento", buscaAcordoDe)
              .lte("data_pagamento", buscaAcordoAte)
              .order("id")
              .range(de, ate),
          () => cancelado,
        );
        // data_pagamento e sempre YYYY-MM-DD (coluna date).
        const linhas = brutas
          .filter((l) => !!l.collector_id)
          .map((l) => ({
            collectorId: l.collector_id as string,
            valor: Number(l.valor_pago || 0),
            data: l.data_pagamento,
          }));
        if (!cancelado) setAcordoPagos({ periodo, linhas });
      } catch (err) {
        console.error("Erro ao buscar pagamentos de acordo:", err);
        if (!cancelado) setAcordoPagos({ periodo, linhas: [] });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [buscaAcordoDe, buscaAcordoAte]);
  const acordoPagosProntos = acordoPagos?.periodo === periodoAtual;
  /** Recebido em acordo por cobrador no intervalo [de, ate]. */
  const acordoRecebido = (
    collectorId: string,
    de: string,
    ate: string,
  ): number =>
    (acordoPagosProntos ? acordoPagos!.linhas : []).reduce(
      (sum, l) =>
        l.collectorId === collectorId && l.data >= de && l.data <= ate
          ? sum + l.valor
          : sum,
      0,
    );

  // Carteira automatica (item 55): clientes que sairam da faixa do cobrador
  // sem acao dele, no periodo. Numero no card/linha do cobrador (de
  // useCarteiraMovimentacao, agregado no banco pra todo mundo de uma vez);
  // o clique abre a lista detalhada de UM cobrador so (useSaidasSemAcao com
  // cobradorId -- nao busca nada enquanto nenhum modal esta aberto), onde o
  // gestor pode devolver os clientes ao cobrador.
  const [saidasCobradorId, setSaidasCobradorId] = useState<string | null>(
    null,
  );
  const saidasCobrador = saidasCobradorId
    ? (users.find((u) => u.id === saidasCobradorId) ?? null)
    : null;
  const { porCobrador: saidasPorCobrador, recarregar: recarregarSaidasDetalhe } =
    useSaidasSemAcao(dateFrom, dateTo, saidasCobradorId);
  const [movVersao, setMovVersao] = useState(0);
  const { movimentacao: movCarteira, carregando: movCarregando } =
    useCarteiraMovimentacao(dateFrom, dateTo, movVersao);
  const qtdSaidas = (id: string) => movCarteira.get(id)?.saidasSemAcao ?? 0;
  // "…" pulsando enquanto busca -- sem isso, "0" durante a busca parecia
  // "ninguem saiu sem ação" (pedido do usuario 2026-11-18: filtro "Tudo"
  // demora, e sem indicacao de carregamento parecia travado).
  const qtdSaidasValor = (id: string): string =>
    movCarregando ? "…" : fmtNum(qtdSaidas(id));
  // Devolver um cliente muda tanto a lista detalhada quanto os numeros
  // agregados (o historico ganha um evento novo de atribuicao).
  const recarregarSaidas = () => {
    recarregarSaidasDetalhe();
    setMovVersao((v) => v + 1);
  };

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
        const inad = inadimplenciaDe(myCollections);

        const clientesCarteiraSet = new Set<string>();
        // Cliente com pelo menos 1 titulo vencido (dentro do periodo) entra
        // so aqui, nao soma nos dois grupos do card "Numero de clientes".
        const clientesVencidosSet = new Set<string>();
        let valorCarteira = 0;
        let vencidaQtd = 0;
        let vencidaValor = 0;
        let previstaQtd = 0;
        let previstaValor = 0;
        let aReceberQtd = 0;
        let aReceberValor = 0;

        myCollections.forEach((c) => {
          // Saldo, vencida e "vence no periodo": mesma regra do card Valores
          // da Atribuicao de Cobradores (filters/clientStatus).
          const parcela = parcelaNoPeriodo(c, dateFrom, dateTo);
          if (!parcela) return;
          const { saldo, noPeriodo, vencida } = parcela;

          if (vencida) {
            // Pedido do usuario (2026-11-17): a coluna/card "Carteira" passa a
            // ser influenciada pelo período -- só entra o que vence dentro
            // do período escolhido. Vencida fora do período não soma em
            // nenhum total desta tela (fica só na "Carteira completa").
            if (noPeriodo) {
              vencidaQtd++;
              vencidaValor += saldo;
              if (c.documento) clientesVencidosSet.add(c.documento);
            }
          } else if (noPeriodo) {
            previstaQtd++;
            previstaValor += saldo;
          } else {
            aReceberQtd++;
            aReceberValor += saldo;
          }

          if (noPeriodo) {
            if (c.documento) clientesCarteiraSet.add(c.documento);
            valorCarteira += saldo;
          }
        });

        const recebidoPeriodo =
          salePayments
            .filter(
              (p) => p.collectorId === collector.id && inPeriod(p.paymentDate),
            )
            .reduce((sum, p) => sum + valorRecebidoTotal(p), 0) +
          atribuicoesAprovadas
            .filter(
              (a) => a.collectorId === collector.id && inPeriod(a.data),
            )
            .reduce((sum, a) => sum + a.valor, 0) +
          acordoRecebido(collector.id, dateFrom, dateTo);

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
          clientesComAtraso: clientesVencidosSet.size,
          valorCarteira,
          vencidaQtd,
          vencidaValor,
          inadVenceu: inad.venceu,
          inadNaoPago: inad.naoPago,
          emAtrasoVisitas,
          semAgendamentoClientes,
          previstaQtd,
          previstaValor,
          aReceberQtd,
          aReceberValor,
          recebidoPeriodo,
          // Para o externo estes numeros vem das VISITAS (atendimentos_periodo
          // conta visita presencial concluida; "realizada" = conversou) e a
          // tela os chama de visitados/encontrados/visitas (atendimentoTexto).
          clientesAtendidos: atend?.clientes ?? 0,
          clientesConversaram: atend?.conversaram ?? 0,
          acionamentosQtd: atend?.tentativas ?? 0,
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
    atribuicoesAprovadas,
    atendimentos,
    lastVisitStatus,
    dateFrom,
    dateTo,
    today,
    sortKey,
    sortDir,
    acordoPagos,
    acordoPagosProntos,
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
          clientesComAtraso: acc.clientesComAtraso + r.clientesComAtraso,
          valorCarteira: acc.valorCarteira + r.valorCarteira,
          vencidaQtd: acc.vencidaQtd + r.vencidaQtd,
          vencidaValor: acc.vencidaValor + r.vencidaValor,
          inadVenceu: acc.inadVenceu + r.inadVenceu,
          inadNaoPago: acc.inadNaoPago + r.inadNaoPago,
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
          acionamentosQtd: acc.acionamentosQtd + r.acionamentosQtd,
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
          clientesComAtraso: 0,
          valorCarteira: 0,
          vencidaQtd: 0,
          vencidaValor: 0,
          inadVenceu: 0,
          inadNaoPago: 0,
          emAtrasoVisitas: 0,
          semAgendamentoClientes: 0,
          previstaQtd: 0,
          previstaValor: 0,
          aReceberQtd: 0,
          aReceberValor: 0,
          recebidoPeriodo: 0,
          clientesAtendidos: 0,
          clientesConversaram: 0,
          acionamentosQtd: 0,
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

    const targetValue = Array.from(teamCollectorIds).reduce(
      (sum, id) =>
        sum + Number(metaDoMes(monthlyGoals, id, mesAtual)?.payments_goal || 0),
      0,
    );
    const actualValue =
      salePayments
        .filter(
          (p) =>
            teamCollectorIds.has(p.collectorId) &&
            p.paymentDate.startsWith(mesAtual),
        )
        .reduce((sum, p) => sum + valorRecebidoTotal(p), 0) +
      atribuicoesAprovadas
        .filter(
          (a) =>
            teamCollectorIds.has(a.collectorId) && a.data.startsWith(mesAtual),
        )
        .reduce((sum, a) => sum + a.valor, 0) +
      Array.from(teamCollectorIds).reduce(
        (sum, id) => sum + acordoRecebido(id, inicioDoMes(today), fimDoMes(today)),
        0,
      );

    if (targetValue <= 0) return null;

    return {
      collectorCount: teamCollectorIds.size,
      targetValue,
      actualValue,
      progress: Math.min((actualValue / targetValue) * 100, 100),
      remaining: Math.max(0, targetValue - actualValue),
    };
    // acordoRecebido le acordoPagos/acordoPagosProntos, que estao nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentUser,
    managerCollectorLinks,
    monthlyGoals,
    salePayments,
    atribuicoesAprovadas,
    today,
    acordoPagos,
    acordoPagosProntos,
  ]);

  // Meta do MES ATUAL de cada cobrador, mesma base da meta da equipe acima
  // (salePayments do mes, valorRecebidoTotal). Mes atual e nao o periodo do
  // filtro: meta e mensal (mesma razao do teamGoal).
  const metaPorCobrador = useMemo(() => {
    const mesAtual = today.slice(0, 7);
    const recebidoMes = new Map<string, number>();
    salePayments.forEach((p) => {
      if (!p.collectorId || !p.paymentDate.startsWith(mesAtual)) return;
      recebidoMes.set(
        p.collectorId,
        (recebidoMes.get(p.collectorId) ?? 0) + valorRecebidoTotal(p),
      );
    });
    atribuicoesAprovadas.forEach((a) => {
      if (!a.collectorId || !a.data.startsWith(mesAtual)) return;
      recebidoMes.set(
        a.collectorId,
        (recebidoMes.get(a.collectorId) ?? 0) + a.valor,
      );
    });
    const mapa = new Map<
      string,
      { meta: number; recebido: number; pct: number }
    >();
    rows.forEach((row) => {
      const meta = Number(
        metaDoMes(monthlyGoals, row.id, mesAtual)?.payments_goal || 0,
      );
      if (meta <= 0) return;
      const recebido =
        (recebidoMes.get(row.id) ?? 0) +
        acordoRecebido(row.id, inicioDoMes(today), fimDoMes(today));
      mapa.set(row.id, { meta, recebido, pct: (recebido / meta) * 100 });
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows,
    monthlyGoals,
    salePayments,
    atribuicoesAprovadas,
    today,
    acordoPagos,
    acordoPagosProntos,
  ]);

  // Meta do mes somada dos cobradores VISIVEIS agora (mesma populacao de
  // `totals`, nao so a equipe vinculada ao gestor como em teamGoal) -- card
  // "Desempenho" da Visao geral.
  const metaGeral = useMemo(() => {
    let meta = 0;
    let recebido = 0;
    rows.forEach((row) => {
      const m = metaPorCobrador.get(row.id);
      if (m) {
        meta += m.meta;
        recebido += m.recebido;
      }
    });
    return { meta, recebido };
  }, [rows, metaPorCobrador]);

  // ---- Card "Carteira automatica" (reuniao 16/11, itens 7/18/35) ----
  // O que a Atribuicao Automatica faz com a carteira de cada cobrador:
  // alcance (faixas e lojas), quem esta perto de sair (mesma conta da Fila
  // do cobrador: diasAteSairDasRegras, aviso a URGENTE_SAIDA_CARTEIRA_DIAS)
  // e quem entrou/saiu no periodo (atribuicoes_historico).
  type VaiSair = {
    documento: string;
    nome: string;
    diasRestantes: number;
    vencido: number;
  };
  const carteiraAuto = useMemo(() => {
    const regrasPor = new Map<string, CollectorOverdueRange[]>();
    collectorOverdueRanges.forEach((r) => {
      const l = regrasPor.get(r.collectorId);
      if (l) l.push(r);
      else regrasPor.set(r.collectorId, [r]);
    });
    const vaoSairPor = new Map<string, VaiSair[]>();
    regrasPor.forEach((regras, collectorId) => {
      if (!regras.some((r) => r.maxDias != null)) return;
      const porCliente = new Map<string, Collection[]>();
      collections.forEach((c) => {
        if (c.user_id !== collectorId || !c.documento) return;
        if (!hasInstallmentBalance(c)) return;
        const l = porCliente.get(c.documento);
        if (l) l.push(c);
        else porCliente.set(c.documento, [c]);
      });
      const lista: VaiSair[] = [];
      porCliente.forEach((titulos, documento) => {
        const group = {
          document: documento,
          sales: [{ installments: titulos } as SaleGroup],
        };
        const atraso = clientMaxOverdueDays(group, acordoAtivoOverdueMap);
        const dias = diasAteSairDasRegras(
          regras,
          atraso,
          clientReferenceStore(group),
        );
        if (dias == null || dias > URGENTE_SAIDA_CARTEIRA_DIAS) return;
        lista.push({
          documento,
          nome: titulos[0].cliente || titulos[0].apelido || documento,
          diasRestantes: dias,
          vencido: collectionsBalanceSplit(
            documento,
            titulos,
            acordoAtivoOverdueMap,
          ).vencido,
        });
      });
      lista.sort((a, b) => a.diasRestantes - b.diasRestantes);
      vaoSairPor.set(collectorId, lista);
    });
    return { regrasPor, vaoSairPor };
  }, [collectorOverdueRanges, collections, acordoAtivoOverdueMap]);

  const [expandedVaoSair, setExpandedVaoSair] = useState<string | null>(
    null,
  );

  const nomeMesAtual = new Date(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString("pt-BR", { month: "short" });

  const linhaMeta = (id: string) => {
    const m = metaPorCobrador.get(id);
    if (!m) return [];
    return [
      {
        label: `Meta de ${nomeMesAtual}`,
        value: atribuicoesProntas
          ? `${m.pct.toFixed(0)}% de ${formatCurrency(m.meta, false)}`
          : "…",
        loading: !atribuicoesProntas,
        tone: atribuicoesProntas && m.pct >= 100 ? ("green" as const) : undefined,
        hint: `${formatCurrency(m.recebido, false)} recebidos no mês atual`,
      },
    ];
  };

  const detalheCobrador = detalheCobradorId
    ? users.find((u) => u.id === detalheCobradorId)
    : undefined;

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
  const atendimentosSub = (conversaram: number, visita = false): string => {
    const t = atendimentoTexto(visita);
    return atendimentosErro
      ? "falha ao carregar"
      : atendimentos === null
        ? "carregando"
        : `${conversaram} ${conversaram === 1 ? t.conversou : t.conversaram}`;
  };

  // Linhas "Clientes acionados"/"Acionamentos" no card Desempenho (pedido do
  // usuario 2026-11-18: cobrador reclamava de nao ter como ver "quantos
  // acionei hoje" nem o gestor "quantos o Jose acionou hoje" sem abrir a
  // tabela; depois pediu tambem a quantidade total, sem deduplicar por
  // cliente). Mesmo dado de atendimentosValor/Sub, so que dentro do card em
  // vez de coluna de tabela -- e ja respeita o filtro de periodo escolhido.
  const linhaAtendimentos = (
    clientesAtendidos: number,
    clientesConversaram: number,
    acionamentosQtd: number,
    visita = false,
  ) => {
    const t = atendimentoTexto(visita);
    return [
      {
        label: t.clientes,
        value: atendimentosValor(clientesAtendidos),
        hint: atendimentosSub(clientesConversaram, visita),
        loading: atendimentos === null && !atendimentosErro,
      },
      {
        label: t.registros,
        value: atendimentosValor(acionamentosQtd),
        hint: t.registrosHint,
        loading: atendimentos === null && !atendimentosErro,
      },
    ];
  };

  // Acordos por cobrador (dono do acordo, acordos.collector_id). "Ativos" e a
  // situacao de AGORA (nao depende do periodo); feitos pela data de criacao e
  // cumpridos/quebrados/cancelados pela data em que foram fechados, dentro do
  // periodo. Valor = valor negociado (termo do acordo, imutavel).
  const acordosPorCobrador = useMemo(() => {
    const dataLocal = (iso?: string | null) =>
      iso ? todayLocalStr(new Date(iso)) : "";
    const noPeriodo = (d: string) => !!d && d >= dateFrom && d <= dateTo;
    const map = new Map<string, ResumoAcordos>();
    acordos.forEach((a) => {
      if (!map.has(a.collectorId)) map.set(a.collectorId, resumoAcordosVazio());
      const r = map.get(a.collectorId)!;
      const valor = Number(a.valorNegociado || 0);
      if (a.status === "ativo") {
        r.ativosQtd++;
        r.ativosValor += valor;
      }
      if (noPeriodo(dataLocal(a.createdAt))) {
        r.feitosQtd++;
        r.feitosValor += valor;
      }
      if (a.status !== "ativo" && noPeriodo(dataLocal(a.resolvedAt))) {
        if (a.status === "cumprido") {
          r.cumpridosQtd++;
          r.cumpridosValor += valor;
        } else {
          r.quebradosQtd++;
          r.quebradosValor += valor;
        }
      }
    });
    return map;
  }, [acordos, dateFrom, dateTo]);

  const somaAcordos = (ids: string[]): ResumoAcordos => {
    const t = resumoAcordosVazio();
    ids.forEach((id) => {
      const r = acordosPorCobrador.get(id);
      if (r) {
        (Object.keys(t) as (keyof ResumoAcordos)[]).forEach((k) => {
          t[k] += r[k];
        });
      }
      t.recebido += acordoRecebido(id, dateFrom, dateTo);
    });
    return t;
  };

  const qtdValor = (qtd: number, valor: number) =>
    qtd > 0 ? `${fmtNum(qtd)} · ${formatCurrency(valor, false)}` : "0";

  // Card Acordos (pedido do gestor 2026-11-19): acordos e o dinheiro que
  // entrou neles. "Recebido em acordos" ja esta DENTRO do Desempenho (parte
  // dele, nao soma de novo).
  const cardAcordos = (r: ResumoAcordos) => (
    <SummaryCard
      icon={Handshake}
      title="Acordos"
      value={formatCurrency(r.ativosValor, false)}
      valueTone="blue"
      caption={`${fmtNum(r.ativosQtd)} ${r.ativosQtd === 1 ? "acordo ativo" : "acordos ativos"} agora`}
      rows={[
        {
          label: "Feitos no período",
          value: qtdValor(r.feitosQtd, r.feitosValor),
        },
        {
          label: "Cumpridos",
          value: qtdValor(r.cumpridosQtd, r.cumpridosValor),
          tone: r.cumpridosQtd > 0 ? "green" : undefined,
          hint: "Acordos quitados dentro do período",
        },
        {
          label: "Quebrados/cancelados",
          value: qtdValor(r.quebradosQtd, r.quebradosValor),
          tone: r.quebradosQtd > 0 ? "red" : undefined,
          hint: "Acordos fechados sem cumprir dentro do período",
        },
        {
          label: "Recebido em acordos",
          value: acordoPagosProntos ? formatCurrency(r.recebido, false) : "…",
          loading: !acordoPagosProntos,
          hint: "Parcelas de acordo pagas no período (no app ou na loja) — já está somado no Desempenho",
        },
      ]}
    />
  );

  // Card Agendamentos: os mesmos numeros das colunas da Tabela (agendadas,
  // realizadas, reagendadas, nao encontrado), por data efetiva no periodo.
  // Valor = saldo do cliente gravado quando o agendamento foi feito.
  const cardAgendamentos = (q: {
    agendadasQtd: number;
    agendadasValor: number;
    realizadasQtd: number;
    reagendadasQtd: number;
    reagendadasValor: number;
    naoEncontradoQtd: number;
    naoEncontradoValor: number;
    emAtrasoVisitas: number;
  }) => (
    <SummaryCard
      icon={CalendarCheck}
      title="Agendamentos"
      value={fmtNum(q.agendadasQtd)}
      valueTone="blue"
      caption={`agendados no período · ${formatCurrency(q.agendadasValor, false)}`}
      rows={[
        { label: "Realizados", value: fmtNum(q.realizadasQtd) },
        {
          label: "Reagendados",
          value: qtdValor(q.reagendadasQtd, q.reagendadasValor),
          tone: q.reagendadasQtd > 0 ? "amber" : undefined,
        },
        {
          label: "Não encontrado",
          value: qtdValor(q.naoEncontradoQtd, q.naoEncontradoValor),
        },
        {
          label: "Atrasados",
          value: fmtNum(q.emAtrasoVisitas),
          tone: q.emAtrasoVisitas > 0 ? "red" : undefined,
          hint: "Agendamentos cuja data já passou sem registro (situação de agora, não do período escolhido)",
        },
      ]}
    />
  );

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
                  <strong>Atrasados</strong> (visitas agendadas que já
                  passaram da data) mostra a situação de agora. O resto —
                  <strong> Carteira</strong>, <strong>Sem agendamento</strong>{" "}
                  e <strong>Com atraso</strong> incluídos — vale para o
                  período escolhido.
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
          {PERIODO_PRESETS.map((preset) => (
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
          // Pedido do usuario (2026-11-17): o mais simples possivel -- 4
          // grupos fixos (Carteira, Vencido, Numero de clientes,
          // Desempenho), mesmo layout do Meu desempenho do cobrador.
          // Carteira e Vencido ja foram unidos num card so, mas o gestor
          // pediu mais destaque pro valor vencido -- separados de novo,
          // sem repetir "A vencer" nos dois (fica so dentro de Carteira).
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <SummaryCard
              icon={Gauge}
              title="Desempenho"
              value={fmtRecebido(totals.recebidoPeriodo)}
              valueLoading={!atribuicoesProntas || !acordoPagosProntos}
              valueTone="green"
              caption={previstaPeriodHint}
              rows={[
                ...(metaGeral.meta > 0
                  ? [
                      {
                        label: "Meta do mês",
                        value: formatCurrency(metaGeral.meta, false),
                      },
                      !atribuicoesProntas
                        ? { label: "P/ alcançar a meta", value: "…", loading: true }
                        : metaGeral.meta - metaGeral.recebido > 0
                        ? {
                            label: "P/ alcançar a meta",
                            value: formatCurrency(
                              metaGeral.meta - metaGeral.recebido,
                              false,
                            ),
                            tone: "amber" as const,
                          }
                        : { label: "Meta", value: "atingida", tone: "green" as const },
                    ]
                  : [{ label: "Meta do mês", value: "não definida" }]),
                ...linhaAtendimentos(
                  totals.clientesAtendidos,
                  totals.clientesConversaram,
                  totals.acionamentosQtd,
                  rows.length > 0 && rows.every((r) => ehExterno(r.type)),
                ),
              ]}
            />
            <SummaryCard
              icon={Wallet}
              title="Carteira"
              value={formatCurrency(totals.valorCarteira, false)}
              caption="valor total no período"
              rows={[
                {
                  label: "A vencer",
                  value: formatCurrency(totals.previstaValor, false),
                },
                {
                  label: "% inadimplente",
                  value: formatarInadimplencia(
                    pctInad(totals.inadVenceu, totals.inadNaoPago),
                    totals.inadVenceu,
                  ),
                  hint: "Últimos 12 meses (regra de mercado) — não é o período escolhido no filtro",
                },
              ]}
            />
            <SummaryCard
              icon={Wallet}
              title="Vencido"
              value={formatCurrency(totals.vencidaValor, false)}
              valueTone="red"
              caption="valor vencido no período"
              rows={[
                {
                  label: "Sem agendamento",
                  value: fmtNum(totals.semAgendamentoClientes),
                  tone: totals.semAgendamentoClientes > 0 ? "amber" : undefined,
                  hint: "Toda a carteira do período (vencida ou a vencer) sem próxima visita marcada — não é só quem está vencido",
                },
              ]}
            />
            <SummaryCard
              icon={Users}
              title="Número de clientes"
              value={fmtNum(totals.clientesCarteira)}
              valueTone="blue"
              caption="clientes com vencimento no período"
              rows={[
                {
                  label: "Com atraso",
                  value: fmtNum(totals.clientesComAtraso),
                  tone: totals.clientesComAtraso > 0 ? "red" : undefined,
                },
                {
                  label: "Em dia",
                  value: fmtNum(totals.clientesCarteira - totals.clientesComAtraso),
                },
              ]}
            />
            {cardAcordos(somaAcordos(rows.map((r) => r.id)))}
            {cardAgendamentos(totals)}
          </div>
        )}
      </div>

      {viewMode === "cards" ? (
        // Com 1 cobrador so, o card usa a largura toda em vez de ficar
        // espremido num terco da tela — nao ha mais ninguem pra formar grid.
        // Mesmos 4 blocos da Visao geral (Carteira, Vencido, Numero de
        // clientes, Desempenho), so que por cobrador.
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
                <div className="flex-shrink-0 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDetalheCobradorId(row.id)}
                    title="Histórico mês a mês, pendências e carteira"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
                  >
                    <History className="h-3.5 w-3.5" />
                    Histórico
                  </button>
                  {isWalletCollectorType(row.type) && (
                    <button
                      type="button"
                      onClick={() => setScheduleContactCollectorId(row.id)}
                      title="Agendar ligação/WhatsApp para vários clientes"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      Agendar contatos
                    </button>
                  )}
                  {row.type === "collector" && (
                    <button
                      type="button"
                      onClick={() => setScheduleVisitCollectorId(row.id)}
                      title="Agendar visitas presenciais"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      Agendar visitas
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <SummaryCard
                  icon={Gauge}
                  title="Desempenho"
                  value={fmtRecebido(row.recebidoPeriodo)}
                  valueLoading={!atribuicoesProntas || !acordoPagosProntos}
                  valueTone="green"
                  caption={previstaPeriodHint}
                  rows={[
                    ...linhaMeta(row.id),
                    ...linhaAtendimentos(
                      row.clientesAtendidos,
                      row.clientesConversaram,
                      row.acionamentosQtd,
                      ehExterno(row.type),
                    ),
                  ]}
                />
                <SummaryCard
                  icon={Wallet}
                  title="Carteira"
                  value={formatCurrency(row.valorCarteira, false)}
                  caption="valor total no período"
                  rows={[
                    {
                      label: "A vencer",
                      value: formatCurrency(row.previstaValor, false),
                    },
                    {
                      label: "% inadimplente",
                      value: formatarInadimplencia(
                        pctInad(row.inadVenceu, row.inadNaoPago),
                        row.inadVenceu,
                      ),
                      hint: "Últimos 12 meses (regra de mercado) — não é o período escolhido no filtro",
                    },
                    ...(isWalletCollectorType(row.type) &&
                    !carteiraAuto.regrasPor.has(row.id)
                      ? [
                          {
                            label: "Saíram sem ação",
                            value: qtdSaidasValor(row.id),
                            loading: movCarregando,
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
                  title="Vencido"
                  value={formatCurrency(row.vencidaValor, false)}
                  valueTone="red"
                  caption="valor vencido no período"
                  rows={[
                    {
                      label: "Sem agendamento",
                      value: fmtNum(row.semAgendamentoClientes),
                      tone: row.semAgendamentoClientes > 0 ? "amber" : undefined,
                      hint: "Toda a carteira do período (vencida ou a vencer) sem próxima visita marcada — não é só quem está vencido",
                    },
                  ]}
                />
                <SummaryCard
                  icon={Users}
                  title="Número de clientes"
                  value={fmtNum(row.clientesCarteira)}
                  valueTone="blue"
                  caption="clientes com vencimento no período"
                  rows={[
                    {
                      label: "Com atraso",
                      value: fmtNum(row.clientesComAtraso),
                      tone: row.clientesComAtraso > 0 ? "red" : undefined,
                    },
                    {
                      label: "Em dia",
                      value: fmtNum(row.clientesCarteira - row.clientesComAtraso),
                    },
                  ]}
                />
                {/* Externo nao faz acordo (perfis de carteira, config/profiles). */}
                {isWalletCollectorType(row.type) &&
                  cardAcordos(somaAcordos([row.id]))}
                {cardAgendamentos(row)}
                {carteiraAuto.regrasPor.has(row.id) &&
                  (() => {
                    const regras = carteiraAuto.regrasPor.get(row.id) ?? [];
                    const vaoSair = carteiraAuto.vaoSairPor.get(row.id) ?? [];
                    const mov = movCarteira.get(row.id);
                    return (
                      <div className="sm:col-span-2">
                        <SummaryCard
                          icon={Shuffle}
                          title="Carteira automática"
                          value={fmtNum(vaoSair.length)}
                          valueTone={vaoSair.length > 0 ? "red" : "neutral"}
                          caption={`vão sair da carteira em até ${URGENTE_SAIDA_CARTEIRA_DIAS} dias`}
                          rows={[
                            ...(vaoSair.length > 0
                              ? [
                                  {
                                    label: "Vencido de quem vai sair",
                                    value: formatCurrency(
                                      vaoSair.reduce(
                                        (s, v) => s + v.vencido,
                                        0,
                                      ),
                                      false,
                                    ),
                                    tone: "red" as const,
                                    onClick: () =>
                                      setExpandedVaoSair((cur) =>
                                        cur === row.id ? null : row.id,
                                      ),
                                    hint: "Clique para ver os clientes",
                                  },
                                ]
                              : []),
                            {
                              label: "Entraram no período",
                              value: movCarregando
                                ? "…"
                                : mov
                                  ? fmtNum(mov.entraram)
                                  : "—",
                              loading: movCarregando,
                              hint: "Data em que o cliente foi atribuído ao cobrador — não é o vencimento da parcela, por isso pode não ter relação com o valor Vencido deste card",
                            },
                            {
                              label: "Saíram no período",
                              value: movCarregando
                                ? "…"
                                : mov
                                  ? fmtNum(mov.sairam)
                                  : "—",
                              loading: movCarregando,
                              hint: "Data em que o cliente deixou de ser do cobrador — não é o vencimento da parcela",
                            },
                            {
                              label: "Saíram sem ação",
                              value: qtdSaidasValor(row.id),
                              loading: movCarregando,
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
                          ]}
                          aside={<FaixasAlcance regras={regras} />}
                        />
                        {expandedVaoSair === row.id && vaoSair.length > 0 && (
                          <ul className="mt-1.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 px-3 py-2 text-xs text-red-800 dark:text-red-300 space-y-0.5 max-h-56 overflow-y-auto">
                            {vaoSair.map((v) => (
                              <li
                                key={v.documento}
                                className="flex justify-between gap-3"
                              >
                                <span className="truncate">{v.nome}</span>
                                <span className="shrink-0 font-semibold">
                                  {v.diasRestantes <= 0
                                    ? "sai hoje"
                                    : `${v.diasRestantes} ${v.diasRestantes === 1 ? "dia" : "dias"}`}{" "}
                                  · {formatCurrency(v.vencido, false)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
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
                    <button
                      type="button"
                      onClick={() => setDetalheCobradorId(row.id)}
                      title="Histórico mês a mês, pendências e carteira"
                      className="font-medium text-gray-900 dark:text-dark-text hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left"
                    >
                      {row.name}
                    </button>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {USER_TYPE_LABELS[row.type]}
                    </div>
                    {isWalletCollectorType(row.type) && (
                      <button
                        type="button"
                        onClick={() => setScheduleContactCollectorId(row.id)}
                        title="Agendar ligação/WhatsApp para vários clientes"
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                      >
                        <CalendarClock className="h-3 w-3" />
                        Agendar contatos
                      </button>
                    )}
                    {row.type === "collector" && (
                      <button
                        type="button"
                        onClick={() => setScheduleVisitCollectorId(row.id)}
                        title="Agendar visitas presenciais"
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                      >
                        <CalendarClock className="h-3 w-3" />
                        Agendar visitas
                      </button>
                    )}
                    {(carteiraAuto.vaoSairPor.get(row.id)?.length ?? 0) > 0 && (
                      <div
                        className="mt-1 flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400"
                        title={`Clientes que saem da carteira em até ${URGENTE_SAIDA_CARTEIRA_DIAS} dias (veja no modo Cards)`}
                      >
                        <Shuffle className="h-3 w-3" />
                        {fmtNum(carteiraAuto.vaoSairPor.get(row.id)!.length)}{" "}
                        vão sair em até {URGENTE_SAIDA_CARTEIRA_DIAS} dias
                      </div>
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
                    <div
                      className={`font-semibold text-green-600 dark:text-green-400 ${atribuicoesProntas ? "" : "animate-pulse"}`}
                    >
                      {fmtRecebido(row.recebidoPeriodo)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                      {formatCurrency(row.previstaValor, false)} ainda vence
                    </div>
                    {linhaMeta(row.id).map((m) => (
                      <div
                        key={m.label}
                        title={m.hint}
                        className={`text-[10px] font-semibold ${m.tone === "green" ? "text-green-600 dark:text-green-400" : "text-indigo-600 dark:text-indigo-400"}`}
                      >
                        {m.label}: {m.value}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap border-l border-gray-100 dark:border-dark-border/40">
                    <div
                      className="font-semibold text-blue-600 dark:text-blue-400"
                      title={atendimentoTexto(ehExterno(row.type)).clientes}
                    >
                      {atendimentosValor(row.clientesAtendidos)}
                    </div>
                    {(row.clientesAtendidos > 0 ||
                      atendimentos === null ||
                      atendimentosErro) && (
                      <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                        {atendimentosSub(row.clientesConversaram, ehExterno(row.type))}
                      </div>
                    )}
                    {row.acionamentosQtd > 0 && (
                      <div
                        className="text-[10px] text-gray-400 dark:text-dark-text-secondary"
                        title={atendimentoTexto(ehExterno(row.type)).registrosHint}
                      >
                        {atendimentosValor(row.acionamentosQtd)}{" "}
                        {atendimentoTexto(ehExterno(row.type)).registrosMin}
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

      {detalheCobrador && (
        <CollectorPerformanceModal
          isOpen
          onClose={() => setDetalheCobradorId(null)}
          collector={{
            collectorId: detalheCobrador.id,
            collectorName: detalheCobrador.name,
            collectorType: detalheCobrador.type,
          }}
        />
      )}

      {scheduleVisitCollectorId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setScheduleVisitCollectorId(null)}
        >
          <div
            className="rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto minimal-scrollbar pr-4"
            onClick={(e) => e.stopPropagation()}
          >
            <VisitScheduler
              collectorId={scheduleVisitCollectorId}
              onClose={() => setScheduleVisitCollectorId(null)}
            />
          </div>
        </div>
      )}

      {scheduleContactCollectorId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
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
