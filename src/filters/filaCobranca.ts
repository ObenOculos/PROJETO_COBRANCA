import { CollectorOverdueRange } from "../types";

/**
 * Fila de Cobrança (item 39). O gestor define, por regra (faixa x lojas) do
 * cobrador, "a cada rodada, quantos clientes desta faixa"; a lista "Ligar"
 * intercala as faixas nessa proporção. Dentro da faixa a ordem é a de sempre
 * (maior atraso primeiro).
 *
 * - Fila desligada (nenhuma regra ativa com peso): lista na ordem padrão.
 * - Turnos opcionais: com `filaPesoTarde` preenchido, `filaPeso` vale até
 *   12h e `filaPesoTarde` depois.
 * - Peso 0 no turno: a faixa não é intercalada, vai para o fim da lista.
 * - Regra ativa sem peso num cobrador com fila (faixa criada depois): vale 1.
 *
 * Banco: colunas fila_peso/fila_peso_tarde de collector_overdue_ranges e RPC
 * definir_fila_cobranca (migration 20261109000010).
 */

export type TurnoFila = "manha" | "tarde";

/** Hora (local) em que a fila passa da manhã para a tarde. */
export const FILA_VIRADA_HORA = 12;

export const turnoDaFila = (agora: Date = new Date()): TurnoFila =>
  agora.getHours() < FILA_VIRADA_HORA ? "manha" : "tarde";

/** A fila está ligada para estas regras (as vigentes de UM cobrador)? */
export const filaLigada = (regras: CollectorOverdueRange[]): boolean =>
  regras.some((r) => r.ativa && r.filaPeso != null);

/** Os turnos manhã/tarde estão ligados para estas regras? */
export const filaComTurnos = (regras: CollectorOverdueRange[]): boolean =>
  regras.some((r) => r.ativa && r.filaPesoTarde != null);

/** Peso da regra no turno, já com os padrões; null = fila desligada. */
export const pesoNaFila = (
  regra: CollectorOverdueRange,
  regrasDoCobrador: CollectorOverdueRange[],
  turno: TurnoFila,
): number | null => {
  if (!filaLigada(regrasDoCobrador)) return null;
  if (!regra.ativa) return 0;
  const manha = regra.filaPeso ?? 1;
  if (turno === "tarde" && filaComTurnos(regrasDoCobrador)) {
    return regra.filaPesoTarde ?? manha;
  }
  return manha;
};

/**
 * Intercala grupos pela proporção dos pesos (round-robin ponderado suave:
 * com 5/2/2/1 a rodada sai A B C A A D A B C A, espalhada, não em blocos).
 * Grupo que acaba sai da conta e os outros seguem na mesma proporção.
 * Grupos com peso 0 NÃO entram: o chamador decide onde pô-los.
 */
export function intercalarPorPeso<T>(
  grupos: { peso: number; itens: T[] }[],
): T[] {
  const ativos = grupos
    .filter((g) => g.peso > 0 && g.itens.length > 0)
    .map((g) => ({ peso: g.peso, itens: g.itens, pos: 0, credito: 0 }));
  const saida: T[] = [];
  while (ativos.length > 0) {
    const total = ativos.reduce((s, g) => s + g.peso, 0);
    let melhor = 0;
    for (let i = 0; i < ativos.length; i++) {
      ativos[i].credito += ativos[i].peso;
      if (ativos[i].credito > ativos[melhor].credito) melhor = i;
    }
    const g = ativos[melhor];
    g.credito -= total;
    saida.push(g.itens[g.pos++]);
    if (g.pos >= g.itens.length) ativos.splice(melhor, 1);
  }
  return saida;
}

/** Uma rodada da fila (para prévia na tela do gestor): rótulos na ordem. */
export const rodadaDaFila = (
  faixas: { rotulo: string; peso: number }[],
): string[] =>
  intercalarPorPeso(
    faixas.map((f) => ({
      peso: f.peso,
      itens: Array.from({ length: f.peso }, () => f.rotulo),
    })),
  );
