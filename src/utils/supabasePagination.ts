// Helpers de paginacao para o PostgREST/Supabase.
//
// O Supabase corta toda resposta em ~1000 linhas. Sem paginar, qualquer tabela
// que cresca alem disso passa a retornar dados truncados _silenciosamente_ —
// nao ha erro, so faltam registros. Todo fetch volumoso precisa passar por aqui.

export const DEFAULT_PAGE_SIZE = 1000;

// Quantas paginas buscar ao mesmo tempo. O gargalo do carregamento nao e o
// banco (cada pagina responde em ~200-400ms), e o round-trip sequencial: 112
// paginas em fila davam ~64s contra ~12s em paralelo.
export const DEFAULT_CONCURRENCY = 8;

type PageResult<T> = { data: T[] | null; error: unknown };
type PageBuilder<T> = (from: number, to: number) => PromiseLike<PageResult<T>>;

interface PaginationOptions<T> {
  pageSize?: number;
  // Chamado a cada lote concluido, com as linhas do lote e o total acumulado.
  // Permite renderizar progressivamente em vez de esperar a carga inteira.
  onBatch?: (batchRows: T[], loadedCount: number) => void;
  // Quando false, as linhas nao ficam retidas e o retorno vem vazio: o chamador
  // consome tudo por `onBatch`. Evita segurar as linhas brutas E a versao
  // convertida ao mesmo tempo em tabelas grandes.
  accumulate?: boolean;
}

interface ParallelOptions<T> extends PaginationOptions<T> {
  concurrency?: number;
}

/**
 * Percorre todas as paginas em sequencia. Use quando o total e desconhecido:
 * para de buscar quando uma pagina volta incompleta.
 */
export async function fetchAllPages<T>(
  buildPage: PageBuilder<T>,
  {
    pageSize = DEFAULT_PAGE_SIZE,
    onBatch,
    accumulate = true,
  }: PaginationOptions<T> = {},
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  let loaded = 0;

  for (;;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    loaded += data.length;
    if (accumulate) rows.push(...data);
    onBatch?.(data, loaded);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

/**
 * Busca as paginas em lotes paralelos. Precisa do total (count exato) para
 * saber quantas paginas existem antes de comecar.
 *
 * As linhas voltam na ordem das paginas, nao na ordem em que as respostas
 * chegaram — o resultado e identico ao da versao sequencial.
 */
export async function fetchPagesInParallel<T>(
  buildPage: PageBuilder<T>,
  total: number,
  {
    pageSize = DEFAULT_PAGE_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    onBatch,
    accumulate = true,
  }: ParallelOptions<T> = {},
): Promise<T[]> {
  if (total <= 0) return [];

  const pageCount = Math.ceil(total / pageSize);
  const offsets = Array.from({ length: pageCount }, (_, i) => i * pageSize);

  const rows: T[] = [];
  let loaded = 0;

  for (let i = 0; i < offsets.length; i += concurrency) {
    const slice = offsets.slice(i, i + concurrency);

    const results = await Promise.all(
      slice.map(async (from) => {
        const { data, error } = await buildPage(from, from + pageSize - 1);
        if (error) throw error;
        return data ?? [];
      }),
    );

    // Concatena na ordem das paginas do lote, nao na ordem de chegada.
    const batchRows = results.flat();
    if (batchRows.length === 0) continue;

    loaded += batchRows.length;
    if (accumulate) rows.push(...batchRows);
    onBatch?.(batchRows, loaded);
  }

  return rows;
}

/**
 * Remove duplicatas mantendo a primeira ocorrencia.
 *
 * A paginacao por OFFSET nao e estavel: se linhas entram na tabela durante o
 * carregamento (importacao rodando em paralelo), as paginas seguintes
 * "escorregam" e a mesma linha pode aparecer duas vezes.
 */
export function dedupeBy<T>(rows: T[], key: (row: T) => unknown): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];

  for (const row of rows) {
    const k = key(row);
    if (k === null || k === undefined) {
      out.push(row);
      continue;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }

  return out;
}
