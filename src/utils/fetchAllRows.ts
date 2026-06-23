/**
 * Pagina uma consulta do Supabase em blocos de 1000 (limite padrão do PostgREST)
 * até trazer todas as linhas. Todo fetch volumoso precisa paginar — sem isso, a
 * resposta é cortada em ~1000 registros silenciosamente.
 *
 * @param runPage  recebe o intervalo [from, to] e roda a página da query
 * @param shouldCancel  opcional; se retornar true, interrompe (ex.: cleanup de effect)
 */
export async function fetchAllRows<T>(
  runPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  shouldCancel?: () => boolean,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;

  while (!shouldCancel?.()) {
    const { data, error } = await runPage(from, from + PAGE - 1);
    if (error) {
      console.error("Erro ao paginar consulta do Supabase:", error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}
