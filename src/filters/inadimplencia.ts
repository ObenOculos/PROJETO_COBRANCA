// Inadimplencia -- fonte unica da regra (reuniao 16/11, itens 19/20/21;
// decisao do usuario): DO QUE JA VENCEU, QUANTO NAO FOI PAGO.
//
//   inadimplencia % = saldo em aberto das parcelas vencidas
//                     / valor original das parcelas vencidas
//
// "Vencida" = vencimento antes de hoje (calculateOverdueDays > 0), pagas ou
// nao. Desconto concedido reduz o saldo em aberto (nao e inadimplencia).
// Com o filtro de vencimento da tela, vira a inadimplencia daquele periodo.

import { Collection } from "../types";
import { calculateOverdueDays } from "../utils/formatters";

export interface Inadimplencia {
  /** Valor original das parcelas que ja venceram (base do %). */
  venceu: number;
  /** Saldo em aberto dessas parcelas (valor - recebido - desconto). */
  naoPago: number;
  /** naoPago / venceu * 100 (0 quando nada venceu). */
  pct: number;
}

export const inadimplenciaDe = (titulos: Collection[]): Inadimplencia => {
  let venceu = 0;
  let naoPago = 0;
  titulos.forEach((c) => {
    if (calculateOverdueDays(c.data_vencimento) <= 0) return;
    venceu += Number(c.valor_original || 0);
    const aberto =
      Number(c.valor_original || 0) -
      Number(c.valor_recebido || 0) -
      Number(c.desconto || 0);
    if (aberto > 0.01) naoPago += aberto;
  });
  return { venceu, naoPago, pct: venceu > 0 ? (naoPago / venceu) * 100 : 0 };
};

/** Faixas de cor da tela. Ajustar aqui se o gestor quiser outro corte. */
export const FAIXA_INADIMPLENCIA = { baixa: 10, media: 25 } as const;

export type NivelInadimplencia = "baixa" | "media" | "alta";

export const nivelInadimplencia = (pct: number): NivelInadimplencia =>
  pct <= FAIXA_INADIMPLENCIA.baixa
    ? "baixa"
    : pct <= FAIXA_INADIMPLENCIA.media
      ? "media"
      : "alta";
