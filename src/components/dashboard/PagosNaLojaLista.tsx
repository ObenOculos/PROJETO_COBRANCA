import React, { useMemo } from "react";
import { Clock, Send, Store } from "lucide-react";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import { ATTEMPT_RESULT_LABELS } from "../../config/collectionAttempts";
import { addDaysLocalStr, todayLocalStr } from "../../config/visitStatus";
import { CollectionAttempt } from "../../types";
import { PagoNaLojaPedivel } from "../../services/atribuicoesPagamento";

// Filtro "Pagou na loja" da Carteira completa do cobrador (2026-11-23): o que
// o cliente pagou na loja/banco depois de uma conversa dele e que ainda da
// para pedir ao gestor. Um cartao por cliente, prazo mais curto primeiro.
// Vem de pagos_na_loja_pediveis (migration 20261123000001) -- inclui cliente
// que ja saiu da carteira.

/** Prazo a 3 dias ou menos: destaca. */
const DIAS_PRAZO_CURTO = 3;

interface ClienteLoja {
  documento: string;
  cliente: string;
  loja: string | null;
  total: number;
  qtd: number;
  ultimoPagamento: string;
  prazo: string;
  ultimaConversa: string | null;
  ultimoResultado: string | null;
  naCarteira: boolean;
  /** Todas as parcelas já pedidas (em análise): sem botão. */
  tudoEmAnalise: boolean;
  algumaEmAnalise: boolean;
}

interface Props {
  itens: PagoNaLojaPedivel[];
  onPedir: (documento: string, cliente: string) => void;
}

const PagosNaLojaLista: React.FC<Props> = ({ itens, onPedir }) => {
  const clientes = useMemo(() => {
    const mapa = new Map<string, ClienteLoja>();
    itens.forEach((p) => {
      const atual = mapa.get(p.documento);
      const valor = Number(p.valor);
      if (!atual) {
        mapa.set(p.documento, {
          documento: p.documento,
          cliente: p.cliente ?? "(sem nome)",
          loja: p.loja,
          total: valor,
          qtd: 1,
          ultimoPagamento: p.data_pagamento,
          prazo: p.prazo,
          ultimaConversa: p.ultimo_contato_em,
          ultimoResultado: p.ultimo_resultado,
          naCarteira: p.na_carteira,
          tudoEmAnalise: p.em_analise,
          algumaEmAnalise: p.em_analise,
        });
        return;
      }
      atual.total += valor;
      atual.qtd += 1;
      if (p.data_pagamento > atual.ultimoPagamento)
        atual.ultimoPagamento = p.data_pagamento;
      if (p.prazo < atual.prazo) atual.prazo = p.prazo;
      if ((p.ultimo_contato_em ?? "") > (atual.ultimaConversa ?? "")) {
        atual.ultimaConversa = p.ultimo_contato_em;
        atual.ultimoResultado = p.ultimo_resultado;
      }
      atual.tudoEmAnalise = atual.tudoEmAnalise && p.em_analise;
      atual.algumaEmAnalise = atual.algumaEmAnalise || p.em_analise;
    });
    return [...mapa.values()].sort(
      (a, b) =>
        Number(a.tudoEmAnalise) - Number(b.tudoEmAnalise) ||
        a.prazo.localeCompare(b.prazo) ||
        a.ultimoPagamento.localeCompare(b.ultimoPagamento) ||
        a.documento.localeCompare(b.documento),
    );
  }, [itens]);

  const limiteCurto = addDaysLocalStr(todayLocalStr(), DIAS_PRAZO_CURTO);

  if (clientes.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-sm text-gray-500">
        Nenhum cliente encontrado.
      </p>
    );
  }

  return (
    <div>
      <p className="px-4 py-2 text-[11px] text-gray-500 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg/40 border-b border-gray-100 dark:border-dark-border">
        Clientes que pagaram na loja ou no banco depois de uma conversa sua.
        Peça ao gestor para o pagamento contar no seu nome — vale até o dia 5
        do mês seguinte ao pagamento.
      </p>
      <ul className="divide-y divide-gray-100 dark:divide-dark-border">
        {clientes.map((c) => {
          const curto = !c.tudoEmAnalise && c.prazo <= limiteCurto;
          const resultado = c.ultimoResultado
            ? (ATTEMPT_RESULT_LABELS[
                c.ultimoResultado as CollectionAttempt["result"]
              ] ?? c.ultimoResultado)
            : null;
          return (
            <li
              key={c.documento}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">
                    {c.cliente}
                  </span>
                  {!c.naCarteira && (
                    <span className="rounded-full bg-gray-100 dark:bg-dark-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:text-dark-text-secondary">
                      Saiu da sua carteira
                    </span>
                  )}
                  {c.algumaEmAnalise && (
                    <span className="rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      {c.tudoEmAnalise ? "Em análise" : "Parte em análise"}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400">
                  {c.documento}
                  {c.loja ? ` · ${c.loja}` : ""}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-800 dark:text-dark-text">
                  <Store className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                  Pagou <strong>{formatCurrency(round2(c.total))}</strong> em{" "}
                  {formatDate(c.ultimoPagamento)}
                  {c.qtd > 1 && (
                    <span className="text-gray-500"> ({c.qtd} parcelas)</span>
                  )}
                </div>
                {c.ultimaConversa && (
                  <div className="text-[11px] text-gray-600 dark:text-dark-text-secondary">
                    Sua conversa:{" "}
                    {new Date(c.ultimaConversa).toLocaleDateString("pt-BR")}
                    {resultado ? ` · ${resultado}` : ""}
                  </div>
                )}
              </div>
              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] ${
                    curto
                      ? "font-semibold text-amber-700 dark:text-amber-400"
                      : "text-gray-500 dark:text-dark-text-secondary"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Pedir até {formatDate(c.prazo)}
                </span>
                {!c.tudoEmAnalise && (
                  <button
                    type="button"
                    onClick={() => onPedir(c.documento, c.cliente)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Pedir ao gestor
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PagosNaLojaLista;
