import React, { useMemo, useState } from "react";
import {
  Building2,
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
// ORDEM (igual na empresa e nos cobradores): Clientes -> Previsao ->
// Recebido/Desempenho -> Carteira (Carteira por ultimo, pedido do usuario).
// ---------------------------------------------------------------------------

type Tema = "red" | "indigo" | "blue" | "green" | "slate";
type TomPilula = "red" | "amber" | "green" | "gray";

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

// Mesmos chips claros das linhas de alerta do SummaryCard (rowClasses), com
// borda da propria cor em todas (25/11).
const PILULA: Record<TomPilula, string> = {
  red: "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  amber:
    "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  green:
    "bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  gray: "bg-white text-gray-700 border border-gray-300 dark:bg-dark-bg-secondary dark:text-dark-text dark:border-dark-border",
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
}) => {
  const [aberto, setAberto] = useState(false);
  const t = TEMA[tema];
  return (
    <div
      className={`min-w-0 flex flex-col rounded-xl border border-gray-200 border-t-4 ${t.faixa} dark:border-dark-border bg-gray-100 dark:bg-dark-bg px-4 py-3`}
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-dark-text-secondary">
        <Icon className={`h-4 w-4 ${t.icone}`} />
        {titulo}
      </div>
      <div
        title={numeroHint}
        className={`mt-1 text-3xl font-extrabold leading-tight truncate ${t.numero} ${numeroLoading ? "animate-pulse" : ""}`}
      >
        {numero}
      </div>
      <div className="text-sm text-gray-700 dark:text-dark-text">{frase}</div>

      {pilulas.length > 0 && (
        // Grade fixa de 2 colunas (25/11: etiquetas soltas quebravam em
        // varias linhas e o card ficava alto). Numero em cima, rotulo
        // embaixo; item impar no fim vira retangulo da largura toda.
        <div
          className={`mt-2 grid grid-cols-2 gap-1 ${colunas === 4 ? "sm:grid-cols-4" : ""}`}
        >
          {pilulas.map((p, i) => (
            <div
              key={p.rotulo}
              title={p.hint}
              onClick={p.onClick}
              role={p.onClick ? "button" : undefined}
              className={`min-w-0 rounded-md px-2 py-1 ${PILULA[p.tom]} ${pilulas.length % 2 === 1 && i === pilulas.length - 1 ? `col-span-2 ${colunas === 4 ? "sm:col-span-1" : ""}` : ""} ${p.onClick ? "cursor-pointer hover:opacity-90" : ""}`}
            >
              <div
                className={`text-sm font-bold leading-tight truncate ${p.loading ? "animate-pulse" : ""}`}
              >
                {p.valor}
              </div>
              <div className="text-[10px] font-medium leading-tight truncate opacity-90">
                {p.rotulo}
              </div>
            </div>
          ))}
        </div>
      )}

      {(detalhes.length > 0 || detalhesExtra) && (
        <div className="mt-auto pt-2">
          {aberto && (
            <div className="mb-1.5 space-y-1 border-t border-gray-300 dark:border-dark-border/60 pt-2">
              {detalhes.map((r) => (
                <div
                  key={r.label}
                  title={r.hint}
                  onClick={r.onClick}
                  className={`flex items-baseline justify-between gap-2 text-xs ${r.onClick ? "cursor-pointer" : ""}`}
                >
                  <span className="text-gray-600 dark:text-dark-text-secondary truncate">
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
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            {aberto ? "menos detalhes" : "ver detalhes"}
            {aberto ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Os 4 cards. Empresa = base inteira; cobradores (`cobrador`) = so os titulos
// da carteira deles (sem cobrador e sempre 0, e quitados viram "pagaram").
// ---------------------------------------------------------------------------

/** 1. Clientes: o TOTAL e o numero principal e as etiquetas sao as PARTES
 * que somam o total (pedido do gestor 25/11: "quando somar vai bater com o
 * total"), na ordem dele: quitados, em dia, atraso com cobrador, atraso sem
 * cobrador. Cada cliente cai em uma parte so (filters/resumoEmpresa). O
 * "sem agendamento" e os acionados detalham o atraso com cobrador. */
export const CardClientes: React.FC<{ r: Resumo; cobrador?: boolean }> = ({
  r,
  cobrador = false,
}) => {
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
      pilulas={partes}
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
            : "   desses, acionados no período",
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
                value: fmtValor(p.parcelas),
                hint: clientesTxt(p.parcelasClientes),
              },
              {
                label: "Parcelas de acordo",
                value: fmtValor(p.acordo),
                hint: clientesTxt(p.acordoClientes),
              },
              {
                label: "Agendados (valor vencido)",
                value: fmtValor(p.agendados),
                hint: `${clientesTxt(p.agendadosClientes)} em atraso com visita ou contato marcado`,
              },
            ]
          : []
      }
    />
  );
};

/** 3a. Recebido (empresa): o que entrou no periodo, pela baixa do ERP. */
const CardRecebidoEmpresa: React.FC<{
  r: Resumo;
  registradoCobradores: { valor: number; loading?: boolean };
  acionados: Set<string> | null;
}> = ({ r, registradoCobradores, acionados }) => (
  <CardSimples
    icon={Banknote}
    titulo="Recebido"
    tema="green"
    numero={fmtValorCurto(r.recebido.erp)}
    numeroHint={fmtValor(r.recebido.erp)}
    frase="entrou no período"
    pilulas={[
      {
        valor: registradoCobradores.loading
          ? "…"
          : fmtValorCurto(registradoCobradores.valor),
        rotulo: "pelos cobradores",
        tom: "gray",
        loading: registradoCobradores.loading,
        hint: "Registrado pelos cobradores no app. Já está dentro do total — não somar.",
      },
      {
        valor: acionados ? fmtNum(acionados.size) : "…",
        rotulo: "clientes acionados",
        tom: "gray",
        loading: !acionados,
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
      titulo="Desempenho"
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
        {
          valor: formatarInadimplencia(
            r.inadimplencia.pct,
            r.inadimplencia.venceu,
          ),
          rotulo: "inadimplência",
          tom: "gray",
          hint: `Do que venceu nos últimos 12 meses, com ${INADIMPLENCIA_A_PARTIR_DIAS} dias ou mais de atraso, quanto não foi pago`,
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
  /** Total registrado por todos os cobradores no periodo. */
  registradoCobradores: { valor: number; loading?: boolean };
}> = ({
  dateFrom,
  dateTo,
  today,
  acionados,
  registradosCobrador,
  registradoCobradores,
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
    ],
  );

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
          <CardClientes r={r} />
          <CardPrevisao r={r} />
          <CardRecebidoEmpresa
            r={r}
            registradoCobradores={registradoCobradores}
            acionados={acionados}
          />
          <CardCarteira r={r} empresa />
        </div>
      )}
    </div>
  );
};

export default ResumoEmpresa;
