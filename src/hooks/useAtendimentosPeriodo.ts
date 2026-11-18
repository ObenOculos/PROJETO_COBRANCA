import { useEffect, useState } from "react";
import { buscarComCacheTela, lerCacheTela } from "../utils/cacheTela";
import { supabase } from "../lib/supabase";
import { comRetentativa } from "../utils/supabaseRetry";

/** Atendimentos de um cobrador no periodo, contados por cliente. */
export interface AtendimentosCobrador {
  /** Clientes diferentes com algum atendimento registrado. */
  clientes: number;
  /** Desses, com quantos houve conversa (contato efetivo). */
  conversaram: number;
  /** Desses, quantos deram promessa de pagamento. */
  promessas: number;
  /** Total de registros no periodo, sem deduplicar por cliente (cliente
   * acionado 3x conta 3 aqui, 1 em `clientes`). */
  tentativas: number;
}

/**
 * Atendimentos registrados (collection_attempts: Atender, Fila, pagamento,
 * venda cancelada; e visitas presenciais concluidas do cobrador externo) no
 * periodo, por cobrador. Fonte unica do "Clientes acionados" -- Resumo por
 * Cobrador (gestor) e Meu desempenho (cobrador).
 *
 * Contados por CLIENTE, nunca por titulo nem por dia: cliente atendido 3
 * vezes = 1. A conta e feita no banco (RPC atendimentos_periodo, migration
 * 20261118000004): antes o front baixava cada linha do periodo em paginas
 * sequenciais e levava 2-3 s a cada troca de periodo. A regra (lista de
 * contato efetivo, visitas presenciais, chave do cliente) mora la.
 *
 * `collectorId` restringe a um cobrador so (obrigatorio para quem nao e
 * gestor -- a RPC recusa o contrario).
 */
export function useAtendimentosPeriodo(
  dateFrom: string,
  dateTo: string,
  collectorId?: string,
  /** Muda para forcar releitura (ex.: depois de um registro novo). */
  versao?: number,
): {
  atendimentos: Map<string, AtendimentosCobrador> | null;
  erro: boolean;
} {
  // Resultado guardado junto do periodo/cobrador a que pertence: trocar o
  // periodo mostra "carregando" ja no mesmo render (sem um quadro com o
  // numero do periodo anterior); releitura por `versao` mantem o anterior ate
  // o novo chegar (a base nao inclui a versao).
  const base = `${dateFrom}|${dateTo}|${collectorId ?? ""}`;
  // Ja nasce com o guardado no cache (se houver): sem isto, toda entrada na
  // tela passava um quadro em "…" antes do efeito ler o cache (2026-11-18).
  const [estado, setEstado] = useState<{
    base: string;
    valor: Map<string, AtendimentosCobrador>;
  } | null>(() => {
    const c = lerCacheTela<Map<string, AtendimentosCobrador>>(
      `atendimentos|${base}|${versao ?? 0}`,
    );
    return c ? { base, valor: c.valor } : null;
  });
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErro(false);
    const chave = `atendimentos|${base}|${versao ?? 0}`;
    const cache = lerCacheTela<Map<string, AtendimentosCobrador>>(chave);
    if (cache) {
      // Volta para a tela: mostra na hora; so consulta se ja passou do prazo.
      setEstado({ base, valor: cache.valor });
      if (cache.fresco) return;
    }
    const buscar = async (): Promise<Map<string, AtendimentosCobrador>> => {
      const { data, error } = await comRetentativa(() =>
        supabase.rpc("atendimentos_periodo", {
          p_inicio: dateFrom,
          p_fim: dateTo,
          p_collector: collectorId ?? null,
        }),
      );
      if (error) throw error;
      const resultado = new Map<string, AtendimentosCobrador>();
      (data ?? []).forEach((r) => {
        resultado.set(r.collector_id, {
          clientes: Number(r.clientes) || 0,
          conversaram: Number(r.conversaram) || 0,
          promessas: Number(r.promessas) || 0,
          tentativas: Number(r.tentativas) || 0,
        });
      });
      return resultado;
    };
    buscarComCacheTela(chave, buscar)
      .then((resultado) => {
        if (!cancelled) setEstado({ base, valor: resultado });
      })
      .catch((err) => {
        console.error("Erro ao buscar atendimentos do período:", err);
        if (!cancelled) setErro(true);
      });
    return () => {
      cancelled = true;
    };
    // `base` ja carrega dateFrom/dateTo/collectorId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, versao]);

  return {
    atendimentos: estado && estado.base === base ? estado.valor : null,
    erro,
  };
}
