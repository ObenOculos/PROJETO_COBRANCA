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
/**
 * Registro de sale_payments que NAO e pagamento registrado no app: estorno
 * (valor negativo / estorno_de) ou ajuste administrativo. Espelha a checagem
 * de registrar_ajuste_recebimento (migration 20261006000001).
 */
export const isAjusteOuEstorno = (p: {
  paymentAmount: number;
  paymentMethod?: string | null;
  estornoDe?: string | null;
}): boolean =>
  p.paymentAmount < 0 ||
  !!p.estornoDe ||
  /^(ajuste|estorno)/i.test(p.paymentMethod ?? "");

/**
 * Quanto o cobrador recebeu de fato neste registro: principal (o que abate
 * parcela) + juros/multa cobrados junto (sale_payments.juros_amount, migration
 * 20261109000008 — nao abatem parcela, mas entram no caixa e no desempenho).
 * Estorno chega com juros negativos proporcionais (ver jurosDosEstornos).
 * Fonte unica: todo total de "recebido" (caixa, desempenho, resumo) usa isto.
 */
export const valorRecebidoTotal = (p: {
  paymentAmount: number;
  jurosAmount?: number | null;
}): number => (Number(p.paymentAmount) || 0) + (Number(p.jurosAmount) || 0);

/**
 * estornar_pagamento / registrar_ajuste_recebimento gravam o estorno com
 * juros_amount 0 (o CHECK nao aceita negativo), entao os juros do original
 * continuariam somando depois do estorno. Aqui o estorno recebe, so na
 * leitura, juros negativos na proporcao do valor estornado — estorno total
 * zera os juros do original. Nao altera nada gravado.
 */
export const jurosDosEstornos = <
  T extends {
    id: string;
    paymentAmount: number;
    jurosAmount?: number | null;
    estornoDe?: string | null;
  },
>(
  payments: T[],
): T[] => {
  const porId = new Map(payments.map((p) => [p.id, p]));
  return payments.map((p) => {
    if (!p.estornoDe) return p;
    const original = porId.get(p.estornoDe);
    const jurosOriginal = Number(original?.jurosAmount) || 0;
    const valorOriginal = Number(original?.paymentAmount) || 0;
    if (!original || jurosOriginal <= 0 || valorOriginal <= 0) return p;
    const fracao = Math.min(
      1,
      Math.abs(Number(p.paymentAmount) || 0) / valorOriginal,
    );
    const juros = -Math.round(jurosOriginal * fracao * 100) / 100;
    return { ...p, jurosAmount: juros };
  });
};

export const resolveSaleKey = (
  c: Pick<Collection, "numero_titulo" | "venda_n">,
): number => c.numero_titulo ?? c.venda_n ?? 0;

/**
 * Titulo da parcela como o ERP mostra, para o cobrador achar no Ciclone/
 * SSOtica (item 68): o numero do titulo; sem numero, o titulo de texto do
 * Ciclone que o sync guarda em `descricao` ("Ciclone: PEDIDO7176/6"). A
 * descricao da SSOtica ("Venda Crediario") e tipo, nao titulo. null = sem.
 */
export const tituloDaParcela = (
  c: Pick<Collection, "numero_titulo" | "venda_n" | "descricao">,
): string | null => {
  const numero = c.numero_titulo ?? c.venda_n;
  if (numero) return String(numero);
  const desc = (c.descricao || "").trim();
  return desc.startsWith("Ciclone:") ? desc.slice(8).trim() || null : null;
};

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
