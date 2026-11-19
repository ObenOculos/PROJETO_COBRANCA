import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/** Escada da Fila de Cobrança para um cliente sem retorno
 * (fila_espera_cobrador, migration 20261119000003). */
export interface EsperaFila {
  /** Tentativas sem retorno desde o último retorno real. */
  tentativas: number;
  /** Dia da última tentativa (YYYY-MM-DD). */
  ultimaTentativa: string;
  /** Dia em que volta à fila; null quando está no limbo do gestor. */
  voltaEm: string | null;
  /** Saiu da fila e espera o gestor decidir (SPC ou volta a cobrar). */
  emLimbo: boolean;
}

/**
 * Clientes da carteira do cobrador que estão na escada de espera (pelo menos
 * 1 tentativa sem retorno). Relê a cada `versao` (registro novo). Falha ou
 * banco sem a migration: mapa vazio, a fila funciona como antes.
 */
export function useFilaEspera(
  collectorId: string | null | undefined,
  versao: unknown,
) {
  const [espera, setEspera] = useState<Map<string, EsperaFila>>(new Map());
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!collectorId) return;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase.rpc("fila_espera_cobrador");
      if (cancelado) return;
      if (error) {
        console.warn("Escada da fila indisponível:", error.message);
        setEspera(new Map());
      } else {
        setEspera(
          new Map(
            (
              (data ?? []) as {
                documento: string;
                tentativas: number;
                ultima_tentativa: string;
                volta_em: string | null;
                em_limbo: boolean;
              }[]
            ).map((r) => [
              r.documento,
              {
                tentativas: r.tentativas,
                ultimaTentativa: r.ultima_tentativa,
                voltaEm: r.volta_em,
                emLimbo: r.em_limbo,
              },
            ]),
          ),
        );
      }
      setCarregado(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [collectorId, versao]);

  return { espera, carregado };
}
