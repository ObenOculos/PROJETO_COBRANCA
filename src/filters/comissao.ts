/**
 * Comissão por faixas de meta (item 72, tabela comissao_faixas).
 *
 * Regra (decisão do usuário, 2026-11-16): vale a MAIOR faixa atingida (não é
 * progressiva); abaixo da 1ª faixa não há comissão. Duas formas, escolhidas
 * pelo gestor por pessoa/mês (todas as faixas do mês na mesma forma):
 *  - "percentual": % da faixa sobre TODO o recebido do mês.
 *    Ex.: 90 mil → 0,889%, 110 mil → 1,3%; recebeu 115 mil → 115.000 × 1,3%.
 *  - "fixo": valor em R$ da faixa. Ex.: 4 mil → R$ 100, 5 mil → R$ 200;
 *    recebeu 5.900 → R$ 200.
 * Gestor: mesma regra, sobre o recebido da equipe vinculada a ele.
 * Fonte única: toda tela que mostrar comissão usa estas funções.
 */

export type FormaComissao = "percentual" | "fixo";

export interface FaixaComissao {
  metaValor: number;
  /** percentual: pontos percentuais (0.889 = 0,889%); fixo: R$. */
  valor: number;
}

/** Faixas em ordem crescente de meta. */
export const ordenarFaixas = (faixas: FaixaComissao[]): FaixaComissao[] =>
  [...faixas].sort((a, b) => a.metaValor - b.metaValor);

/** Maior faixa com meta ≤ recebido, ou null se não bateu a 1ª. */
export const faixaAtingida = (
  recebido: number,
  faixas: FaixaComissao[],
): FaixaComissao | null => {
  let atingida: FaixaComissao | null = null;
  for (const f of ordenarFaixas(faixas)) {
    if (recebido >= f.metaValor) atingida = f;
  }
  return atingida;
};

/** Valor da comissão em R$, arredondado em centavos. */
export const calcularComissao = (
  recebido: number,
  faixas: FaixaComissao[],
  forma: FormaComissao,
): number => {
  const f = faixaAtingida(recebido, faixas);
  if (!f) return 0;
  if (forma === "fixo") return f.valor;
  return Math.round(recebido * f.valor) / 100;
};

/**
 * Mesmas regras da RPC definir_metas_mes, para avisar antes de gravar.
 * Retorna a mensagem do primeiro problema, ou null.
 */
export const validarFaixas = (
  faixas: FaixaComissao[],
  forma: FormaComissao,
): string | null => {
  const ordenadas = ordenarFaixas(faixas);
  for (let i = 0; i < ordenadas.length; i++) {
    const f = ordenadas[i];
    if (!(f.metaValor > 0)) return "Toda faixa precisa de uma meta maior que zero.";
    if (!(f.valor >= 0)) return "Toda faixa precisa de um valor de comissão.";
    if (forma === "percentual" && f.valor > 100)
      return "Percentual deve estar entre 0 e 100.";
    if (i > 0 && f.metaValor === ordenadas[i - 1].metaValor)
      return "Duas faixas com a mesma meta.";
    if (i > 0 && f.valor < ordenadas[i - 1].valor)
      return "Uma faixa maior não pode pagar menos que a anterior.";
  }
  return null;
};
