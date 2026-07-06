// Fonte única para contar "vendas / fichas" a partir de um conjunto de
// collections. Antes cada tela contava de um jeito (Lojas somava por loja e
// duplicava vendas espalhadas em mais de uma loja); aqui a regra é uma só.
import { Collection } from "../types";
import { clientKey } from "./clientStatus";

/**
 * Identidade da VENDA de uma parcela. Regra de negócio:
 * - `numero_titulo` e `venda_n` representam a MESMA informação (o número da
 *   venda), mas `numero_titulo` é a fonte mais confiável e tem prioridade —
 *   `venda_n` pode vir vazio;
 * - 0 = parcela sem número de venda (avulsa).
 * A coluna `descricao` (texto livre, ex.: "Venda original 1111") NÃO é usada
 * aqui: é campo manual, sem padrão, e só serviria como último recurso via
 * parsing dedicado.
 * Fonte única: todo agrupamento de vendas (contexto, tabelas, modais) deve usar
 * esta função para não divergir.
 */
export const resolveSaleKey = (c: Collection): number =>
  c.numero_titulo ?? c.venda_n ?? 0;

/**
 * Conta vendas distintas agrupando por CLIENTE (documento || cliente):
 * - cada par (cliente, chave-da-venda) conta 1 (chave = numero_titulo, com
 *   fallback para venda_n — ver resolveSaleKey);
 * - parcelas avulsas (chave 0) contam 1 por cliente.
 * Independe de loja — uma venda com parcelas em várias lojas conta uma vez só.
 */
export const countVendas = (collections: Collection[]): number => {
  const vendas = new Set<string>();
  for (const c of collections) {
    const key = clientKey(c);
    if (!key) continue;
    vendas.add(`${key}:::${resolveSaleKey(c)}`);
  }
  return vendas.size;
};
