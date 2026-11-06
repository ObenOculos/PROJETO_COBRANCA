// Nome do cliente: fonte unica das regras entre nome fantasia e razao social.
//
// `clientes.nome` (e `Collection.cliente` / `ClientGroup.client`) e o nome
// FANTASIA, como o cobrador conhece a loja. `clientes.razao_social` vem do ERP
// Ciclone (migration 20261106000011) e e o nome juridico do CPF/CNPJ -- o que
// aparece na nota, no boleto e no que o cliente assina.

const normalizar = (valor: string | null | undefined): string =>
  (valor ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/**
 * Razao social somente quando acrescenta informacao: vazia ou igual ao nome
 * exibido (ignorando maiusculas e espacos) devolve undefined, para a tela nao
 * repetir o mesmo nome duas vezes.
 */
export const razaoSocialDistinta = (
  razaoSocial: string | null | undefined,
  nomeExibido: string | null | undefined,
): string | undefined => {
  const razao = (razaoSocial ?? "").trim();
  if (!razao) return undefined;
  return normalizar(razao) === normalizar(nomeExibido) ? undefined : razao;
};

/**
 * Nome para documento juridico (Termo de Acordo / confissao de divida): a
 * razao social quando existe -- e quem responde pelo CPF/CNPJ --, senao o nome
 * do cadastro.
 */
export const nomeJuridicoCliente = (
  razaoSocial: string | null | undefined,
  nome: string,
): string => (razaoSocial ?? "").trim() || nome;
