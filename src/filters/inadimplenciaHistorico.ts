// Acompanhamento da inadimplencia mes a mes (item 93, 25/11).
//
// Os numeros vem prontos da RPC inadimplencia_historico (migrations
// 20261125000002/3): a regra e a mesma de filters/inadimplencia.ts
// (atraso a partir de 3 dias, vencimentos dos ultimos 12 meses, todos os
// titulos a prazo), reconstruida para o ultimo dia de cada mes. Aqui so as
// contas de exibicao -- percentuais, variacao e faixas -- para a tela nao
// reinventar nenhuma delas.
//
// Dois indicadores separados (decisao 25/11):
// - Inadimplencia: do que venceu em 12 meses, quanto nao foi pago. Mede
//   venda + cobranca juntas.
// - Recuperacao: do saldo em atraso no inicio do mes, quanto foi pago ate o
//   fim do mes (no mes corrente, ate hoje). Mede so a cobranca.

export interface PontoInadimplencia {
  /** Ultimo dia do mes (ou hoje, no mes corrente). YYYY-MM-DD. */
  dia: string;
  /** Loja, id do cobrador ou null (empresa / sem cobrador). */
  chave: string | null;
  /** "retrato" (gravado no dia) ou "reconstrucao" (pelas datas de pagamento). */
  fonte: string;
  venceu: number;
  naoPago: number;
  faixas: FaixasAtraso;
  atrasoInicioMes: number;
  recuperadoMes: number;
}

export interface FaixasAtraso {
  d3_30: number;
  d31_60: number;
  d61_90: number;
  d91_180: number;
  d181_365: number;
  d365_mais: number;
}

/** Ordem e rotulos das faixas (da mais nova para a mais antiga). */
export const FAIXAS_ATRASO: { chave: keyof FaixasAtraso; rotulo: string }[] = [
  { chave: "d3_30", rotulo: "3 a 30 dias" },
  { chave: "d31_60", rotulo: "31 a 60" },
  { chave: "d61_90", rotulo: "61 a 90" },
  { chave: "d91_180", rotulo: "91 a 180" },
  { chave: "d181_365", rotulo: "181 a 365" },
  { chave: "d365_mais", rotulo: "Mais de 1 ano" },
];

interface LinhaRpc {
  dia: string;
  chave: string | null;
  fonte: string;
  venceu: number | string | null;
  nao_pago: number | string | null;
  atraso_3_30: number | string | null;
  atraso_31_60: number | string | null;
  atraso_61_90: number | string | null;
  atraso_91_180: number | string | null;
  atraso_181_365: number | string | null;
  atraso_365_mais: number | string | null;
  atraso_inicio_mes: number | string | null;
  recuperado_mes: number | string | null;
}

const n = (v: number | string | null | undefined): number =>
  Number(v ?? 0) || 0;

export const pontoDaRpc = (l: LinhaRpc): PontoInadimplencia => ({
  dia: l.dia,
  chave: l.chave,
  fonte: l.fonte,
  venceu: n(l.venceu),
  naoPago: n(l.nao_pago),
  faixas: {
    d3_30: n(l.atraso_3_30),
    d31_60: n(l.atraso_31_60),
    d61_90: n(l.atraso_61_90),
    d91_180: n(l.atraso_91_180),
    d181_365: n(l.atraso_181_365),
    d365_mais: n(l.atraso_365_mais),
  },
  atrasoInicioMes: n(l.atraso_inicio_mes),
  recuperadoMes: n(l.recuperado_mes),
});

/** Inadimplencia do ponto, em % (0 quando nada venceu). */
export const pctInadimplencia = (p: PontoInadimplencia): number =>
  p.venceu > 0 ? (p.naoPago / p.venceu) * 100 : 0;

/** Recuperacao do mes, em % do atraso no inicio do mes. */
export const pctRecuperacao = (p: PontoInadimplencia): number =>
  p.atrasoInicioMes > 0 ? (p.recuperadoMes / p.atrasoInicioMes) * 100 : 0;

/** Todo o saldo em atraso no dia (todas as faixas). */
export const atrasoTotal = (p: PontoInadimplencia): number =>
  FAIXAS_ATRASO.reduce((s, f) => s + p.faixas[f.chave], 0);

/** Atraso de ate 90 dias / 91 a 365 / mais de 1 ano. */
export const atrasoPorIdade = (p: PontoInadimplencia) => ({
  ate90: p.faixas.d3_30 + p.faixas.d31_60 + p.faixas.d61_90,
  ate365: p.faixas.d91_180 + p.faixas.d181_365,
  maisDeAno: p.faixas.d365_mais,
});

/** Variacao em pontos percentuais entre dois valores de %. */
export const variacaoPp = (
  atual: number,
  anterior: number | null,
): number | null => (anterior == null ? null : atual - anterior);

/** Media simples de uma serie de % (ignora vazia). */
export const media = (valores: number[]): number =>
  valores.length > 0 ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "nov/26" a partir de YYYY-MM-DD (sem Date: evita o fuso). */
export const rotuloMes = (dia: string): string => {
  const [a, m] = dia.split("-");
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
};

/** "25/11" a partir de YYYY-MM-DD. */
export const rotuloDia = (dia: string): string => {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
};

export const formatarPct = (v: number, casas = 1): string =>
  `${v.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;

/** "+0,3 p.p." / "-1,2 p.p." / "0,0 p.p." */
export const formatarPp = (v: number): string =>
  `${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  )} p.p.`;

/** Abaixo disto (em p.p.) a inadimplencia conta como "estavel". */
export const TENDENCIA_LIMIAR_PP = 0.3;

export type Tendencia = "melhorou" | "estavel" | "piorou";

/** Inadimplencia: cair e bom. */
export const tendenciaInadimplencia = (varPp: number | null): Tendencia =>
  varPp == null || Math.abs(varPp) < TENDENCIA_LIMIAR_PP
    ? "estavel"
    : varPp < 0
      ? "melhorou"
      : "piorou";

/** Recuperacao do mes contra a media dos meses fechados: subir e bom
 * (margem de 10% da media para nao oscilar por pouco). */
export const tendenciaRecuperacao = (
  atual: number,
  mediaMeses: number,
): Tendencia =>
  mediaMeses <= 0 || Math.abs(atual - mediaMeses) < mediaMeses * 0.1
    ? "estavel"
    : atual > mediaMeses
      ? "melhorou"
      : "piorou";
