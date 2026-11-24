import { supabase } from "../lib/supabase";
import { Database } from "../types/database.types";

// Chamadas do item 89 (cancelamento no app x ERP) -- regra na migration
// 20261124000001 e em config/divergencias.ts.

export type LinhaDivergenciaCancelamento =
  Database["public"]["Functions"]["divergencias_cancelamento"]["Returns"][number];

export const mensagemErroDivergencia = (err: unknown): string => {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "PGRST202" || e?.code === "42883" || e?.code === "42P01")
    return "O painel de divergências ainda não existe no banco (falta aplicar a migration).";
  return e?.message || "Falha ao falar com o banco.";
};

export async function carregarDivergenciasCancelamento(): Promise<
  LinhaDivergenciaCancelamento[]
> {
  const { data, error } = await supabase.rpc("divergencias_cancelamento");
  if (error) throw error;
  return data ?? [];
}

export async function reabrirVendaCancelada(
  vendaCanceladaId: number,
  motivo: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("reabrir_venda_cancelada", {
    p_venda_cancelada_id: vendaCanceladaId,
    p_motivo: motivo,
  });
  if (error) throw error;
  return data ?? 0;
}
