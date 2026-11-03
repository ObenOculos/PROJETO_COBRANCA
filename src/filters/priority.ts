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

export const PRIORITY_COLOR_CLASSES: Record<PriorityBucket, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};
