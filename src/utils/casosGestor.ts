import { supabase } from "../lib/supabase";

// Chamadas do item 83 (clientes reincidentes) -- regras e numeros em
// config/reincidencia.ts e na migration 20261118000003.

export type MotivoCasoGestor = "limite_remarcacao" | "tentativas_sem_retorno";

/** HINT do RAISE do banco (PostgREST devolve em `hint`). */
export const hintDoErro = (err: unknown): string | undefined =>
  (err as { hint?: string } | null)?.hint ?? undefined;

export async function pedirAutorizacaoRemarcacao(p: {
  visitId: string;
  novaData: string;
  novoHorario?: string;
  motivoChave?: string;
  notasOriginal?: string;
  notasNova?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("pedir_autorizacao_remarcacao", {
    p_visit_id: p.visitId,
    p_nova_data: p.novaData,
    p_novo_horario: p.novoHorario || undefined,
    p_motivo_chave: p.motivoChave,
    p_notas_original: p.notasOriginal,
    p_notas_nova: p.notasNova,
  });
  if (error) throw error;
}

export async function contarTentativasSemRetorno(
  documento: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("tentativas_sem_retorno", {
    p_documento: documento,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function reportarTentativasGestor(
  documento: string,
  observacao?: string,
): Promise<void> {
  const { error } = await supabase.rpc("reportar_tentativas_gestor", {
    p_documento: documento,
    p_observacao: observacao?.trim() || undefined,
  });
  if (error) throw error;
}

export async function temCasoPendente(
  documento: string,
  motivo: MotivoCasoGestor,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("casos_gestor")
    .select("id")
    .eq("documento", documento)
    .eq("motivo", motivo)
    .eq("status", "pendente")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
