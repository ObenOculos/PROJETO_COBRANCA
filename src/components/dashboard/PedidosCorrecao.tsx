import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Undo2, XCircle } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import {
  listarPedidosCorrecao,
  PedidoCorrecao,
} from "../../services/pedidosCorrecao";

// Item 62 etapa 2: aba "Correções" do gestor (substitui "Autorizações" e o
// token). Pedidos do cobrador para estornar um pagamento que ele registrou:
// o gestor estorna (valor do pedido ou ajustado) ou recusa com resposta. A
// decisao e da RPC decidir_pedido_correcao (so gestor, uma vez por pedido).

interface PagamentoResumo {
  id: string;
  payment_date: string;
  payment_amount: number;
  payment_method: string | null;
  sale_number: number | null;
  collector_name: string | null;
}

/** Decididos que ainda aparecem na aba (dias). */
const DIAS_HISTORICO = 30;

const lerValor = (texto: string): number => {
  const t = texto.trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

const PedidosCorrecao: React.FC = () => {
  const { users, salePayments, decidirPedidoCorrecao } = useCollection();
  const [pedidos, setPedidos] = useState<PedidoCorrecao[] | null>(null);
  const [pagamentos, setPagamentos] = useState<Map<string, PagamentoResumo>>(
    new Map(),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [acao, setAcao] = useState<"estornar" | "recusar">("estornar");
  const [valorTexto, setValorTexto] = useState("");
  const [resposta, setResposta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const nomePorId = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const desde = new Date(
        Date.now() - DIAS_HISTORICO * 86400000,
      ).toISOString();
      const lista = await listarPedidosCorrecao({ desde });
      const ids = Array.from(new Set(lista.map((p) => p.sale_payment_id)));
      const mapa = new Map<string, PagamentoResumo>();
      // Lotes pequenos: a lista de ids vai na URL.
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("sale_payments")
          .select(
            "id, payment_date, payment_amount, payment_method, sale_number, collector_name",
          )
          .in("id", ids.slice(i, i + 200));
        if (error) throw error;
        (data ?? []).forEach((p) => mapa.set(p.id, p as PagamentoResumo));
      }
      setPagamentos(mapa);
      setPedidos(lista);
    } catch (e) {
      console.error("Erro ao carregar pedidos de correção:", e);
      const err = (e ?? {}) as { message?: string; code?: string };
      setErro(
        err.code === "42P01" || err.code === "PGRST205"
          ? "A tabela de pedidos ainda não existe no banco (falta aplicar a migration)."
          : err.message || "Falha ao carregar os pedidos.",
      );
      setPedidos([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Quanto ainda resta para estornar de cada pagamento (estornos ja feitos).
  const disponivel = useCallback(
    (pagamentoId: string, valorOriginal: number) => {
      const estornado = (salePayments ?? [])
        .filter((p) => p.estornoDe === pagamentoId)
        .reduce((s, p) => s - p.paymentAmount, 0);
      return round2(valorOriginal - estornado);
    },
    [salePayments],
  );

  const abrir = (p: PedidoCorrecao, tipo: "estornar" | "recusar") => {
    const pag = pagamentos.get(p.sale_payment_id);
    const resta = pag
      ? disponivel(pag.id, Number(pag.payment_amount))
      : p.valor;
    setAberto(p.id);
    setAcao(tipo);
    setValorTexto(
      Math.min(Number(p.valor), resta).toFixed(2).replace(".", ","),
    );
    setResposta("");
    setErroAcao(null);
  };

  const decidir = async (p: PedidoCorrecao) => {
    const pag = pagamentos.get(p.sale_payment_id);
    const resta = pag ? disponivel(pag.id, Number(pag.payment_amount)) : 0;
    const valor = lerValor(valorTexto);
    if (acao === "estornar" && !(valor >= 0.01 && valor <= resta + 0.001)) {
      setErroAcao(`Informe um valor entre R$ 0,01 e ${formatCurrency(resta)}.`);
      return;
    }
    if (acao === "recusar" && !resposta.trim()) {
      setErroAcao("Escreva o motivo da recusa para o cobrador.");
      return;
    }
    setSalvando(true);
    setErroAcao(null);
    try {
      const r = await decidirPedidoCorrecao({
        pedidoId: p.id,
        aprovar: acao === "estornar",
        valor: acao === "estornar" ? round2(valor) : undefined,
        resposta,
      });
      setAviso(
        acao === "estornar" && r
          ? `Estorno de ${formatCurrency(r.valor)} registrado (${p.cliente ?? p.documento}).${
              r.parcelas > 0
                ? ` ${formatCurrency(r.revertidoParcelas)} desfeito em ${r.parcelas} parcela(s).`
                : ""
            }`
          : `Pedido recusado (${p.cliente ?? p.documento}).`,
      );
      setAberto(null);
      await carregar();
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      setSalvando(false);
    }
  };

  const abertos = (pedidos ?? []).filter((p) => !p.decisao);
  const decididos = (pedidos ?? []).filter((p) => p.decisao);

  const linhaPagamento = (p: PedidoCorrecao) => {
    const pag = pagamentos.get(p.sale_payment_id);
    if (!pag) return "Pagamento não encontrado";
    return `${formatDate(pag.payment_date)} · ${pag.payment_method || "Pagamento"}${
      pag.sale_number ? ` · venda #${pag.sale_number}` : ""
    } · ${formatCurrency(Number(pag.payment_amount))}`;
  };

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <Undo2 className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-amber-600 flex-shrink-0" />
          Pedidos de correção de pagamento
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
          O cobrador pede o estorno de um pagamento que registrou errado. O
          estorno é um registro novo (o pagamento original fica no histórico).
          Para corrigir sem pedido, use “Corrigir pagamento” na ficha do
          cliente.
        </p>
      </div>

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-teal-50 dark:bg-teal-900/20 px-3 py-2 text-sm text-teal-800 dark:text-teal-300">
          <span>{aviso}</span>
          <button
            onClick={() => setAviso(null)}
            className="text-xs font-medium underline"
          >
            ok
          </button>
        </div>
      )}
      {erro && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {erro}
        </div>
      )}

      {pedidos === null ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Carregando…
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
              Em análise ({abertos.length})
            </h3>
            {abertos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-dark-border py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                Nenhum pedido esperando decisão.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                {abertos.map((p) => (
                  <div key={p.id} className="px-3 py-3 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                          {p.cliente ?? "(sem nome)"}{" "}
                          <span className="text-xs font-normal text-gray-400">
                            {p.documento}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                          {nomePorId.get(p.solicitado_por_id) ?? "Cobrador"} ·{" "}
                          {new Date(p.created_at).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
                          Pagamento: {linhaPagamento(p)}
                        </div>
                        <div className="mt-1 text-sm text-gray-800 dark:text-dark-text">
                          Pede estorno de{" "}
                          <strong>{formatCurrency(Number(p.valor))}</strong>:{" "}
                          {p.motivo}
                        </div>
                      </div>
                      {aberto !== p.id && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => abrir(p, "estornar")}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Estornar
                          </button>
                          <button
                            onClick={() => abrir(p, "recusar")}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>

                    {aberto === p.id && (
                      <div className="rounded-lg bg-gray-50 dark:bg-dark-bg/40 p-3 space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          {acao === "estornar" && (
                            <label className="sm:w-40">
                              <span className="text-[11px] font-semibold text-gray-600 dark:text-dark-text-secondary">
                                Valor a estornar
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={valorTexto}
                                onChange={(e) => setValorTexto(e.target.value)}
                                className="mt-0.5 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />
                            </label>
                          )}
                          <label className="flex-1">
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-dark-text-secondary">
                              {acao === "estornar"
                                ? "Resposta ao cobrador (opcional)"
                                : "Motivo da recusa (obrigatório)"}
                            </span>
                            <input
                              type="text"
                              value={resposta}
                              onChange={(e) => setResposta(e.target.value)}
                              className="mt-0.5 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </label>
                        </div>
                        {erroAcao && (
                          <div className="text-xs text-red-600 dark:text-red-400">
                            {erroAcao}
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setAberto(null)}
                            className="rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-dark-text"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => void decidir(p)}
                            disabled={salvando}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
                              acao === "estornar"
                                ? "bg-amber-600 hover:bg-amber-700"
                                : "bg-red-600 hover:bg-red-700"
                            }`}
                          >
                            {salvando
                              ? "Gravando…"
                              : acao === "estornar"
                                ? "Confirmar estorno"
                                : "Confirmar recusa"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {decididos.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                Decididos nos últimos {DIAS_HISTORICO} dias
              </h3>
              <ul className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                {decididos.map((p) => (
                  <li
                    key={p.id}
                    className="px-3 py-2 text-xs text-gray-600 dark:text-dark-text-secondary"
                  >
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        p.decisao === "estornado"
                          ? "text-teal-600 dark:text-teal-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {p.decisao === "estornado" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {p.decisao === "estornado" ? "Estornado" : "Recusado"}
                    </span>{" "}
                    · {p.cliente ?? p.documento} ·{" "}
                    {nomePorId.get(p.solicitado_por_id) ?? "cobrador"} pediu{" "}
                    {formatCurrency(Number(p.valor))} ({p.motivo}) · decidido
                    por{" "}
                    {p.decidido_por_id
                      ? (nomePorId.get(p.decidido_por_id) ?? "gestor")
                      : "gestor"}{" "}
                    em{" "}
                    {p.decidido_em
                      ? new Date(p.decidido_em).toLocaleDateString("pt-BR")
                      : ""}
                    {p.resposta && ` — ${p.resposta}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default PedidosCorrecao;
