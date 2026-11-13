import { MutableRefObject, useEffect, useState } from "react";
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
}

const ID_CHUNK = 300;
const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Atendimentos registrados (collection_attempts: Atender, Fila, pagamento,
 * venda cancelada) no periodo, por cobrador. Fonte unica do "Clientes
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

  useEffect(() => {
    let cancelled = false;
    setErro(false);
    (async () => {
      try {
        const linhas = await fetchAllRows(
          (from, to) => {
            let q = supabase
              .from("collection_attempts")
              .select("id, collector_id, collection_id, date, result")
              // `date` e text YYYY-MM-DD (data do atendimento).
              .gte("date", dateFrom)
              .lte("date", dateTo);
            if (collectorId) q = q.eq("collector_id", collectorId);
            return q.order("id").range(from, to);
          },
          () => cancelled,
        );
        if (cancelled) return;

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
          if (cancelled) return;
          (data ?? []).forEach((r) => {
            if (r.documento) docByParcela.set(String(r.id_parcela), r.documento);
          });
        }

        // cobrador -> cliente -> {conversou, prometeu} em algum atendimento
        // do periodo. Uma unidade so (cliente) para nao ter de comparar
        // "atendimentos" com "clientes".
        const porCobrador = new Map<
          string,
          Map<string, { conversou: boolean; prometeu: boolean }>
        >();
        linhas.forEach((l) => {
          if (!l.collector_id) return;
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
            conversou: (atual?.conversou ?? false) || isEffectiveAttemptResult(result),
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
          resultado.set(id, { clientes: clientes.size, conversaram, promessas });
        });
        if (!cancelled) setAtendimentos(resultado);
      } catch (err) {
        console.error("Erro ao buscar atendimentos do período:", err);
        if (!cancelled) setErro(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // docByParcelaRef e ref (estavel); lido no momento da busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, collectorId, versao]);

  // Troca de periodo/cobrador: limpa na hora (mostra "carregando"), mas uma
  // releitura por `versao` mantem o numero anterior ate o novo chegar.
  useEffect(() => {
    setAtendimentos(null);
  }, [dateFrom, dateTo, collectorId]);

  return { atendimentos, erro };
}
