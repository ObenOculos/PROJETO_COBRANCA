import { CollectorOverdueRange, FilaOrdem } from "../types";
import { faixaCobreAtraso } from "./priority";

/**
 * Fila de Cobrança (itens 39 e 40). O gestor define, por regra (faixa x
 * lojas) do cobrador, "a cada rodada, quantos clientes desta faixa"; o lote
 * do cobrador intercala as faixas nessa proporção (montarLoteFila). Dentro da faixa a ordem é a de sempre
 * (maior atraso primeiro).
 *
 * - Fila desligada (nenhuma regra ativa com peso): lista na ordem padrão.
 * - Turnos opcionais: com `filaPesoTarde` preenchido, `filaPeso` vale até
 *   12h e `filaPesoTarde` depois.
 * - Peso 0 no turno: a faixa não entra no lote nesse turno.
 * - Regra ativa sem peso num cobrador com fila (faixa criada depois): vale 1.
 * - Ordem dentro da faixa configurável: maior atraso (padrão) ou maior dívida
 *   vencida (`filaOrdem`).
 * - Faixa de dívida vencida (`filaSaldoMin`/`filaSaldoMax`): cliente fora do
 *   valor não entra no lote (continua na Carteira completa).
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

/** Tamanho do lote quando o gestor não configurou a fila do cobrador. */
export const LOTE_PADRAO = 10;

/** Alerta que põe o cliente na frente da faixa dele no lote. */
export type UrgenciaLote = "quebrado" | "urgente";

export interface DadosClienteLote {
  atraso: number;
  loja: string | null;
  vencido: number;
  urgencia: UrgenciaLote | null;
}

export interface ItemDoLote<T> {
  item: T;
  /** Regra (versão) da Distribuição pela qual entrou; null sem fila. */
  regraId: string | null;
  urgencia: UrgenciaLote | null;
}

/**
 * Tamanho do lote no turno = soma das quantidades que o gestor configurou
 * (ex.: 5+2+2+1 = 10). Fila desligada: LOTE_PADRAO.
 */
export const tamanhoDoLote = (
  regrasDoCobrador: CollectorOverdueRange[],
  turno: TurnoFila,
): number => {
  if (!filaLigada(regrasDoCobrador)) return LOTE_PADRAO;
  return regrasDoCobrador
    .filter((r) => r.ativa)
    .reduce((s, r) => s + Math.max(0, pesoNaFila(r, regrasDoCobrador, turno) ?? 0), 0);
};

/**
 * Fila de Cobrança em lotes (item 40, 2026-11-10): monta o PRÓXIMO lote do
 * cobrador. O banco (abrir_lote_fila) grava e só aceita lote novo com o
 * anterior todo finalizado.
 *
 * `candidatos`: quem o chamador já considerou disponível (cliente com dívida
 * vencida, sem compromisso marcado, sem contato recente, não tentado nem
 * deixado para depois hoje).
 *
 * Fila ligada: só entram clientes das faixas definidas pelo gestor (com o
 * valor dentro da faixa de dívida e quantidade > 0 no turno), intercaladas
 * na proporção; dentro da faixa, alerta primeiro (acordo quebrado, depois
 * "vai sair da carteira") e então a ordem da regra. Faixa sem clientes
 * suficientes: as vagas vão para as outras, na mesma proporção.
 * Fila desligada: alerta primeiro e depois maior atraso, LOTE_PADRAO clientes.
 */
export function montarLoteFila<T>(
  candidatos: T[],
  regrasDoCobrador: CollectorOverdueRange[],
  turno: TurnoFila,
  dados: (item: T) => DadosClienteLote,
): ItemDoLote<T>[] {
  const tamanho = tamanhoDoLote(regrasDoCobrador, turno);
  const ativas = regrasDoCobrador.filter((r) => r.ativa);
  const entradas = candidatos
    .map((item) => ({ item, d: dados(item) }))
    .filter((e) => e.d.vencido > 0.01);

  const pesoUrgencia = (u: UrgenciaLote | null) =>
    u === "quebrado" ? 0 : u === "urgente" ? 1 : 2;
  type Entrada = (typeof entradas)[number];
  const porAtraso = (a: Entrada, b: Entrada) =>
    b.d.atraso - a.d.atraso || b.d.vencido - a.d.vencido;
  const porValor = (a: Entrada, b: Entrada) =>
    b.d.vencido - a.d.vencido || b.d.atraso - a.d.atraso;
  const alertaPrimeiro =
    (ordem: (a: Entrada, b: Entrada) => number) => (a: Entrada, b: Entrada) =>
      pesoUrgencia(a.d.urgencia) - pesoUrgencia(b.d.urgencia) || ordem(a, b);

  if (!filaLigada(regrasDoCobrador)) {
    return entradas
      .sort(alertaPrimeiro(porAtraso))
      .slice(0, tamanho)
      .map((e) => ({
        item: e.item,
        regraId:
          ativas.find((r) => faixaCobreAtraso(r, e.d.atraso, e.d.loja))?.id ?? null,
        urgencia: e.d.urgencia,
      }));
  }

  const porRegra = new Map<string, Entrada[]>();
  entradas.forEach((e) => {
    const regra = ativas.find((r) => faixaCobreAtraso(r, e.d.atraso, e.d.loja));
    if (!regra) return;
    if (!saldoNaFaixaDaFila(regra, e.d.vencido)) return;
    if ((pesoNaFila(regra, regrasDoCobrador, turno) ?? 0) <= 0) return;
    if (!porRegra.has(regra.id)) porRegra.set(regra.id, []);
    porRegra.get(regra.id)!.push(e);
  });

  return intercalarPorPeso(
    ativas.map((r) => {
      const lista = porRegra.get(r.id) ?? [];
      lista.sort(alertaPrimeiro(r.filaOrdem === "valor" ? porValor : porAtraso));
      return {
        peso: pesoNaFila(r, regrasDoCobrador, turno) ?? 0,
        itens: lista.map((e) => ({
          item: e.item,
          regraId: r.id,
          urgencia: e.d.urgencia,
        })),
      };
    }),
  ).slice(0, tamanho);
}

/** "Deixar para depois" (tabela fila_adiamentos, migration 20261109000012):
 * conta como cliente finalizado no lote (migration 20261110000003). */
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
