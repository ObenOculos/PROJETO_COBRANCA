import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../utils/fetchAllRows";
import { avisarPendenciasMudaram } from "./pendenciasCorrecoes";

// Item 66: atribuir ao cobrador a baixa do ERP (cliente pagou na loja/banco
// depois da tratativa). Tabela atribuicoes_pagamento + RPCs
// parcelas_para_atribuicao / pedir_atribuicao_pagamento /
// decidir_atribuicao_pagamento (migration 20261116000003). O credito conta no
// desempenho, mas nao e dinheiro do caixa do cobrador.

/** Parcela paga pelo ERP; `bloqueio` null = o usuario atual pode pedir. */
export interface ParcelaAtribuivel {
  id_parcela: number;
  venda: number | null;
  parcela: number | null;
  data_vencimento: string | null;
  valor: number;
  data_pagamento: string; // YYYY-MM-DD
  loja: string | null;
  ultimo_contato_em: string | null;
  pedido_decisao: "aberto" | "aprovado" | null;
  pedido_meu: boolean | null;
  bloqueio: string | null;
  /** BANCO_DADOS.descricao -- identifica a parcela quando não há nº de
   * venda (ex.: "Renegociação de Parcelas"). */
  descricao: string | null;
}

export interface AtribuicaoPagamento {
  id: string;
  lote: string;
  id_parcela: number;
  documento: string;
  cliente: string | null;
  venda: number | null;
  parcela: number | null;
  valor: number;
  data_pagamento: string;
  observacao: string;
  /** Vazio só na exceção do gestor (sem conversa efetiva registrada). */
  ultimo_contato_em: string | null;
  solicitado_por_id: string;
  /** Atribuído pelo gestor sem pedido (migration 20261117000004). */
  excecao?: boolean;
  created_at: string;
  decisao: "aprovado" | "recusado" | null;
  valor_aprovado: number | null;
  resposta: string | null;
  decidido_por_id: string | null;
  decidido_em: string | null;
}

const mensagem = (e: { message?: string } | null, padrao: string): string =>
  e?.message || padrao;

export const listarParcelasAtribuiveis = async (
  documento: string,
): Promise<ParcelaAtribuivel[]> => {
  const { data, error } = await supabase.rpc("parcelas_para_atribuicao", {
    p_documento: documento,
  });
  if (error) throw new Error(mensagem(error, "Falha ao carregar as parcelas."));
  return (data ?? []) as ParcelaAtribuivel[];
};

/** Pedidos de um cliente. A RLS limita o cobrador aos dele. */
export const listarAtribuicoesDoCliente = async (
  documento: string,
): Promise<AtribuicaoPagamento[]> =>
  fetchAllRows<AtribuicaoPagamento>((from, to) =>
    supabase
      .from("atribuicoes_pagamento")
      .select("*")
      .eq("documento", documento)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<AtribuicaoPagamento[]>(),
  );

export const pedirAtribuicaoPagamento = async (p: {
  documento: string;
  parcelas: number[];
  observacao: string;
}): Promise<string> => {
  const { data, error } = await supabase.rpc("pedir_atribuicao_pagamento", {
    p_documento: p.documento,
    p_parcelas: p.parcelas,
    p_observacao: p.observacao.trim(),
  });
  if (error) throw new Error(mensagem(error, "Falha ao enviar o pedido."));
  return data as string;
};

export const decidirAtribuicaoPagamento = async (p: {
  lote: string;
  aprovar: boolean;
  resposta?: string;
}): Promise<{ decisao: string; parcelas: number; valor?: number }> => {
  const { data, error } = await supabase.rpc("decidir_atribuicao_pagamento", {
    p_lote: p.lote,
    p_aprovar: p.aprovar,
    p_resposta: p.resposta?.trim() || undefined,
  });
  if (error) throw new Error(mensagem(error, "Falha ao registrar a decisão."));
  avisarPendenciasMudaram();
  return data as { decisao: string; parcelas: number; valor?: number };
};

// ---------------------------------------------------------------------------
// Gestor (etapa 2, migration 20261116000004)
// ---------------------------------------------------------------------------

/** Parcela paga pelo ERP x cobrador que conversou com o cliente nos 30 dias
 * ate o pagamento. Com `pedido_lote` null = elegivel sem pedido. */
export interface LinhaPainelAtribuicao {
  id_parcela: number;
  documento: string;
  cliente: string | null;
  venda: number | null;
  parcela: number | null;
  valor: number;
  data_pagamento: string;
  loja: string | null;
  cobrador_id: string;
  contatos: number;
  ultimo_contato_em: string;
  ultimo_resultado: string;
  pedido_lote: string | null;
  pedido_decisao: "aberto" | "aprovado" | null;
  pedido_cobrador_id: string | null;
}

export const carregarPainelAtribuicao = async (): Promise<
  LinhaPainelAtribuicao[]
> => {
  const { data, error } = await supabase.rpc("atribuicoes_painel_gestor");
  if (error) throw new Error(mensagem(error, "Falha ao carregar o painel."));
  return (data ?? []) as LinhaPainelAtribuicao[];
};

