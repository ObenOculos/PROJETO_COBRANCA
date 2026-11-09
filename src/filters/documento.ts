// Busca por CPF/CNPJ: fonte unica da regra.
//
// O documento fica gravado formatado ("12.345.678/0001-90"), mas quem busca
// costuma digitar so os numeros ("12345678"). Comparar o texto cru exigia a
// mascara exata.

/** Termo que e so numero e pontuacao de documento -- nao um nome. */
const PARECE_DOCUMENTO = /^[\d.\-/\s]+$/;

/** Minimo de digitos para comparar sem mascara (evita "1" achar todo mundo). */
const MIN_DIGITOS = 3;

/**
 * true se `termo` encontra `documento`, com ou sem a mascara.
 *
 * - Texto cru continua valendo ("345.678" acha "12.345.678/0001-90").
 * - Termo so com numeros/pontuacao compara apenas os digitos dos dois lados
 *   ("12345678000190", "12345678" ou "345678/0001" acham o mesmo CNPJ).
 * - Termo com letras ("otica 2") nao entra na comparacao por digitos, senao
 *   o "2" acharia metade da carteira.
 */
export const documentoCombina = (
  documento: string | null | undefined,
  termo: string | null | undefined,
): boolean => {
  const doc = (documento ?? "").trim();
  const t = (termo ?? "").trim();
  if (!doc || !t) return false;
  if (doc.toLowerCase().includes(t.toLowerCase())) return true;
  if (!PARECE_DOCUMENTO.test(t)) return false;
  const digitos = t.replace(/\D/g, "");
  return (
    digitos.length >= MIN_DIGITOS && doc.replace(/\D/g, "").includes(digitos)
  );
};
