// Cache em memoria (da aba do navegador) para consultas de tela que nao
// mudam a cada segundo -- ex.: "Clientes atendidos" e "Carteira automatica"
// do Resumo por Cobrador. Sem ele, cada volta para a pagina refazia todas as
// consultas (pedido do usuario, 16/11).
//
// Uso (stale-while-revalidate):
//   const c = lerCacheTela<T>(chave);
//   if (c) { mostra c.valor; if (c.fresco) nao busca; }
//   ...busca e grava com gravarCacheTela(chave, valor).
//
// Some ao recarregar a pagina (F5). Nao use para dado que precisa estar
// sempre exato no instante (saldo, pagamento): so para painel de leitura.

/** Ate aqui o valor e mostrado sem consultar de novo. */
export const CACHE_TELA_FRESCO_MS = 2 * 60 * 1000;
/** Depois disto o valor e descartado (nem mostrado enquanto atualiza). */
const CACHE_TELA_MAX_MS = 30 * 60 * 1000;

const memoria = new Map<string, { valor: unknown; em: number }>();

export function lerCacheTela<T>(
  chave: string,
): { valor: T; fresco: boolean } | null {
  const item = memoria.get(chave);
  if (!item) return null;
  const idade = Date.now() - item.em;
  if (idade > CACHE_TELA_MAX_MS) {
    memoria.delete(chave);
    return null;
  }
  return { valor: item.valor as T, fresco: idade <= CACHE_TELA_FRESCO_MS };
}

export function gravarCacheTela<T>(chave: string, valor: T): void {
  memoria.set(chave, { valor, em: Date.now() });
}

/** Descarta o valor guardado -- use antes de refazer a busca quando uma
 * ação local (gravação) tornou o cache sabidamente desatualizado. */
export function invalidarCacheTela(chave: string): void {
  memoria.delete(chave);
}

const emAndamento = new Map<string, Promise<unknown>>();

/** Busca e grava no cache. A busca NAO e cancelada quando a tela desmonta
 * (sair e voltar antes de terminar reaproveita a mesma consulta e o
 * resultado fica guardado); quem chamou so ignora o retorno se ja saiu. */
export function buscarComCacheTela<T>(
  chave: string,
  buscar: () => Promise<T>,
): Promise<T> {
  const atual = emAndamento.get(chave);
  if (atual) return atual as Promise<T>;
  const p = buscar()
    .then((valor) => {
      gravarCacheTela(chave, valor);
      return valor;
    })
    .finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, p);
  return p;
}