/** Pedidos em aberto + decididos desde `desde` (ISO). So gestor ve todos. */
export const listarAtribuicoesGestor = async (
  desde: string,
): Promise<AtribuicaoPagamento[]> =>
  fetchAllRows<AtribuicaoPagamento>((from, to) =>
    supabase
      .from("atribuicoes_pagamento")
      .select("*")
      .or(`decisao.is.null,decidido_em.gte.${desde}`)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<AtribuicaoPagamento[]>(),
  );

// ---------------------------------------------------------------------------
// Conferência de recebimentos (2026-11-17, migration 20261117000002)
// ---------------------------------------------------------------------------

/** Parcela baixada no mês com conversa de cobrador nos 30 dias antes do
 * pagamento e/ou pedido "pago na loja". Uma linha por parcela x cobrador que
 * conversou (cobrador_id null = só o pedido). */
export interface ConversaConferencia {
  id_parcela: number;
  documento: string;
  valor: number | string;
  data_pagamento: string;
  cobrador_id: string | null;
  contatos: number;
  ultimo_contato_em: string | null;
  ultimo_resultado: string | null;
  /** Ainda dá para o cobrador pedir (sem bloqueio, sem pedido, até o dia 5
   * do mês seguinte ao pagamento). */
  pode_pedir: boolean;
  pedido_lote: string | null;
  pedido_decisao: "aberto" | "aprovado" | "recusado" | null;
  pedido_cobrador_id: string | null;
  valor_aprovado: number | string | null;
}

export const carregarConversasConferencia = async (
  inicio: string,
  fim: string,
): Promise<ConversaConferencia[]> =>
  fetchAllRows<ConversaConferencia>((from, to) =>
    supabase
      .rpc("conferencia_conversas", { p_inicio: inicio, p_fim: fim })
      // Ordem unica para a paginacao (CLAUDE.md): parcela + cobrador.
      .order("id_parcela")
      .order("cobrador_id")
      .range(from, to)
      .returns<ConversaConferencia[]>(),
  );

// ---------------------------------------------------------------------------
// Cobrador: o que ainda dá para pedir (2026-11-23, migration 20261123000001)
// ---------------------------------------------------------------------------

/** Parcela paga pelo ERP que o cobrador logado ainda pode pedir (ou já pediu
 * e está em análise). Vem dos contatos dele, não da carteira: `na_carteira`
 * false = o cliente já saiu da carteira dele. */
export interface PagoNaLojaPedivel {
  documento: string;
  cliente: string | null;
  loja: string | null;
  id_parcela: number;
  venda: number | null;
  parcela: number | null;
  valor: number | string;
  data_pagamento: string; // YYYY-MM-DD
  /** Último dia para pedir (dia 5 do mês seguinte ao pagamento). */
  prazo: string; // YYYY-MM-DD
  ultimo_contato_em: string | null;
  ultimo_resultado: string | null;
  na_carteira: boolean;
  em_analise: boolean;
  descricao: string | null;
}

export const listarPagosNaLojaPediveis = async (): Promise<
  PagoNaLojaPedivel[]
> =>
  fetchAllRows<PagoNaLojaPedivel>((from, to) =>
    supabase
      .rpc("pagos_na_loja_pediveis")
      // Ordem unica para a paginacao (CLAUDE.md).
      .order("id_parcela")
      .range(from, to)
      .returns<PagoNaLojaPedivel[]>(),
  );

// ---------------------------------------------------------------------------
// Exceção do gestor (2026-11-17, migration 20261117000004)
// ---------------------------------------------------------------------------

/** Parcelas pagas pelo ERP (30 dias) que o gestor pode atribuir ao cobrador
 * como exceção. `ultimo_contato_em` = conversa efetiva do cobrador, se houver. */
export const listarParcelasExcecao = async (
  documento: string,
  cobradorId: string,
): Promise<ParcelaAtribuivel[]> => {
  const { data, error } = await supabase.rpc("parcelas_para_excecao", {
    p_documento: documento,
    p_cobrador_id: cobradorId,
  });
  if (error) throw new Error(mensagem(error, "Falha ao carregar as parcelas."));
  return (data ?? []) as ParcelaAtribuivel[];
};

/** Gestor atribui direto ao cobrador (já aprovado, marcado como exceção). */
export const atribuirPagamentoExcecao = async (p: {
  documento: string;
  parcelas: number[];
  cobradorId: string;
  motivo: string;
}): Promise<{ lote: string; parcelas: number; valor: number }> => {
  const { data, error } = await supabase.rpc("atribuir_pagamento_excecao", {
    p_documento: p.documento,
    p_parcelas: p.parcelas,
    p_cobrador_id: p.cobradorId,
    p_motivo: p.motivo.trim(),
  });
  if (error) throw new Error(mensagem(error, "Falha ao atribuir."));
  return data as { lote: string; parcelas: number; valor: number };
};
