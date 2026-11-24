// Quem recebe no acordo (item 91, 24/11): fonte unica da regra
// loja × marca × padrao. O Termo, o Resumo e o Pix da entrada usam isto --
// nunca leiam acordoConfiguracaoPadrao direto para dados da empresa.
//
// Regra (decisoes do usuario em 24/11): o credor e cadastrado por MARCA e
// toda loja da marca herda; a loja so guarda excecao.
//   dados (nome, CNPJ, endereco, Pix): excecao da loja -> marca -> padrao.
//     Sempre o bloco inteiro de uma fonte, nunca campo a campo (senao sairia
//     CNPJ de uma empresa com Pix de outra).
//   logo: excecao da loja -> marca -> logo do app, este so quando os dados
//     tambem vieram do padrao (marca com dados e sem logo = sem logo, para
//     nao sair o logo da Focco numa loja Luana).

import type {
  CadastroCredor,
  CredorAcordo,
  CredorLoja,
  CredorMarca,
  OrigemCredor,
} from "../types";

/** Registro vigente em `referencia` (ISO; omitido = agora): o mais recente
 * criado ate la. Para acordo ja criado, passe o created_at dele. */
function vigenteEm<T extends { createdAt: string }>(
  registros: T[],
  referencia?: string,
): T | null {
  const ref = referencia ? Date.parse(referencia) : Number.POSITIVE_INFINITY;
  let melhor: T | null = null;
  for (const r of registros) {
    const criado = Date.parse(r.createdAt);
    if (criado > ref) continue;
    if (!melhor || criado > Date.parse(melhor.createdAt)) melhor = r;
  }
  return melhor;
}

export function credorLojaVigente(
  credores: CredorLoja[],
  nomeDaLoja: string | null | undefined,
  referencia?: string,
): CredorLoja | null {
  if (!nomeDaLoja) return null;
  return vigenteEm(
    credores.filter((c) => c.nomeDaLoja === nomeDaLoja),
    referencia,
  );
}

export function credorMarcaVigente(
  credores: CredorMarca[],
  marcaId: string | null | undefined,
  referencia?: string,
): CredorMarca | null {
  if (!marcaId) return null;
  return vigenteEm(
    credores.filter((c) => c.marcaId === marcaId),
    referencia,
  );
}

export function resolverCredorAcordo(
  cadastro: CadastroCredor,
  nomeDaLoja: string | null | undefined,
  referencia?: string,
): CredorAcordo {
  const marcaId = nomeDaLoja ? cadastro.lojaMarca.get(nomeDaLoja) : undefined;
  const marca = cadastro.marcas.find((m) => m.id === marcaId) ?? null;
  const loja = credorLojaVigente(cadastro.credoresLoja, nomeDaLoja, referencia);
  const doMarca = credorMarcaVigente(cadastro.credoresMarca, marca?.id, referencia);

  let dados: {
    empresaNome: string | null;
    empresaCnpj: string | null;
    empresaEndereco: string | null;
    empresaChavePix: string | null;
  };
  let origemDados: OrigemCredor;
  if (loja?.empresaNome) {
    dados = loja;
    origemDados = "loja";
  } else if (doMarca?.empresaNome) {
    dados = doMarca;
    origemDados = "marca";
  } else {
    const p = cadastro.padrao;
    dados = {
      empresaNome: p?.empresaNome ?? null,
      empresaCnpj: p?.empresaCnpj ?? null,
      empresaEndereco: p?.empresaEndereco ?? null,
      empresaChavePix: p?.empresaChavePix ?? null,
    };
    origemDados = "padrao";
  }

  let logoUrl: string | null | undefined;
  let origemLogo: OrigemCredor;
  if (loja?.logoUrl) {
    logoUrl = loja.logoUrl;
    origemLogo = "loja";
  } else if (doMarca?.logoUrl) {
    logoUrl = doMarca.logoUrl;
    origemLogo = "marca";
  } else {
    logoUrl = origemDados === "padrao" ? undefined : null;
    origemLogo = "padrao";
  }

  return {
    empresaNome: dados.empresaNome,
    empresaCnpj: dados.empresaCnpj,
    empresaEndereco: dados.empresaEndereco,
    empresaChavePix: dados.empresaChavePix,
    logoUrl,
    origemDados,
    origemLogo,
    marca,
  };
}

/** Loja unica de uma lista de titulos; null se vazia ou sem loja. */
export function lojaDosTitulos(
  titulos: { nomeDaLoja?: string | null }[],
): string | null {
  for (const t of titulos) if (t.nomeDaLoja) return t.nomeDaLoja;
  return null;
}
