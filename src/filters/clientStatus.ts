// Fonte unica de verdade da classificacao de status do cliente na cobranca.
// Antes essa regra vivia inline no getFilteredCollections (CollectionContext) e
// corria o risco de divergir do ClientAssignment e do CollectorDashboard. Estes
// helpers devem ser reutilizados por todas as telas que classificam clientes.
import { Collection, ClientGroup } from "../types";
import { calculateOverdueDays } from "../utils/formatters";

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
 * O cliente ainda deve? Regra unica de "carteira ativa": o cobrador so trabalha
 * (lista, rota, agendamento) quem tem saldo acima de 1 centavo. O cliente
 * quitado CONTINUA atribuido (user_id) — o Desempenho credita o que ele pagou ao
 * cobrador por esse campo —, so sai da lista de trabalho.
 * Espelho no banco: cliente_tem_saldo_aberto (migration 20261005000001), que
 * cancela as visitas em aberto de quem quita.
 */
export const hasOpenBalance = (pendingValue: number): boolean =>
  round2(pendingValue) > 0.01;

/**
 * A PARCELA ainda tem saldo (original - recebido - desconto)? Mesma regra e
 * tolerancia de hasOpenBalance, aplicada a uma parcela so. Nao use a coluna
 * `status` para isso: ela diverge dos valores (ver docs/PROGRESSO.md, 1c).
 */
export const hasInstallmentBalance = (
  c: Pick<Collection, "valor_original" | "valor_recebido" | "desconto">,
): boolean =>
  hasOpenBalance(
    (c.valor_original || 0) - (c.valor_recebido || 0) - (c.desconto || 0),
  );

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

/** Parcela de acordo em aberto, para fins de calculo de atraso. */
export interface AcordoParcelaAberta {
  dataVencimento: string;
  saldo: number;
}

/**
 * documento -> parcelas em aberto do acordo ATIVO do cliente. Uma entrada
 * (mesmo vazia) significa "este cliente tem acordo ativo" -- e o que
 * diferencia de "sem acordo ativo, usar titulo original" em
 * clientMaxOverdueDays. Montado em lote em CollectionContext a partir dos
 * acordos ativos (fetchAcordos), nao por cliente, pra nao autorizar N+1
 * fetch por linha da tabela.
 */
export type AcordoAtivoOverdueMap = Map<string, AcordoParcelaAberta[]>;

/**
 * Maior atraso (em dias) entre as parcelas do cliente que ainda tem saldo.
 *
 * Se o cliente tem acordo ATIVO (presente em acordoAtivoParcelas), usa o
 * cronograma NOVO (parcelas do acordo) em vez do titulo original -- o
 * titulo e fato historico imutavel e fica com a data de vencimento
 * pre-acordo para sempre, mesmo com o acordo em dia (achado 2026-11-04,
 * ver migration 20261104000001_atraso_considera_acordo_ativo). Sem acordo
 * ativo, mesma regra de sempre: maior atraso entre as parcelas do titulo
 * que ainda tem saldo, ignorando quitada/cancelada (hasInstallmentBalance)
 * e vencimento futuro (calculateOverdueDays <= 0).
 *
 * Espelho exato em SQL: cliente_max_atraso_dias.
 */
export const clientMaxOverdueDays = (
  group: Pick<ClientGroup, "sales" | "document">,
  acordoAtivoParcelas?: AcordoAtivoOverdueMap,
): number => {
  const parcelasAcordo = acordoAtivoParcelas?.get(group.document);
  if (parcelasAcordo) {
    let maxAtraso = 0;
    parcelasAcordo.forEach((parcela) => {
      if (round2(parcela.saldo) <= 0.01) return;
      const atraso = calculateOverdueDays(parcela.dataVencimento);
      if (atraso > maxAtraso) maxAtraso = atraso;
    });
    return maxAtraso;
  }

  let maxAtraso = 0;
  group.sales?.forEach((sale) => {
    sale.installments?.forEach((inst) => {
      if (!hasInstallmentBalance(inst)) return;
      const atraso = calculateOverdueDays(inst.data_vencimento);
      if (atraso > maxAtraso) maxAtraso = atraso;
    });
  });
  return maxAtraso;
};

/**
 * Loja de referencia do cliente para as regras da carteira: a da parcela em
 * aberto mais antiga (menor vencimento) -- a mesma parcela que define o
 * atraso. Empate pelo nome da loja. Espelho em SQL:
 * cliente_loja_referencia (migration 20261106000008).
 */
export const clientReferenceStore = (
  group: Pick<ClientGroup, "sales">,
): string | null => {
  let best: { venc: string; loja: string } | null = null;
  group.sales?.forEach((sale) => {
    sale.installments?.forEach((inst) => {
      if (!hasInstallmentBalance(inst) || !inst.nome_da_loja) return;
      const venc = inst.data_vencimento ?? "9999-12-31";
      if (
        !best ||
        venc < best.venc ||
        (venc === best.venc && inst.nome_da_loja < best.loja)
      ) {
        best = { venc, loja: inst.nome_da_loja };
      }
    });
  });
  return (best as { venc: string; loja: string } | null)?.loja ?? null;
};
