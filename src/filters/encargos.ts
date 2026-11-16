// Multa e juros de atraso dos titulos do Ciclone (item 67, 2026-11-16).
// Fonte unica: toda tela que mostra "com juros" usa estas funcoes.
//
// Regra do Ciclone (conferida nas baixas de 2026 e na coluna "Prev. Baixa"
// da tela de titulos -- ex.: saldo 849,93, 8 dias, 2% + 0,25%/dia = 883,93):
//   multa = saldo pendente x % multa            (uma vez)
//   juros = saldo pendente x % juros/dia x dias  (simples, dias corridos)
// cada parte arredondada a centavos. Parcela ainda no prazo nao tem encargo.
//
// E VALOR DE REFERENCIA, calculado na hora: nao e gravado e nao muda saldo,
// carteira, desempenho nem conferencia (a divida e o principal). No Ciclone o
// encargo e cobrado na baixa e pode ser negociado/perdoado. No pagamento o
// juro continua digitado (item 60) -- a tela so sugere este valor.
//
// So para titulo do Ciclone: os percentuais vem de fncrt_percentualmulta /
// fncrt_percentualjurodia (scripts/ciclone/sync_financeiro.py). Fora dele
// (SSOtica, planilhas antigas) os campos multa/juros_por_dia nao sao
// percentual -- 14 titulos com valores soltos em 2026-11-16.
// Cliente com acordo ativo segue as parcelas do acordo: sem encargo daqui.
import { ClientGroup, Collection } from "../types";
import { calculateOverdueDays } from "../utils/formatters";
import { todayLocalStr } from "../config/visitStatus";
import {
  AcordoAtivoOverdueMap,
  hasInstallmentBalance,
  round2,
} from "./clientStatus";

/** nome_da_loja gravado pelo sync do Ciclone (NOME_DA_LOJA no script). */
export const LOJA_CICLONE = "Focco Brasil";

/** Acima disso o percentual de juros ao dia e quase certamente erro de
 * cadastro no ERP (visto: multa 0,25 e juros 2,0 ao dia, trocados). */
const JUROS_DIA_MAXIMO_PLAUSIVEL = 1;

export const isTituloCiclone = (c: Pick<Collection, "nome_da_loja">): boolean =>
  (c.nome_da_loja || "").trim() === LOJA_CICLONE;

export interface EncargoParcela {
  saldo: number;
  dias: number;
  percentualMulta: number;
  percentualJurosDia: number;
  multa: number;
  juros: number;
  /** multa + juros */
  encargo: number;
  /** saldo + multa + juros (a "Prev. Baixa" do Ciclone) */
  totalHoje: number;
  /** Percentual fora do plausivel: nao calcula, pede conferencia no ERP. */
  conferirNoErp: boolean;
}

type ParcelaEncargo = Pick<
  Collection,
  | "nome_da_loja"
  | "valor_original"
  | "valor_recebido"
  | "desconto"
  | "data_vencimento"
  | "multa"
  | "juros_por_dia"
>;

/** Dias corridos de `de` ate `ate` (YYYY-MM-DD, calendario local). */
const diasEntre = (de: string, ate: string): number => {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
  );
};

/** Encargo de UMA parcela ate hoje -- ou ate `ate` (YYYY-MM-DD, dia em que o
 * cliente pagou, no maximo hoje) -- ou null quando nao ha (fora do Ciclone,
 * quitada, no prazo ou sem multa/juros cadastrados). */
export const encargoParcela = (
  inst: ParcelaEncargo,
  ate?: string,
): EncargoParcela | null => {
  if (!isTituloCiclone(inst) || !hasInstallmentBalance(inst)) return null;
  const hoje = todayLocalStr();
  const recuo =
    ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) && ate < hoje
      ? diasEntre(ate, hoje)
      : 0;
  const dias = calculateOverdueDays(inst.data_vencimento) - recuo;
  if (dias <= 0) return null;
  const pm = Number(inst.multa) || 0;
  const pj = Number(inst.juros_por_dia) || 0;
  if (pm <= 0 && pj <= 0) return null;
  const saldo = round2(
    (inst.valor_original || 0) - (inst.valor_recebido || 0) - (inst.desconto || 0),
  );
  if (pj > JUROS_DIA_MAXIMO_PLAUSIVEL) {
    return {
      saldo,
      dias,
      percentualMulta: pm,
      percentualJurosDia: pj,
      multa: 0,
      juros: 0,
      encargo: 0,
      totalHoje: saldo,
      conferirNoErp: true,
    };
  }
  const multa = round2((saldo * pm) / 100);
  const juros = round2((saldo * pj * dias) / 100);
  return {
    saldo,
    dias,
    percentualMulta: pm,
    percentualJurosDia: pj,
    multa,
    juros,
    encargo: round2(multa + juros),
    totalHoje: round2(saldo + multa + juros),
    conferirNoErp: false,
  };
};

export interface EncargoCliente {
  multa: number;
  juros: number;
  encargo: number;
  /** Parcelas vencidas com encargo. */
  parcelas: number;
  /** Alguma parcela com percentual a conferir no ERP. */
  conferirNoErp: boolean;
}

/** Soma dos encargos das parcelas vencidas do cliente (null se nenhum). */
export const encargoCliente = (
  group: Pick<ClientGroup, "sales" | "document">,
  acordoAtivoParcelas?: AcordoAtivoOverdueMap,
): EncargoCliente | null => {
  if (acordoAtivoParcelas?.get(group.document)) return null;
  let multa = 0;
  let juros = 0;
  let parcelas = 0;
  let conferirNoErp = false;
  group.sales?.forEach((sale) =>
    sale.installments?.forEach((inst) => {
      const e = encargoParcela(inst);
      if (!e) return;
      if (e.conferirNoErp) conferirNoErp = true;
      if (e.encargo <= 0) return;
      multa += e.multa;
      juros += e.juros;
      parcelas += 1;
    }),
  );
  if (parcelas === 0 && !conferirNoErp) return null;
  return {
    multa: round2(multa),
    juros: round2(juros),
    encargo: round2(multa + juros),
    parcelas,
    conferirNoErp,
  };
};
