// Classificacao de urgencia por dias de atraso. Antes vivia duplicada em 3
// lugares de CollectorDashboard.tsx (filtro, contadores de stats, cor do
// badge) com os mesmos limiares (90/60/30) escritos a mao em cada um.
export type PriorityBucket = "critical" | "high" | "medium" | "low";

export const priorityBucket = (overdueDays: number): PriorityBucket => {
  if (overdueDays > 90) return "critical";
  if (overdueDays > 60) return "high";
  if (overdueDays > 30) return "medium";
  return "low";
};

export const PRIORITY_LABELS: Record<PriorityBucket, string> = {
  critical: "Crítico (+90 dias)",
  high: "Alerta (60-90 dias)",
  medium: "Médio (30-60 dias)",
  low: "Em dia / Recente (0-30 dias)",
};

// A partir de quantos dias de folga (faixa.maxDias - atraso atual) um
// cliente entra em "Clientes urgentes" (prestes a sair da carteira do
// cobrador por ultrapassar a faixa de atraso dele -- ver
// collector_overdue_ranges). Usado tanto no painel do cobrador quanto no
// do gestor, por isso fica aqui e nao inline num componente.
export const URGENTE_SAIDA_CARTEIRA_DIAS = 15;

/**
 * A regra da carteira cobre este cliente? Faixa INCLUSIVA nas duas pontas
 * ("1 a 60" cobre o dia 60 e "61 a 120" comeca no 61) e loja na lista da
 * regra (null = todas). Atraso = parcela vencida mais antiga
 * (clientMaxOverdueDays); loja = a dessa parcela (clientReferenceStore).
 * Espelha faixa_cobre_cliente no banco (migration 20261106000007).
 */
export const faixaCobreAtraso = (
  faixa: { minDias: number; maxDias: number | null; lojas?: string[] | null },
  atraso: number,
  loja?: string | null,
): boolean =>
  atraso >= faixa.minDias &&
  (faixa.maxDias == null || atraso <= faixa.maxDias) &&
  (faixa.lojas == null || (loja != null && faixa.lojas.includes(loja)));

/** Dias ate o cliente passar do teto da faixa (no ultimo dia, falta 1). */
export const diasAteSairDaFaixa = (maxDias: number, atraso: number): number =>
  maxDias - atraso + 1;

/**
 * Dias ate o cliente sair da carteira de um cobrador com VARIAS regras:
 * parte da regra que cobre o cliente hoje e emenda as regras do mesmo
 * cobrador que continuam a cobertura sem buraco (ex.: "3 a 60" e "61 a 120"
 * na mesma loja = sai so depois do 120). null quando nenhuma regra cobre
 * hoje ou quando a cobertura nao tem fim (regra sem teto).
 */
export const diasAteSairDasRegras = (
  regras: { minDias: number; maxDias: number | null; lojas?: string[] | null }[],
  atraso: number,
  loja: string | null,
): number | null => {
  let atual = regras.find((r) => faixaCobreAtraso(r, atraso, loja));
  if (!atual) return null;
  // Limite de passos so por seguranca contra regras mal formadas.
  for (let i = 0; i < regras.length; i++) {
    if (atual.maxDias == null) return null;
    const teto: number = atual.maxDias;
    const seguinte = regras.find((r) => faixaCobreAtraso(r, teto + 1, loja));
    if (!seguinte) return diasAteSairDaFaixa(teto, atraso);
    atual = seguinte;
  }
  return null;
};

export const PRIORITY_COLOR_CLASSES: Record<PriorityBucket, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};
