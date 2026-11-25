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
  CalendarClock,
  Repeat,
  ChevronDown,
  ChevronUp,
  Gauge,
  Users,
  Store,
  UserX,
  Shuffle,
  History,
  TrendingDown,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { isCollectorType, UserType } from "../../types";
import { useAtendimentosPeriodo } from "../../hooks/useAtendimentosPeriodo";
import { useClientesAcionados } from "../../hooks/useClientesAcionados";
import FiltroMultiplo from "../common/FiltroMultiplo";
import SortTh from "../common/SortTh";
import ModoVisualizacao, { Modo } from "../common/ModoVisualizacao";
import ResumoPorLoja from "./ResumoPorLoja";
import AcompanhamentoInadimplencia from "./AcompanhamentoInadimplencia";
import ResumoEmpresa, {
  CardCarteira,
  CardClientes,
  CardDesempenho,
  CardPrevisao,
  CardSimples,
} from "./ResumoEmpresa";
import {
  resumoEmpresa,
  ResumoEmpresa as ResumoClientes,
} from "../../filters/resumoEmpresa";
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
import { inadimplenciaDe } from "../../filters/inadimplencia";
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
  // Mesma conta do painel Empresa (filters/resumoEmpresa), so com os
  // titulos da carteira deste cobrador: Carteira, Previsao e Clientes.
  resumo: ResumoClientes;
  // Documentos dos clientes com pagamento do cobrador no periodo.
  pagosDocs: Set<string>;
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

const SORT_GETTERS: Record<SortKey, (row: CollectorRow) => number | string> = {
  name: (r) => r.name,
  valorCarteira: (r) => r.resumo.carteira.vencido + r.resumo.carteira.aVencer,
  vencidaValor: (r) => r.vencidaValor,
  previstaValor: (r) => r.previstaValor,
  aReceberValor: (r) => r.aReceberValor,
  recebidoPeriodo: (r) => r.recebidoPeriodo,
  emAtrasoVisitas: (r) => r.emAtrasoVisitas,
  semAgendamentoClientes: (r) => r.resumo.clientes.semAgendamento,
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
        registrosHint:
          "Total de visitas concluídas no período (realizada, não encontrado ou reagendada)",
      }
    : {
        clientes: "Clientes acionados",
        conversou: "conversou",
        conversaram: "conversaram",
        registros: "Acionamentos",
        registrosMin: "acionamentos",
        registrosHint:
          "Total de registros no período, sem deduplicar por cliente",
      };
