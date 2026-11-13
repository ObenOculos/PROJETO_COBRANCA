import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Send, X } from "lucide-react";
import { ClientGroup } from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { isAjusteOuEstorno } from "../../filters/sales";
import { round2 } from "../../filters/clientStatus";
import {
  listarPedidosCorrecao,
  PedidoCorrecao,
  pedirCorrecao,
} from "../../services/pedidosCorrecao";

// Item 62: "Corrigir pagamento" -- substitui o "Editar pagamentos" antigo
// (token de autorizacao + redistribuicao do recebido da venda).
// * Gestor (modo "estornar"): escolhe um pagamento do app e estorna o total
//   ou uma parte, com motivo. A RPC estornar_pagamento grava o estorno como
//   registro novo (o original nao muda) e desfaz nas parcelas so o que aquele
//   pagamento aplicou. Se o pagamento tem pedido do cobrador em aberto, o
//   estorno decide o pedido (decidir_pedido_correcao).
// * Cobrador (modo "pedir"): escolhe um pagamento que ELE registrou e pede a
//   correcao ao gestor (tabela pedidos_correcao_pagamento).
// Nada trava a parcela: a sincronizacao do ERP/lojas continua valendo por cima.

interface Props {
  clientGroup: ClientGroup;
  modo: "estornar" | "pedir";
  usuarioId: string;
  nomePorId: Map<string, string>;
  onClose: () => void;
  onSuccess: () => void;
}

/** "1.234,56" / "1234.56" / "1234,5" -> numero (NaN se invalido). */
const lerValor = (texto: string): number => {
  const t = texto.trim();
  if (!t) return NaN;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(normal);
};

const ROTULO_DECISAO: Record<string, string> = {
  estornado: "Estornado",
  recusado: "Recusado",
};

