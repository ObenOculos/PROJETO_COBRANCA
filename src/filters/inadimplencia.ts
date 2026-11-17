// Inadimplencia -- fonte unica da regra (reuniao 16/11, itens 19/20/21;
// decisoes do usuario no mesmo dia).
//
// Forma de mercado para crediario/varejo: DO QUE VENCEU NO PERIODO, QUANTO
// NAO FOI PAGO, contando como inadimplente so o atraso acima de um corte.
//
//   inadimplencia % = saldo em aberto das parcelas com atraso > CORTE
//                     / valor original das parcelas com atraso > CORTE
//
// - Corte (INADIMPLENCIA_CORTE_DIAS = 30): parcela vencida ha ate 30 dias e
//   "atraso", nao inadimplencia -- aparece a parte (atrasoRecente).
// - Periodo: por padrao os vencimentos dos ultimos 12 meses
//   (INADIMPLENCIA_JANELA_DIAS). Sem janela, o historico de anos ja pagos
//   dilui o numero (16/11: 13,3% no historico todo x 20,3% em 12 meses).
//   Quando a tela ja recorta por vencimento (filtro do usuario), passe
//   `janelaDias: null` e vale o recorte dele.
// - Desconto concedido reduz o saldo em aberto (nao e inadimplencia).
// - Cancelados/agrupados/renegociados ja chegam fora (isForaDaCobranca).
// - Pendente (item 63 / pergunta 7 ao financeiro): baixa por PERCAS (perda)
//   hoje vem do Ciclone como recebida e por isso conta como paga; o correto
//   e contar como nao paga. Ajustar aqui quando o financeiro confirmar.

import { Collection } from "../types";
import { calculateOverdueDays } from "../utils/formatters";

export const INADIMPLENCIA_CORTE_DIAS = 30;
export const INADIMPLENCIA_JANELA_DIAS = 365;

export interface Inadimplencia {
  /** Valor original das parcelas com atraso > corte, no periodo (base). */
  venceu: number;
  /** Saldo em aberto dessas parcelas. */
  naoPago: number;
  /** naoPago / venceu * 100 (0 quando nada venceu). */
  pct: number;
  /** Saldo em aberto das parcelas vencidas ha 1..corte dias (so atraso). */
  atrasoRecente: number;
}

export interface OpcoesInadimplencia {
  /** Dias para tras de vencimento considerados; null = sem janela. */
  janelaDias?: number | null;
  corteDias?: number;
  /** Dias de atraso de um vencimento. Padrao: calculateOverdueDays; telas
   * que somam a carteira inteira passam criarCalculoAtraso() (cache). */
  atrasoDias?: (vencimento: string | null | undefined) => number;
}

const saldoAberto = (c: Collection) =>
  Number(c.valor_original || 0) -
  Number(c.valor_recebido || 0) -
  Number(c.desconto || 0);

export const inadimplenciaDe = (
  titulos: Collection[],
  {
    janelaDias = INADIMPLENCIA_JANELA_DIAS,
    corteDias = INADIMPLENCIA_CORTE_DIAS,
    atrasoDias = calculateOverdueDays,
  }: OpcoesInadimplencia = {},
): Inadimplencia => {
  let venceu = 0;
  let naoPago = 0;
  let atrasoRecente = 0;
  titulos.forEach((c) => {
    const atraso = atrasoDias(c.data_vencimento);
    if (atraso <= 0) return;
    if (janelaDias != null && atraso > janelaDias) return;
    const aberto = saldoAberto(c);
    if (atraso <= corteDias) {
      if (aberto > 0.01) atrasoRecente += aberto;
      return;
    }
    venceu += Number(c.valor_original || 0);
    if (aberto > 0.01) naoPago += aberto;
  });
  return {
    venceu,
    naoPago,
    pct: venceu > 0 ? (naoPago / venceu) * 100 : 0,
    atrasoRecente,
  };
};

