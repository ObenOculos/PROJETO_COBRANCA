import React, { useMemo, useState } from "react";
import { Building2, Users, Wallet, TrendingUp, Banknote } from "lucide-react";
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

// Os cards abaixo sao os MESMOS na visao geral da empresa e na dos cobradores
// (reuniao 25/11: "mesmo layout"). Empresa = base inteira; cobradores = so os
// titulos da carteira deles (sem cobrador e sempre 0, e os quitados viram
// "Pagaram no periodo").
//
// ORDEM (igual nas duas visoes, pedido de 25/11): da acao para o valor --
//   1. Clientes   (quem precisa de acao agora)
//   2. Previsao   (o que vai entrar)
//   3. Recebido / Desempenho (o que ja entrou + acionamentos)
//   4. Carteira   (o tamanho da divida; por ultimo)

/** Clientes: cada cliente cai em uma linha so (as linhas somam o total). */
export const CardClientes: React.FC<{
  r: Resumo;
  /** Visao dos cobradores: "Pagaram no periodo" no lugar de Quitados e sem a
   * linha "Sem cobrador" (sempre 0). */
  cobrador?: boolean;
}> = ({ r, cobrador = false }) => {
  const c = r.clientes;
  const linhasFinais: SummaryCardRow[] = cobrador
    ? [
        {
          label: "Pagaram no período",
          value: fmtNum(c.pagaram),
          tone: c.pagaram > 0 ? "green" : undefined,
          hint: "Clientes com pagamento no período: registrado pelo cobrador ou baixado no ERP",
        },
        {
          label: "↳ Só baixa no ERP",
          value: fmtNum(c.pagaramSoErp),
          hint: "Pagaram direto (loja, boleto, Pix) e o cobrador não registrou no app",
        },
      ]
    : [
        {
          label: "Quitados",
          value: fmtNum(c.quitados),
          hint: "Sem nenhum saldo em aberto",
        },
      ];
  return (
    <SummaryCard
      icon={Users}
      title="Clientes"
      value={fmtNum(cobrador ? c.emAtraso + c.emDia : c.total)}
      valueTone="blue"
      caption={
        cobrador
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
        ...(cobrador
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
          label: cobrador ? "↳ Sem agendamento" : "↳ Com cobrador, sem agendamento",
          value: fmtNum(c.semAgendamento),
          tone: c.semAgendamento > 0 ? "amber" : undefined,
          hint: "Nenhuma visita ou contato marcado: ação mais urgente",
        },
        {
          label: "      desses, acionados no período",
          value:
            c.semAgendamentoAcionados === null
              ? "…"
              : fmtNum(c.semAgendamentoAcionados),
          loading: c.semAgendamentoAcionados === null,
          hint: "Sem agendamento, mas o cobrador ligou, mandou mensagem ou visitou no período escolhido",
        },
        {
          label: cobrador ? "↳ Agendados" : "↳ Com cobrador e agendados",
          value: fmtNum(c.comAgendamento),
          hint: "Têm visita ou contato marcado (inclui agendamento que já passou da data sem registro)",
        },
        {
          label: "Em dia (a vencer)",
          value: fmtNum(c.emDia),
          tone: c.emDia > 0 ? "green" : undefined,
          hint: "Têm saldo, mas nada vencido",
        },
        ...linhasFinais,
      ]}
    />
  );
};

/** Carteira: o que os clientes devem hoje (vencido x a vencer) e o recorte
 * do periodo escolhido. */
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
      {
        label: "No período: vencido",
        value: fmtValor(r.carteira.vencidoPeriodo),
        tone: r.carteira.vencidoPeriodo > 0 ? "red" : undefined,
        hint: "Parcelas com vencimento dentro do período escolhido que já venceram",
      },
      {
        label: "No período: a vencer",
        value: fmtValor(r.carteira.aVencerPeriodo),
        hint: "Parcelas com vencimento dentro do período escolhido que ainda vão vencer",
      },
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

/** Previsao de recebimento: de hoje ate o fim do periodo. O que ja entrou
 * fica no card seguinte (Recebido / Desempenho). */
export const CardPrevisao: React.FC<{ r: Resumo }> = ({ r }) => {
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

/** Recebido no periodo da empresa -- mesmo lugar do Desempenho na visao dos
 * cobradores. Duas fontes que NAO se somam: a baixa do ERP (tudo que entrou)
 * ja inclui o que o cobrador registrou. */
const CardRecebidoEmpresa: React.FC<{
  r: Resumo;
  periodo: string;
  registradoCobradores: { valor: string; loading?: boolean };
  acionados: Set<string> | null;
}> = ({ r, periodo, registradoCobradores, acionados }) => (
  <SummaryCard
    icon={Banknote}
    title="Recebido no período"
    value={fmtValor(r.recebido.erp)}
    valueTone="green"
    caption={`baixa no ERP · ${periodo}`}
    rows={[
      {
        label: "Registrado pelos cobradores",
        value: registradoCobradores.valor,
        loading: registradoCobradores.loading,
        hint: "O que os cobradores registraram no app no período (inclui pago na loja atribuído e parcelas de acordo). Já está dentro da baixa do ERP — não somar.",
      },
      {
        label: "Pago direto (só baixa no ERP)",
        value: fmtValor(r.recebido.soErp),
        hint: "Baixado no ERP no período, de clientes sem pagamento registrado por cobrador (pagou na loja, boleto, Pix)",
      },
      {
        label: "Clientes acionados",
        value: acionados ? fmtNum(acionados.size) : "…",
        loading: !acionados,
        hint: "Clientes diferentes que algum cobrador ligou, mandou mensagem ou visitou no período",
      },
    ]}
  />
);

/**
 * Visao geral da empresa (reuniao 25/11): a base inteira de clientes -- nao
 * depende dos cobradores marcados no filtro. Clientes e Carteira sao a
 * situacao de agora (Carteira traz tambem o recorte do periodo); a Previsao
 * vai de hoje ate o fim do periodo. Regras em filters/resumoEmpresa. Fica no
 * mesmo quadro da visao geral dos cobradores (CollectorsSummary).
 */
const ResumoEmpresa: React.FC<{
  dateFrom: string;
  dateTo: string;
  today: string;
  /** Clientes acionados no periodo (todos os cobradores); null = carregando. */
  acionados: Set<string> | null;
  /** Clientes com pagamento registrado por algum cobrador no periodo. */
  registradosCobrador: Set<string>;
  /** Total registrado por todos os cobradores no periodo (ja formatado). */
  registradoCobradores: { valor: string; loading?: boolean };
  /** Legenda curta do periodo (ex.: "01/11/2026–30/11/2026"). */
  periodo: string;
}> = ({
  dateFrom,
  dateTo,
  today,
  acionados,
  registradosCobrador,
  registradoCobradores,
  periodo,
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
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-dark-text">
          <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Visão geral da empresa
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <CardClientes r={r} />
        <CardPrevisao r={r} />
        <CardRecebidoEmpresa
          r={r}
          periodo={periodo}
          registradoCobradores={registradoCobradores}
          acionados={acionados}
        />
        <CardCarteira r={r} empresa />
      </div>
    </div>
  );
};

export default ResumoEmpresa;
