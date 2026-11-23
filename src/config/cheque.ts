// Item 87 (2026-11-23): cliente em CONDICAO DE CHEQUE fica fora da carteira
// dos cobradores -- so o gestor trata (Pedidos > Cheques).
//
// A regra mora no banco (clientes_condicao_cheque, migration
// 20261123000002); estes numeros sao repetidos la como padrao das funcoes.

/** Tipos de titulo do Ciclone = cheque que a empresa ja tem em maos
 * (2 carteira, 3 custodia, 5 deposito). Cheque devolvido (4) volta a
 * cobranca normal. Mesmo conjunto do SQL. */
export const TIPOS_TITULO_CHEQUE_EM_MAOS = [2, 3, 5] as const;

/** Cheque em carteira vencido ha mais que isto vai para "Conferir com o
 * financeiro" (compensou e falta baixa, ou voltou?). Decisao 2026-11-23. */
export const DIAS_CONFERIR_CHEQUE = 30;

/** Sugestao: pagou em cheque no Ciclone nos ultimos N meses e tem saldo. */
export const MESES_SUGESTAO_CHEQUE = 24;

export type GrupoCheque =
  | "cheque_conferir"
  | "cheque_carteira"
  | "paga_em_cheque"
  | "sugestao";

export const GRUPO_CHEQUE_LABEL: Record<GrupoCheque, string> = {
  cheque_conferir: "Conferir com o financeiro",
  cheque_carteira: "Cheque em carteira",
  paga_em_cheque: "Paga em cheque",
  sugestao: "Sugestões",
};
