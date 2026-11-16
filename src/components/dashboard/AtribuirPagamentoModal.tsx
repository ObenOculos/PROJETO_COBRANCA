import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Send, X } from "lucide-react";
import { ClientGroup } from "../../types";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import {
  AtribuicaoPagamento,
  listarAtribuicoesDoCliente,
  listarParcelasAtribuiveis,
  ParcelaAtribuivel,
  pedirAtribuicaoPagamento,
} from "../../services/atribuicoesPagamento";

// Item 66: o cobrador pede ao gestor que a baixa do ERP (cliente pagou na
// loja/banco depois da tratativa) conte no desempenho dele. Nao e pagamento:
// o titulo nao muda e o valor nao entra no caixa dele. A RPC
// parcelas_para_atribuicao ja diz o que pode ser pedido (contato do cobrador
// nos 30 dias antes do pagamento, sem lancamento do app, fora de acordo).

interface Props {
  clientGroup: ClientGroup;
  onClose: () => void;
}

const ROTULO_DECISAO: Record<string, string> = {
  aprovado: "Aprovado",
  recusado: "Recusado",
};

const AtribuirPagamentoModal: React.FC<Props> = ({ clientGroup, onClose }) => {
  const [parcelas, setParcelas] = useState<ParcelaAtribuivel[] | null>(null);
  const [pedidos, setPedidos] = useState<AtribuicaoPagamento[]>([]);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [observacao, setObservacao] = useState("");
  const [verOutras, setVerOutras] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ valor: number; qtd: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      listarParcelasAtribuiveis(clientGroup.document),
      listarAtribuicoesDoCliente(clientGroup.document),
    ])
      .then(([p, a]) => {
        if (cancelado) return;
        setParcelas(p);
        setPedidos(a);
      })
      .catch((e) => {
        if (cancelado) return;
        setParcelas([]);
        setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [clientGroup.document]);

  // Podem ser pedidas, agrupadas pelo dia do pagamento (o que o cliente pagou
  // junto). As demais ficam recolhidas, com o motivo.
  const { grupos, outras } = useMemo(() => {
    const livres = (parcelas ?? []).filter((p) => !p.bloqueio);
    const porDia = new Map<string, ParcelaAtribuivel[]>();
    livres.forEach((p) => {
      const lista = porDia.get(p.data_pagamento) ?? [];
      lista.push(p);
      porDia.set(p.data_pagamento, lista);
    });
    return {
      grupos: [...porDia.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      outras: (parcelas ?? []).filter((p) => !!p.bloqueio),
    };
  }, [parcelas]);

  const selecionadas = (parcelas ?? []).filter((p) =>
    marcadas.has(p.id_parcela),
  );
  const total = round2(selecionadas.reduce((s, p) => s + Number(p.valor), 0));
  const podeEnviar =
    selecionadas.length > 0 && observacao.trim().length > 0 && !salvando;

  const alternar = (ids: number[], marcar: boolean) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)));
      return novo;
    });

  const enviar = async () => {
    if (!podeEnviar) return;
    setSalvando(true);
    setErro(null);
    try {
      await pedirAtribuicaoPagamento({
        documento: clientGroup.document,
        parcelas: selecionadas.map((p) => p.id_parcela),
        observacao,
      });
      setEnviado({ valor: total, qtd: selecionadas.length });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar o pedido.");
    } finally {
      setSalvando(false);
    }
  };

  // Ultimos pedidos deste cliente (um por lote).
  const lotes = useMemo(() => {
    const m = new Map<string, AtribuicaoPagamento & { soma: number; qtd: number }>();
    pedidos.forEach((p) => {
      const atual = m.get(p.lote);
      if (atual) {
        atual.soma += Number(p.valor_aprovado ?? p.valor);
        atual.qtd += 1;
      } else {
        m.set(p.lote, { ...p, soma: Number(p.valor_aprovado ?? p.valor), qtd: 1 });
      }
    });
    return [...m.values()];
  }, [pedidos]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110]">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-dark-border">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
              Cliente pagou na loja depois da minha cobrança
            </h2>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {clientGroup.client} · {clientGroup.document}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-bg"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {enviado ? (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              Pedido de {formatCurrency(enviado.valor)} ({enviado.qtd}{" "}
              {enviado.qtd === 1 ? "parcela" : "parcelas"}) enviado ao gestor.
            </div>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
              Quando o gestor aprovar, o valor conta no seu desempenho, na data
              do pagamento. Ele não entra no seu caixa, porque o dinheiro foi
              recebido pela loja.
            </p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg bg-gray-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-gray-900"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                Marque o que o cliente pagou na loja ou no banco depois que você
                cobrou. O gestor confere e, se aprovar, o valor conta no seu
                desempenho. Não muda a parcela e não entra no seu caixa.
              </p>

              {parcelas === null ? (
                <div className="py-6 text-center text-sm text-gray-500">
                  Carregando…
                </div>
              ) : grupos.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Nenhum pagamento da loja pode ser pedido para este cliente.
                  <br />
                  Vale para pagamento dos últimos 30 dias, com uma conversa sua
                  registrada no Atender (promessa, contato realizado, acordo…)
                  até 30 dias antes dele.
                </div>
              ) : (
                <div className="space-y-3">
                  {grupos.map(([dia, lista]) => {
                    const ids = lista.map((p) => p.id_parcela);
                    const todas = ids.every((id) => marcadas.has(id));
                    const soma = round2(
                      lista.reduce((s, p) => s + Number(p.valor), 0),
                    );
                    return (
                      <div
                        key={dia}
                        className="rounded-xl border border-gray-200 dark:border-dark-border"
                      >
                        <label className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 dark:bg-dark-bg/40 rounded-t-xl cursor-pointer">
                          <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-dark-text">
                            <input
                              type="checkbox"
                              checked={todas}
                              onChange={(e) => alternar(ids, e.target.checked)}
                            />
                            Pago em {formatDate(dia)}
                            {lista[0].loja ? ` · ${lista[0].loja}` : ""}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                            {formatCurrency(soma)}
                          </span>
                        </label>
                        <div className="divide-y divide-gray-100 dark:divide-dark-border/40">
                          {lista.map((p) => (
                            <label
                              key={p.id_parcela}
                              className="flex items-center justify-between gap-3 px-3 py-2 pl-8 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg/40"
                            >
                              <span className="flex items-center gap-2 text-gray-700 dark:text-dark-text">
                                <input
                                  type="checkbox"
                                  checked={marcadas.has(p.id_parcela)}
                                  onChange={(e) =>
                                    alternar([p.id_parcela], e.target.checked)
                                  }
                                />
                                Venda #{p.venda ?? "—"} · parcela {p.parcela ?? "—"}
                                {p.data_vencimento
                                  ? ` · venc. ${formatDate(p.data_vencimento)}`
                                  : ""}
                              </span>
                              <span className="text-gray-900 dark:text-dark-text">
                                {formatCurrency(Number(p.valor))}
                              </span>
                            </label>
                          ))}
                        </div>
                        {lista[0].ultimo_contato_em && (
                          <div className="px-3 py-1.5 text-[11px] text-gray-500 dark:text-dark-text-secondary border-t border-gray-100 dark:border-dark-border/40">
                            Seu último contato antes do pagamento:{" "}
                            {new Date(
                              lista[0].ultimo_contato_em,
                            ).toLocaleDateString("pt-BR")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {grupos.length > 0 && (
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
                    Como foi a cobrança (obrigatório)
                  </span>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={2}
                    placeholder="Ex.: cobrei pelo WhatsApp dia 05/11, ele prometeu pagar na loja"
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-gray-900 dark:text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
              )}

              {erro && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {erro}
                </div>
              )}

              {outras.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setVerOutras((v) => !v)}
                    className="flex items-center gap-1 text-xs text-gray-500 dark:text-dark-text-secondary hover:text-gray-700"
                  >
                    {verOutras ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Outras {outras.length} parcelas pagas que não podem ser
                    pedidas
                  </button>
                  {verOutras && (
                    <ul className="mt-1 space-y-0.5">
                      {outras.map((p) => (
                        <li
                          key={p.id_parcela}
                          className="text-[11px] text-gray-500 dark:text-dark-text-secondary"
                        >
                          {formatDate(p.data_pagamento)} · venda #{p.venda ?? "—"}{" "}
                          parcela {p.parcela ?? "—"} ·{" "}
                          {formatCurrency(Number(p.valor))} — {p.bloqueio}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {lotes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-700 dark:text-dark-text">
                    Seus pedidos deste cliente
                  </div>
                  <ul className="space-y-1">
                    {lotes.map((l) => (
                      <li
                        key={l.lote}
                        className="text-[11px] text-gray-600 dark:text-dark-text-secondary"
                      >
                        <span
                          className={`font-semibold ${
                            l.decisao === "aprovado"
                              ? "text-teal-600 dark:text-teal-400"
                              : l.decisao === "recusado"
                                ? "text-red-600 dark:text-red-400"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {l.decisao ? ROTULO_DECISAO[l.decisao] : "Em análise"}
                        </span>{" "}
                        · pago em {formatDate(l.data_pagamento)} ·{" "}
                        {formatCurrency(round2(l.soma))} ({l.qtd}{" "}
                        {l.qtd === 1 ? "parcela" : "parcelas"})
                        {l.resposta && (
                          <span className="text-gray-800 dark:text-dark-text">
                            {" "}
                            — resposta: {l.resposta}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-dark-border">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-200 dark:border-dark-border px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg"
              >
                Cancelar
              </button>
              {grupos.length > 0 && (
                <button
                  onClick={() => void enviar()}
                  disabled={!podeEnviar}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  {salvando
                    ? "Enviando…"
                    : selecionadas.length > 0
                      ? `Pedir ${formatCurrency(total)} ao gestor`
                      : "Pedir ao gestor"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AtribuirPagamentoModal;
