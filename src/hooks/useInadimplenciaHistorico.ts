import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { buscarComCacheTela, lerCacheTela } from "../utils/cacheTela";
import {
  PontoInadimplencia,
  pontoDaRpc,
  somarMeses,
} from "../filters/inadimplenciaHistorico";

// Historico da inadimplencia (RPC inadimplencia_historico) com o cache de
// tela. Usado pela aba Inadimplencia e pelos cards do Resumo Geral (26/11):
// mesma chave = uma consulta so entre as telas (egress do Supabase).

export type Agrupar = "loja" | "cobrador";

export const buscarHistorico = async (
  inicio: string,
  fim: string,
  lojas: string[] | null,
  agrupar: Agrupar | null,
): Promise<PontoInadimplencia[]> => {
  // Meses passados vem guardados no banco (inadimplencia_retrato); so o dia
  // de hoje e calculado na hora. Resposta pequena: 1 linha por mes (ou por
  // mes x loja/cobrador), sem titulos.
  const { data, error } = await supabase.rpc("inadimplencia_historico", {
    p_inicio: `${inicio}-01`,
    p_fim: `${fim}-01`,
    ...(lojas ? { p_lojas: lojas } : {}),
    ...(agrupar ? { p_agrupar: agrupar } : {}),
  });
  if (error) throw error;
  return (data ?? []).map(pontoDaRpc);
};

/** Busca com o cache de tela (voltar para a aba nao refaz a consulta). */
export function useHistorico(
  inicio: string,
  fim: string,
  lojas: string[] | null,
  agrupar: Agrupar | null,
  ativo = true,
): { dados: PontoInadimplencia[] | null; erro: boolean } {
  const chave = `inadimplenciaHistorico|${inicio}|${fim}|${agrupar ?? ""}|${lojas ? [...lojas].sort().join(",") : "*"}`;
  const [estado, setEstado] = useState<{
    chave: string;
    dados: PontoInadimplencia[];
  } | null>(() => {
    const c = lerCacheTela<PontoInadimplencia[]>(chave);
    return c ? { chave, dados: c.valor } : null;
  });
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    setErro(false);
    const c = lerCacheTela<PontoInadimplencia[]>(chave);
    if (c) {
      setEstado({ chave, dados: c.valor });
      if (c.fresco) return;
    }
    buscarComCacheTela(chave, () =>
      buscarHistorico(inicio, fim, lojas, agrupar),
    )
      .then((dados) => {
        if (!cancelado) setEstado({ chave, dados });
      })
      .catch((e) => {
        console.error("Erro ao buscar o histórico da inadimplência:", e);
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
    };
    // `chave` ja carrega intervalo/lojas/agrupar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo]);

  return {
    dados: estado && estado.chave === chave ? estado.dados : null,
    erro,
  };
}

/** Soma pontos (varias lojas/cobradores do mesmo dia) num ponto so. */
export const somarPontos = (
  pontos: PontoInadimplencia[],
): PontoInadimplencia | null => {
  if (pontos.length === 0) return null;
  return pontos.reduce((a, p) => ({
    ...a,
    venceu: a.venceu + p.venceu,
    naoPago: a.naoPago + p.naoPago,
    atrasoInicioMes: a.atrasoInicioMes + p.atrasoInicioMes,
    recuperadoMes: a.recuperadoMes + p.recuperadoMes,
  }));
};

/** Fim do mes passado por loja (guardado no banco: consulta pequena, sem
 * calculo). Para o tracinho "mes passado" dos cards do Resumo Geral. */
export function useMesPassadoPorLoja(
  mesAtual: string,
  ativo = true,
): Map<string, PontoInadimplencia> | null {
  const mes = somarMeses(mesAtual, -1);
  const { dados } = useHistorico(mes, mes, null, "loja", ativo);
  return useMemo(() => {
    if (!dados) return null;
    const m = new Map<string, PontoInadimplencia>();
    dados.forEach((p) => {
      if (p.chave) m.set(p.chave, p);
    });
    return m;
  }, [dados]);
}
