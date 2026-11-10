import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { todayLocalStr } from "../config/visitStatus";
import { MotivoAdiamento } from "../filters/filaCobranca";

export interface AdiamentoDoDia {
  motivo: MotivoAdiamento;
  observacao: string | null;
}

/**
 * "Deixar para depois" da Fila de Cobrança (item 39): os clientes que ESTE
 * cobrador tirou da vez HOJE (fila_adiamentos, migration 20261109000012) e a
 * ação de registrar. Fato histórico: só insere, nunca apaga. A RLS só aceita
 * cliente da carteira do próprio cobrador, no dia de hoje.
 */
export function useFilaAdiamentos(collectorId: string | null | undefined) {
  const [adiamentos, setAdiamentos] = useState<Map<string, AdiamentoDoDia>>(
    new Map(),
  );
  const [dia, setDia] = useState(todayLocalStr());
  // Já leu os adiamentos do dia? (o lote da fila só é montado depois)
  const [carregado, setCarregado] = useState(false);

  // Vira o dia com a tela aberta: os adiamentos de ontem deixam de valer.
  useEffect(() => {
    const t = window.setInterval(() => {
      const hoje = todayLocalStr();
      setDia((atual) => (atual === hoje ? atual : hoje));
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!collectorId) return;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase
        .from("fila_adiamentos")
        .select("documento, motivo, observacao, created_at")
        .eq("collector_id", collectorId)
        .eq("dia", dia)
        .order("created_at")
        .order("id");
      if (cancelado) return;
      if (error) {
        // Sem a migration: só não há "deixar para depois".
        console.warn("Adiamentos da fila indisponíveis:", error.message);
        setAdiamentos(new Map());
        setCarregado(true);
        return;
      }
      // Ordem por created_at: o último registro do cliente vale.
      setAdiamentos(
        new Map(
          (data ?? []).map((r) => [
            r.documento,
            { motivo: r.motivo as MotivoAdiamento, observacao: r.observacao },
          ]),
        ),
      );
      setCarregado(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [collectorId, dia]);

  const adiar = useCallback(
    async (documento: string, motivo: MotivoAdiamento, observacao: string | null) => {
      if (!collectorId) throw new Error("Usuário não identificado.");
      const { error } = await supabase.from("fila_adiamentos").insert({
        collector_id: collectorId,
        documento,
        motivo,
        observacao: observacao?.trim() || null,
      });
      if (error) {
        console.error("Erro ao deixar para depois:", error);
        throw new Error("Não foi possível deixar este cliente para depois. Tente de novo.");
      }
      setAdiamentos((prev) =>
        new Map(prev).set(documento, {
          motivo,
          observacao: observacao?.trim() || null,
        }),
      );
    },
    [collectorId],
  );

  return { adiamentos, adiar, carregado };
}
