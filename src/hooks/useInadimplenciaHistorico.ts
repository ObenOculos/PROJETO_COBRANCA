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

/** Consulta com o cache de tela (voltar para a aba nao refaz a consulta).
 * `chave` identifica a consulta inteira (parametros inclusos). */
function useConsultaCache<T>(
  chave: string,
  buscar: () => Promise<T>,
  ativo: boolean,
  rotuloErro: string,
): { dados: T | null; erro: boolean } {
  const [estado, setEstado] = useState<{ chave: string; dados: T } | null>(
    () => {
      const c = lerCacheTela<T>(chave);
      return c ? { chave, dados: c.valor } : null;
    },
  );
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    setErro(false);
    const c = lerCacheTela<T>(chave);
    if (c) {
      setEstado({ chave, dados: c.valor });
      if (c.fresco) return;
    }
    buscarComCacheTela(chave, buscar)
      .then((dados) => {
        if (!cancelado) setEstado({ chave, dados });
      })
      .catch((e) => {
        console.error(rotuloErro, e);
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
    };
    // `chave` ja carrega todos os parametros de `buscar`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo]);

  return {
    dados: estado && estado.chave === chave ? estado.dados : null,
    erro,
  };
}

const chaveLojas = (lojas: string[] | null) =>
  lojas ? [...lojas].sort().join(",") : "*";

/** Historico mes a mes (RPC inadimplencia_historico). */
export function useHistorico(
  inicio: string,
  fim: string,
  lojas: string[] | null,
  agrupar: Agrupar | null,
  ativo = true,
): { dados: PontoInadimplencia[] | null; erro: boolean } {
  return useConsultaCache(
    `inadimplenciaHistorico|${inicio}|${fim}|${agrupar ?? ""}|${chaveLojas(lojas)}`,
    () => buscarHistorico(inicio, fim, lojas, agrupar),
    ativo,
    "Erro ao buscar o histórico da inadimplência:",
  );
}

/** Inadimplencia e recuperacao de um periodo qualquer (RPC
 * inadimplencia_periodo, 26/11): a mesma conta dos cards do Resumo Geral
 * (filters/inadimplencia), feita no banco porque a aba Inadimplencia nao
 * carrega a base inteira. */
export interface InadimplenciaPeriodo {
  venceu: number;
  naoPago: number;
  atrasoRecente: number;
  /** null = periodo ainda nao comecou (sem recuperacao). */
  baseRecuperacao: number | null;
  recuperado: number | null;
  /** Fim do periodo limitado a hoje. */
  ateEfetivo: string;
  /** Safra de 30 dias (etapa 2): vencidas no periodo ha 30+ dias e o que
   * estava sem pagar 30 dias depois; e as ainda no prazo. */
  safraVenceu: number;
  safraSemPagar: number;
  noPrazoVenceu: number;
  noPrazoAberto: number;
}

const num = (v: number | string | null | undefined): number =>
  Number(v ?? 0) || 0;

export function useInadimplenciaPeriodo(
  de: string,
  ate: string,
  lojas: string[] | null,
  ativo = true,
): { dados: InadimplenciaPeriodo | null; erro: boolean } {
  return useConsultaCache(
    `inadimplenciaPeriodo|${de}|${ate}|${chaveLojas(lojas)}`,
    async () => {
      const { data, error } = await supabase.rpc("inadimplencia_periodo", {
        p_de: de,
        p_ate: ate,
        ...(lojas ? { p_lojas: lojas } : {}),
      });
      if (error) throw error;
      const l = data?.[0];
      return {
        venceu: num(l?.venceu),
        naoPago: num(l?.nao_pago),
        atrasoRecente: num(l?.atraso_recente),
        baseRecuperacao:
          l?.base_recuperacao == null ? null : num(l.base_recuperacao),
        recuperado: l?.recuperado == null ? null : num(l.recuperado),
        ateEfetivo: String(l?.ate_efetivo ?? ate),
        safraVenceu: num(l?.safra_venceu),
        safraSemPagar: num(l?.safra_sem_pagar),
        noPrazoVenceu: num(l?.no_prazo_venceu),
        noPrazoAberto: num(l?.no_prazo_aberto),
      };
    },
    ativo && !!de && !!ate && de <= ate,
    "Erro ao buscar a inadimplência do período:",
  );
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

/** Um mes por loja (ultimo dia do mes; o mes atual vale ate hoje e e
 * calculado na hora). Uma consulta serve todas as lojas: o filtro de loja
 * soma no navegador. */
export function usePontoPorLoja(
  mes: string,
  ativo = true,
): Map<string, PontoInadimplencia> | null {
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
