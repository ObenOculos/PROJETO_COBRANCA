import React, { useMemo, useState } from "react";
import { Building2, Users, Wallet, TrendingUp } from "lucide-react";
import SummaryCard, { SummaryCardRow } from "../common/SummaryCard";
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
const toBr = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const clientesTxt = (n: number) =>
  `${fmtNum(n)} ${n === 1 ? "cliente" : "clientes"}`;

// Os 3 cards abaixo sao os MESMOS no painel Empresa e na secao dos cobradores
// (reuniao 25/11: "mesmo layout"). Empresa = base inteira; nos cobradores = so
// os titulos da carteira deles (sem cobrador e sempre 0, e os quitados viram
// "Pagaram no periodo").

/** Clientes: cada cliente cai em uma linha so (as linhas somam o total). */
export const CardClientes: React.FC<{
  r: Resumo;
  /** Secao dos cobradores: clientes que pagaram no periodo (no lugar de
   * Quitados). Sem isto = painel Empresa. */
  pagos?: { qtd: number; loading?: boolean };
}> = ({ r, pagos }) => {
  const c = r.clientes;
  const linhaFinal: SummaryCardRow = pagos
    ? {
        label: "Pagaram no período",
        value: pagos.loading ? "…" : fmtNum(pagos.qtd),
        loading: pagos.loading,
        tone: pagos.qtd > 0 ? "green" : undefined,
        hint: "Clientes com pagamento registrado pelo cobrador no período escolhido",
      }
    : {
        label: "Quitados",
        value: fmtNum(c.quitados),
        hint: "Sem nenhum saldo em aberto",
      };
  return (
    <SummaryCard
      icon={Users}
      title="Clientes"
      value={fmtNum(pagos ? c.emAtraso + c.emDia : c.total)}
      valueTone="blue"
      caption={
        pagos
          ? "clientes com saldo na carteira, hoje"
          : "todos os clientes da base, hoje"
      }
      rows={[
        {
          label: "Em atraso",
          value: fmtNum(c.emAtraso),
          tone: c.emAtraso > 0 ? "red" : undefined,
          hint: "Têm alguma parcela vencida",
        },
        ...(pagos
          ? []
          : [
              {
                label: "↳ Sem cobrador",
                value: fmtNum(c.semCobrador),
                tone: c.semCobrador > 0 ? ("red" as const) : undefined,
                hint: "Em atraso e fora da carteira de qualquer cobrador: precisam ser incluídos",
              },
            ]),
        {
          label: pagos ? "↳ Sem agendamento" : "↳ Com cobrador, sem agendamento",
          value: fmtNum(c.semAgendamento),
          tone: c.semAgendamento > 0 ? "amber" : undefined,
          hint: "Nenhuma visita ou contato marcado: ação mais urgente",
        },
        {
          label: pagos ? "↳ Agendados" : "↳ Com cobrador e agendados",
          value: fmtNum(c.comAgendamento),
          hint: "Têm visita ou contato marcado (inclui agendamento que já passou da data sem registro)",
        },
        {
          label: "Em dia (a vencer)",
          value: fmtNum(c.emDia),
          tone: c.emDia > 0 ? "green" : undefined,
          hint: "Têm saldo, mas nada vencido",
        },
        linhaFinal,
      ]}
    />
  );
};

