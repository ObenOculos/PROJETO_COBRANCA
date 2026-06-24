// Fonte única para contar "vendas / fichas" a partir de um conjunto de
// collections. Antes cada tela contava de um jeito (Lojas somava por loja e
// duplicava vendas espalhadas em mais de uma loja); aqui a regra é uma só.
import { Collection } from "../types";
import { clientKey } from "./clientStatus";

/**
 * Conta vendas distintas agrupando por CLIENTE (documento || cliente):
 * - cada par (cliente, venda_n) conta 1;
 * - renegociadas (sem venda_n) contam 1 por cliente.
 * Independe de loja — uma venda com parcelas em várias lojas conta uma vez só.
 */
export const countVendas = (collections: Collection[]): number => {
  const vendas = new Set<string>();
  const renegociadaClients = new Set<string>();
  for (const c of collections) {
    const key = clientKey(c);
    if (!key) continue;
    if (c.venda_n) vendas.add(`${key}:::${c.venda_n}`);
    else renegociadaClients.add(key);
  }
  return vendas.size + renegociadaClients.size;
};
