// Estilo das metricas secundarias ("pilulas") dos cards do Resumo Geral e
// da aba Inadimplencia. Arquivo proprio para as duas telas usarem o mesmo
// (e o fast refresh continuar valendo nos componentes).
//
// 26/11 (hierarquia visual): deixaram de ser caixinhas com fundo e borda --
// viraram texto (valor em cima, rotulo cinza embaixo). So o VALOR ganha cor,
// e so quando e alerta (red/amber) ou bom (green); o resto fica neutro.

export type TomPilula = "red" | "amber" | "green" | "gray";

export const METRICA: Record<TomPilula, string> = {
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
  green: "text-green-700 dark:text-green-400",
  gray: "text-gray-800 dark:text-dark-text",
};