/** Carteira: o que os clientes devem hoje, vencido x a vencer. */
export const CardCarteira: React.FC<{
  r: Resumo;
  empresa?: boolean;
  /** Linhas a mais no fim (ex.: "Saíram sem ação" do cobrador). */
  extraRows?: SummaryCardRow[];
}> = ({ r, empresa = false, extraRows = [] }) => (
  <SummaryCard
    icon={Wallet}
    title={empresa ? "Carteira da empresa" : "Carteira"}
    value={fmtValor(r.carteira.vencido + r.carteira.aVencer)}
    caption="tudo que os clientes devem hoje"
    rows={[
      {
        label: "Vencido",
        value: fmtValor(r.carteira.vencido),
        tone: r.carteira.vencido > 0 ? "red" : undefined,
      },
      { label: "A vencer", value: fmtValor(r.carteira.aVencer) },
      ...(empresa
        ? [
            {
              label: "Fora da cobrança",
              value: fmtValor(r.carteira.foraDaCobranca),
              tone:
                r.carteira.foraDaCobranca > 0 ? ("amber" as const) : undefined,
              hint: "Saldo (vencido + a vencer) de clientes sem cobrador",
            },
          ]
        : []),
      {
        label: "% inadimplente",
        value: formatarInadimplencia(
          r.inadimplencia.pct,
          r.inadimplencia.venceu,
        ),
        hint: "Do que venceu nos últimos 12 meses há mais de 30 dias, quanto não foi pago (regra de mercado). Não depende do período escolhido.",
      },
      ...extraRows,
    ]}
  />
);

/** Previsao de recebimento: de hoje ate o fim do periodo. Com `recebido`,
 * mostra tambem o que ja entrou no periodo (a receber x recebido). */
export const CardPrevisao: React.FC<{
  r: Resumo;
  recebido?: { valor: string; loading?: boolean };
}> = ({ r, recebido }) => {
  const p = r.previsao;
  const janelaTxt = !p.de
    ? "o período escolhido já passou"
    : p.ate === PERIODO_TUDO_ATE
      ? "de hoje em diante"
      : p.de === p.ate
        ? `para ${toBr(p.de)}`
        : `de ${toBr(p.de)} até ${toBr(p.ate)}`;
  const linhas: SummaryCardRow[] = p.de
    ? [
        {
          label: "Parcelas que vencem",
          value: fmtValor(p.parcelas),
          hint: `${clientesTxt(p.parcelasClientes)} — parcelas com vencimento na janela (cliente sem acordo)`,
        },
        {
          label: "Parcelas de acordo",
          value: fmtValor(p.acordo),
          hint: `${clientesTxt(p.acordoClientes)} — parcelas de acordo ativo com vencimento na janela`,
        },
        {
          label: "Agendados (vencido)",
          value: fmtValor(p.agendados),
          hint: `${clientesTxt(p.agendadosClientes)} em atraso com visita ou contato marcado na janela — soma o valor vencido deles`,
        },
      ]
    : [{ label: "A previsão olha de hoje em diante", value: "" }];
  if (recebido) {
    linhas.push({
      label: "Já recebido no período",
      value: recebido.valor,
      loading: recebido.loading,
      tone: "green",
      hint: "O que entrou no período escolhido (mesmo valor do Desempenho)",
    });
  }
  return (
    <SummaryCard
      icon={TrendingUp}
      title="Previsão de recebimento"
      value={p.de ? fmtValor(p.total) : "—"}
      valueTone="green"
      caption={janelaTxt}
      rows={linhas}
    />
  );
};

/**
 * Painel "Empresa" do Resumo (reuniao 25/11): a base inteira de clientes --
 * nao depende dos cobradores marcados no filtro. O periodo vale so para a
 * Previsao (de hoje ate o fim do periodo); Clientes e Carteira sao a situacao
 * de agora. Regras em filters/resumoEmpresa.
 */
const ResumoEmpresa: React.FC<{
  dateFrom: string;
  dateTo: string;
  today: string;
}> = ({ dateFrom, dateTo, today }) => {
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
      }),
    [
      collections,
      scheduledVisits,
      acordoAtivoOverdueMap,
      dateFrom,
      dateTo,
      today,
      loja,
    ],
  );

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border-2 border-emerald-100 dark:border-emerald-900/40 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-dark-text">
          <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Empresa
          <span className="text-xs font-normal text-gray-400 dark:text-dark-text-secondary">
            (todos os clientes, com ou sem cobrador)
          </span>
        </div>
        <label className="sm:ml-auto flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-text-secondary">
          Loja
          <select
            value={loja}
            onChange={(e) => setLoja(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text"
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CardClientes r={r} />
        <CardCarteira r={r} empresa />
        <CardPrevisao r={r} />
      </div>
    </div>
  );
};

export default ResumoEmpresa;