/**
 * Para onde foi o que foi vendido: divide o valor original dos titulos em
 * partes que SOMAM o total (Desempenho Loja, 16/11 -- antes Financeiro e
 * Inadimplencia mostravam o mesmo dinheiro em cortes diferentes e nenhum
 * fechava a conta).
 *
 *   vendido = recebido + desconto + aVencer + atrasoRecente
 *             + inadJanela + inadAntigo
 *
 * Tudo por PARCELA (saldo aberto = original - recebido - desconto; saldo de
 * ate 1 centavo ou negativo conta como quitado, mesmo corte da
 * inadimplenciaDe). `inadJanela` e exatamente o `naoPago` da
 * inadimplencia do recorte; `inadAntigo` e o saldo com atraso > corte que
 * ficou fora da janela (zero sem janela).
 */
export interface ComposicaoCarteira {
  vendido: number;
  recebido: number;
  desconto: number;
  aVencer: number;
  atrasoRecente: number;
  inadJanela: number;
  inadAntigo: number;
  /** atrasoRecente + inadJanela + inadAntigo (todo saldo vencido). */
  vencido: number;
  /** Saldo em aberto: aVencer + vencido. */
  emAberto: number;
  /** Inadimplencia do mesmo recorte (o % sai daqui). */
  inadimplencia: Inadimplencia;
}

export const composicaoCarteira = (
  titulos: Collection[],
  opcoes: OpcoesInadimplencia = {},
): ComposicaoCarteira => {
  const corteDias = opcoes.corteDias ?? INADIMPLENCIA_CORTE_DIAS;
  const atrasoDias = opcoes.atrasoDias ?? calculateOverdueDays;
  let vendido = 0;
  let desconto = 0;
  let aVencer = 0;
  let atrasoRecente = 0;
  let inadTotal = 0;
  titulos.forEach((c) => {
    vendido += Number(c.valor_original || 0);
    desconto += Number(c.desconto || 0);
    const aberto = saldoAberto(c);
    if (aberto <= 0.01) return;
    const atraso = atrasoDias(c.data_vencimento);
    if (atraso <= 0) aVencer += aberto;
    else if (atraso <= corteDias) atrasoRecente += aberto;
    else inadTotal += aberto;
  });
  const inadimplencia = inadimplenciaDe(titulos, { ...opcoes, atrasoDias });
  const inadJanela = inadimplencia.naoPago;
  const inadAntigo = Math.max(0, inadTotal - inadJanela);
  const vencido = atrasoRecente + inadTotal;
  const emAberto = aVencer + vencido;
  return {
    vendido,
    recebido: vendido - desconto - emAberto,
    desconto,
    aVencer,
    atrasoRecente,
    inadJanela,
    inadAntigo,
    vencido,
    emAberto,
    inadimplencia,
  };
};

/** Recorte de periodo da inadimplencia na tela: janela padrao, historico
 * todo, ou o filtro de vencimento do usuario (que prevalece). */
export type RecorteInadimplencia = "janela" | "tudo" | "filtro";

export const janelaDoRecorte = (r: RecorteInadimplencia): number | null =>
  r === "janela" ? INADIMPLENCIA_JANELA_DIAS : null;

/** Texto do recorte usado, para mostrar junto do numero. */
export const descricaoRecorteInadimplencia = (
  r: RecorteInadimplencia,
  corteDias = INADIMPLENCIA_CORTE_DIAS,
): string =>
  r === "filtro"
    ? `atraso > ${corteDias} dias · vencimentos do filtro`
    : r === "tudo"
      ? `atraso > ${corteDias} dias · todo o histórico`
      : `atraso > ${corteDias} dias · vencimentos dos últimos ${Math.round(INADIMPLENCIA_JANELA_DIAS / 30.4)} meses`;

/** Percentual para exibir: "—" quando nada venceu alem do corte no recorte
 * (ex.: periodo recente, so com atraso de ate 30 dias) -- 0% enganaria. */
export const formatarInadimplencia = (
  pct: number,
  venceu: number,
  casas = 1,
): string =>
  venceu > 0
    ? `${pct.toLocaleString("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      })}%`
    : "—";

/** Faixas de cor da tela. Ajustar aqui se o gestor quiser outro corte. */
export const FAIXA_INADIMPLENCIA = { baixa: 10, media: 25 } as const;

export type NivelInadimplencia = "baixa" | "media" | "alta";

export const nivelInadimplencia = (pct: number): NivelInadimplencia =>
  pct <= FAIXA_INADIMPLENCIA.baixa
    ? "baixa"
    : pct <= FAIXA_INADIMPLENCIA.media
      ? "media"
      : "alta";
