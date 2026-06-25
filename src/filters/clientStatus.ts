// Fonte unica de verdade da classificacao de status do cliente na cobranca.
// Antes essa regra vivia inline no getFilteredCollections (CollectionContext) e
// corria o risco de divergir do ClientAssignment e do CollectorDashboard. Estes
// helpers devem ser reutilizados por todas as telas que classificam clientes.
import { Collection } from "../types";

export type ClientPaymentStatus = "pago" | "parcial" | "pendente";

/** Arredonda para 2 casas, evitando ruido de ponto flutuante em somas de valores. */
export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Chave de agrupamento de cliente. Identica ao agrupamento da tabela
 * (CollectionTable) e da atribuicao (ClientAssignment): documento, com fallback
 * no nome. Mantida aqui para que toda contagem por cliente bata entre as telas.
 */
export const clientKey = (
  c: Pick<Collection, "documento" | "cliente">,
): string => (c.documento || c.cliente || "").trim();

/**
 * Status de pagamento AGREGADO do cliente, somando TODAS as vendas ativas dele:
 * - nada recebido            -> "pendente"
 * - recebeu algo, ainda deve -> "parcial"
 * - quitou tudo              -> "pago"
 * O desconto entra como valor quitado (mesma regra de calculateSaleBalance), por
 * isso a venda/cliente quita quando recebido + desconto cobrem o valor original.
 * Cada cliente cai em uma unica categoria, entao Pendente + Parcial + Pago = total
 * de clientes ativos (sem duplicidade entre categorias).
 */
export const getClientPaymentStatus = (
  collections: Collection[],
): ClientPaymentStatus => {
  const totalValue = round2(
    collections.reduce((sum, c) => sum + (c.valor_original || 0), 0),
  );
  const totalReceived = round2(
    collections.reduce((sum, c) => sum + (c.valor_recebido || 0), 0),
  );
  const totalDiscount = round2(
    collections.reduce((sum, c) => sum + (c.desconto || 0), 0),
  );
  const effectivePaid = round2(totalReceived + totalDiscount);
  const pendingValue = round2(totalValue - effectivePaid);

  if (effectivePaid === 0) return "pendente";
  if (pendingValue > 0.01) return "parcial";
  return "pago";
};

/**
 * Valor em aberto (saldo devedor) do cliente: total - recebido - desconto,
 * somando todas as vendas. Mesma regra do status (desconto quita), por isso um
 * cliente "pago" tem pendente ~0. Nunca negativo. Use sempre que precisar do
 * "valor em aberto" para nao divergir da classificacao de status.
 */
export const getClientPending = (collections: Collection[]): number => {
  const totalValue = round2(
    collections.reduce((sum, c) => sum + (c.valor_original || 0), 0),
  );
  const totalReceived = round2(
    collections.reduce((sum, c) => sum + (c.valor_recebido || 0), 0),
  );
  const totalDiscount = round2(
    collections.reduce((sum, c) => sum + (c.desconto || 0), 0),
  );
  return Math.max(0, round2(totalValue - totalReceived - totalDiscount));
};

/**
 * Normaliza o vocabulario de status para o valor canonico. O dropdown envia
 * "Em atraso"/"Pago"/"Pago Parcial" e os botoes enviam "pendente"/"pago"/"parcial".
 * O caso "cancelado" e tratado a parte (base de titulos cancelados), nao aqui.
 */
export const normalizePaymentStatus = (raw: string): ClientPaymentStatus => {
  const value = (raw || "").toLowerCase().trim();
  if (["pago", "recebido", "paid", "quitado", "finalizado"].includes(value)) {
    return "pago";
  }
  if (
    [
      "parcial",
      "pago parcial",
      "parcialmente pago",
      "parcialmente_pago",
      "partial",
    ].includes(value)
  ) {
    return "parcial";
  }
  return "pendente";
};

/** Indica se o filtro de status selecionado se refere a titulos cancelados. */
export const isCanceladoFilter = (status: string | undefined | null): boolean =>
  (status || "").trim().toLowerCase() === "cancelado";
