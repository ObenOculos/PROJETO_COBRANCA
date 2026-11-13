import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatCurrency, formatDate } from "../../utils/formatters";

// Item 61, etapa B: detalhe de um cliente da Conferencia de recebimentos --
// as parcelas que a base baixou no mes x os lancamentos do app no mes, lado a
// lado. Mesmos criterios da RPC conferencia_recebimentos (migration
// 20261111000004): base sem cancelado e com valor_recebido > 0; app =
// sale_payments sem "Ajuste..." (estornos incluidos) + acordo_pagamentos.
// O documento tem uma grafia so em todas as tabelas (conferido 2026-11-13),
// por isso o filtro e por igualdade.
//
// O que a linha da conferencia nao soma aparece esmaecido, com o motivo:
// na visao "Todos", lancamento de outro cobrador (a linha e por quem
// registrou); na visao "So carteira", baixa de outra carteira.

interface BaseRow {
  id_parcela: number;
  venda_n: number | null;
  numero_titulo: number | null;
  parcela: number | null;
  nome_da_loja: string | null;
  data_vencimento: string | null;
  data_de_recebimento: string;
  valor_recebido: number;
  status: string | null;
  user_id: string | null;
}

interface AppRow {
  chave: string;
  data: string;
  valor: number;
  origem: string; // forma de pagamento ou "Acordo (parcela n)"
  venda: number | null;
  cobradorId: string | null;
  notas: string | null;
  estorno: boolean;
}

interface Props {
  documento: string;
  cobradorId: string | null;
  visao: "todos" | "carteira";
  inicio: string;
  fim: string;
  nomePorId: Map<string, string>;
  onAbrirFicha: (() => void) | null;
}

