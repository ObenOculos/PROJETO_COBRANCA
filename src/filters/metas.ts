import type { MonthlyGoal } from "../types";

/**
 * Meta do mês com vigência (item 72, decisão do usuário 2026-11-16): a meta
 * gravada num mês vale dali em diante, até a próxima alteração. Uma linha de
 * monthly_goals no mês M = "a partir de M" (payments_goal 0 e sem faixas =
 * "sem meta a partir de M"). As faixas de comissão (comissao_faixas) seguem a
 * mesma regra: valem as do mês da linha que vigora.
 *
 * Antes de INICIO_METAS_VIGENTES cada mês era isolado (meta antiga de abril
 * não pode passar a valer em novembro), então lá só vale a linha do próprio mês.
 * Fonte única: toda tela que precisa da "meta do mês" usa metaDoMes.
 */
export const INICIO_METAS_VIGENTES = "2026-11";

/** "YYYY-MM" de uma data "YYYY-MM-DD" (ou já "YYYY-MM"). */
const ymDe = (d: string) => d.slice(0, 7);

/** Linha de monthly_goals que vale no mês `ym` ("YYYY-MM"), ou undefined. */
export const metaDoMes = (
  monthlyGoals: MonthlyGoal[],
  userId: string | undefined | null,
  ym: string,
): MonthlyGoal | undefined => {
  if (!userId) return undefined;
  const doUsuario = monthlyGoals.filter((g) => g.user_id === userId);
  if (ym < INICIO_METAS_VIGENTES) {
    return doUsuario.find((g) => ymDe(g.month) === ym);
  }
  let vigente: MonthlyGoal | undefined;
  for (const g of doUsuario) {
    const m = ymDe(g.month);
    if (m < INICIO_METAS_VIGENTES || m > ym) continue;
    if (!vigente || m > ymDe(vigente.month)) vigente = g;
  }
  return vigente;
};

/** Meses "YYYY-MM" de `de` até `ate`, inclusive. */
export const mesesEntre = (de: string, ate: string): string[] => {
  const out: string[] = [];
  let [y, m] = de.split("-").map(Number);
  const [yf, mf] = ate.split("-").map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

/**
 * Meses (até `ateYm`) em que o usuário tem meta valendo, já resolvidos.
 * Para históricos/listas por mês.
 */
export const metasPorMes = (
  monthlyGoals: MonthlyGoal[],
  userId: string,
  ateYm: string,
): { ym: string; goal: MonthlyGoal }[] => {
  const meses = monthlyGoals
    .filter((g) => g.user_id === userId)
    .map((g) => ymDe(g.month))
    .sort();
  if (meses.length === 0) return [];
  return mesesEntre(meses[0], ateYm)
    .map((ym) => ({ ym, goal: metaDoMes(monthlyGoals, userId, ym) }))
    .filter(
      (x): x is { ym: string; goal: MonthlyGoal } =>
        !!x.goal && (x.goal.payments_goal > 0 || x.goal.visits_goal > 0),
    );
};
