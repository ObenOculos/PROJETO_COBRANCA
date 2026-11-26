// Atalhos de periodo (Mes atual, Hoje, 7 dias, 30 dias, Tudo). Fonte unica do
// Resumo por Cobrador e do filtro de vencimento da Atribuicao de Cobradores:
// com o mesmo atalho as duas telas recortam exatamente as mesmas datas.
// Datas sempre YYYY-MM-DD no fuso local; contas so com getters UTC sobre a
// string, sem new Date("YYYY-MM-DD") (ver CLAUDE.md).

//
// 26/11 (usuario): "7 dias"/"30 dias" olhavam para a FRENTE (hoje ate
// hoje+N), mas quase tudo no Resumo olha para tras (recebido, acionados,
// inadimplencia, recuperacao). Agora os atalhos sao: Mes atual, Hoje, 7 dias
// e 15 dias PARA TRAS (contando hoje), Mes passado e Tudo. Para o futuro, as
// datas de/ate continuam livres.
export type PeriodoPreset =
  | "month-atual"
  | "today"
  | "7d"
  | "15d"
  | "mes-passado"
  | "all";

export const PERIODO_PRESETS: { key: PeriodoPreset; label: string }[] = [
  { key: "month-atual", label: "Mês atual" },
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "15d", label: "15 dias" },
  { key: "mes-passado", label: "Mês passado" },
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

/** Intervalo [de, ate] do atalho. "7 dias"/"15 dias" sao os ultimos N dias
 * contando hoje (7 dias = hoje-6 ate hoje). "Mes atual" vai ate o fim do mes
 * (a Previsao usa o resto do mes); "Mes passado" e o mes anterior inteiro. */
export const periodoDoPreset = (
  key: PeriodoPreset,
  hoje: string,
): { de: string; ate: string } => {
  switch (key) {
    case "month-atual":
      return { de: inicioDoMes(hoje), ate: fimDoMes(hoje) };
    case "today":
      return { de: hoje, ate: hoje };
    case "7d":
      return { de: addDiasStr(hoje, -6), ate: hoje };
    case "15d":
      return { de: addDiasStr(hoje, -14), ate: hoje };
    case "mes-passado": {
      const fimPassado = addDiasStr(inicioDoMes(hoje), -1);
      return { de: inicioDoMes(fimPassado), ate: fimPassado };
    }
    case "all":
      return { de: PERIODO_TUDO_DE, ate: PERIODO_TUDO_ATE };
  }
};

/** Dica do botao: as datas exatas do atalho ("20/11 a 26/11"). */
export const dicaDoPreset = (key: PeriodoPreset, hoje: string): string => {
  if (key === "all") return "Todo o histórico";
  const { de, ate } = periodoDoPreset(key, hoje);
  const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return de === ate ? br(de) : `${br(de)} a ${br(ate)}`;
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