const ConferenciaDetalhe: React.FC<Props> = ({
  documento,
  cobradorId,
  visao,
  inicio,
  fim,
  nomePorId,
  onAbrirFicha,
}) => {
  const [base, setBase] = useState<BaseRow[] | null>(null);
  const [app, setApp] = useState<AppRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [rb, rs, ra] = await Promise.all([
          supabase
            .from("BANCO_DADOS")
            .select(
              "id_parcela, venda_n, numero_titulo, parcela, nome_da_loja, data_vencimento, data_de_recebimento, valor_recebido, status, user_id",
            )
            .eq("documento", documento)
            .gte("data_de_recebimento", inicio)
            .lte("data_de_recebimento", fim)
            .gt("valor_recebido", 0)
            .order("data_de_recebimento")
            .order("id_parcela"),
          supabase
            .from("sale_payments")
            .select(
              "id, payment_date, payment_amount, payment_method, sale_number, collector_id, notes, estorno_de",
            )
            .eq("client_document", documento)
            .gte("payment_date", inicio)
            .lte("payment_date", fim)
            .order("payment_date")
            .order("id"),
          supabase
            .from("acordo_pagamentos")
            .select(
              "id, data_pagamento, valor_pago, collector_id, notes, estorno_de, acordo_parcelas!inner(numero, acordos!inner(client_document))",
            )
            .eq("acordo_parcelas.acordos.client_document", documento)
            .gte("data_pagamento", inicio)
            .lte("data_pagamento", fim)
            .order("data_pagamento")
            .order("id"),
        ]);
        if (rb.error) throw rb.error;
        if (rs.error) throw rs.error;
        if (ra.error) throw ra.error;
        if (cancelado) return;

        setBase(
          (rb.data as BaseRow[]).filter(
            (b) => (b.status ?? "").trim().toLowerCase() !== "cancelado",
          ),
        );

        const linhasApp: AppRow[] = [
          ...rs.data
            .filter((s) => !/^ajuste/i.test(s.payment_method ?? ""))
            .map((s) => ({
              chave: `s:${s.id}`,
              data: s.payment_date,
              valor: Number(s.payment_amount) || 0,
              origem: s.payment_method || "Pagamento",
              venda: s.sale_number,
              cobradorId: s.collector_id,
              notas: s.notes,
              estorno: !!s.estorno_de,
            })),
          ...ra.data.map((a) => {
            const parcela = a.acordo_parcelas as unknown as {
              numero: number;
            } | null;
            return {
              chave: `a:${a.id}`,
              data: a.data_pagamento,
              valor: Number(a.valor_pago) || 0,
              origem: `Acordo${parcela ? ` (parcela ${parcela.numero})` : ""}`,
              venda: null,
              cobradorId: a.collector_id,
              notas: a.notes,
              estorno: !!a.estorno_de,
            };
          }),
        ].sort((x, y) => x.data.localeCompare(y.data));
        setApp(linhasApp);
      } catch (e) {
        console.error("Erro ao carregar detalhe da conferência:", e);
        if (!cancelado)
          setErro(
            e instanceof Error
              ? e.message
              : typeof e === "object" && e && "message" in e
                ? String((e as { message: unknown }).message)
                : "Falha ao carregar",
          );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [documento, inicio, fim]);

  const nome = (id: string | null) =>
    id ? (nomePorId.get(id) ?? "Usuário removido") : "Sem cobrador";

  // O que entra na soma da linha da conferencia.
  const baseConta = (b: BaseRow) =>
    visao === "todos" || b.user_id === cobradorId;
  const appConta = (a: AppRow) => a.cobradorId === cobradorId;

  if (erro)
    return (
      <div className="text-xs text-red-600 dark:text-red-400">
        Não foi possível carregar o detalhe: {erro}
      </div>
    );
  if (base === null || app === null)
    return (
      <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
        Carregando detalhe…
      </div>
    );

  const totalBase = base
    .filter(baseConta)
    .reduce((s, b) => s + Number(b.valor_recebido), 0);
  const totalApp = app.filter(appConta).reduce((s, a) => s + a.valor, 0);
  const foraBase = base.filter((b) => !baseConta(b)).length;
  const foraApp = app.filter((a) => !appConta(a)).length;

  const cabecalho =
    "text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary";
  const esmaecido = "opacity-50";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Base */}
        <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary overflow-x-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-dark-border/40">
            <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
              Baixado na base
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-dark-text">
              {formatCurrency(totalBase)}
            </span>
          </div>
          {base.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500 dark:text-dark-text-secondary">
              Nenhuma baixa neste mês.
            </div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className={cabecalho}>
                  <th className="px-3 py-1.5 font-semibold">Baixa</th>
                  <th className="px-3 py-1.5 font-semibold">Venda / parcela</th>
                  <th className="px-3 py-1.5 font-semibold">Vencimento</th>
                  <th className="px-3 py-1.5 font-semibold text-right">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {base.map((b) => {
                  const conta = baseConta(b);
                  return (
                    <tr
                      key={b.id_parcela}
                      className={`border-t border-gray-100 dark:border-dark-border/40 ${conta ? "" : esmaecido}`}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-800 dark:text-dark-text">
                        {formatDate(b.data_de_recebimento)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-dark-text">
                        {b.venda_n
                          ? `#${b.venda_n}`
                          : b.numero_titulo
                            ? `título ${b.numero_titulo}`
                            : "—"}
                        {b.parcela != null && ` · ${b.parcela}ª`}
                        <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                          {b.nome_da_loja ?? ""}
                          {!conta &&
                            ` · carteira de ${nome(b.user_id)} (não somado)`}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-500 dark:text-dark-text-secondary">
                        {b.data_vencimento
                          ? formatDate(b.data_vencimento)
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium text-gray-900 dark:text-dark-text">
                        {formatCurrency(Number(b.valor_recebido))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* App */}
        <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary overflow-x-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-dark-border/40">
            <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
              Registrado no app
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-dark-text">
              {formatCurrency(totalApp)}
            </span>
          </div>
          {app.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500 dark:text-dark-text-secondary">
              Nenhum lançamento no app neste mês.
            </div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className={cabecalho}>
                  <th className="px-3 py-1.5 font-semibold">Data</th>
                  <th className="px-3 py-1.5 font-semibold">Lançamento</th>
                  <th className="px-3 py-1.5 font-semibold">Cobrador</th>
                  <th className="px-3 py-1.5 font-semibold text-right">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {app.map((a) => {
                  const conta = appConta(a);
                  return (
                    <tr
                      key={a.chave}
                      className={`border-t border-gray-100 dark:border-dark-border/40 ${conta ? "" : esmaecido}`}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-800 dark:text-dark-text">
                        {formatDate(a.data)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-dark-text">
                        {a.origem}
                        {a.venda ? ` · #${a.venda}` : ""}
                        {a.estorno && (
                          <span className="ml-1 rounded bg-red-50 px-1 text-[10px] font-medium text-red-600 dark:bg-red-900/20 dark:text-red-300">
                            estorno
                          </span>
                        )}
                        {a.notas && (
                          <div
                            className="max-w-[16rem] truncate text-[10px] text-gray-400 dark:text-dark-text-secondary"
                            title={a.notas}
                          >
                            {a.notas}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-600 dark:text-dark-text-secondary">
                        {nome(a.cobradorId)}
                        {!conta && (
                          <div className="text-[10px]">
                            não somado nesta linha
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right whitespace-nowrap font-medium ${a.valor < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-dark-text"}`}
                      >
                        {formatCurrency(a.valor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 dark:text-dark-text-secondary">
          {foraBase + foraApp > 0
            ? "Linhas esmaecidas são deste cliente, mas de outra carteira ou de outro cobrador: não entram nesta linha da conferência."
            : ""}
        </span>
        {onAbrirFicha ? (
          <button
            onClick={onAbrirFicha}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir ficha do cliente
          </button>
        ) : (
          <span className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
            Ficha indisponível (cliente não carregado)
          </span>
        )}
      </div>
    </div>
  );
};

export default ConferenciaDetalhe;
