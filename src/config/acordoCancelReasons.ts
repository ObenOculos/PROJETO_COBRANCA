/**
 * Motivos pre-programados de cancelamento de acordo (AcordoDetailModal).
 *
 * Mesmo motivo do catalogo de reagendamento (src/config/rescheduleReasons) e
 * de observacoes de visita (src/config/visitOutcomes): texto livre nao agrupa,
 * nao filtra e nao vira metrica. `acordos.motivo_cancelamento` e uma coluna de
 * texto unica (sem campo de chave separado) — o `label` e gravado literalmente
 * nela, com a observacao livre concatenada quando o cobrador preenche. Para
 * "Outro motivo" a observacao e obrigatoria e vira o texto gravado, sem o
 * rotulo na frente (mesma convencao do OUTCOME_OTHER em visitOutcomes).
 */
export interface AcordoCancelReason {
  key: string;
  label: string;
}

export const ACORDO_CANCEL_REASONS: readonly AcordoCancelReason[] = [
  {
    key: "renegociou_condicoes_melhores",
    label: "Cliente renegociou em condições melhores",
  },
  { key: "cliente_desistiu", label: "Cliente desistiu do acordo" },
  {
    key: "pagou_fora_acordo",
    label: "Cliente pagou à vista fora do acordo",
  },
  { key: "erro_lancamento", label: "Erro no lançamento do acordo" },
  { key: "nao_localizado", label: "Cliente não localizado / sumiu" },
  { key: "outro", label: "Outro motivo" },
] as const;

/** Chave que exige observacao livre obrigatoria (vira o texto gravado). */
export const ACORDO_CANCEL_REASON_OTHER = "outro";

export const acordoCancelReasonLabel = (key?: string | null): string => {
  if (!key) return "Motivo não informado";
  return ACORDO_CANCEL_REASONS.find((r) => r.key === key)?.label ?? key;
};
