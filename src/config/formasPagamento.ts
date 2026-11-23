// Formas de pagamento: fonte única dos nomes exibidos.
// Valores gravados em sale_payments.payment_method: dinheiro, pix,
// cartao_credito, cartao_debito, boleto (tela de pagamento), "Cedrus"
// (histórico migrado do sistema antigo) e "Estorno"/"Estorno/Ajuste
// Negativo" (correções).

/** Formas que o cobrador escolhe ao receber (ordem da tela de pagamento). */
export const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
};

const OUTRAS_FORMAS_LABEL: Record<string, string> = {
  Cedrus: "Cedrus (sistema antigo)",
  estorno: "Estornos",
  nao_informado: "Não informado",
  // Item 66: cliente pagou na loja/banco, credito atribuido ao cobrador
  // (pedido dele ou excecao do gestor) -- nao e sale_payments.
  atribuicao_pago_loja: "Pago na loja (atribuído)",
  // Parcela de acordo que a LOJA recebeu (espelho da importação da SSÓtica,
  // no nome do cobrador do acordo) -- não passou pelo cobrador.
  acordo_pago_loja: "Acordo pago na loja",
};

/** Parcela de acordo recebida pelo cobrador: o app não grava a forma ao
 * receber; vale a combinada no acordo (entrada = Pix). Grupo
 * "acordo:<forma>" -> rótulo "Acordo — <forma>" (decisão 2026-11-23). */
export const FORMA_ACORDO_PREFIXO = "acordo:";
export const formaAcordo = (forma: string | null | undefined): string =>
  `${FORMA_ACORDO_PREFIXO}${(forma || "").trim() || "forma não informada"}`;

/** Agrupa o valor gravado: as variações de estorno viram uma só. */
export const formaPagamentoGrupo = (raw?: string | null): string => {
  const v = (raw || "").trim();
  if (!v) return "nao_informado";
  if (/^estorno/i.test(v)) return "estorno";
  return v;
};

/** Nome para exibir de um valor gravado (ou de um grupo). */
export const formaPagamentoRotulo = (raw?: string | null): string => {
  const g = formaPagamentoGrupo(raw);
  if (g.startsWith(FORMA_ACORDO_PREFIXO))
    return `Acordo — ${g.slice(FORMA_ACORDO_PREFIXO.length)}`;
  return FORMA_PAGAMENTO_LABEL[g] ?? OUTRAS_FORMAS_LABEL[g] ?? g;
};
