/**
 * Converte um valor monetario para numero, tolerante a formatos comuns:
 * - remove "R$", espacos e outros simbolos;
 * - "1.234,56" (BR: ponto de milhar + virgula decimal) -> 1234.56;
 * - "1234,56" (so virgula decimal) -> 1234.56;
 * - "1234.56" (ponto decimal) -> 1234.56.
 * Retorna null para vazio/invalido. Substitui o antigo Number(x.replace(",","."))
 * que so trocava a PRIMEIRA virgula e quebrava com separador de milhar.
 */
export const parseMoney = (value: string | number | undefined | null): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;

  let s = value.toString().trim();
  if (s === "") return null;

  // Mantem apenas digitos, virgula, ponto e sinal.
  s = s.replace(/[^\d,.-]/g, "");
  if (s === "" || s === "-") return null;

  if (s.includes(",") && s.includes(".")) {
    // Tem os dois: ponto e milhar, virgula e decimal (padrao BR).
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // So virgula: decimal BR.
    s = s.replace(",", ".");
  }
  // So ponto (ou nenhum): ja esta no formato decimal.

  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};
