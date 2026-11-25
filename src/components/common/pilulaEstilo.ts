// Estilo dos quadrinhos ("pilulas") dos cards do Resumo Geral e da aba
// Inadimplencia: mesmos chips claros das linhas de alerta do SummaryCard,
// com borda da propria cor (25/11). Arquivo proprio para as duas telas
// usarem o mesmo (e o fast refresh continuar valendo nos componentes).

export type TomPilula = "red" | "amber" | "green" | "gray";

export const PILULA: Record<TomPilula, string> = {
  red: "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  amber:
    "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  green:
    "bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  gray: "bg-white text-gray-700 border border-gray-300 dark:bg-dark-bg-secondary dark:text-dark-text dark:border-dark-border",
};
