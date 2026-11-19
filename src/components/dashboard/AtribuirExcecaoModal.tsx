import React, { useEffect, useMemo, useState } from "react";
import { CobradorOptions } from "../common/CobradorOptions";
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import { invalidarHistoricoCliente } from "../../utils/cacheHistoricoCliente";
import {
  atribuirPagamentoExcecao,
  listarParcelasExcecao,
  ParcelaAtribuivel,
} from "../../services/atribuicoesPagamento";

// Pago na loja -- exceção do gestor (2026-11-17, decisão do usuário). O padrão
// continua: o cobrador pede (com conversa efetiva nos 30 dias antes do
// pagamento) e o gestor aprova em Correções. Aqui o gestor atribui direto,
// quando sabe que a conversa aconteceu mas não ficou registrada como efetiva
// (WhatsApp, ligação, "não atendeu" e o cliente retornou). Motivo
// obrigatório; fica marcado como exceção no histórico (migration
// 20261117000004). Abre pela Ficha (Mais ações) e pela Conferência.

interface Props {
  documento: string;
  cliente: string;
  /** Cobrador sugerido (dono da carteira das parcelas pagas). */
  cobradorPadrao?: string | null;
  onClose: () => void;
  /** Depois de gravar (para a tela recarregar). */
  onAtribuido?: () => void;
}

const AtribuirExcecaoModal: React.FC<Props> = ({
  documento,
  cliente,
  cobradorPadrao,
  onClose,
  onAtribuido,
}) => {
  const { users } = useCollection();
  const cobradores = useMemo(
    () =>
      users
        .filter((u) => u.type !== "manager" && u.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [users],
  );
  const [cobradorId, setCobradorId] = useState<string>(
    cobradorPadrao && cobradores.some((c) => c.id === cobradorPadrao)
      ? cobradorPadrao
      : "",
  );
  const [parcelas, setParcelas] = useState<ParcelaAtribuivel[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ valor: number; qtd: number } | null>(
    null,
  );

  // Esc fecha (o modal fica por cima da Ficha ou da Conferência).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [onClose]);

  // As travas dependem do cobrador (pedido dele, conversa dele): recarrega.
  useEffect(() => {
    if (!cobradorId) {
      setParcelas([]);
      return;
    }
    let cancelado = false;
    setParcelas(null);
    setMarcadas(new Set());
    setErro(null);
    listarParcelasExcecao(documento, cobradorId)
      .then((p) => {
        if (!cancelado) setParcelas(p);
      })
      .catch((e) => {
        if (cancelado) return;
        setParcelas([]);
        setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [documento, cobradorId]);

  const livres = (parcelas ?? []).filter((p) => !p.bloqueio);
  const bloqueadas = (parcelas ?? []).filter((p) => !!p.bloqueio);
  const selecionadas = livres.filter((p) => marcadas.has(p.id_parcela));
  const total = round2(selecionadas.reduce((s, p) => s + Number(p.valor), 0));
  const nomeCobrador = cobradores.find((c) => c.id === cobradorId)?.name ?? "";
  const podeGravar =
    !!cobradorId && selecionadas.length > 0 && motivo.trim().length > 0 && !salvando;

  const alternar = (id: number) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const gravar = async () => {
    if (!podeGravar) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await atribuirPagamentoExcecao({
        documento,
        parcelas: selecionadas.map((p) => p.id_parcela),
        cobradorId,
        motivo,
      });
      invalidarHistoricoCliente(documento);
      setFeito({ valor: Number(r.valor), qtd: r.parcelas });
      onAtribuido?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atribuir.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[120]">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-dark-border">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-teal-600" />
              Atribuir pago na loja (exceção)
            </h2>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {cliente} · {documento}
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

        {feito ? (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              {formatCurrency(feito.valor)} ({feito.qtd}{" "}
              {feito.qtd === 1 ? "parcela" : "parcelas"}) atribuído a{" "}
              {nomeCobrador}.
            </div>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
              Fica registrado no nome do cobrador, na data do pagamento, marcado
              como exceção do gestor. Não muda a parcela e não entra no caixa.
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
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  Use só quando o cobrador <strong>conversou</strong> com o
                  cliente, mas a conversa não ficou registrada como efetiva
                  (WhatsApp, ligação, retorno do cliente). O padrão continua: o
                  cobrador pede e você aprova em Correções.
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
                  Cobrador que recebe o crédito
                </span>
                <select
                  value={cobradorId}
                  onChange={(e) => setCobradorId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Escolha o cobrador…</option>
                  <CobradorOptions cobradores={cobradores} />
                </select>
              </label>

              {cobradorId &&
                (parcelas === null ? (
                  <div className="py-4 text-center text-sm text-gray-500">
                    Carregando…
                  </div>
                ) : parcelas.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                    Nenhuma parcela paga pelo ERP nos últimos 30 dias.
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                    {[...livres, ...bloqueadas].map((p) => {
                      const livre = !p.bloqueio;
                      return (
                        <label
                          key={p.id_parcela}
                          className={`flex items-start justify-between gap-3 px-3 py-2 text-sm ${
                            livre
                              ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg/40"
                              : "opacity-60"
                          }`}
                        >
                          <span className="flex items-start gap-2 min-w-0">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              disabled={!livre}
                              checked={marcadas.has(p.id_parcela)}
                              onChange={() => alternar(p.id_parcela)}
                            />
                            <span className="min-w-0">
                              <span className="block text-gray-800 dark:text-dark-text">
                                Pago em {formatDate(p.data_pagamento)} ·{" "}
                                {p.venda
                                  ? `venda #${p.venda}`
                                  : p.descricao || "parcela avulsa"}{" "}
                                · parcela {p.parcela ?? "—"}
                              </span>
                              <span
                                className={`block text-[11px] ${
                                  !livre
                                    ? "text-gray-500 dark:text-dark-text-secondary"
                                    : p.ultimo_contato_em
                                      ? "text-teal-700 dark:text-teal-400"
                                      : "text-amber-700 dark:text-amber-400"
                                }`}
                              >
                                {!livre
                                  ? p.bloqueio
                                  : p.ultimo_contato_em
                                    ? `Conversa efetiva em ${new Date(p.ultimo_contato_em).toLocaleDateString("pt-BR")}: o cobrador também poderia pedir.`
                                    : "Sem conversa efetiva registrada (exceção)."}
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 font-medium text-gray-900 dark:text-dark-text">
                            {formatCurrency(Number(p.valor))}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}

              {cobradorId && livres.length > 0 && (
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
                    Motivo da exceção (obrigatório)
                  </span>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={2}
                    placeholder="Ex.: a cobradora falou com a cliente pelo WhatsApp em 10/11 e ela pagou na loja"
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-gray-900 dark:text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </label>
              )}

              {erro && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {erro}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-dark-border">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-200 dark:border-dark-border px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text"
              >
                Cancelar
              </button>
              <button
                onClick={() => void gravar()}
                disabled={!podeGravar}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="h-4 w-4" />
                {salvando
                  ? "Gravando…"
                  : selecionadas.length > 0 && nomeCobrador
                    ? `Atribuir ${formatCurrency(total)} a ${nomeCobrador}`
                    : "Atribuir"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AtribuirExcecaoModal;
