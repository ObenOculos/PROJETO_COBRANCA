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

// 2026-11-24: tipo "acordo" -- desconto do acordo acima do maximo da
// configuracao; o gestor libera um PERCENTUAL e o criar_acordo confere
// (migration 20261124000007). Nao vale no Receber pagamento.

export interface PedidoDesconto {
  id: string;
  tipo: TipoPedidoDesconto | "acordo";
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
  /** So tipo acordo. */
  desconto_percentual_pedido: number | null;
  desconto_percentual_aprovado: number | null;
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
    if (p.tipo === "acordo") continue;
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
    tipo: r.tipo as PedidoDesconto["tipo"],
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
  /** So pedido de acordo: percentual liberado (o pedido ou menor). */
  percentualAprovado?: number;
  resposta?: string;
}): Promise<{
  decisao: string;
  desconto?: number;
  percentual?: number;
  valido_ate?: string;
}> => {
  const { data, error } = await supabase.rpc("decidir_pedido_desconto", {
    p_id: p.id,
    p_aprovar: p.aprovar,
    p_desconto_aprovado: p.aprovar ? p.descontoAprovado : undefined,
    p_percentual_aprovado: p.aprovar ? p.percentualAprovado : undefined,
    p_resposta: p.resposta?.trim() || undefined,
  });
  if (error) throw new Error(mensagem(error, "Falha ao registrar a decisão."));
  avisarPendenciasMudaram();
  return data as {
    decisao: string;
    desconto?: number;
    percentual?: number;
    valido_ate?: string;
  };
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
    desconto_percentual_pedido:
      r.desconto_percentual_pedido == null
        ? null
        : num(r.desconto_percentual_pedido),
    desconto_percentual_aprovado:
      r.desconto_percentual_aprovado == null
        ? null
        : num(r.desconto_percentual_aprovado),
  }));
};

/** Decisao do gestor sobre um pedido do cobrador (para o sino dele). */
export interface DecisaoDescontoMinha {
  id: string;
  tipo: PedidoDesconto["tipo"];
  documento: string;
  cliente: string | null;
  decisao: "aprovado" | "recusado";
  desconto_aprovado: number | null;
  desconto_percentual_aprovado: number | null;
  valido_ate: string | null;
  resposta: string | null;
  decidido_em: string;
}

/** Pedidos do usuario logado decididos desde `desde` (ISO). A RLS ja limita
 * ao solicitante; o filtro por id deixa explicito. */
export const listarMinhasDecisoesDesconto = async (
  userId: string,
  desde: string,
): Promise<DecisaoDescontoMinha[]> => {
  const { data, error } = await supabase
    .from("pedidos_desconto")
    .select(
      "id, tipo, documento, cliente, decisao, desconto_aprovado, desconto_percentual_aprovado, valido_ate, resposta, decidido_em",
    )
    .eq("solicitado_por_id", userId)
    .gte("decidido_em", desde)
    .order("decidido_em", { ascending: false })
    .order("id")
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    tipo: r.tipo as PedidoDesconto["tipo"],
    decisao: r.decisao as DecisaoDescontoMinha["decisao"],
    desconto_aprovado:
      r.desconto_aprovado == null ? null : num(r.desconto_aprovado),
    desconto_percentual_aprovado:
      r.desconto_percentual_aprovado == null
        ? null
        : num(r.desconto_percentual_aprovado),
    decidido_em: r.decidido_em as string,
  }));
};

// ---------------------------------------------------------------------------
// Acordo
// ---------------------------------------------------------------------------

/** Ultimo pedido de liberacao de desconto de acordo do usuario logado para o
 * cliente (a aprovada, valida e nao usada vem primeiro). */
export interface PedidoDescontoAcordo {
  id: string;
  decisao: "aprovado" | "recusado" | null;
  percentual_pedido: number;
  percentual_aprovado: number | null;
  valido_ate: string | null; // YYYY-MM-DD
  resposta: string | null;
  usado: boolean;
  created_at: string;
}

/** Percentual liberado que ainda pode ser usado hoje -- ou null. */
export const liberacaoAcordoVigente = (
  p: PedidoDescontoAcordo | null,
): number | null => {
  if (!p || p.decisao !== "aprovado" || p.usado) return null;
  if (!p.valido_ate || p.valido_ate < todayLocalStr()) return null;
  return p.percentual_aprovado;
};

export const buscarPedidoDescontoAcordo = async (
  documento: string,
): Promise<PedidoDescontoAcordo | null> => {
  const { data, error } = await supabase.rpc("pedido_desconto_acordo_atual", {
    p_documento: documento,
  });
  if (error) {
    throw new Error(mensagem(error, "Falha ao carregar a liberação de desconto."));
  }
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    decisao: (r.decisao as PedidoDescontoAcordo["decisao"]) ?? null,
    percentual_pedido: num(r.percentual_pedido),
    percentual_aprovado:
      r.percentual_aprovado == null ? null : num(r.percentual_aprovado),
    valido_ate: (r.valido_ate as string | null) ?? null,
    resposta: (r.resposta as string | null) ?? null,
    usado: Boolean(r.usado),
    created_at: String(r.created_at),
  };
};

export const pedirDescontoAcordo = async (p: {
  documento: string;
  titulos: number[];
  percentual: number;
  /** Saldo + multa + juros dos titulos (total sem desconto). */
  valorBruto: number;
  motivo: string;
}): Promise<string> => {
  const { data, error } = await supabase.rpc("pedir_desconto_acordo", {
    p_documento: p.documento,
    p_titulos: p.titulos,
    p_desconto_percentual: p.percentual,
    p_valor_bruto: p.valorBruto,
    p_motivo: p.motivo.trim(),
  });
  if (error) throw new Error(mensagem(error, "Falha ao enviar o pedido."));
  avisarPendenciasMudaram();
  return data as string;
};
