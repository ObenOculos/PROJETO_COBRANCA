import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../utils/fetchAllRows";

// Motivo gravado em atribuicoes_historico pela carteira automatica (item 55,
// migration 20261113000002): o cliente saiu da faixa do cobrador SEM nenhum
// registro dele (Atender, pagamento, acordo, agendamento) nos ultimos 30 dias
// desde que entrou na carteira. O gestor usa para cobrar justificativa.
export const MOTIVO_SAIDA_SEM_ACAO = "fora_da_faixa_sem_acao";

export interface SaidaSemAcao {
  id: string;
  documento: string;
  cliente_nome: string | null;
  nome_da_loja: string | null;
  cobrador_anterior_id: string | null;
  cobrador_novo_id: string | null;
  assigned_at: string;
}

/** Saidas sem acao no periodo [dateFrom, dateTo] (YYYY-MM-DD local; dateTo
 * "9999-12-31" = sem limite), agrupadas pelo cobrador de quem o cliente
 * saiu. Um cliente que saiu mais de uma vez do mesmo cobrador aparece uma
 * vez (a saida mais recente). */
export function useSaidasSemAcao(dateFrom: string, dateTo: string) {
  const [saidas, setSaidas] = useState<SaidaSemAcao[] | null>(null);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setErro(false);
    const fromIso = new Date(`${dateFrom}T00:00:00`).toISOString();
    // "Tudo" (9999): sem limite superior -- a data seguinte nao cabe no ISO.
    let toIso: string | null = null;
    if (dateTo < "9999") {
      const fim = new Date(`${dateTo}T00:00:00`);
      fim.setDate(fim.getDate() + 1);
      toIso = fim.toISOString();
    }
    fetchAllRows<SaidaSemAcao>(
      (from, to) => {
        let q = supabase
          .from("atribuicoes_historico")
          .select(
            "id, documento, cliente_nome, nome_da_loja, cobrador_anterior_id, cobrador_novo_id, assigned_at",
          )
          .eq("motivo", MOTIVO_SAIDA_SEM_ACAO)
          .gte("assigned_at", fromIso);
        if (toIso) q = q.lt("assigned_at", toIso);
        return q
          .order("assigned_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
      },
      () => cancelled,
    )
      .then((rows) => {
        if (!cancelled) setSaidas(rows);
      })
      .catch((err) => {
        console.error("Erro ao carregar saídas sem ação:", err);
        if (!cancelled) setErro(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, versao]);

  const porCobrador = useMemo(() => {
    const mapa = new Map<string, SaidaSemAcao[]>();
    // Vem da mais recente para a mais antiga: a 1a de cada cliente fica.
    const vistos = new Set<string>();
    (saidas ?? []).forEach((s) => {
      if (!s.cobrador_anterior_id) return;
      const chave = `${s.cobrador_anterior_id}|${s.documento}`;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      const lista = mapa.get(s.cobrador_anterior_id) ?? [];
      lista.push(s);
      mapa.set(s.cobrador_anterior_id, lista);
    });
    return mapa;
  }, [saidas]);

  return { porCobrador, carregando: saidas === null && !erro, erro, recarregar };
}
