import { CollectorOverdueRange, FilaOrdem } from "../types";
import { faixaCobreAtraso } from "./priority";

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
 * - Ordem dentro da faixa configurável: maior atraso (padrão) ou maior dívida
 *   vencida (`filaOrdem`).
 * - Faixa de dívida vencida (`filaSaldoMin`/`filaSaldoMax`): cliente fora do
 *   valor não entra na intercalação, vai para o fim (não some da carteira).
 *
 * Banco: colunas fila_* de collector_overdue_ranges e RPC
 * definir_fila_cobranca (migrations 20261109000010 e 0011).
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

export const FILA_ORDEM_LABEL: Record<FilaOrdem, string> = {
  atraso: "Maior atraso",
  valor: "Maior dívida vencida",
};

/** A dívida vencida está dentro da faixa de valor da regra? */
export const saldoNaFaixaDaFila = (
  regra: Pick<CollectorOverdueRange, "filaSaldoMin" | "filaSaldoMax">,
  vencido: number,
): boolean =>
  (regra.filaSaldoMin == null || vencido >= regra.filaSaldoMin - 0.005) &&
  (regra.filaSaldoMax == null || vencido <= regra.filaSaldoMax + 0.005);

/** Por que o cliente ficou no fim da lista em vez de entrar na intercalação. */
export type MotivoFimDaFila =
  | "tentouHoje"
  | "foraDoValor"
  | "foraDoTurno"
  | "semFaixa"
  | "emDia"
  | "adiado";

export interface DadosClienteFila {
  atraso: number;
  loja: string | null;
  vencido: number;
  tentouHoje: boolean;
  /** "Deixar para depois" registrado hoje. */
  adiadoHoje: boolean;
}

/**
 * Monta a lista "Ligar" com a fila ligada. Ordem:
 *  1. faixas intercaladas pelo peso do turno (dentro da faixa, pela ordem da
 *     regra);
 *  2. quem já tentou hoje sem falar (mesma intercalação);
 *  3. fim: fora do valor / peso 0 no turno / sem faixa, maior atraso primeiro;
 *  4. em dia (nada vencido);
 *  5. deixados para depois hoje.
 * Com a fila desligada devolve null (o chamador mantém a ordem padrão).
 */
export function montarFilaLigar<T>(
  itens: T[],
  regrasDoCobrador: CollectorOverdueRange[],
  turno: TurnoFila,
  dados: (item: T) => DadosClienteFila,
): { lista: T[]; motivoFim: Map<T, MotivoFimDaFila> } | null {
  if (!filaLigada(regrasDoCobrador)) return null;
  const ativas = regrasDoCobrador.filter((r) => r.ativa);
  const motivoFim = new Map<T, MotivoFimDaFila>();
  const porRegra = new Map<string, { item: T; d: DadosClienteFila }[]>();
  const tentouPorRegra = new Map<string, { item: T; d: DadosClienteFila }[]>();
  const fim: { item: T; d: DadosClienteFila }[] = [];
  const emDia: { item: T; d: DadosClienteFila }[] = [];
  const adiados: { item: T; d: DadosClienteFila }[] = [];

  itens.forEach((item) => {
    const d = dados(item);
    const entrada = { item, d };
    if (d.adiadoHoje) {
      motivoFim.set(item, "adiado");
      adiados.push(entrada);
      return;
    }
    if (d.vencido <= 0.01) {
      motivoFim.set(item, "emDia");
      emDia.push(entrada);
      return;
    }
    const regra = ativas.find((r) => faixaCobreAtraso(r, d.atraso, d.loja));
    if (!regra) {
      motivoFim.set(item, "semFaixa");
      fim.push(entrada);
      return;
    }
    if (!saldoNaFaixaDaFila(regra, d.vencido)) {
      motivoFim.set(item, "foraDoValor");
      fim.push(entrada);
      return;
    }
    if ((pesoNaFila(regra, regrasDoCobrador, turno) ?? 0) <= 0) {
      motivoFim.set(item, "foraDoTurno");
      fim.push(entrada);
      return;
    }
    const destino = d.tentouHoje ? tentouPorRegra : porRegra;
    if (d.tentouHoje) motivoFim.set(item, "tentouHoje");
    if (!destino.has(regra.id)) destino.set(regra.id, []);
    destino.get(regra.id)!.push(entrada);
  });

  const porAtraso = (
    a: { d: DadosClienteFila },
    b: { d: DadosClienteFila },
  ) => b.d.atraso - a.d.atraso || b.d.vencido - a.d.vencido;
  const porValor = (
    a: { d: DadosClienteFila },
    b: { d: DadosClienteFila },
  ) => b.d.vencido - a.d.vencido || b.d.atraso - a.d.atraso;

  const intercalar = (grupos: Map<string, { item: T; d: DadosClienteFila }[]>) =>
    intercalarPorPeso(
      ativas.map((r) => {
        const lista = grupos.get(r.id) ?? [];
        lista.sort(r.filaOrdem === "valor" ? porValor : porAtraso);
        return {
          peso: pesoNaFila(r, regrasDoCobrador, turno) ?? 0,
          itens: lista.map((e) => e.item),
        };
      }),
    );

  const lista = [
    ...intercalar(porRegra),
    ...intercalar(tentouPorRegra),
    ...fim.sort(porAtraso).map((e) => e.item),
    ...emDia.sort(porAtraso).map((e) => e.item),
    ...adiados.sort(porAtraso).map((e) => e.item),
  ];
  return { lista, motivoFim };
}

/** "Deixar para depois" (tabela fila_adiamentos, migration 20261109000012):
 * o cliente vai para o fim da lista "Ligar" só no dia do registro. */
export type MotivoAdiamento = "ligar_mais_tarde" | "sem_telefone" | "outro";

export const MOTIVO_ADIAMENTO_LABEL: Record<MotivoAdiamento, string> = {
  ligar_mais_tarde: "Cliente pediu para ligar mais tarde",
  sem_telefone: "Sem telefone válido",
  outro: "Outro motivo",
};

/** Texto do selo na linha (curto). */
export const MOTIVO_ADIAMENTO_SELO: Record<MotivoAdiamento, string> = {
  ligar_mais_tarde: "pediu para ligar mais tarde",
  sem_telefone: "sem telefone válido",
  outro: "outro motivo",
};

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
