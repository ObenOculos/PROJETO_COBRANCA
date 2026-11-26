import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarRange,
  Info,
  RotateCcw,
  Users,
  Wallet,
  TrendingUp,
  Banknote,
  Gauge,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { SummaryCardRow } from "../common/SummaryCard";
import FiltroMultiplo from "../common/FiltroMultiplo";
import { METRICA, TomPilula } from "../common/pilulaEstilo";
import { useCollection } from "../../contexts/CollectionContext";
import {
  resumoEmpresa,
  lojasDaBase,
  ResumoEmpresa as Resumo,
} from "../../filters/resumoEmpresa";
import {
  formatarInadimplencia,
  INADIMPLENCIA_A_PARTIR_DIAS,
} from "../../filters/inadimplencia";
import { PERIODO_TUDO_ATE } from "../../filters/periodo";
import {
  formatarPct,
  pctInadimplencia,
  pctRecuperacao,
} from "../../filters/inadimplenciaHistorico";
import {
  somarPontos,
  useMesPassadoPorLoja,
  usePontoPorLoja,
} from "../../hooks/useInadimplenciaHistorico";
import { formatCurrency } from "../../utils/formatters";

const fmtNum = (n: number): string => n.toLocaleString("pt-BR");
const fmtValor = (n: number): string => formatCurrency(n, false);
/** Valor arredondado para o numero grande: "R$ 5,7 mi", "R$ 341 mil". O
 * valor exato fica no "ver detalhes" e ao passar o mouse. */
