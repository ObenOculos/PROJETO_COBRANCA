// Atalhos de periodo (Mes atual, Hoje, 7 dias, 30 dias, Tudo). Fonte unica do
// Resumo por Cobrador e do filtro de vencimento da Atribuicao de Cobradores:
// com o mesmo atalho as duas telas recortam exatamente as mesmas datas.
// Datas sempre YYYY-MM-DD no fuso local; contas so com getters UTC sobre a
// string, sem new Date("YYYY-MM-DD") (ver CLAUDE.md).

export type PeriodoPreset = "month-atual" | "today" | "week" | "month30" | "all";

export const PERIODO_PRESETS: { key: PeriodoPreset; label: string }[] = [
  { key: "month-atual", label: "Mês atual" },
  { key: "today", label: "Hoje" },
  { key: "week", label: "7 dias" },
  { key: "month30", label: "30 dias" },
  { key: "all", label: "Tudo" },
];

// Sentinelas para "Tudo": faixa larga o bastante pra cobrir qualquer registro
// real sem precisar de um caso especial "sem filtro" nas comparacoes de string.
export const PERIODO_TUDO_DE = "2000-01-01";
// 9999 e nao 2099: o ERP tem vencimento digitado errado (ex.: ano 2245), e
// com teto menor "Tudo" deixava a parcela fora de "Vence no periodo" mas
// dentro de "A vencer" -- os dois nao batiam.
export const PERIODO_TUDO_ATE = "9999-12-31";

export const addDiasStr = (base: string, dias: number): string => {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

/** Primeiro dia do mes de uma data YYYY-MM-DD. */
export const inicioDoMes = (base: string): string => `${base.slice(0, 7)}-01`;

/** Ultimo dia do mes de uma data YYYY-MM-DD. */
export const fimDoMes = (base: string): string => {
  const [y, m] = base.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
};

/** Intervalo [de, ate] do atalho. "7 dias"/"30 dias" olham PARA FRENTE (de
 * hoje ate hoje+N): o que vai vencer. */
export const periodoDoPreset = (
  key: PeriodoPreset,
  hoje: string,
): { de: string; ate: string } => {
  if (key === "month-atual") return { de: inicioDoMes(hoje), ate: fimDoMes(hoje) };
  if (key === "all") return { de: PERIODO_TUDO_DE, ate: PERIODO_TUDO_ATE };
  const dias = { today: 0, week: 7, month30: 30 }[key];
  return { de: hoje, ate: addDiasStr(hoje, dias) };
};

/** Qual atalho corresponde ao intervalo (para acender o botao), ou null. */
export const presetDoPeriodo = (
  de: string,
  ate: string,
  hoje: string,
  candidatos: readonly PeriodoPreset[] = PERIODO_PRESETS.map((p) => p.key),
): PeriodoPreset | null =>
  candidatos.find((k) => {
    const p = periodoDoPreset(k, hoje);
    return p.de === de && p.ate === ate;
  }) ?? null;