const ehExterno = (type: UserType): boolean => type === "collector";

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
                {qtdLojas > 0
                  ? `${qtdLojas} ${qtdLojas === 1 ? "loja" : "lojas"}`
                  : "todas as lojas"}
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
  type AtribuicaoAprovada = {
    collectorId: string;
    valor: number;
    data: string;
    /** Cliente (para o recorte por loja do Resumo Geral). */
    documento: string;
  };
  const CHAVE_ATRIBUICOES = "atribuicoesVigentes|todas|doc";
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
        .select("solicitado_por_id, valor_vigente, data_pagamento, documento");
      if (error) throw error;
      return (data || [])
        .filter((r) => r.solicitado_por_id && r.data_pagamento)
        .map((r) => ({
          collectorId: r.solicitado_por_id as string,
          valor: Number(r.valor_vigente) || 0,
          data: String(r.data_pagamento).slice(0, 10),
          documento: r.documento ?? "",
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
  const [expandedReincidente, setExpandedReincidente] = useState<string | null>(
    null,
  );
  // Agendamento em massa de contato (ligação/WhatsApp) pro gestor, sem
  // precisar logar como o cobrador -- ver ContactScheduler.
  const [scheduleContactCollectorId, setScheduleContactCollectorId] = useState<
    string | null
  >(null);
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
  // Modo de visualizacao das abas Por cobrador e Por loja (25/11: o gestor
  // escolhe Tabela ou Cards numa chave; antes o detalhe abria clicando na
  // linha). Padrao Tabela, melhor para comparar; a escolha fica salva.
  const [modo, setModo] = useState<Modo>(() =>
    localStorage.getItem("resumoGeralModo") === "cards" ? "cards" : "table",
  );
  useEffect(() => {
    localStorage.setItem("resumoGeralModo", modo);
  }, [modo]);
  // Abas do Resumo Geral (25/11): Geral (empresa + cobradores somados) e
  // Por cobrador (uma linha por cobrador). A ultima aba aberta fica salva.
  const [aba, setAba] = useState<
    "geral" | "cobrador" | "loja" | "inadimplencia"
  >(() => {
    const salva = localStorage.getItem("resumoGeralAba");
    return salva === "cobrador" || salva === "loja" || salva === "inadimplencia"
      ? salva
      : "geral";
  });
  useEffect(() => {
    localStorage.setItem("resumoGeralAba", aba);
  }, [aba]);
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
  const [excludedCollectorIds, setExcludedCollectorIds] = useState<Set<string>>(
    new Set(),
  );
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
  const { acionados } = useClientesAcionados(dateFrom, dateTo);
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
    linhas: {
      collectorId: string;
      valor: number;
      data: string;
      documento: string;
    }[];
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
          acordo_parcelas: {
            acordos: { client_document: string } | null;
          } | null;
        }>(
          (de, ate) =>
            supabase
              .from("acordo_pagamentos")
              .select(
                "collector_id, valor_pago, data_pagamento, acordo_parcelas(acordos(client_document))",
              )
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
            documento: l.acordo_parcelas?.acordos?.client_document ?? "",
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
  const [saidasCobradorId, setSaidasCobradorId] = useState<string | null>(null);
  const saidasCobrador = saidasCobradorId
    ? (users.find((u) => u.id === saidasCobradorId) ?? null)
    : null;
  const {
    porCobrador: saidasPorCobrador,
    recarregar: recarregarSaidasDetalhe,
  } = useSaidasSemAcao(dateFrom, dateTo, saidasCobradorId);
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

  // Pagamentos que ja foram estornados (o estorno aponta para o original):
  // o cliente nao conta como "pagou no periodo".
  const estornados = useMemo(
    () =>
      new Set(
        salePayments.map((p) => p.estornoDe).filter((id): id is string => !!id),
      ),
    [salePayments],
  );

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
            .filter((a) => a.collectorId === collector.id && inPeriod(a.data))
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

        const semAgendamentoClientes = Array.from(clientesCarteiraSet).filter(
          (doc) => lastVisitStatus.get(doc) !== "agendada",
        ).length;

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

        const pagosDocs = new Set<string>();
        salePayments.forEach((p) => {
          if (
            p.collectorId === collector.id &&
            inPeriod(p.paymentDate) &&
            !p.estornoDe &&
            !estornados.has(p.id) &&
            valorRecebidoTotal(p) > 0 &&
            p.clientDocument
          ) {
            pagosDocs.add(p.clientDocument);
          }
        });
        const resumo = resumoEmpresa({
          collections: myCollections,
          scheduledVisits,
          acordoAtivoParcelas: acordoAtivoOverdueMap,
          dateFrom,
          dateTo,
          today,
          acionados: acionados
            ? (acionados.get(collector.id) ?? new Set())
            : null,
          registradosCobrador: pagosDocs,
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
          resumo,
          pagosDocs,
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
    acordoAtivoOverdueMap,
    estornados,
    acionados,
  ]);

  // Secao dos cobradores somada: a MESMA conta do painel Empresa sobre os
  // titulos dos cobradores marcados (cliente com 2 cobradores conta 1 vez).
  const resumoCobradores = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    const registrados = new Set<string>();
    rows.forEach((r) => r.pagosDocs.forEach((d) => registrados.add(d)));
    let acionadosSel: Set<string> | null = null;
    if (acionados) {
      acionadosSel = new Set<string>();
      rows.forEach((r) =>
        acionados.get(r.id)?.forEach((d) => acionadosSel!.add(d)),
      );
    }
    return resumoEmpresa({
      collections: collections.filter((c) => !!c.user_id && ids.has(c.user_id)),
      scheduledVisits,
      acordoAtivoParcelas: acordoAtivoOverdueMap,
      dateFrom,
      dateTo,
      today,
      acionados: acionadosSel,
      registradosCobrador: registrados,
    });
  }, [
    rows,
    collections,
    scheduledVisits,
    acordoAtivoOverdueMap,
    dateFrom,
    dateTo,
    today,
    acionados,
  ]);

  // Visao da empresa: TODOS os cobradores (nao so os marcados no filtro).
  const empresaRegistrados = useMemo(() => {
    const docs = new Set<string>();
    salePayments.forEach((p) => {
      if (
        inPeriod(p.paymentDate) &&
        !p.estornoDe &&
        !estornados.has(p.id) &&
        valorRecebidoTotal(p) > 0 &&
        p.clientDocument
      ) {
        docs.add(p.clientDocument);
      }
    });
    return docs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salePayments, estornados, dateFrom, dateTo]);
  const empresaAcionados = useMemo(() => {
    if (!acionados) return null;
    const docs = new Set<string>();
    acionados.forEach((set) => set.forEach((d) => docs.add(d)));
    return docs;
  }, [acionados]);
  // Registrado pelos cobradores no periodo, por cliente (pagamentos do app,
  // atribuicoes aprovadas e pagamentos de acordo): o card Recebido da
  // empresa soma so os clientes do recorte, entao segue o filtro de loja.
  const registradoPorCliente = useMemo(() => {
    const mapa = new Map<string, number>();
    const soma = (doc: string | null | undefined, valor: number) => {
      if (!doc) return;
      mapa.set(doc, (mapa.get(doc) ?? 0) + valor);
    };
    salePayments.forEach((p) => {
      if (inPeriod(p.paymentDate))
        soma(p.clientDocument, valorRecebidoTotal(p));
    });
    atribuicoesAprovadas.forEach((a) => {
      if (inPeriod(a.data)) soma(a.documento, a.valor);
    });
    (acordoPagosProntos ? acordoPagos!.linhas : []).forEach((l) => {
      if (inPeriod(l.data)) soma(l.documento, l.valor);
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    salePayments,
    atribuicoesAprovadas,
    acordoPagos,
    acordoPagosProntos,
    dateFrom,
    dateTo,
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
        (sum, id) =>
          sum + acordoRecebido(id, inicioDoMes(today), fimDoMes(today)),
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

  const [expandedVaoSair, setExpandedVaoSair] = useState<string | null>(null);

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
        tone:
          atribuicoesProntas && m.pct >= 100 ? ("green" as const) : undefined,
        hint: `${formatCurrency(m.recebido, false)} recebidos no mês atual`,
      },
    ];
  };

  const detalheCobrador = detalheCobradorId
    ? users.find((u) => u.id === detalheCobradorId)
    : undefined;

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

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
            <ClipboardList className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            Resumo Geral
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
                  <strong>Geral</strong>: a empresa inteira (todos os clientes,
                  com ou sem cobrador) e, embaixo, os mesmos cards só com os
                  cobradores marcados.
                  <br />
                  <strong>Por cobrador</strong> e <strong>Por loja</strong>: uma
                  linha cada para comparar (Tabela) ou os cards de cada um
                  (Cards).
                  <br />
                  <strong>Clientes</strong> e <strong>Carteira</strong>: a
                  situação de hoje. <strong>Previsão</strong>: o que vence de
                  hoje até o fim do período escolhido.
                  <br />
                  <strong>Clientes atendidos</strong>: cada cliente conta uma
                  vez, mesmo atendido várias vezes.
                </div>
              )}
            </div>
          </h2>

          <div className="flex bg-gray-100 dark:bg-dark-bg rounded-lg p-0.5">
            {(
              [
                ["geral", "Geral", Gauge],
                ["cobrador", "Por cobrador", Users],
                ["loja", "Por loja", Store],
                ["inadimplencia", "Inadimplência", TrendingDown],
              ] as const
            ).map(([id, rotulo, Icone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-semibold transition-all touch-manipulation ${
                  aba === id
                    ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                }`}
              >
                <Icone className="h-4 w-4 mr-1.5" />
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* A aba Inadimplencia tem janela propria (12 meses de vencimento):
            o periodo nao se aplica a ela. */}
        {aba !== "inadimplencia" && (
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

            {/* Datas na mesma linha dos atalhos (25/11: o rotulo "Periodo
              personalizado" e o texto "(de ... ate ...)" repetiam as datas). */}
            <span className="hidden sm:block h-5 w-px bg-gray-200 dark:bg-dark-border mx-1" />
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
          </div>
        )}
      </div>

      {aba === "geral" && teamGoal && (
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
      {aba === "geral" && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border-2 border-blue-100 dark:border-blue-900/40 p-4 space-y-3">
          <ResumoEmpresa
            dateFrom={dateFrom}
            dateTo={dateTo}
            today={today}
            acionados={empresaAcionados}
            registradosCobrador={empresaRegistrados}
            registradoPorCliente={registradoPorCliente}
            registradoCarregando={!atribuicoesProntas || !acordoPagosProntos}
          />
          <div className="border-t-2 border-gray-200 dark:border-dark-border" />
          {/* Filtro de cobrador aqui, como o de Loja na visao da empresa
            (25/11): cada filtro fica junto do bloco que ele muda. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              onClick={() => setOverviewOpen((o) => !o)}
              className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-dark-text"
            >
              <Gauge className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {rows.length === 1
                ? "Visão geral do cobrador"
                : "Visão geral dos cobradores"}
              {overviewOpen ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            <div className="sm:ml-auto flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-text-secondary">
              Cobrador
              <FiltroMultiplo
                opcoes={allCollectors.map((c) => ({ id: c.id, nome: c.name }))}
                excluidos={excludedCollectorIds}
                onChange={setExcludedCollectorIds}
                textos={{
                  todos: "Todos os cobradores",
                  nenhum: "Nenhum cobrador",
                  plural: "cobradores",
                }}
              />
            </div>
          </div>

          {overviewOpen && (
            // Pedido do usuario (2026-11-17): o mais simples possivel -- 4
            // grupos fixos (Carteira, Vencido, Numero de clientes,
            // Desempenho), mesmo layout do Meu desempenho do cobrador.
            // Carteira e Vencido ja foram unidos num card so, mas o gestor
            // pediu mais destaque pro valor vencido -- separados de novo,
            // sem repetir "A vencer" nos dois (fica so dentro de Carteira).
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <CardClientes r={resumoCobradores} cobrador />
              <CardPrevisao r={resumoCobradores} />
              <CardDesempenho
                r={resumoCobradores}
                recebido={totals.recebidoPeriodo}
                loading={!atribuicoesProntas || !acordoPagosProntos}
                meta={metaGeral.meta > 0 ? metaGeral : null}
                atendimentos={linhaAtendimentos(
                  totals.clientesAtendidos,
                  totals.clientesConversaram,
                  totals.acionamentosQtd,
                  rows.length > 0 && rows.every((r) => ehExterno(r.type)),
                )}
              />
              <CardCarteira r={resumoCobradores} />
            </div>
          )}
        </div>
      )}

      {/* Por cobrador: filtro de cobrador (o mesmo da aba Geral) e a
          lista. */}
      {aba === "cobrador" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-text-secondary">
              Cobrador
              <FiltroMultiplo
                opcoes={allCollectors.map((c) => ({ id: c.id, nome: c.name }))}
                excluidos={excludedCollectorIds}
                onChange={setExcludedCollectorIds}
                textos={{
                  todos: "Todos os cobradores",
                  nenhum: "Nenhum cobrador",
                  plural: "cobradores",
                }}
              />
            </div>
            <div className="ml-auto">
              <ModoVisualizacao modo={modo} onChange={setModo} />
            </div>
          </div>

          {modo === "cards" ? (
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
                    <CardClientes r={row.resumo} cobrador />
                    <CardPrevisao r={row.resumo} />
                    <CardDesempenho
                      r={row.resumo}
                      recebido={row.recebidoPeriodo}
                      loading={!atribuicoesProntas || !acordoPagosProntos}
                      meta={metaPorCobrador.get(row.id) ?? null}
                      atendimentos={linhaAtendimentos(
                        row.clientesAtendidos,
                        row.clientesConversaram,
                        row.acionamentosQtd,
                        ehExterno(row.type),
                      )}
                    />
                    <CardCarteira
                      r={row.resumo}
                      extraPilulas={
                        isWalletCollectorType(row.type) &&
                        !carteiraAuto.regrasPor.has(row.id) &&
                        qtdSaidas(row.id) > 0
                          ? [
                              {
                                valor: qtdSaidasValor(row.id),
                                rotulo: "saíram sem ação",
                                tom: "red" as const,
                                loading: movCarregando,
                                onClick: () => setSaidasCobradorId(row.id),
                                hint: "Clientes que passaram da faixa no período sem nenhuma ação do cobrador. Clique para ver e devolver.",
                              },
                            ]
                          : []
                      }
                    />
                    {carteiraAuto.regrasPor.has(row.id) &&
                      (() => {
                        const regras = carteiraAuto.regrasPor.get(row.id) ?? [];
                        const vaoSair =
                          carteiraAuto.vaoSairPor.get(row.id) ?? [];
                        const mov = movCarteira.get(row.id);
                        return (
                          <div className="sm:col-span-2">
                            {/* Mesmo modelo dos outros cards (25/11): numero
                            grande + quadrinhos (4 numa linha, card largo);
                            as faixas da regra ficam no "ver detalhes". */}
                            <CardSimples
                              icon={Shuffle}
                              titulo="Carteira automática"
                              tema="red"
                              numero={fmtNum(vaoSair.length)}
                              frase={`vão sair da carteira em até ${URGENTE_SAIDA_CARTEIRA_DIAS} dias`}
                              colunas={4}
                              pilulas={[
                                {
                                  valor: formatCurrency(
                                    vaoSair.reduce((s, v) => s + v.vencido, 0),
                                    false,
                                  ),
                                  rotulo: "vencido de quem vai sair",
                                  tom: vaoSair.length > 0 ? "red" : "gray",
                                  onClick:
                                    vaoSair.length > 0
                                      ? () =>
                                          setExpandedVaoSair((cur) =>
                                            cur === row.id ? null : row.id,
                                          )
                                      : undefined,
                                  hint:
                                    vaoSair.length > 0
                                      ? "Clique para ver os clientes"
                                      : undefined,
                                },
                                {
                                  valor: movCarregando
                                    ? "…"
                                    : mov
                                      ? fmtNum(mov.entraram)
                                      : "—",
                                  rotulo: "entraram no período",
                                  tom: "gray",
                                  loading: movCarregando,
                                  hint: "Data em que o cliente foi atribuído ao cobrador — não é o vencimento da parcela",
                                },
                                {
                                  valor: movCarregando
                                    ? "…"
                                    : mov
                                      ? fmtNum(mov.sairam)
                                      : "—",
                                  rotulo: "saíram no período",
                                  tom: "gray",
                                  loading: movCarregando,
                                  hint: "Data em que o cliente deixou de ser do cobrador — não é o vencimento da parcela",
                                },
                                {
                                  valor: qtdSaidasValor(row.id),
                                  rotulo: "saíram sem ação",
                                  tom: qtdSaidas(row.id) > 0 ? "red" : "gray",
                                  loading: movCarregando,
                                  onClick:
                                    qtdSaidas(row.id) > 0
                                      ? () => setSaidasCobradorId(row.id)
                                      : undefined,
                                  hint: "Clientes que passaram da faixa no período sem nenhuma ação do cobrador. Clique para ver e devolver.",
                                },
                              ]}
                              detalhesExtra={<FaixasAlcance regras={regras} />}
                            />
                            {expandedVaoSair === row.id &&
                              vaoSair.length > 0 && (
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
                            <li
                              key={r.document}
                              className="flex justify-between"
                            >
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
                      title="Registrado pelo cobrador no app no período (a baixa do ERP fica na aba Geral)"
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
                            onClick={() =>
                              setScheduleContactCollectorId(row.id)
                            }
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
                        {(carteiraAuto.vaoSairPor.get(row.id)?.length ?? 0) >
                          0 && (
                          <div
                            className="mt-1 flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400"
                            title={`Clientes que saem da carteira em até ${URGENTE_SAIDA_CARTEIRA_DIAS} dias (veja no modo Cards)`}
                          >
                            <Shuffle className="h-3 w-3" />
                            {fmtNum(
                              carteiraAuto.vaoSairPor.get(row.id)!.length,
                            )}{" "}
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
                          {formatCurrency(
                            row.resumo.carteira.vencido +
                              row.resumo.carteira.aVencer,
                            false,
                          )}
                        </div>
                        <div className="text-[10px] text-red-500 dark:text-red-400">
                          {formatCurrency(row.resumo.carteira.vencido, false)}{" "}
                          vencido
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                          {formatCurrency(row.resumo.carteira.aVencer, false)} a
                          vencer
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
                            {atendimentosSub(
                              row.clientesConversaram,
                              ehExterno(row.type),
                            )}
                          </div>
                        )}
                        {row.acionamentosQtd > 0 && (
                          <div
                            className="text-[10px] text-gray-400 dark:text-dark-text-secondary"
                            title={
                              atendimentoTexto(ehExterno(row.type))
                                .registrosHint
                            }
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
                        {fmtNum(row.resumo.clientes.semAgendamento)}
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
        </>
      )}

      {aba === "inadimplencia" && <AcompanhamentoInadimplencia />}

      {aba === "loja" && (
        <ResumoPorLoja
          dateFrom={dateFrom}
          dateTo={dateTo}
          today={today}
          acionados={empresaAcionados}
          registradosCobrador={empresaRegistrados}
          registradoPorCliente={registradoPorCliente}
          registradoCarregando={!atribuicoesProntas || !acordoPagosProntos}
          modo={modo}
          onModo={setModo}
        />
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
