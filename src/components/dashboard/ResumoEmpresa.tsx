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
import { useCollection } from "../../contexts/CollectionContext";
import {
  resumoEmpresa,
  lojasDaBase,
  ResumoEmpresa as Resumo,
} from "../../filters/resumoEmpresa";
import { formatarInadimplencia } from "../../filters/inadimplencia";
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

export interface Pilula {
  texto: string;
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

// Mesmos chips claros das linhas de alerta do SummaryCard (rowClasses).
const PILULA: Record<TomPilula, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  gray: "bg-white text-gray-700 border border-gray-200 dark:bg-dark-bg-secondary dark:text-dark-text dark:border-dark-border",
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
  detalhes?: SummaryCardRow[];
}> = ({
  icon: Icon,
  titulo,
  tema,
  numero,
  numeroHint,
  numeroLoading = false,
  frase,
  pilulas = [],
  detalhes = [],
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
        // Etiquetas lado a lado (25/11: empilhadas deixavam o card alto e o
        // vizinho com um vazio estranho).
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pilulas.map((p) => (
            <div
              key={p.texto}
              title={p.hint}
              onClick={p.onClick}
              role={p.onClick ? "button" : undefined}
              className={`rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap ${PILULA[p.tom]} ${p.loading ? "animate-pulse" : ""} ${p.onClick ? "cursor-pointer hover:opacity-90" : ""}`}
            >
              {p.texto}
            </div>
          ))}
        </div>
      )}

      {detalhes.length > 0 && (
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

/** 1. Clientes: o TOTAL e o numero principal (pedido 25/11); embaixo, em
 * atraso e o que falta fazer com eles. */
export const CardClientes: React.FC<{ r: Resumo; cobrador?: boolean }> = ({
  r,
  cobrador = false,
}) => {
  const c = r.clientes;
  const base = cobrador ? c.emAtraso + c.emDia : c.total;
  const pilulas: Pilula[] = [
    {
      texto: `${fmtNum(c.emAtraso)} em atraso`,
      tom: c.emAtraso > 0 ? "red" : "green",
      hint: "Têm alguma parcela vencida",
    },
  ];
  if (!cobrador && c.semCobrador > 0) {
    pilulas.push({
      texto: `${fmtNum(c.semCobrador)} sem cobrador`,
      tom: "red",
      hint: "Em atraso e fora da carteira de qualquer cobrador: precisam ser incluídos",
    });
  }
  if (c.semAgendamento > 0) {
    pilulas.push({
      texto: `${fmtNum(c.semAgendamento)} sem agendamento`,
      tom: "amber",
      hint: "Em atraso, com cobrador, sem visita ou contato marcado",
    });
  }

  const acionados: SummaryCardRow = {
    label: "Sem agendamento, mas acionados no período",
    value:
      c.semAgendamentoAcionados === null
        ? "…"
        : fmtNum(c.semAgendamentoAcionados),
    loading: c.semAgendamentoAcionados === null,
    hint: "O cobrador ligou, mandou mensagem ou visitou no período, mesmo sem agendamento",
  };
  return (
    <CardSimples
      icon={Users}
      titulo="Clientes"
      tema="indigo"
      numero={fmtNum(base)}
      frase={
        cobrador
          ? "clientes com saldo na carteira"
          : "clientes no total (com e sem saldo)"
      }
      pilulas={pilulas}
      detalhes={[
        acionados,
        { label: "Em atraso com agendamento", value: fmtNum(c.comAgendamento) },
        {
          label: "Em dia (a vencer)",
          value: fmtNum(c.emDia),
          hint: "Têm saldo, mas nada vencido",
        },
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
          : [
              {
                label: "Quitados",
                value: fmtNum(c.quitados),
                hint: "Sem nenhum saldo em aberto",
              },
            ]),
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
              { valor: p.parcelas, txt: "em parcelas", n: p.parcelasClientes },
              { valor: p.acordo, txt: "de acordos", n: p.acordoClientes },
              { valor: p.agendados, txt: "de agendados", n: p.agendadosClientes },
            ]
              .filter((x) => x.valor > 0)
              .map((x) => ({
                texto: `${fmtValorCurto(x.valor)} ${x.txt}`,
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
        texto: registradoCobradores.loading
          ? "… pelos cobradores"
          : `${fmtValorCurto(registradoCobradores.valor)} pelos cobradores`,
        tom: "gray",
        loading: registradoCobradores.loading,
        hint: "Registrado pelos cobradores no app. Já está dentro do total — não somar.",
      },
      {
        texto: acionados
          ? `${fmtNum(acionados.size)} clientes acionados`
          : "… clientes acionados",
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
          texto: loading
            ? "… da meta"
            : pct >= 100
              ? "Meta do mês batida!"
              : `${pct.toFixed(0)}% da meta do mês`,
          tom: loading ? "gray" : pct >= 100 ? "green" : pct >= 70 ? "amber" : "red",
          loading,
          hint: `${fmtValor(meta.recebido)} de ${fmtValor(meta.meta)} no mês atual`,
        },
      ]
    : [{ texto: "Sem meta definida", tom: "gray" }];
  // 1a linha de atendimentos = clientes acionados (ou visitados, externo):
  // vira etiqueta, como no card Recebido da empresa.
  const [clientesAtend, ...outrosAtend] = atendimentos;
  if (clientesAtend) {
    pilulas.push({
      texto: `${clientesAtend.value} ${clientesAtend.label.toLowerCase()}`,
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
      frase={empresa ? "os clientes devem hoje" : "os clientes da carteira devem hoje"}
      pilulas={[
        {
          texto: `${fmtValorCurto(r.carteira.vencido)} vencido`,
          tom: r.carteira.vencido > 0 ? "red" : "green",
          hint: fmtValor(r.carteira.vencido),
        },
        {
          texto: `${fmtValorCurto(r.carteira.aVencer)} a vencer`,
          tom: "gray",
          hint: fmtValor(r.carteira.aVencer),
        },
        {
          texto: `Inadimplência ${formatarInadimplencia(r.inadimplencia.pct, r.inadimplencia.venceu)}`,
          tom: "gray",
          hint: "Do que venceu nos últimos 12 meses há mais de 30 dias, quanto não foi pago (regra de mercado)",
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
  const [loja, setLoja] = useState("");

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
        loja,
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
      loja,
      acionados,
      registradosCobrador,
    ],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-dark-text">
          <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          Visão geral da empresa
        </div>
        <label className="sm:ml-auto flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-text-secondary">
          Loja
          <select
            value={loja}
            onChange={(e) => setLoja(e.target.value)}
            className="w-56 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-sm text-gray-900 dark:text-dark-text truncate"
          >
            <option value="">Todas</option>
            {lojas.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

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
    </div>
  );
};

export default ResumoEmpresa;
