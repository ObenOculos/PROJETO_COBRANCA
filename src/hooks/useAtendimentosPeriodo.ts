import { MutableRefObject, useEffect, useRef, useState } from "react";
import { buscarComCacheTela, lerCacheTela } from "../utils/cacheTela";
import { supabase } from "../lib/supabase";
import { CollectionAttempt } from "../types";
import { isEffectiveAttemptResult } from "../config/collectionAttempts";
import { fetchAllRows } from "../utils/fetchAllRows";
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

const ID_CHUNK = 300;
const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Atendimentos registrados (collection_attempts: Atender, Fila, pagamento,
 * venda cancelada; e visitas presenciais concluidas do cobrador externo) no
 * periodo, por cobrador. Fonte unica do "Clientes
 * atendidos" -- Resumo por Cobrador (gestor) e Meu desempenho (cobrador).
 *
 * Contados por CLIENTE, nunca por titulo (um registro grava uma linha por
 * titulo) nem por dia: cliente atendido 3 vezes = 1.
 *
 * `docByParcelaRef`: titulo -> documento ja conhecido no contexto (evita
 * reconsultar BANCO_DADOS); os que faltarem sao buscados aqui e guardados
 * nele. `collectorId` restringe a um cobrador so.
 */
export function useAtendimentosPeriodo(
  dateFrom: string,
  dateTo: string,
  docByParcelaRef: MutableRefObject<Map<string, string>>,
  collectorId?: string,
  /** Muda para forcar releitura (ex.: depois de um registro novo). */
  versao?: number,
): {
  atendimentos: Map<string, AtendimentosCobrador> | null;
  erro: boolean;
} {
  const [atendimentos, setAtendimentos] = useState<Map<
    string,
    AtendimentosCobrador
  > | null>(null);
  const [erro, setErro] = useState(false);
  // Periodo/cobrador da busca anterior: trocar limpa o numero (mostra
  // "carregando"); releitura por `versao` mantem o anterior ate o novo chegar.
  const baseAnterior = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErro(false);
    const base = `${dateFrom}|${dateTo}|${collectorId ?? ""}`;
    const chave = `atendimentos|${base}|${versao ?? 0}`;
    const cache = lerCacheTela<Map<string, AtendimentosCobrador>>(chave);
    const trocouBase = baseAnterior.current !== base;
    baseAnterior.current = base;
    if (cache) {
      // Volta para a tela: mostra na hora; so consulta se ja passou do prazo.
      setAtendimentos(cache.valor);
      if (cache.fresco) return;
    } else if (trocouBase) {
      setAtendimentos(null);
    }
    const buscar = async (): Promise<Map<string, AtendimentosCobrador>> => {
      {
        const linhas = await fetchAllRows((from, to) => {
          let q = supabase
            .from("collection_attempts")
            .select("id, collector_id, collection_id, date, result")
            // `date` e text YYYY-MM-DD (data do atendimento).
            .gte("date", dateFrom)
            .lte("date", dateTo);
          if (collectorId) q = q.eq("collector_id", collectorId);
          return q.order("id").range(from, to);
        });

        // collection_attempts guarda o titulo, nao o cliente: resolve o
        // documento dos titulos que o contexto nao tem (gestor so carrega os
        // em aberto, e um atendimento pode ser de titulo ja quitado).
        const docByParcela = docByParcelaRef.current;
        const faltando = Array.from(
          new Set(
            linhas
              .map((l) => l.collection_id)
              .filter((id) => !docByParcela.has(id)),
          ),
        );
        for (const ids of chunk(faltando, ID_CHUNK)) {
          const { data, error } = await comRetentativa(() =>
            supabase
              .from("BANCO_DADOS")
              .select("id_parcela, documento")
              .in("id_parcela", ids.map(Number)),
          );
          if (error) throw error;
          (data ?? []).forEach((r) => {
            if (r.documento)
              docByParcela.set(String(r.id_parcela), r.documento);
          });
        }

        // Visitas presenciais concluidas no periodo. O cobrador externo nao usa
        // o Atender: o trabalho dele fica so em scheduled_visits (visita
        // feita, nao encontrado, remarcada na rua) -- sem isto ele aparecia
        // com 0 acionamentos (achado 2026-11-18). Visita de ligacao/WhatsApp
        // fica de fora: essa ja vira collection_attempt pelo Atender.
        // Data = visitEffectiveDate (config/visitStatus): realizada no dia
        // da visita, as demais na data agendada.
        const visitas = await fetchAllRows((from, to) => {
          let q = supabase
            .from("scheduled_visits")
            .select("id, collector_id, client_document, status")
            .in("status", ["realizada", "nao_encontrado", "reagendada"])
            .or("channel.is.null,channel.eq.presencial")
            .or(
              `and(data_visita_realizada.gte.${dateFrom},data_visita_realizada.lte.${dateTo}),` +
                `and(data_visita_realizada.is.null,scheduled_date.gte.${dateFrom},scheduled_date.lte.${dateTo})`,
            );
          if (collectorId) q = q.eq("collector_id", collectorId);
          return q.order("id").range(from, to);
        });

        // cobrador -> cliente -> {conversou, prometeu} em algum atendimento
        // do periodo. Uma unidade so (cliente) para nao ter de comparar
        // "atendimentos" com "clientes".
        const porCobrador = new Map<
          string,
          Map<string, { conversou: boolean; prometeu: boolean }>
        >();
        // Total de linhas por cobrador, sem deduplicar por cliente -- ver
        // `tentativas` em AtendimentosCobrador.
        const tentativasPorCobrador = new Map<string, number>();
        visitas.forEach((v) => {
          if (!v.collector_id) return;
          tentativasPorCobrador.set(
            v.collector_id,
            (tentativasPorCobrador.get(v.collector_id) ?? 0) + 1,
          );
          const cliente = v.client_document || `v:${v.id}`;
          let clientes = porCobrador.get(v.collector_id);
          if (!clientes) {
            clientes = new Map();
            porCobrador.set(v.collector_id, clientes);
          }
          const atual = clientes.get(cliente);
          clientes.set(cliente, {
            // Visita feita = encontrou o cliente.
            conversou: (atual?.conversou ?? false) || v.status === "realizada",
            prometeu: atual?.prometeu ?? false,
          });
        });
        linhas.forEach((l) => {
          if (!l.collector_id) return;
          tentativasPorCobrador.set(
            l.collector_id,
            (tentativasPorCobrador.get(l.collector_id) ?? 0) + 1,
          );
          // Sem documento (titulo apagado): o proprio titulo vira a chave,
          // para nao sumir com o atendimento.
          const cliente =
            docByParcela.get(l.collection_id) ?? `t:${l.collection_id}`;
          const result = l.result as CollectionAttempt["result"];
          let clientes = porCobrador.get(l.collector_id);
          if (!clientes) {
            clientes = new Map();
            porCobrador.set(l.collector_id, clientes);
          }
          const atual = clientes.get(cliente);
          clientes.set(cliente, {
            conversou:
              (atual?.conversou ?? false) || isEffectiveAttemptResult(result),
            prometeu: (atual?.prometeu ?? false) || result === "promise",
          });
        });

        const resultado = new Map<string, AtendimentosCobrador>();
        porCobrador.forEach((clientes, id) => {
          let conversaram = 0;
          let promessas = 0;
          clientes.forEach((c) => {
            if (c.conversou) conversaram++;
            if (c.prometeu) promessas++;
          });
          resultado.set(id, {
            clientes: clientes.size,
            conversaram,
            promessas,
            tentativas: tentativasPorCobrador.get(id) ?? 0,
          });
        });
        return resultado;
      }
    };
    buscarComCacheTela(chave, buscar)
      .then((resultado) => {
        if (!cancelled) setAtendimentos(resultado);
      })
      .catch((err) => {
        console.error("Erro ao buscar atendimentos do período:", err);
        if (!cancelled) setErro(true);
      });
    return () => {
      cancelled = true;
    };
    // docByParcelaRef e ref (estavel); lido no momento da busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, collectorId, versao]);

  return { atendimentos, erro };
}
