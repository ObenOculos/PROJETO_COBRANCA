// Quem recebe no acordo (item 91, 24/11): fonte unica da regra loja × padrao.
// O Termo, o Resumo e o Pix da entrada usam isto -- nunca leiam
// acordoConfiguracaoPadrao direto para dados da empresa.
//
// Regra (decisao do usuario): tudo por loja. Loja configurada = todos os
// dados dela (nome, CNPJ, endereco, Pix, logo); nunca mistura com o padrao
// campo a campo, senao sairia CNPJ de uma empresa com Pix de outra. Loja sem
// cadastro (ou que voltou ao padrao) usa o padrao inteiro, com o logo do app.

import type {
  AcordoConfiguracaoPadrao,
  CredorAcordo,
  CredorLoja,
} from "../types";

/**
 * Registro da loja vigente em `referencia` (ISO timestamp; omitido = agora).
 * Para um acordo ja criado, passe o created_at dele: trocar a chave hoje nao
 * muda o Termo de ontem.
 */
export function credorLojaVigente(
  credores: CredorLoja[],
  nomeDaLoja: string | null | undefined,
  referencia?: string,
): CredorLoja | null {
  if (!nomeDaLoja) return null;
  const ref = referencia ? Date.parse(referencia) : Number.POSITIVE_INFINITY;
  let melhor: CredorLoja | null = null;
  for (const c of credores) {
    if (c.nomeDaLoja !== nomeDaLoja) continue;
    const criado = Date.parse(c.createdAt);
    if (criado > ref) continue;
    if (!melhor || criado > Date.parse(melhor.createdAt)) melhor = c;
  }
  return melhor;
}

export function resolverCredorAcordo(
  padrao: AcordoConfiguracaoPadrao | null,
  credores: CredorLoja[],
  nomeDaLoja: string | null | undefined,
  referencia?: string,
): CredorAcordo {
  const loja = credorLojaVigente(credores, nomeDaLoja, referencia);
  if (loja && loja.empresaNome) {
    return {
      empresaNome: loja.empresaNome,
      empresaCnpj: loja.empresaCnpj,
      empresaEndereco: loja.empresaEndereco,
      empresaChavePix: loja.empresaChavePix,
      logoUrl: loja.logoUrl,
      lojaConfigurada: loja.nomeDaLoja,
    };
  }
  return {
    empresaNome: padrao?.empresaNome ?? null,
    empresaCnpj: padrao?.empresaCnpj ?? null,
    empresaEndereco: padrao?.empresaEndereco ?? null,
    empresaChavePix: padrao?.empresaChavePix ?? null,
    logoUrl: undefined,
    lojaConfigurada: null,
  };
}

/** Loja unica de uma lista de titulos; null se vazia ou sem loja. */
export function lojaDosTitulos(
  titulos: { nomeDaLoja?: string | null }[],
): string | null {
  for (const t of titulos) if (t.nomeDaLoja) return t.nomeDaLoja;
  return null;
}
