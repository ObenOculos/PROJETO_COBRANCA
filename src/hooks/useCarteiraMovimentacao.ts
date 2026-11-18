import { useEffect, useState } from "react";
import { buscarComCacheTela, lerCacheTela } from "../utils/cacheTela";
import { supabase } from "../lib/supabase";

export interface MovimentacaoCobrador {
  entraram: number;
  sairam: number;
  saidasSemAcao: number;
}

/**
 * Entradas/saidas/saidas-sem-acao da carteira automatica, por cobrador, no
 * periodo [dateFrom, dateTo]. Agregado no banco (RPC
 * carteira_movimentacao_periodo) -- antes isso baixava toda linha de
 * atribuicoes_historico do periodo pro navegador so pra contar (lento em
 * periodo largo). So gestor pode chamar a RPC.
 */
export function useCarteiraMovimentacao(
  dateFrom: string,
  dateTo: string,
  /** Muda para forcar releitura (ex.: depois de devolver um cliente). */
  versao: number = 0,
): {
  movimentacao: Map<string, MovimentacaoCobrador>;
  carregando: boolean;
  erro: boolean;
} {
  // Ja nasce com o guardado no cache (se houver): sem isto, toda entrada na
  // tela passava um quadro em "…" antes do efeito ler o cache (2026-11-18).
  const [inicial] = useState(() =>
    lerCacheTela<Map<string, MovimentacaoCobrador>>(
      `carteiraMovimentacao|${dateFrom}|${dateTo}|${versao}`,
    ),
  );
  const [movimentacao, setMovimentacao] = useState<
    Map<string, MovimentacaoCobrador>
  >(() => inicial?.valor ?? new Map());
  const [carregando, setCarregando] = useState(!inicial);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErro(false);
    const chave = `carteiraMovimentacao|${dateFrom}|${dateTo}|${versao}`;
    const cache = lerCacheTela<Map<string, MovimentacaoCobrador>>(chave);
    if (cache) {
      setMovimentacao(cache.valor);
      setCarregando(false);
      if (cache.fresco) return;
    } else {
      setCarregando(true);
    }
    const buscar = async (): Promise<Map<string, MovimentacaoCobrador>> => {
      const { data, error } = await supabase.rpc(
        "carteira_movimentacao_periodo",
        { p_inicio: dateFrom, p_fim: dateTo },
      );
      if (error) throw error;
      const mapa = new Map<string, MovimentacaoCobrador>();
      (data ?? []).forEach(
        (r: {
          cobrador_id: string;
          entraram: number;
          sairam: number;
          saidas_sem_acao: number;
        }) => {
          mapa.set(r.cobrador_id, {
            entraram: r.entraram,
            sairam: r.sairam,
            saidasSemAcao: r.saidas_sem_acao,
          });
        },
      );
      return mapa;
    };
    buscarComCacheTela(chave, buscar)
      .then((mapa) => {
        if (!cancelled) setMovimentacao(mapa);
      })
      .catch((err) => {
        console.error("Erro ao carregar movimentação da carteira:", err);
        if (!cancelled) setErro(true);
      })
      .finally(() => {
        if (!cancelled) setCarregando(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, versao]);

  return { movimentacao, carregando, erro };
}
