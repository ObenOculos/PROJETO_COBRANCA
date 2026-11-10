import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { TurnoFila, UrgenciaLote } from "../filters/filaCobranca";

export interface ItemLoteFila {
  documento: string;
  posicao: number;
  regraId: string | null;
  urgencia: UrgenciaLote | null;
  finalizado: boolean;
}

export interface LoteFila {
  id: string;
  criadoEm: string;
  turno: TurnoFila | null;
  tamanhoPrevisto: number;
  itens: ItemLoteFila[];
}

/**
 * Lote aberto da Fila de Cobrança do cobrador logado (item 40, migration
 * 20261110000003): leitura por fila_lote_atual() e abertura do próximo por
 * abrir_lote_fila(). A situação "finalizado" de cada cliente vem do banco
 * (regra única fila_item_finalizado); `recarregar` depois de registrar algo.
 */
export function useFilaLote(collectorId: string | null | undefined) {
  const [lote, setLote] = useState<LoteFila | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const seq = useRef(0);

  const recarregar = useCallback(async () => {
    if (!collectorId) return;
    const meu = ++seq.current;
    const { data, error } = await supabase.rpc("fila_lote_atual");
    if (meu !== seq.current) return; // resposta velha
    if (error) {
      console.error("Erro ao carregar o lote da fila:", error);
      setErro("Não foi possível carregar a sua fila. Atualize a página.");
      setCarregado(true);
      return;
    }
    setErro(null);
    const linhas = data ?? [];
    if (linhas.length === 0) {
      setLote(null);
    } else {
      const l = linhas[0];
      setLote({
        id: l.lote_id,
        criadoEm: l.criado_em,
        turno: (l.turno as TurnoFila | null) ?? null,
        tamanhoPrevisto: l.tamanho_previsto,
        itens: linhas.map((r) => ({
          documento: r.documento,
          posicao: r.posicao,
          regraId: r.regra_id,
          urgencia: (r.urgencia as UrgenciaLote | null) ?? null,
          finalizado: r.finalizado,
        })),
      });
    }
    setCarregado(true);
  }, [collectorId]);

  useEffect(() => {
    setCarregado(false);
    setLote(null);
    void recarregar();
  }, [recarregar]);

  const abrirLote = useCallback(
    async (
      itens: { documento: string; regraId: string | null; urgencia: UrgenciaLote | null }[],
      turno: TurnoFila | null,
      tamanhoPrevisto: number,
    ) => {
      const { error } = await supabase.rpc("abrir_lote_fila", {
        p_itens: itens.map((i) => ({
          documento: i.documento,
          regra_id: i.regraId,
          urgencia: i.urgencia,
        })),
        p_turno: turno,
        p_tamanho_previsto: tamanhoPrevisto,
      });
      if (error) {
        console.error("Erro ao abrir o lote da fila:", error);
        setErro(error.message);
      }
      await recarregar();
    },
    [recarregar],
  );

  return { lote, carregado, erro, recarregar, abrirLote };
}
