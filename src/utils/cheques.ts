import { supabase } from "../lib/supabase";
import { Database } from "../types/database.types";
import {
  DIAS_CONFERIR_CHEQUE,
  MESES_SUGESTAO_CHEQUE,
} from "../config/cheque";

// Chamadas do item 87 (condicao de cheque) -- regra em config/cheque.ts e na
// migration 20261123000002.

export type LinhaPainelCheque =
  Database["public"]["Functions"]["painel_cheques"]["Returns"][number];

export interface CondicaoChequeCliente {
  paga_em_cheque: boolean;
  cheques_qtd: number;
  cheques_valor: number;
  cheque_venc_mais_antigo: string | null;
}

/** Mensagem legivel de erro do PostgREST (tabela/funcao ainda inexistente =
 * migration nao aplicada). */
export const mensagemErroCheque = (err: unknown): string => {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "PGRST202" || e?.code === "42883" || e?.code === "42P01")
    return "O painel de cheques ainda não existe no banco (falta aplicar a migration).";
  return e?.message || "Falha ao falar com o banco.";
};

export async function carregarPainelCheques(): Promise<LinhaPainelCheque[]> {
  const { data, error } = await supabase.rpc("painel_cheques", {
    p_dias_conferir: DIAS_CONFERIR_CHEQUE,
    p_meses_sugestao: MESES_SUGESTAO_CHEQUE,
  });
  if (error) throw error;
  return data ?? [];
}

/** null = cliente fora da condicao de cheque. */
export async function carregarCondicaoCheque(
  documento: string,
): Promise<CondicaoChequeCliente | null> {
  const { data, error } = await supabase.rpc("condicao_cheque_cliente", {
    p_documento: documento,
  });
  if (error) throw error;
  return (data as CondicaoChequeCliente | null) ?? null;
}

export async function marcarPagaEmCheque(
  documento: string,
  marcar: boolean,
  motivo: string,
): Promise<{ retirado_da_carteira: boolean; segue_em_condicao: boolean }> {
  const { data, error } = await supabase.rpc("marcar_paga_em_cheque", {
    p_documento: documento,
    p_marcar: marcar,
    p_motivo: motivo.trim(),
  });
  if (error) throw error;
  return data as { retirado_da_carteira: boolean; segue_em_condicao: boolean };
}
