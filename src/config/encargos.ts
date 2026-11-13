/**
 * Multa e juros por atraso de UM titulo -- regra unica do app.
 *
 * Multa % fixa + juros simples % a.m. proporcional aos dias (dias/30), sobre
 * o saldo em aberto do titulo. Titulo ainda nao vencido (diasAtraso <= 0)
 * nao tem encargo. Confirmado com o modelo de Termo de Acordo do usuario;
 * os percentuais vem de acordo_configuracao_padrao (padrao do gestor).
 *
 * Usado no Acordo (valores congelados em acordo_titulos) e no Receber
 * pagamento (valor SUGERIDO -- o cobrador pode dispensar, com observacao).
 */
export interface EncargosTitulo {
  multa: number;
  juros: number;
  /** multa + juros */
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const encargosPorAtraso = (
  saldo: number,
  diasAtraso: number,
  multaPercentual: number,
  jurosPercentualAm: number,
): EncargosTitulo => {
  if (!(diasAtraso > 0) || !(saldo > 0)) return { multa: 0, juros: 0, total: 0 };
  const multa = r2(saldo * ((multaPercentual || 0) / 100));
  const juros = r2(saldo * ((jurosPercentualAm || 0) / 100) * (diasAtraso / 30));
  return { multa, juros, total: r2(multa + juros) };
};
