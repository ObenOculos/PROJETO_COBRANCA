// Fonte unica de verdade da classificacao de status do cliente na cobranca.
// Antes essa regra vivia inline no getFilteredCollections (CollectionContext) e
// corria o risco de divergir do ClientAssignment e do CollectorDashboard. Estes
// helpers devem ser reutilizados por todas as telas que classificam clientes.
import { Collection, ClientGroup, SaleGroup } from "../types";
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
 * Quantos dias o cliente que quitou continua visivel na Carteira completa do
 * cobrador de carteira, com o selo "Quitado" (decisao de 2026-11-13). Regra
 * so de VISIBILIDADE e igual para todos: nao importa se o pagamento foi
 * registrado pelo cobrador ou veio do ERP. Ele nao volta para a Fila, nao
 * conta em "Sem atendimento" nem no valor da carteira. A busca acha qualquer
 * quitado do cobrador, de qualquer data.
 */
export const QUITADO_VISIVEL_DIAS = 7;

/**
 * Dia (YYYY-MM-DD) em que o cliente quitou: o recebimento mais recente das
 * parcelas dele. So faz sentido para quem esta quitado (!hasOpenBalance).
 */
export const dataQuitacao = (group: ClientGroup): string | null => {
  let ultima: string | null = null;
  group.sales.forEach((s) =>
    s.installments.forEach((c) => {
      const d = c.data_de_recebimento?.slice(0, 10);
      if (d && (!ultima || d > ultima)) ultima = d;
    }),
  );
  return ultima;
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

/** Saldo do cliente dividido entre o que ja venceu e o que ainda vai vencer. */
export interface ClientBalanceSplit {
  /** Parcelas com vencimento passado: o que precisa ser cobrado hoje. */
  vencido: number;
  /** Parcelas dentro do prazo: so negociavel, nao atrasado. */
  aVencer: number;
}

/**
 * Divide o saldo do cliente em VENCIDO e A VENCER -- fonte unica do valor que
 * a carteira cobra (item 34: a carteira mostrava vencido + a vencer como se
 * fosse tudo pendencia). Mesmo recorte de clientMaxOverdueDays: com acordo
 * ATIVO usa as parcelas do acordo (nao o titulo original); sem acordo, as
 * parcelas do titulo com saldo (hasInstallmentBalance).
 */
export const clientBalanceSplit = (
  group: Pick<ClientGroup, "sales" | "document">,
  acordoAtivoParcelas?: AcordoAtivoOverdueMap,
): ClientBalanceSplit => {
  let vencido = 0;
  let aVencer = 0;
  const parcelasAcordo = acordoAtivoParcelas?.get(group.document);
  if (parcelasAcordo) {
    parcelasAcordo.forEach((parcela) => {
      if (round2(parcela.saldo) <= 0.01) return;
      if (calculateOverdueDays(parcela.dataVencimento) > 0) {
        vencido += parcela.saldo;
      } else {
        aVencer += parcela.saldo;
      }
    });
    return { vencido: round2(vencido), aVencer: round2(aVencer) };
  }

  group.sales?.forEach((sale) => {
    sale.installments?.forEach((inst) => {
      if (!hasInstallmentBalance(inst)) return;
      const saldo =
        (inst.valor_original || 0) -
        (inst.valor_recebido || 0) -
        (inst.desconto || 0);
      if (calculateOverdueDays(inst.data_vencimento) > 0) {
        vencido += saldo;
      } else {
        aVencer += saldo;
      }
    });
  });
  return { vencido: round2(vencido), aVencer: round2(aVencer) };
};

/**
 * clientBalanceSplit para telas que tem a lista de titulos do cliente em vez
 * do ClientGroup (ex.: Atribuicao de Cobradores). Mesma regra, sem copia.
 */
export const collectionsBalanceSplit = (
  documento: string,
  collections: Collection[],
  acordoAtivoParcelas?: AcordoAtivoOverdueMap,
): ClientBalanceSplit =>
  clientBalanceSplit(
    { document: documento, sales: [{ installments: collections } as SaleGroup] },
    acordoAtivoParcelas,
  );

/**
 * Valor EM ATRASO do cliente: so o que ja venceu (ver clientBalanceSplit).
 * Usado na mensagem do WhatsApp e na carteira.
 */
export const clientOverdueAmount = (
  group: Pick<ClientGroup, "sales" | "document">,
  acordoAtivoParcelas?: AcordoAtivoOverdueMap,
): number => clientBalanceSplit(group, acordoAtivoParcelas).vencido;

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

/**
 * Lojas em que o cliente tem saldo em aberto, para o cobrador saber de qual
 * loja esta cobrando (cobrador com mais de uma loja na carteira). Ordem: a
 * parcela em aberto mais antiga de cada loja -- a primeira e sempre a
 * clientReferenceStore (a que vale para as regras da carteira).
 */
export const clientOpenStores = (group: Pick<ClientGroup, "sales">): string[] => {
  const maisAntiga = new Map<string, string>();
  group.sales?.forEach((sale) => {
    sale.installments?.forEach((inst) => {
      if (!hasInstallmentBalance(inst) || !inst.nome_da_loja) return;
      const venc = inst.data_vencimento ?? "9999-12-31";
      const atual = maisAntiga.get(inst.nome_da_loja);
      if (!atual || venc < atual) maisAntiga.set(inst.nome_da_loja, venc);
    });
  });
  return Array.from(maisAntiga.entries())
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([loja]) => loja);
};

/**
 * Lojas para exibir no cliente: as com saldo em aberto (clientOpenStores);
 * cliente sem saldo (ex.: quitado nos ultimos dias) mostra as lojas das
 * vendas dele.
 */
export const clientStoresForDisplay = (
  group: Pick<ClientGroup, "sales">,
): string[] => {
  const abertas = clientOpenStores(group);
  if (abertas.length > 0) return abertas;
  const todas = new Set<string>();
  group.sales?.forEach((sale) =>
    sale.installments?.forEach((inst) => {
      if (inst.nome_da_loja) todas.add(inst.nome_da_loja);
    }),
  );
  return Array.from(todas).sort();
};
