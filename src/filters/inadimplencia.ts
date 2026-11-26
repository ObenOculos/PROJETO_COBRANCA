// Inadimplencia -- fonte unica da regra (reuniao 16/11, itens 19/20/21;
// decisoes do usuario no mesmo dia).
//
// Forma de mercado para crediario/varejo: DO QUE VENCEU NO PERIODO, QUANTO
// NAO FOI PAGO, contando como inadimplente so o atraso acima de um corte.
//
//   inadimplencia % = saldo em aberto das parcelas com atraso > CORTE
//                     / valor original das parcelas com atraso > CORTE
//
// - Corte: inadimplente a partir de INADIMPLENCIA_A_PARTIR_DIAS = 3 dias de
//   atraso (gestor, 25/11; antes 30). Vencida ha 1..2 dias e "atraso", nao
//   inadimplencia -- aparece a parte (atrasoRecente). Internamente a conta e
//   "atraso > INADIMPLENCIA_CORTE_DIAS" (= a partir de - 1).
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
import { addDiasStr } from "./periodo";

export const INADIMPLENCIA_A_PARTIR_DIAS = 3;
export const INADIMPLENCIA_CORTE_DIAS = INADIMPLENCIA_A_PARTIR_DIAS - 1;
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

// ---------------------------------------------------------------------------
// FOTO de 12 meses num dia (26/11, etapa 1: NUMERO OFICIAL da inadimplencia
// no Resumo e na aba -- um nome, uma conta). Mesma regra da RPC
// inadimplencia_calculo (migrations 20261125000003/20261126000004):
//   no dia D, das parcelas que venceram entre D-365 e D-3, quanto estava
//   sem pagar em D.
//   aberto em D = original - desconto, se a baixa foi depois de D;
//                 original - recebido - desconto, se nao ha data ou foi ate D
// Com D = hoje da o mesmo que inadimplenciaDe() sem recorte. Comparavel mes
// a mes (o grafico da aba e esta conta no fim de cada mes).
// ---------------------------------------------------------------------------

export const inadimplenciaFotoEm = (
  titulos: Collection[],
  dia: string,
): Inadimplencia => {
  const de = addDiasStr(dia, -INADIMPLENCIA_JANELA_DIAS);
  const ateInad = addDiasStr(dia, -INADIMPLENCIA_A_PARTIR_DIAS);
  let venceu = 0;
  let naoPago = 0;
  let atrasoRecente = 0;
  titulos.forEach((c) => {
    const v = c.data_vencimento?.slice(0, 10);
    if (!v || v < de || v >= dia) return;
    const original = Number(c.valor_original || 0);
    const desconto = Number(c.desconto || 0);
    const pago = c.data_de_recebimento?.slice(0, 10) || null;
    const aberto =
      !pago || pago <= dia
        ? Math.max(original - Number(c.valor_recebido || 0) - desconto, 0)
        : original - desconto;
    if (v > ateInad) {
      if (aberto > 0.01) atrasoRecente += aberto;
      return;
    }
    venceu += original;
    if (aberto > 0.01) naoPago += aberto;
  });
  return {
    venceu,
    naoPago,
    pct: venceu > 0 ? (naoPago / venceu) * 100 : 0,
    atrasoRecente,
  };
};

// ---------------------------------------------------------------------------
// SAFRA de 30 dias de um periodo (26/11, etapa 2): o jeito de mercado de
// comparar periodos. "Venceu no periodo, sem pagar HOJE" nao compara (o mes
// recente sempre parece pior so por ter tido menos tempo); aqui cada parcela
// e olhada no MESMO prazo -- 30 dias depois do vencimento.
//   safra % = das parcelas que venceram no periodo ha 30+ dias, quanto
//             estava sem pagar no 30o dia depois do vencimento
//   aberto no dia X = original - desconto, se a baixa foi depois de X;
//                     original - recebido - desconto, se nao ha data ou ate X
// As que venceram ha menos de 30 dias ainda estao "no prazo": ficam a parte
// (valor que venceu e quanto segue aberto hoje). Mesma regra da RPC
// inadimplencia_periodo (migration 20261126000006).
// ---------------------------------------------------------------------------

export const SAFRA_DIAS = 30;

export interface Safra {
  /** Valor original das parcelas do periodo vencidas ha SAFRA_DIAS+ dias. */
  venceu: number;
  /** Delas, o que estava sem pagar no dia vencimento + SAFRA_DIAS. */
  semPagar: number;
  /** semPagar / venceu * 100 (0 sem base). */
  pct: number;
  /** Parcelas do periodo vencidas ha menos de SAFRA_DIAS dias. */
  noPrazoVenceu: number;
  /** Delas, o que segue aberto hoje. */
  noPrazoAberto: number;
}

