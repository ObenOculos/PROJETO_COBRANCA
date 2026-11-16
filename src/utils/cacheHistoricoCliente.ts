// Cache em memoria do Historico (linha do tempo) da ficha do cliente.
//
// Antes cada abertura da aba refazia 4-5 consultas (contatos, acordos,
// carteira, baixas, pagamentos) -- lento e pesado para o egress do Supabase
// (item 65). Agora o resultado vale por VALIDADE_MS; qualquer gravacao sobre
// o cliente (Atender, pagamento, acordo, estorno, pedidos...) chama
// invalidarHistoricoCliente(documento) e a proxima abertura busca de novo.
// Fica so em memoria: some ao recarregar a pagina. O que outra pessoa grava
// no mesmo cliente nesse intervalo so aparece depois da validade ou no
// "Atualizar" da propria aba.

export const VALIDADE_HISTORICO_MS = 5 * 60 * 1000;

interface Entrada<T> {
  quando: number;
  dados: T;
}

const cache = new Map<string, Entrada<unknown>>();

const prefixo = (documento: string) => `${documento}|`;

export const lerHistoricoCliente = <T>(
  documento: string,
  chave: string,
): Entrada<T> | null => {
  const e = cache.get(prefixo(documento) + chave) as Entrada<T> | undefined;
  if (!e) return null;
  if (Date.now() - e.quando > VALIDADE_HISTORICO_MS) {
    cache.delete(prefixo(documento) + chave);
    return null;
  }
  return e;
};

export const guardarHistoricoCliente = <T>(
  documento: string,
  chave: string,
  dados: T,
): number => {
  const quando = Date.now();
  cache.set(prefixo(documento) + chave, { quando, dados });
  return quando;
};

/** Descarta o Historico guardado de um cliente (ou de todos, sem documento). */
export const invalidarHistoricoCliente = (documento?: string | null): void => {
  if (!documento) {
    cache.clear();
    return;
  }
  const p = prefixo(documento);
  Array.from(cache.keys()).forEach((k) => {
    if (k.startsWith(p)) cache.delete(k);
  });
};
