import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../utils/fetchAllRows";

// Item 62 etapa 2: pedidos de correcao de pagamento (tabela
// pedidos_correcao_pagamento, migration 20261113000007). O cobrador pede (RLS:
// so pagamento que ele registrou); o gestor decide pela RPC
// decidir_pedido_correcao (contexto: decidirPedidoCorrecao).

export interface PedidoCorrecao {
  id: string;
  sale_payment_id: string;
  documento: string;
  cliente: string | null;
  valor: number;
  motivo: string;
  solicitado_por_id: string;
  created_at: string;
  decisao: "estornado" | "recusado" | null;
  estorno_id: string | null;
  resposta: string | null;
  decidido_por_id: string | null;
  decidido_em: string | null;
}

/** Pedidos de um cliente (todos) ou, sem documento, os abertos + decididos
 * desde `desde` (aba do gestor). A RLS limita o cobrador aos dele. */
export const listarPedidosCorrecao = async (filtro: {
  documento?: string;
  desde?: string; // ISO; so com documento ausente
}): Promise<PedidoCorrecao[]> =>
  fetchAllRows<PedidoCorrecao>((from, to) => {
    let q = supabase.from("pedidos_correcao_pagamento").select("*");
    if (filtro.documento) q = q.eq("documento", filtro.documento);
    else if (filtro.desde)
      q = q.or(`decisao.is.null,decidido_em.gte.${filtro.desde}`);
    return q
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<PedidoCorrecao[]>();
  });

export const pedirCorrecao = async (p: {
  salePaymentId: string;
  documento: string;
  cliente: string;
  valor: number;
  motivo: string;
  usuarioId: string;
}): Promise<void> => {
  const { error } = await supabase.from("pedidos_correcao_pagamento").insert({
    sale_payment_id: p.salePaymentId,
    documento: p.documento,
    cliente: p.cliente,
    valor: Math.round(p.valor * 100) / 100,
    motivo: p.motivo.trim(),
    solicitado_por_id: p.usuarioId,
  });
  if (error) {
    if (error.code === "23505")
      throw new Error("Já existe um pedido em análise para este pagamento.");
    throw new Error(error.message || "Falha ao enviar o pedido.");
  }
};
