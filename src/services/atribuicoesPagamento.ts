import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../utils/fetchAllRows";

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
  ultimo_contato_em: string;
  solicitado_por_id: string;
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
  return data as { decisao: string; parcelas: number; valor?: number };
};