const fmtValorCurto = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000)
    return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000)
    return `R$ ${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return formatCurrency(n, false);
};
const toBr = (iso: string): string => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const clientesTxt = (n: number) =>
  `${fmtNum(n)} ${n === 1 ? "cliente" : "clientes"}`;

// ---------------------------------------------------------------------------
// Card simples (pedido 25/11: gestor leigo, "como se fosse para uma
// crianca", com bom contraste, MAS nas cores do projeto -- nada saturado:
// mesmo cinza de card e mesmos chips claros do SummaryCard). Um card = uma
// pergunta:
//   icone colorido (assunto) -> numero bem grande -> frase curta ->
//   no maximo 2-3 "pilulas" de alerta -> o resto em "ver detalhes".
// Os NOMES dos cards sao os da reuniao (Clientes, Previsao, Desempenho,
// Carteira, Inadimplencia) -- nao trocar.
//
// ORDEM (gestor, 26/11): Carteira -> Inadimplencia -> Previsao -> Recebido,
// e Clientes numa faixa larga embaixo. Nos cobradores a 2a posicao e a
// Recuperacao (a carteira do cobrador so tem atrasado, a inadimplencia dele
// sai sempre alta). O card de valor recebido se chama "Recebido" na empresa
// e nos cobradores (pedido do usuario 26/11; antes "Desempenho" nos
// cobradores). Por dentro continua o CardDesempenho (meta e acionados).
// ---------------------------------------------------------------------------

type Tema = "red" | "indigo" | "blue" | "green" | "slate";

/** Quadrinho do card: numero em cima, rotulo curto embaixo. */
export interface Pilula {
  valor: string;
  rotulo: string;
  tom: TomPilula;
  hint?: string;
  loading?: boolean;
  onClick?: () => void;
}

// Mesmas cores do valor do SummaryCard (valueClasses).
// Borda de cor no topo (o usuario gostou -- 25/11), em tom -400 para nao
// ficar saturado.
const TEMA: Record<Tema, { faixa: string; numero: string; icone: string }> = {
  red: {
    faixa: "border-t-red-400 dark:border-t-red-500/70",
    numero: "text-red-600 dark:text-red-400",
    icone: "text-red-600 dark:text-red-400",
  },
  // Clientes (25/11: nao repetir o azul da Previsao; indigo ja e do projeto,
  // na Meta da equipe).
  indigo: {
    faixa: "border-t-indigo-400 dark:border-t-indigo-500/70",
    numero: "text-indigo-600 dark:text-indigo-400",
    icone: "text-indigo-600 dark:text-indigo-400",
  },
  blue: {
    faixa: "border-t-blue-400 dark:border-t-blue-500/70",
    numero: "text-blue-600 dark:text-blue-400",
    icone: "text-blue-600 dark:text-blue-400",
  },
  green: {
    faixa: "border-t-green-400 dark:border-t-green-500/70",
    numero: "text-green-600 dark:text-green-400",
    icone: "text-green-600 dark:text-green-400",
  },
  slate: {
    faixa: "border-t-gray-400 dark:border-t-gray-500/70",
    numero: "text-gray-900 dark:text-dark-text",
    icone: "text-gray-500 dark:text-dark-text-secondary",
  },
};

/** (i) que abre uma explicacao curta (clique; fecha ao clicar fora). */
const InfoDica: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [aberta, setAberta] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberta(false);
      }
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberta]);
  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-label="O que significa"
        className="text-gray-400 hover:text-blue-600 dark:text-dark-text-secondary dark:hover:text-blue-400"
      >
        <Info className="h-4 w-4" />
      </button>
      {aberta && (
        <span className="absolute right-0 top-6 z-20 w-64 rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-xs font-normal leading-snug text-blue-800 dark:text-blue-200 shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
};

export const CardSimples: React.FC<{
  icon: React.ElementType;
  titulo: string;
  tema: Tema;
  numero: string;
  numeroHint?: string;
  numeroLoading?: boolean;
  frase: string;
  pilulas?: Pilula[];
  /** 4 = quadrinhos numa linha so (card da largura toda, sm+). */
  colunas?: 2 | 4;
  detalhes?: SummaryCardRow[];
  /** Conteudo livre dentro do "ver detalhes" (ex.: faixas da regra). */
  detalhesExtra?: React.ReactNode;
  /** Logo abaixo da frase (ex.: barra com o mes passado). */
  extra?: React.ReactNode;
  /** Etiqueta no canto do titulo (ex.: mes do numero). */
  etiqueta?: string;
  /** Explicacao curta atras de um (i) no canto (26/11: texto no card
   * ficava grande demais). */
  info?: React.ReactNode;
  /** Link ao lado do "ver detalhes" (ex.: abrir a aba Inadimplencia). */
  acao?: { rotulo: string; onClick: () => void };
  /** Faixa larga e baixa (Clientes, 26/11): numero a esquerda e quadrinhos
   * numa linha so a direita (lg+). */
  faixa?: boolean;
  /** Faixa num espaco estreito (card de cada cobrador/loja): numero em
   * cima e quadrinhos numa linha so embaixo. */
  faixaEmpilhada?: boolean;
}> = ({
  icon: Icon,
  titulo,
  tema,
  numero,
  numeroHint,
  numeroLoading = false,
  frase,
  pilulas = [],
  colunas = 2,
  detalhes = [],
  detalhesExtra,
  extra,
  etiqueta,
  info,
  acao,
  faixa = false,
  faixaEmpilhada = false,
}) => {
  const [aberto, setAberto] = useState(false);
  const lado = faixa && !faixaEmpilhada;
  const t = TEMA[tema];
  const temDetalhes = detalhes.length > 0 || !!detalhesExtra;
  // Hierarquia (26/11): 1o o numero grande (tinta neutra -- a cor do
  // assunto fica so no icone e na borda do topo); 2o a barra/partes; 3o as
  // metricas secundarias, em texto sem caixa (cor so quando e alerta);
  // 4o os links. Antes tudo tinha caixa, borda e cor e disputava atencao.
  // 2 colunas no card normal (3 lado a lado cortava o rotulo); 4 so no
  // card da largura toda.
  const colsMetricas =
    pilulas.length >= 4 && colunas === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : "grid-cols-2";
  return (
    <div
      className={`min-w-0 flex flex-col rounded-xl border border-gray-200 dark:border-dark-border border-t-4 ${t.faixa} bg-gray-100 dark:bg-dark-bg px-4 pt-3 pb-2.5`}
    >
      <div className={lado ? "lg:flex lg:items-center lg:gap-8" : ""}>
        <div className={lado ? "lg:w-56 lg:shrink-0" : ""}>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-dark-text-secondary">
            <Icon className={`h-4 w-4 ${t.icone}`} />
            {titulo}
            {etiqueta && (
              <span
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-dark-text-secondary"
                title="Mês do número grande"
              >
                <CalendarRange className="h-3 w-3" />
                {etiqueta}
              </span>
            )}
            {info && (
              <span className={etiqueta ? "" : "ml-auto"}>
                <InfoDica>{info}</InfoDica>
              </span>
            )}
          </div>
          <div
            title={numeroHint}
            className={`mt-1 text-3xl font-extrabold leading-tight tracking-tight truncate text-gray-900 dark:text-dark-text ${numeroLoading ? "animate-pulse" : ""}`}
          >
            {numero}
          </div>
          <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
            {frase}
          </div>
        </div>
        {extra && <div className={lado ? "lg:flex-1 min-w-0" : ""}>{extra}</div>}

        {pilulas.length > 0 && (
          <div
            className={`mt-3 grid ${colsMetricas} gap-x-3 gap-y-2 border-t border-gray-200 dark:border-dark-border/60 pt-2.5 ${lado ? "lg:mt-0 lg:flex-1 lg:border-t-0 lg:pt-0" : ""}`}
          >
            {pilulas.map((p) => (
              <div
                key={p.rotulo}
                title={p.hint}
                onClick={p.onClick}
                role={p.onClick ? "button" : undefined}
                className={`min-w-0 ${p.onClick ? "cursor-pointer group" : ""}`}
              >
                <div
                  className={`text-base font-bold leading-tight truncate tabular-nums ${METRICA[p.tom]} ${p.onClick ? "group-hover:underline decoration-dotted" : ""} ${p.loading ? "animate-pulse" : ""}`}
                >
                  {p.valor}
                </div>
                <div className="text-[11px] leading-tight truncate text-gray-500 dark:text-dark-text-secondary">
                  {p.rotulo}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(temDetalhes || acao) && (
        <div className="mt-auto pt-3">
          {temDetalhes && aberto && (
            <div className="mb-1.5 space-y-1 border-t border-gray-300 dark:border-dark-border/60 pt-2">
              {detalhes.map((r) => (
                <div
                  key={r.label}
                  title={r.hint}
                  onClick={r.onClick}
                  className={`flex items-baseline justify-between gap-2 text-xs ${r.onClick ? "cursor-pointer" : ""}`}
                >
                  {/* "↪ ..." = parte da linha de cima: recuada (26/11). */}
                  <span
                    className={`text-gray-600 dark:text-dark-text-secondary truncate ${r.label.startsWith("↪") ? "pl-3" : ""}`}
                  >
                    {r.label}
                  </span>
                  <span
                    className={`font-bold whitespace-nowrap text-gray-900 dark:text-dark-text ${r.loading ? "animate-pulse" : ""}`}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
              {detalhesExtra}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            {temDetalhes ? (
              <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-dark-text-secondary dark:hover:text-dark-text"
              >
                {aberto ? "menos detalhes" : "ver detalhes"}
                {aberto ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span />
            )}
            {acao && (
              <button
                type="button"
                onClick={acao.onClick}
                className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                {acao.rotulo}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Os 4 cards. Empresa = base inteira; cobradores (`cobrador`) = so os titulos
// da carteira deles (sem cobrador e sempre 0, e quitados viram "pagaram").
// ---------------------------------------------------------------------------

const COR_PARTE: Record<TomPilula, string> = {
  gray: "bg-gray-300 dark:bg-gray-600",
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

/** Partes que somam o total (26/11): uma barra so dividida + legenda com
 * os numeros. Mostra a proporcao sem quatro caixas coloridas disputando
 * atencao com o numero principal. */
const BarraPartes: React.FC<{
  partes: (Pilula & { qtd: number })[];
  total: number;
}> = ({ partes, total }) => (
  <div className="mt-3">
    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-border">
      {total > 0 &&
        partes
          .filter((p) => p.qtd > 0)
          .map((p) => (
            <div
              key={p.rotulo}
              title={`${p.rotulo}: ${p.valor}`}
              className={`h-full ${COR_PARTE[p.tom]}`}
              style={{ width: `${(p.qtd / total) * 100}%` }}
            />
          ))}
    </div>
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
      {partes.map((p) => (
        <div key={p.rotulo} title={p.hint} className="flex items-baseline gap-1.5">
          <span
            className={`h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${COR_PARTE[p.tom]}`}
          />
          <span
            className={`text-base font-bold tabular-nums ${METRICA[p.tom]}`}
          >
            {p.valor}
          </span>
          <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
            {p.rotulo}
          </span>
        </div>
      ))}
    </div>
  </div>
);

/** 1. Clientes: o TOTAL e o numero principal e as etiquetas sao as PARTES
 * que somam o total (pedido do gestor 25/11: "quando somar vai bater com o
 * total"), na ordem dele: quitados, em dia, atraso com cobrador, atraso sem
 * cobrador. Cada cliente cai em uma parte so (filters/resumoEmpresa). O
 * "sem agendamento" e os acionados detalham o atraso com cobrador. */
export const CardClientes: React.FC<{
  r: Resumo;
  cobrador?: boolean;
  /** Faixa larga embaixo dos outros cards (gestor, 26/11). */
  faixa?: boolean;
  faixaEmpilhada?: boolean;
}> = ({ r, cobrador = false, faixa = false, faixaEmpilhada = false }) => {
  const c = r.clientes;
  const atrasoComCobrador = c.emAtraso - c.semCobrador;
  // Na carteira do cobrador nao ha quitado (quem quita sai da carteira) nem
  // "sem cobrador": as partes sao em dia + atraso com/sem agendamento, que
  // tambem somam o total (25/11).
  const partes: (Pilula & { qtd: number })[] = cobrador
    ? [
        {
          qtd: c.emDia,
          valor: fmtNum(c.emDia),
          rotulo: "em dia",
          tom: "green",
          hint: "Têm saldo, mas nada vencido",
        },
        {
          qtd: c.comAgendamento,
          valor: fmtNum(c.comAgendamento),
          rotulo: "atraso com agendamento",
          tom: "amber",
          hint: "Têm parcela vencida e visita ou contato marcado",
        },
        {
          qtd: c.semAgendamento,
          valor: fmtNum(c.semAgendamento),
          rotulo: "atraso sem agendamento",
          tom: "red",
          hint: "Têm parcela vencida e nenhuma visita ou contato marcado: ação mais urgente",
        },
      ]
    : [
        {
          qtd: c.quitados,
          valor: fmtNum(c.quitados),
          rotulo: "quitados",
          tom: "gray",
          hint: "Sem nenhum saldo em aberto",
        },
        {
          qtd: c.emDia,
          valor: fmtNum(c.emDia),
          rotulo: "em dia",
          tom: "green",
          hint: "Têm saldo, mas nada vencido",
        },
        {
          qtd: atrasoComCobrador,
          valor: fmtNum(atrasoComCobrador),
          rotulo: "atraso com cobrador",
          tom: "amber",
          hint: "Têm parcela vencida e estão na carteira de um cobrador",
        },
        {
          qtd: c.semCobrador,
          valor: fmtNum(c.semCobrador),
          rotulo: "atraso sem cobrador",
          tom: "red",
          hint: "Têm parcela vencida e não estão na carteira de nenhum cobrador: precisam ser incluídos",
        },
      ];
  const total = partes.reduce((soma, p) => soma + p.qtd, 0);

  return (
    <CardSimples
      icon={Users}
      titulo="Clientes"
      tema="indigo"
      numero={fmtNum(total)}
      frase={cobrador ? "clientes com saldo na carteira" : "clientes no total"}
      extra={<BarraPartes partes={partes} total={total} />}
      faixa={faixa}
      faixaEmpilhada={faixaEmpilhada}
      detalhes={[
        // No cobrador o com/sem agendamento ja esta nos quadrinhos.
        ...(cobrador
          ? []
          : [
              {
                label: "Atraso com cobrador, sem agendamento",
                value: fmtNum(c.semAgendamento),
                hint: "Nenhuma visita ou contato marcado",
              },
            ]),
        {
          label: cobrador
            ? "Atraso sem agendamento, mas acionados"
            : "↪ desses, acionados no período",
          value:
            c.semAgendamentoAcionados === null
              ? "…"
              : fmtNum(c.semAgendamentoAcionados),
          loading: c.semAgendamentoAcionados === null,
          hint: "O cobrador ligou, mandou mensagem ou visitou no período, mesmo sem agendamento",
        },
        ...(cobrador
          ? []
          : [
              {
                label: "Atraso com cobrador, com agendamento",
                value: fmtNum(c.comAgendamento),
              },
            ]),
        ...(cobrador
          ? [
              {
                label: "Pagaram no período",
                value: fmtNum(c.pagaram),
                hint: "Registrado pelo cobrador ou baixado no ERP",
              },
              {
                label: "Pagaram só na loja (sem o cobrador)",
                value: fmtNum(c.pagaramSoErp),
              },
            ]
          : []),
      ]}
    />
  );
};

/** 2. Previsao: quanto deve entrar de hoje ate o fim do periodo. */
export const CardPrevisao: React.FC<{ r: Resumo }> = ({ r }) => {
  const p = r.previsao;
  const frase = !p.de
    ? "o período escolhido já passou"
    : p.ate === PERIODO_TUDO_ATE
      ? "deve entrar de hoje em diante"
      : p.de === p.ate
        ? `deve entrar em ${toBr(p.de)}`
        : `deve entrar de hoje até ${toBr(p.ate)}`;
  return (
    <CardSimples
      icon={TrendingUp}
      titulo="Previsão"
      tema="blue"
      numero={p.de ? fmtValorCurto(p.total) : "—"}
      numeroHint={p.de ? fmtValor(p.total) : undefined}
      frase={frase}
      pilulas={
        p.de
          ? [
              { valor: p.parcelas, txt: "parcelas", n: p.parcelasClientes },
              { valor: p.acordo, txt: "acordos", n: p.acordoClientes },
              {
                valor: p.agendados,
                txt: "agendados (vencido)",
                n: p.agendadosClientes,
              },
            ].map((x) => ({
              valor: fmtValorCurto(x.valor),
              rotulo: x.txt,
              tom: "gray" as const,
              hint: `${fmtValor(x.valor)} · ${clientesTxt(x.n)}`,
            }))
          : []
      }
      detalhes={
        p.de
          ? [
              {
                label: "Parcelas que vencem",
                value: `${fmtValor(p.parcelas)} · ${clientesTxt(p.parcelasClientes)}`,
              },
              {
                label: "Parcelas de acordo",
                value: `${fmtValor(p.acordo)} · ${clientesTxt(p.acordoClientes)}`,
              },
              {
                // 26/11: a quantidade de clientes agendados so aparecia ao
                // passar o mouse -- agora fica na linha.
                label: "Agendados (valor vencido)",
                value: `${fmtValor(p.agendados)} · ${clientesTxt(p.agendadosClientes)}`,
                hint: "Clientes em atraso com visita ou contato marcado; o valor é o vencido deles",
              },
            ]
          : []
      }
    />
  );
};

/** 3a. Recebido (empresa ou loja): o que entrou no periodo, pela baixa do
 * ERP. "Pelos cobradores" e "acionados" saem do mesmo recorte (r), entao
 * acompanham o filtro de loja. */
export const CardRecebidoEmpresa: React.FC<{
  r: Resumo;
  /** Registros dos cobradores ainda carregando. */
  registradoCarregando?: boolean;
}> = ({ r, registradoCarregando = false }) => (
  <CardSimples
    icon={Banknote}
    titulo="Recebido"
    tema="green"
    numero={fmtValorCurto(r.recebido.erp)}
    numeroHint={fmtValor(r.recebido.erp)}
    frase="entrou no período"
    pilulas={[
      {
        valor: registradoCarregando ? "…" : fmtValorCurto(r.recebido.cobrador),
        rotulo: "pelos cobradores",
        tom: "gray",
        loading: registradoCarregando,
        hint: "Registrado pelos cobradores no app. Já está dentro do total — não somar.",
      },
      {
        valor:
          r.clientes.acionados === null ? "…" : fmtNum(r.clientes.acionados),
        rotulo: "clientes acionados",
        tom: "gray",
        loading: r.clientes.acionados === null,
        hint: "Clientes diferentes que algum cobrador ligou, mandou mensagem ou visitou no período",
      },
    ]}
    detalhes={[
      {
        label: "Pagaram na loja sem o cobrador",
        value: fmtValor(r.recebido.soErp),
        hint: "Baixado no ERP, de clientes sem pagamento registrado por cobrador",
      },
    ]}
  />
);

/** 3b. Desempenho (cobradores): o que o cobrador recebeu e a meta. */
export const CardDesempenho: React.FC<{
  r: Resumo;
  recebido: number;
  loading?: boolean;
  /** Meta do mes atual; null = sem meta definida. */
  meta: { meta: number; recebido: number } | null;
  /** Linhas de atendimento (acionados/acionamentos) para o "ver detalhes". */
  atendimentos: SummaryCardRow[];
}> = ({ r, recebido, loading = false, meta, atendimentos }) => {
  const pct = meta && meta.meta > 0 ? (meta.recebido / meta.meta) * 100 : 0;
  const pilulas: Pilula[] = meta
    ? [
        {
          valor: loading ? "…" : `${pct.toFixed(0)}%`,
          rotulo: pct >= 100 ? "meta do mês batida!" : "da meta do mês",
          tom: loading
            ? "gray"
            : pct >= 100
              ? "green"
              : pct >= 70
                ? "amber"
                : "red",
          loading,
          hint: `${fmtValor(meta.recebido)} de ${fmtValor(meta.meta)} no mês atual`,
        },
      ]
    : [{ valor: "—", rotulo: "sem meta definida", tom: "gray" }];
  // 1a linha de atendimentos = clientes acionados (ou visitados, externo):
  // vira etiqueta, como no card Recebido da empresa.
  const [clientesAtend, ...outrosAtend] = atendimentos;
  if (clientesAtend) {
    pilulas.push({
      valor: clientesAtend.value,
      rotulo: clientesAtend.label.toLowerCase(),
      tom: "gray",
      loading: clientesAtend.loading,
      hint: clientesAtend.hint,
    });
  }
  return (
    <CardSimples
      icon={Gauge}
      titulo="Recebido"
      tema="green"
      numero={loading ? "…" : fmtValorCurto(recebido)}
      numeroHint={fmtValor(recebido)}
      numeroLoading={loading}
      frase="recebido no período"
      pilulas={pilulas}
      detalhes={[
        ...(meta
          ? [
              { label: "Meta do mês", value: fmtValor(meta.meta) },
              {
                label: "Falta para a meta",
                value: fmtValor(Math.max(meta.meta - meta.recebido, 0)),
              },
            ]
          : []),
        {
          label: "Pagaram na loja sem o cobrador",
          value: fmtValor(r.recebido.soErp),
          hint: "Baixado no ERP no período, de clientes da carteira sem registro do cobrador",
        },
        ...outrosAtend,
      ]}
    />
  );
};

/** 4. Carteira: quanto os clientes devem hoje. */
export const CardCarteira: React.FC<{
  r: Resumo;
  empresa?: boolean;
  /** Pilulas a mais (ex.: "Saíram sem ação" do cobrador). */
  extraPilulas?: Pilula[];
}> = ({ r, empresa = false, extraPilulas = [] }) => {
  const total = r.carteira.vencido + r.carteira.aVencer;
  return (
    <CardSimples
      icon={Wallet}
      titulo="Carteira"
      tema="slate"
      numero={fmtValorCurto(total)}
      numeroHint={fmtValor(total)}
      frase={
        empresa
          ? "os clientes devem hoje"
          : "os clientes da carteira devem hoje"
      }
      pilulas={[
        {
          valor: fmtValorCurto(r.carteira.vencido),
          rotulo: "vencido",
          tom: r.carteira.vencido > 0 ? "red" : "green",
          hint: fmtValor(r.carteira.vencido),
        },
        {
          valor: fmtValorCurto(r.carteira.aVencer),
          rotulo: "a vencer",
          tom: "gray",
          hint: fmtValor(r.carteira.aVencer),
        },
        ...extraPilulas,
      ]}
      detalhes={[
        { label: "Vencido", value: fmtValor(r.carteira.vencido) },
        { label: "A vencer", value: fmtValor(r.carteira.aVencer) },
        {
          label: "Venceu no período",
          value: fmtValor(r.carteira.vencidoPeriodo),
          hint: "Parcelas com vencimento dentro do período escolhido que já venceram",
        },
        {
          label: "Vence no período",
          value: fmtValor(r.carteira.aVencerPeriodo),
          hint: "Parcelas com vencimento dentro do período escolhido que ainda vão vencer",
        },
        ...(empresa
          ? [
              {
                label: "Sem cobrador",
                value: fmtValor(r.carteira.foraDaCobranca),
                hint: "Saldo de clientes fora da carteira de qualquer cobrador",
              },
            ]
          : []),
      ]}
    />
  );
};

/** Barra cinza com o valor e um tracinho de referencia (mes passado) --
 * mesmo visual dos cards da aba Inadimplencia. */
const BarraReferencia: React.FC<{
  pct: number;
  escala: number;
  referencia: number | null | undefined;
  rotulo: string;
  cor: string;
}> = ({ pct, escala, referencia, rotulo, cor }) => {
  const pos = (v: number) =>
    `${Math.max(0, Math.min(100, (v / escala) * 100))}%`;
  return (
    <div className="relative mt-2 mb-4">
      <div className="h-3 rounded-full bg-gray-300/70 dark:bg-dark-border overflow-hidden">
        <div
          className={`h-full rounded-full ${cor}`}
          style={{ width: pos(pct) }}
        />
      </div>
      {referencia != null && (
        <div
          className="absolute top-[-3px] flex flex-col items-center -translate-x-1/2"
          style={{ left: pos(referencia) }}
          title={`${rotulo}: ${formatarPct(referencia)}`}
        >
          <span className="h-[18px] w-0.5 rounded bg-gray-700 dark:bg-gray-200" />
          <span className="mt-0.5 whitespace-nowrap text-[10px] text-gray-500 dark:text-dark-text-secondary">
            {rotulo}{" "}
            <strong className="text-gray-700 dark:text-dark-text">
              {formatarPct(referencia)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
};

/** 2. Inadimplencia (empresa/loja, 26/11): o numero que era um quadrinho da
 * Carteira, agora com card proprio e o mes passado na barra. */
export const CardInadimplencia: React.FC<{
  r: Resumo;
  /** % no fim do mes passado (RPC); null/undefined = sem tracinho. */
  mesPassado?: number | null;
  /** Recuperacao do mes das lojas do recorte (RPC); undefined = carregando,
   * null = sem dado. 26/11: o Resumo nao mostrava a recuperacao da empresa. */
  recuperacao?: { pct: number; recuperado: number; base: number } | null;
  onVerMesAMes?: () => void;
}> = ({ r, mesPassado, recuperacao, onVerMesAMes }) => {
  const i = r.inadimplencia;
  return (
    <CardSimples
      icon={AlertTriangle}
      titulo="Inadimplência"
      tema="red"
      numero={formatarInadimplencia(i.pct, i.venceu)}
      frase="do que venceu não foi pago"
      extra={
        <BarraReferencia
          pct={i.pct}
          escala={100}
          referencia={mesPassado}
          rotulo="mês passado"
          cor="bg-red-500"
        />
      }
      pilulas={[
        {
          valor: fmtValorCurto(i.naoPago),
          rotulo: "sem pagar",
          tom: "red",
          hint: fmtValor(i.naoPago),
        },
        {
          valor: fmtValorCurto(i.venceu),
          rotulo: "venceu em 12 meses",
          tom: "gray",
          hint: fmtValor(i.venceu),
        },
        ...(recuperacao !== null
          ? [
              {
                valor: recuperacao ? formatarPct(recuperacao.pct) : "…",
                loading: !recuperacao,
                rotulo: "recuperação no mês",
                tom: "green" as const,
                hint: recuperacao
                  ? `${fmtValor(recuperacao.recuperado)} pagos de ${fmtValor(recuperacao.base)} que estavam em atraso no início do mês (empresa inteira)`
                  : undefined,
              },
            ]
          : []),
      ]}
      info={
        recuperacao ? (
          <>
            <strong>Recuperação</strong>: do atraso de antes do mês, quanto foi
            pago no mês. Aqui é a <strong>empresa inteira</strong>; nos
            cobradores, só a carteira deles.
          </>
        ) : undefined
      }
      detalhes={[
        {
          label: "Sem pagar",
          value: fmtValor(i.naoPago),
          hint: `Atraso de ${INADIMPLENCIA_A_PARTIR_DIAS} dias ou mais, de parcelas que venceram nos últimos 12 meses`,
        },
        { label: "Venceu em 12 meses", value: fmtValor(i.venceu) },
        {
          label: `Atrasado há menos de ${INADIMPLENCIA_A_PARTIR_DIAS} dias`,
          value: fmtValor(i.atrasoRecente),
          hint: "Ainda não conta como inadimplência",
        },
        ...(recuperacao
          ? [
              {
                label: "Recuperado no mês",
                value: fmtValor(recuperacao.recuperado),
              },
              {
                label: "Em atraso no início do mês",
                value: fmtValor(recuperacao.base),
              },
            ]
          : []),
      ]}
      acao={
        onVerMesAMes ? { rotulo: "mês a mês", onClick: onVerMesAMes } : undefined
      }
    />
  );
};

/** Numeros do card Recuperacao (RPC inadimplencia_historico). */
export interface DadosRecuperacao {
  pct: number;
  recuperado: number;
  base: number;
  mesPassado: number | null;
  /** "nov/26 até hoje" */
  mes: string;
}

/** 2. Recuperacao (cobradores, 26/11): do atraso que vinha de antes do mes,
 * quanto voltou. */
export const CardRecuperacao: React.FC<{
  d: DadosRecuperacao | null;
  /** Inadimplencia da carteira (espelho do card da empresa, 26/11): la o
   * card grande e a inadimplencia com a recuperacao dentro; aqui o
   * contrario. A carteira so recebe cliente atrasado, entao esse % sai
   * alto e nao mede o trabalho do cobrador -- por isso fica secundario. */
  inad?: { pct: number; venceu: number; naoPago: number };
  onVerMesAMes?: () => void;
}> = ({ d, inad, onVerMesAMes }) => {
  const escala = d
    ? Math.max(10, Math.ceil(Math.max(d.pct, d.mesPassado ?? 0) / 10) * 10)
    : 10;
  return (
    <CardSimples
      icon={RotateCcw}
      titulo="Recuperação"
      tema="green"
      etiqueta={d?.mes}
      numero={d ? formatarPct(d.pct) : "…"}
      numeroLoading={!d}
      frase="do atraso da carteira foi pago no mês"
      info={
        <>
          Só a <strong>carteira dos cobradores</strong>; na empresa entra todo
          mundo, por isso o % muda.
          {inad &&
            " A inadimplência da carteira é alta porque só entra cliente atrasado."}
        </>
      }
      extra={
        d ? (
          <BarraReferencia
            pct={d.pct}
            escala={escala}
            referencia={d.mesPassado}
            rotulo="mês passado"
            cor="bg-green-500"
          />
        ) : undefined
      }
      pilulas={
        d
          ? [
              {
                valor: fmtValorCurto(d.recuperado),
                rotulo: "recuperados no mês",
                tom: "green",
                hint: fmtValor(d.recuperado),
              },
              {
                valor: fmtValorCurto(d.base),
                rotulo: "em atraso no início",
                tom: "gray",
                hint: fmtValor(d.base),
              },
              ...(inad
                ? [
                    {
                      valor: formatarInadimplencia(inad.pct, inad.venceu),
                      rotulo: "inadimplência",
                      tom: "gray" as const,
                      hint: `${fmtValor(inad.naoPago)} sem pagar de ${fmtValor(inad.venceu)} que venceram em 12 meses (só a carteira). Alta porque a carteira só recebe cliente atrasado.`,
                    },
                  ]
                : []),
            ]
          : []
      }
      acao={
        onVerMesAMes ? { rotulo: "mês a mês", onClick: onVerMesAMes } : undefined
      }
    />
  );
};

/**
 * Visao geral da empresa (reuniao 25/11): a base inteira de clientes -- nao
 * depende dos cobradores marcados no filtro. Regras em filters/resumoEmpresa.
 * Fica no mesmo quadro da visao geral dos cobradores (CollectorsSummary).
 */
const ResumoEmpresa: React.FC<{
  dateFrom: string;
  dateTo: string;
  today: string;
  /** Clientes acionados no periodo (todos os cobradores); null = carregando. */
  acionados: Set<string> | null;
  /** Clientes com pagamento registrado por algum cobrador no periodo. */
  registradosCobrador: Set<string>;
  /** Valor registrado pelos cobradores no periodo, por cliente. */
  registradoPorCliente: Map<string, number>;
  registradoCarregando?: boolean;
  /** Abre a aba Inadimplencia (link "mes a mes" do card). */
  onVerInadimplencia?: () => void;
}> = ({
  dateFrom,
  dateTo,
  today,
  acionados,
  registradosCobrador,
  registradoPorCliente,
  registradoCarregando = false,
  onVerInadimplencia,
}) => {
  const { collections, scheduledVisits, acordoAtivoOverdueMap } =
    useCollection();
  const [lojasExcluidas, setLojasExcluidas] = useState<Set<string>>(
    () => new Set(),
  );
  // Minimizar/expandir, igual a visao dos cobradores (25/11).
  const [aberta, setAberta] = useState(true);

  const lojas = useMemo(() => lojasDaBase(collections), [collections]);

  const r = useMemo(
    () =>
      resumoEmpresa({
        collections,
        scheduledVisits,
        acordoAtivoParcelas: acordoAtivoOverdueMap,
        dateFrom,
        dateTo,
        today,
        lojasExcluidas,
        acionados,
        registradosCobrador,
        registradoPorCliente,
      }),
    [
      collections,
      scheduledVisits,
      acordoAtivoOverdueMap,
      dateFrom,
      dateTo,
      today,
      lojasExcluidas,
      acionados,
      registradosCobrador,
      registradoPorCliente,
    ],
  );

  // Tracinho "mes passado" do card Inadimplencia: fim do mes passado das
  // lojas do filtro (guardado no banco, mesma regra).
  const mesPassadoLojas = useMesPassadoPorLoja(today.slice(0, 7), aberta);
  const inadMesPassado = useMemo(() => {
    if (!mesPassadoLojas) return null;
    const p = somarPontos(
      [...mesPassadoLojas.entries()]
        .filter(([loja]) => !lojasExcluidas.has(loja))
        .map(([, ponto]) => ponto),
    );
    return p && p.venceu > 0 ? pctInadimplencia(p) : null;
  }, [mesPassadoLojas, lojasExcluidas]);

  // Recuperacao do mes da empresa (lojas do filtro), mesma conta da aba
  // Inadimplencia. Uma consulta por loja (calculada na hora para o mes
  // atual, cache de tela) serve qualquer filtro de loja.
  const mesAtualLojas = usePontoPorLoja(today.slice(0, 7), aberta);
  const recuperacaoEmpresa = useMemo(() => {
    if (!mesAtualLojas) return undefined;
    const p = somarPontos(
      [...mesAtualLojas.entries()]
        .filter(([loja]) => !lojasExcluidas.has(loja))
        .map(([, ponto]) => ponto),
    );
    return p && p.atrasoInicioMes > 0
      ? {
          pct: pctRecuperacao(p),
          recuperado: p.recuperadoMes,
          base: p.atrasoInicioMes,
        }
      : null;
  }, [mesAtualLojas, lojasExcluidas]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-dark-text"
        >
          <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          Visão geral da empresa
          {aberta ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>
        <div className="sm:ml-auto flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-text-secondary">
          Loja
          <FiltroMultiplo
            opcoes={lojas.map((l) => ({ id: l, nome: l }))}
            excluidos={lojasExcluidas}
            onChange={setLojasExcluidas}
            textos={{
              todos: "Todas as lojas",
              nenhum: "Nenhuma loja",
              plural: "lojas",
            }}
          />
        </div>
      </div>

      {aberta && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <CardCarteira r={r} empresa />
          <CardInadimplencia
            r={r}
            mesPassado={inadMesPassado}
            recuperacao={recuperacaoEmpresa}
            onVerMesAMes={onVerInadimplencia}
          />
          <CardPrevisao r={r} />
          <CardRecebidoEmpresa
            r={r}
            registradoCarregando={registradoCarregando}
          />
          <div className="col-span-full">
            <CardClientes r={r} faixa />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumoEmpresa;