const CorrigirPagamentoModal: React.FC<Props> = ({
  clientGroup,
  modo,
  usuarioId,
  nomePorId,
  onClose,
  onSuccess,
}) => {
  const { salePayments, estornarPagamento, decidirPedidoCorrecao } =
    useCollection();
  const gestor = modo === "estornar";
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [valorTexto, setValorTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCorrecao[]>([]);
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<
    | {
        tipo: "estorno";
        valor: number;
        revertidoParcelas: number;
        parcelas: number;
      }
    | { tipo: "pedido"; valor: number }
    | null
  >(null);

  useEffect(() => {
    let cancelado = false;
    listarPedidosCorrecao({ documento: clientGroup.document })
      .then((p) => {
        if (!cancelado) setPedidos(p);
      })
      .catch((e) => {
        // Sem a tabela (migration nao aplicada) o modal segue sem pedidos.
        console.error("Erro ao carregar pedidos de correção:", e);
      });
    return () => {
      cancelado = true;
    };
  }, [clientGroup.document, versao]);

  const pedidoAbertoPorPagamento = useMemo(() => {
    const m = new Map<string, PedidoCorrecao>();
    pedidos.forEach((p) => {
      if (!p.decisao) m.set(p.sale_payment_id, p);
    });
    return m;
  }, [pedidos]);

  // Pagamentos do app deste cliente (cobrador: so os dele), com o que resta.
  const pagamentos = useMemo(() => {
    const doCliente = (salePayments ?? []).filter(
      (p) => p.clientDocument === clientGroup.document,
    );
    const jaEstornado = new Map<string, number>();
    doCliente.forEach((p) => {
      if (p.estornoDe)
        jaEstornado.set(
          p.estornoDe,
          (jaEstornado.get(p.estornoDe) ?? 0) - p.paymentAmount,
        );
    });
    return doCliente
      .filter((p) => !isAjusteOuEstorno(p))
      .filter((p) => gestor || p.collectorId === usuarioId)
      .map((p) => {
        const estornado = round2(jaEstornado.get(p.id) ?? 0);
        return {
          ...p,
          estornado,
          disponivel: round2(p.paymentAmount - estornado),
        };
      })
      .sort(
        (a, b) =>
          (b.paymentDate ?? "").localeCompare(a.paymentDate ?? "") ||
          (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      );
  }, [salePayments, clientGroup.document, gestor, usuarioId]);

  const atual = pagamentos.find((p) => p.id === escolhido) ?? null;
  const pedidoDoAtual = atual
    ? pedidoAbertoPorPagamento.get(atual.id)
    : undefined;
  const valor = lerValor(valorTexto);
  const valorOk =
    !!atual &&
    Number.isFinite(valor) &&
    valor >= 0.01 &&
    valor <= atual.disponivel + 0.001;
  const podeSalvar = valorOk && motivo.trim().length > 0 && !salvando;

  const escolher = (id: string, valorInicial: number) => {
    setEscolhido(id);
    setValorTexto(valorInicial.toFixed(2).replace(".", ","));
    setErro(null);
  };

  const salvar = async () => {
    if (!atual || !podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      if (!gestor) {
        await pedirCorrecao({
          salePaymentId: atual.id,
          documento: clientGroup.document,
          cliente: clientGroup.client,
          valor: round2(valor),
          motivo,
          usuarioId,
        });
        setResultado({ tipo: "pedido", valor: round2(valor) });
        setVersao((v) => v + 1);
        return;
      }
      const r = pedidoDoAtual
        ? await decidirPedidoCorrecao({
            pedidoId: pedidoDoAtual.id,
            aprovar: true,
            valor: round2(valor),
            resposta: motivo,
          })
        : await estornarPagamento({
            pagamentoId: atual.id,
            valor: round2(valor),
            motivo: motivo.trim(),
          });
      if (r) setResultado({ tipo: "estorno", ...r });
      onSuccess();
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : gestor
            ? "Falha ao registrar o estorno."
            : "Falha ao enviar o pedido.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110]">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-dark-border">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
              {gestor ? "Corrigir pagamento" : "Pedir correção de pagamento"}
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

        {resultado ? (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              {resultado.tipo === "pedido"
                ? `Pedido de correção de ${formatCurrency(resultado.valor)} enviado ao gestor.`
                : `Estorno de ${formatCurrency(resultado.valor)} registrado.`}
            </div>
            {resultado.tipo === "estorno" && (
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                {resultado.parcelas > 0
                  ? `${formatCurrency(resultado.revertidoParcelas)} desfeito em ${resultado.parcelas} parcela(s).`
                  : "Nenhuma parcela foi alterada."}
                {resultado.revertidoParcelas < resultado.valor - 0.009 &&
                  " O restante não estava aplicado em parcela por este pagamento (pagamento antigo, parcela em acordo ou já alterada pelo ERP/loja) — a parcela segue o sistema de origem."}
              </p>
            )}
            {resultado.tipo === "pedido" && (
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                O gestor vê o pedido na aba Correções. A resposta aparece aqui,
                na ficha do cliente.
              </p>
            )}
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
                {gestor ? (
                  <>
                    Escolha o pagamento lançado errado e quanto dele estornar. O
                    lançamento original fica no histórico; o estorno é um
                    registro novo. Valor a mais se registra em{" "}
                    <strong>Receber pagamento</strong>; baixa errada no ERP se
                    corrige no Ciclone ou na loja.
                  </>
                ) : (
                  <>
                    Escolha o pagamento que você registrou errado, quanto dele
                    deve ser estornado e o porquê. O gestor confere e faz o
                    estorno (ou responde).
                  </>
                )}
              </p>

              {pagamentos.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  {gestor
                    ? "Nenhum pagamento registrado no app para este cliente."
                    : "Você não tem pagamento registrado para este cliente."}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                  {pagamentos.map((p) => {
                    const ativo = p.id === escolhido;
                    const aberto = pedidoAbertoPorPagamento.get(p.id);
                    const bloqueado =
                      p.disponivel < 0.01 || (!gestor && !!aberto);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={bloqueado}
                        onClick={() =>
                          escolher(
                            p.id,
                            aberto && gestor
                              ? Math.min(aberto.valor, p.disponivel)
                              : p.disponivel,
                          )
                        }
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                          ativo
                            ? "bg-amber-50 dark:bg-amber-900/20"
                            : "hover:bg-gray-50 dark:hover:bg-dark-bg/40"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text">
                            {formatDate(p.paymentDate)} ·{" "}
                            {p.paymentMethod || "Pagamento"}
                            {p.saleNumber ? ` · venda #${p.saleNumber}` : ""}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-dark-text-secondary truncate">
                            {p.collectorName || "—"}
                            {p.notes ? ` · ${p.notes}` : ""}
                          </div>
                          {aberto && (
                            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              Pedido de correção em análise:{" "}
                              {formatCurrency(aberto.valor)} — {aberto.motivo}
                            </div>
                          )}
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                            {formatCurrency(p.paymentAmount)}
                          </div>
                          {p.estornado > 0.009 && (
                            <div className="text-[11px] text-red-600 dark:text-red-400">
                              {p.disponivel < 0.01
                                ? "estornado"
                                : `${formatCurrency(p.estornado)} já estornado`}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {atual && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
                      Valor a estornar
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={valorTexto}
                      onChange={(e) => setValorTexto(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span
                      className={`text-[11px] ${valorOk || !valorTexto ? "text-gray-500 dark:text-dark-text-secondary" : "text-red-600 dark:text-red-400"}`}
                    >
                      Até {formatCurrency(atual.disponivel)}
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
                      {gestor && pedidoDoAtual
                        ? "Resposta ao cobrador (obrigatória)"
                        : "Motivo (obrigatório)"}
                    </span>
                    <input
                      type="text"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: lançado em duplicidade"
                      className="mt-1 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-gray-900 dark:text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                </div>
              )}

              {erro && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {erro}
                </div>
              )}

              {pedidos.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-700 dark:text-dark-text">
                    Pedidos de correção deste cliente
                  </div>
                  <ul className="space-y-1">
                    {pedidos.map((p) => (
                      <li
                        key={p.id}
                        className="text-[11px] text-gray-600 dark:text-dark-text-secondary"
                      >
                        <span
                          className={`font-semibold ${
                            p.decisao === "estornado"
                              ? "text-teal-600 dark:text-teal-400"
                              : p.decisao === "recusado"
                                ? "text-red-600 dark:text-red-400"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {p.decisao ? ROTULO_DECISAO[p.decisao] : "Em análise"}
                        </span>{" "}
                        · {new Date(p.created_at).toLocaleDateString("pt-BR")} ·{" "}
                        {nomePorId.get(p.solicitado_por_id) ?? "cobrador"} pediu{" "}
                        {formatCurrency(Number(p.valor))}: {p.motivo}
                        {p.resposta && (
                          <span className="text-gray-800 dark:text-dark-text">
                            {" "}
                            — resposta: {p.resposta}
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
              <button
                onClick={() => void salvar()}
                disabled={!podeSalvar}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {gestor ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {salvando
                  ? gestor
                    ? "Registrando…"
                    : "Enviando…"
                  : gestor
                    ? valorOk
                      ? `Estornar ${formatCurrency(round2(valor))}`
                      : "Estornar"
                    : "Enviar pedido ao gestor"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CorrigirPagamentoModal;
