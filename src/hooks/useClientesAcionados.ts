import { useEffect, useState } from "react";
import { buscarComCacheTela, lerCacheTela } from "../utils/cacheTela";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../utils/fetchAllRows";

/** cobrador -> documentos dos clientes acionados no periodo. */
export type ClientesAcionados = Map<string, Set<string>>;

/**
 * Clientes ACIONADOS no periodo (ligacao, WhatsApp, visita), por cobrador --
 * RPC clientes_acionados_periodo (migration 20261125000001), mesma regra de
 * atendimentos_periodo, so que com a lista de clientes para o Resumo cruzar
 * com "em atraso"/"sem agendamento" (item 92). So o gestor.
 */
export function useClientesAcionados(
  dateFrom: string,
  dateTo: string,
): { acionados: ClientesAcionados | null; erro: boolean } {
  const base = `${dateFrom}|${dateTo}`;
  const chave = `clientesAcionados|${base}`;
  const [estado, setEstado] = useState<{
    base: string;
    valor: ClientesAcionados;
  } | null>(() => {
    const c = lerCacheTela<ClientesAcionados>(chave);
    return c ? { base, valor: c.valor } : null;
  });
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErro(false);
    const cache = lerCacheTela<ClientesAcionados>(chave);
    if (cache) {
      setEstado({ base, valor: cache.valor });
      if (cache.fresco) return;
    }
    const buscar = async (): Promise<ClientesAcionados> => {
      const linhas = await fetchAllRows((from, to) =>
        supabase
          .rpc("clientes_acionados_periodo", {
            p_inicio: dateFrom,
            p_fim: dateTo,
          })
          .range(from, to),
      );
      const mapa: ClientesAcionados = new Map();
      linhas.forEach((l) => {
        const set = mapa.get(l.collector_id);
        if (set) set.add(l.documento);
        else mapa.set(l.collector_id, new Set([l.documento]));
      });
      return mapa;
    };
    buscarComCacheTela(chave, buscar)
      .then((valor) => {
        if (!cancelled) setEstado({ base, valor });
      })
      .catch((err) => {
        console.error("Erro ao buscar clientes acionados:", err);
        if (!cancelled) setErro(true);
      });
    return () => {
      cancelled = true;
    };
    // `chave`/`base` ja carregam dateFrom/dateTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return {
    acionados: estado && estado.base === base ? estado.valor : null,
    erro,
  };
}