export const safraDe = (
  titulos: Collection[],
  de: string,
  ate: string,
  hoje: string,
): Safra => {
  const maturadoAte = addDiasStr(hoje, -SAFRA_DIAS);
  let venceu = 0;
  let semPagar = 0;
  let noPrazoVenceu = 0;
  let noPrazoAberto = 0;
  titulos.forEach((c) => {
    const v = c.data_vencimento?.slice(0, 10);
    if (!v || v < de || v > ate || v >= hoje) return;
    const original = Number(c.valor_original || 0);
    const desconto = Number(c.desconto || 0);
    const resto = Math.max(
      original - Number(c.valor_recebido || 0) - desconto,
      0,
    );
    if (v > maturadoAte) {
      noPrazoVenceu += original;
      if (resto > 0.01) noPrazoAberto += resto;
      return;
    }
    const pago = c.data_de_recebimento?.slice(0, 10) || null;
    const corte = addDiasStr(v, SAFRA_DIAS);
    const aberto = !pago || pago <= corte ? resto : original - desconto;
    venceu += original;
    if (aberto > 0.01) semPagar += aberto;
  });
  return {
    venceu,
    semPagar,
    pct: venceu > 0 ? (semPagar / venceu) * 100 : 0,
    noPrazoVenceu,
    noPrazoAberto,
  };
};

// ---------------------------------------------------------------------------
// Recuperacao de um periodo (26/11: acompanha o filtro de datas da tela).
//
// MESMA regra da RPC (inadimplencia_calculo, migration 20261125000003), so
// que com qualquer inicio em vez do 1o dia do mes:
//   S = vespera do inicio; D = fim do periodo (no maximo hoje)
//   aberto em X = original - desconto, se a baixa foi depois de X;
//                 original - recebido - desconto, se nao ha data ou foi ate X
//   base       = aberto em S das parcelas ja em atraso (>= 3 dias) em S
//   recuperado = (aberto em S - aberto em D) dessas mesmas parcelas
// Com o inicio no dia 1 e o fim hoje, da o mesmo numero da aba
// Inadimplencia (recuperacao do mes). Atraso de qualquer idade (decisao
// 25/11). Fora da cobranca ja chega fora da base (isForaDaCobranca).
// ---------------------------------------------------------------------------

export interface Recuperacao {
  /** Saldo em atraso na vespera do inicio. */
  base: number;
  /** Quanto desse saldo foi pago ate o fim do periodo. */
  recuperado: number;
  /** recuperado / base * 100 (0 sem base). */
  pct: number;
  /** Periodo efetivo (fim limitado a hoje). */
  de: string;
  ate: string;
}

/** Dias corridos de `de` ate `ate` (YYYY-MM-DD; sem fuso). */
const diasEntre = (de: string, ate: string): number => {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(ate) - utc(de)) / 86400000);
};

/** Recuperacao do periodo [de, ate]; null quando o periodo ainda nao
 * comecou (de > hoje). */
export const recuperacaoDe = (
  titulos: Collection[],
  de: string,
  ate: string,
  hoje: string,
): Recuperacao | null => {
  const fim = ate < hoje ? ate : hoje;
  if (!de || de > fim) return null;
  const vespera = addDiasStr(de, -1);
  const venceuAte = addDiasStr(vespera, -INADIMPLENCIA_A_PARTIR_DIAS);
  let base = 0;
  let recuperado = 0;
  titulos.forEach((c) => {
    const v = c.data_vencimento?.slice(0, 10);
    if (!v || v > venceuAte) return;
    const original = Number(c.valor_original || 0);
    const desconto = Number(c.desconto || 0);
    const cheio = original - desconto;
    const resto = Math.max(original - Number(c.valor_recebido || 0) - desconto, 0);
    const pago = c.data_de_recebimento?.slice(0, 10) || null;
    const abertoS = !pago || pago <= vespera ? resto : cheio;
    const abertoD = !pago || pago <= fim ? resto : cheio;
    base += abertoS;
    recuperado += abertoS - abertoD;
  });
  return {
    base,
    recuperado,
    pct: base > 0.01 ? (recuperado / base) * 100 : 0,
    de,
    ate: fim,
  };
};

/** Periodo anterior do mesmo tamanho (para a referencia na barra): termina
 * na vespera do inicio e tem os mesmos dias corridos do periodo efetivo. */
export const periodoAnterior = (
  de: string,
  ateEfetivo: string,
): { de: string; ate: string } => {
  const dias = diasEntre(de, ateEfetivo) + 1;
  return { de: addDiasStr(de, -dias), ate: addDiasStr(de, -1) };
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
): string => {
  const atraso = `atraso de ${corteDias + 1} dias ou mais`;
  return r === "filtro"
    ? `${atraso} · vencimentos do filtro`
    : r === "tudo"
      ? `${atraso} · todo o histórico`
      : `${atraso} · vencimentos dos últimos ${Math.round(INADIMPLENCIA_JANELA_DIAS / 30.4)} meses`;
};

/** Percentual para exibir: "—" quando nada venceu alem do corte no recorte
 * (ex.: periodo recente, so com atraso abaixo do corte) -- 0% enganaria. */
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
