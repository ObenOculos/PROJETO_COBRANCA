import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../utils/fetchAllRows";
import { todayLocalStr } from "../config/visitStatus";
import { avisarPendenciasMudaram } from "./pendenciasCorrecoes";

// Item 71, etapa 2: cobrador (interno/terceirizado/juridico) pede desconto ao
// gestor ANTES de registrar o pagamento. Tabela pedidos_desconto + RPCs
// pedir_desconto / decidir_pedido_desconto / pedidos_desconto_do_cliente
// (migration 20261116000006). Aprovado = teto de desconto para o cliente,
// pelo cobrador, ate `valido_ate`; o uso e a soma dos descontos dos
// pagamentos ligados (o process_payment confere e liga).

export type TipoPedidoDesconto = "parcelas" | "tudo";

export interface PedidoDesconto {
  id: string;
  tipo: TipoPedidoDesconto;
  parcelas: number[];
  valor_devido: number;
  valor_pago: number;
  desconto_pedido: number;
  motivo: string;
  solicitado_por_id: string;
  created_at: string;
  decisao: "aprovado" | "recusado" | null;
  desconto_aprovado: number | null;
  valido_ate: string | null; // YYYY-MM-DD
  resposta: string | null;
  decidido_por_id: string | null;
  decidido_em: string | null;
  /** Soma dos descontos dos pagamentos que usaram esta autorizacao. */
  desconto_usado: number;
}

/** Linha da tabela para o gestor (sem o usado). */
export interface PedidoDescontoGestor
  extends Omit<PedidoDesconto, "desconto_usado"> {
  documento: string;
  cliente: string | null;
}

const mensagem = (e: { message?: string } | null, padrao: string): string =>
  e?.message || padrao;

const num = (v: unknown): number => Number(v) || 0;

/** Autorizacao aprovada, dentro da validade e com saldo -- ou null. */
export const autorizacaoVigente = (
  pedidos: PedidoDesconto[],
): (PedidoDesconto & { disponivel: number }) | null => {
  const hoje = todayLocalStr();
  for (const p of pedidos) {
    if (p.decisao !== "aprovado" || !p.valido_ate || p.valido_ate < hoje) {
      continue;
    }
    const disponivel =
      Math.round((num(p.desconto_aprovado) - num(p.desconto_usado)) * 100) /
      100;
    if (disponivel > 0.009) return { ...p, disponivel };
  }
  return null;
};

export const listarPedidosDescontoDoCliente = async (
  documento: string,
): Promise<PedidoDesconto[]> => {
  const { data, error } = await supabase.rpc("pedidos_desconto_do_cliente", {
    p_documento: documento,
  });
  if (error) {
    throw new Error(mensagem(error, "Falha ao carregar os pedidos de desconto."));
  }
  return (data ?? []).map((r) => ({
    ...r,
    tipo: r.tipo as TipoPedidoDesconto,
    decisao: r.decisao as PedidoDesconto["decisao"],
    valor_devido: num(r.valor_devido),
    valor_pago: num(r.valor_pago),
    desconto_pedido: num(r.desconto_pedido),
    desconto_aprovado:
      r.desconto_aprovado == null ? null : num(r.desconto_aprovado),
    desconto_usado: num(r.desconto_usado),
  }));
};

export const pedirDesconto = async (p: {
  documento: string;
  tipo: TipoPedidoDesconto;
  parcelas: number[];
  valorPago: number;
  motivo: string;
}): Promise<string> => {
  const { data, error } = await supabase.rpc("pedir_desconto", {
    p_documento: p.documento,
    p_tipo: p.tipo,
    p_parcelas: p.tipo === "parcelas" ? p.parcelas : [],
    p_valor_pago: p.valorPago,
    p_motivo: p.motivo.trim(),
  });
  if (error) throw new Error(mensagem(error, "Falha ao enviar o pedido."));
  return data as string;
};

export const decidirPedidoDesconto = async (p: {
  id: string;
  aprovar: boolean;
  descontoAprovado?: number;
  resposta?: string;
}): Promise<{ decisao: string; desconto?: number; valido_ate?: string }> => {
  const { data, error } = await supabase.rpc("decidir_pedido_desconto", {
    p_id: p.id,
    p_aprovar: p.aprovar,
    p_desconto_aprovado: p.aprovar ? p.descontoAprovado : undefined,
    p_resposta: p.resposta?.trim() || undefined,
  });
  if (error) throw new Error(mensagem(error, "Falha ao registrar a decisão."));
  avisarPendenciasMudaram();
  return data as { decisao: string; desconto?: number; valido_ate?: string };
};

/** Gestor: pedidos em aberto + decididos desde `desde` (ISO). */
export const listarPedidosDescontoGestor = async (
  desde: string,
): Promise<PedidoDescontoGestor[]> => {
  const linhas = await fetchAllRows<PedidoDescontoGestor>((from, to) =>
    supabase
      .from("pedidos_desconto")
      .select("*")
      .or(`decisao.is.null,decidido_em.gte.${desde}`)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<PedidoDescontoGestor[]>(),
  );
  return linhas.map((r) => ({
    ...r,
    valor_devido: num(r.valor_devido),
    valor_pago: num(r.valor_pago),
    desconto_pedido: num(r.desconto_pedido),
    desconto_aprovado:
      r.desconto_aprovado == null ? null : num(r.desconto_aprovado),
  }));
};
