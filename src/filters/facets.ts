// Faceting (filtros dependentes entre si). Para cada dimensao categorica, as
// opcoes disponiveis sao os valores distintos que sobram ao aplicar TODOS os
// filtros ativos EXCETO o da propria dimensao. Omitir a propria dimensao e o que
// permite trocar o valor depois de seleciona-lo (o valor atual e os demais
// compativeis continuam visiveis). Opcoes sem resultado nao aparecem.
//
// Reutiliza o predicado puro clientMatchesFilters (src/filters/predicates) para
// nao duplicar a regra de filtragem no nivel do cliente.
import {
  FilterableClient,
  ClientFilters,
  clientMatchesFilters,
} from "./predicates";

/** Dedup + ordenacao pt-BR, descartando vazios. */
export const distinctSorted = (
  values: (string | null | undefined)[],
): string[] =>
  Array.from(
    new Set(values.filter((v): v is string => Boolean(v && v.trim()))),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

/** Opcoes categoricas disponiveis no nivel do CLIENTE (aba Atribuicao). */
export interface ClientFacets {
  cities: string[];
  neighborhoods: string[];
  stores: string[];
  /** Values de situacao presentes; inclui o token "empty" (SITUACAO_OPTIONS). */
  situacoes: string[];
}

/**
 * Calcula as opcoes disponiveis de cada dimensao aplicando o conjunto de filtros
 * atual, porem sempre ignorando o filtro da propria dimensao que esta sendo
 * listada (invariante de faceting).
 */
export const computeClientFacets = (
  clients: FilterableClient[],
  filters: ClientFilters,
  createdAt?: Map<string, Date>,
): ClientFacets => {
  const matching = (omit: keyof ClientFilters): FilterableClient[] =>
    clients.filter((c) =>
      clientMatchesFilters(c, { ...filters, [omit]: undefined }, createdAt),
    );

  const situacaoCollections = matching("situacao").flatMap(
    (c) => c.collections,
  );
  const hasEmptySituacao = situacaoCollections.some(
    (col) => !col.situacao || col.situacao.trim() === "",
  );

  return {
    cities: distinctSorted(matching("city").map((c) => c.cidade)),
    neighborhoods: distinctSorted(
      matching("neighborhood").map((c) => c.bairro),
    ),
    stores: distinctSorted(
      matching("store").flatMap((c) =>
        c.collections.map((col) => col.nome_da_loja),
      ),
    ),
    situacoes: [
      ...(hasEmptySituacao ? ["empty"] : []),
      ...distinctSorted(situacaoCollections.map((col) => col.situacao)),
    ],
  };
};
