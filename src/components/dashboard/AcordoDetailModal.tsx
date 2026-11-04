import React, { useEffect, useMemo, useState } from "react";
import { X, CheckCircle2, AlertCircle, Ban, ChevronRight } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
import {
  ACORDO_CANCEL_REASONS,
  ACORDO_CANCEL_REASON_OTHER,
  acordoCancelReasonLabel,
} from "../../config/acordoCancelReasons";
import {
  Acordo,
  AcordoParcela,
  AcordoPagamento,
  AcordoTitulo,
} from "../../types";

interface AcordoDetailModalProps {
  acordoId: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  cumprido: "Cumprido",
  cancelado: "Cancelado",
  quebrado: "Quebrado",
};

const STATUS_COLOR: Record<string, string> = {
  ativo: "bg-blue-50 text-blue-600 border-blue-100",
  cumprido: "bg-green-50 text-green-600 border-green-100",
  cancelado: "bg-gray-100 text-gray-600 border-gray-200",
  quebrado: "bg-red-50 text-red-600 border-red-100",
};

const AcordoDetailModal: React.FC<AcordoDetailModalProps> = ({
  acordoId,
  onClose,
}) => {
  const { fetchAcordoDetalhe, registrarPagamentoAcordo, cancelarAcordo } =
    useCollection();

  const [acordo, setAcordo] = useState<Acordo | null>(null);
  const [titulos, setTitulos] = useState<AcordoTitulo[]>([]);
  const [parcelas, setParcelas] = useState<AcordoParcela[]>([]);
  const [pagamentos, setPagamentos] = useState<AcordoPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payingParcelaId, setPayingParcelaId] = useState<string | null>(null);
  const [payValue, setPayValue] = useState("");
  const [payDate, setPayDate] = useState(todayLocalStr());
  const [saving, setSaving] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelMotivoKey, setCancelMotivoKey] = useState("");
  const [cancelObservacao, setCancelObservacao] = useState("");
  const [showQuitadas, setShowQuitadas] = useState(false);
  const [showTitulosOrigem, setShowTitulosOrigem] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const detalhe = await fetchAcordoDetalhe(acordoId);
      setAcordo(detalhe.acordo);
      setTitulos(detalhe.titulos);
      setParcelas(detalhe.parcelas);
      setPagamentos(detalhe.pagamentos);
    } catch (err) {
      setError(
        "Falha ao carregar acordo: " +
          (err instanceof Error ? err.message : "erro"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acordoId]);

  const saldoDaParcela = (parcelaId: string, valorParcela: number) =>
    valorParcela -
    pagamentos
      .filter((p) => p.acordoParcelaId === parcelaId)
      .reduce((sum, p) => sum + p.valorPago, 0);

  const gruposTitulosPorVenda = useMemo(() => {
    const map = new Map<
      number,
      { saleLabel: string; titulos: AcordoTitulo[] }
    >();
    titulos.forEach((t) => {
      const key = t.saleNumber ?? -1;
      const grupo = map.get(key);
      if (grupo) grupo.titulos.push(t);
      else
        map.set(key, {
          saleLabel: t.saleLabel || `Título ${t.collectionId}`,
          titulos: [t],
        });
    });
    return Array.from(map.entries()).map(([saleKey, g]) => ({
      saleKey,
      ...g,
    }));
  }, [titulos]);

  const openPayForm = (parcela: AcordoParcela) => {
    setPayingParcelaId(parcela.id);
    setPayValue(saldoDaParcela(parcela.id, parcela.valorParcela).toFixed(2));
    setPayDate(todayLocalStr());
    setError("");
  };

  const confirmPayment = async () => {
    if (!payingParcelaId) return;
    const valor = parseFloat(payValue);
    if (!(valor > 0)) {
      setError("Valor do pagamento deve ser positivo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await registrarPagamentoAcordo({
        acordoParcelaId: payingParcelaId,
        valorPago: valor,
        dataPagamento: payDate,
      });
      setPayingParcelaId(null);
      await load();
    } catch (err) {
      setError(
        "Falha ao registrar pagamento: " +
          (err instanceof Error ? err.message : "erro"),
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmCancelar = async () => {
    if (!cancelMotivoKey) {
      setError("Selecione um motivo de cancelamento.");
      return;
    }
    const observacao = cancelObservacao.trim();
    if (cancelMotivoKey === ACORDO_CANCEL_REASON_OTHER && !observacao) {
      setError("Descreva o motivo do cancelamento.");
      return;
    }
    const label = acordoCancelReasonLabel(cancelMotivoKey);
    const motivo =
      cancelMotivoKey === ACORDO_CANCEL_REASON_OTHER
        ? observacao
        : observacao
          ? `${label} — ${observacao}`
          : label;

    setSaving(true);
    setError("");
    try {
      await cancelarAcordo(acordoId, motivo);
      onClose();
    } catch (err) {
      setError(
        "Falha ao cancelar acordo: " +
          (err instanceof Error ? err.message : "erro"),
      );
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Acordo{acordo ? ` — ${acordo.clientName || acordo.clientDocument}` : ""}
            </h3>
            {acordo && (
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLOR[acordo.status]}`}
              >
                {STATUS_LABEL[acordo.status]}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto minimal-scrollbar">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : acordo ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-dark-bg-secondary">
                  <p className="text-[11px] text-gray-400 font-bold">
                    Valor negociado
                  </p>
                  <p className="font-bold text-gray-900 dark:text-dark-text">
                    {formatCurrency(acordo.valorNegociado)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-dark-bg-secondary">
                  <p className="text-[11px] text-gray-400 font-bold">
                    Títulos consolidados
                  </p>
                  <p className="font-bold text-gray-900 dark:text-dark-text">
                    {titulos.length}
                  </p>
                </div>
              </div>

              {titulos.length > 0 && (
                <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowTitulosOrigem((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-gray-500 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <ChevronRight
                        className={`w-3.5 h-3.5 transition-transform ${showTitulosOrigem ? "rotate-90" : ""}`}
                      />
                      Títulos consolidados ({titulos.length})
                    </span>
                  </button>
                  {showTitulosOrigem && (
                    <div className="divide-y divide-gray-100 dark:divide-dark-border">
                      {gruposTitulosPorVenda.map((grupo) => (
                        <div key={grupo.saleKey}>
                          <p className="px-3 py-1.5 text-[11px] font-bold text-gray-400 bg-gray-50 dark:bg-dark-bg-secondary uppercase tracking-wide">
                            {grupo.saleLabel}
                          </p>
                          <div className="divide-y divide-gray-50 dark:divide-dark-border">
                            {grupo.titulos.map((t) => {
                              const temEncargo =
                                t.multaValor > 0 ||
                                t.jurosValor > 0 ||
                                t.descontoValor > 0;
                              const totalFinal =
                                t.saldoNoMomento +
                                t.multaValor +
                                t.jurosValor -
                                t.descontoValor;
                              return (
                                <div
                                  key={t.id}
                                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-gray-600 dark:text-dark-text-secondary"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span>
                                      Título {t.collectionId}
                                      {t.vencimentoOriginal &&
                                        ` — venc. original ${new Date(
                                          t.vencimentoOriginal + "T00:00:00",
                                        ).toLocaleDateString("pt-BR")}`}
                                    </span>
                                    {temEncargo && (
                                      <p className="text-[10px] text-gray-400">
                                        Saldo {formatCurrency(t.saldoNoMomento)}
                                        {t.multaValor > 0 &&
                                          ` + multa ${formatCurrency(t.multaValor)}`}
                                        {t.jurosValor > 0 &&
                                          ` + juros ${formatCurrency(t.jurosValor)}`}
                                        {t.descontoValor > 0 &&
                                          ` − desconto ${formatCurrency(t.descontoValor)}`}
                                      </p>
                                    )}
                                  </div>
                                  <span className="font-bold text-gray-700 dark:text-dark-text shrink-0">
                                    {formatCurrency(totalFinal)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {acordo.motivoCancelamento && (
                <p className="text-xs text-gray-500 italic">
                  Motivo: {acordo.motivoCancelamento}
                </p>
              )}

              {(() => {
                const quitadas = parcelas.filter(
                  (p) => saldoDaParcela(p.id, p.valorParcela) <= 0.01,
                );
                const pendentes = parcelas.filter(
                  (p) => saldoDaParcela(p.id, p.valorParcela) > 0.01,
                );
                const totalPagoQuitadas = pagamentos
                  .filter((pg) =>
                    quitadas.some((q) => q.id === pg.acordoParcelaId),
                  )
                  .reduce((sum, pg) => sum + pg.valorPago, 0);
                const totalAberto = pendentes.reduce(
                  (sum, p) => sum + saldoDaParcela(p.id, p.valorParcela),
                  0,
                );
                const progressPct = parcelas.length
                  ? (quitadas.length / parcelas.length) * 100
                  : 0;

                return (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-500 dark:text-dark-text-secondary">
                          {quitadas.length}/{parcelas.length} parcelas pagas
                        </span>
                        <span className="font-bold text-red-500">
                          Saldo em aberto: {formatCurrency(totalAberto)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-dark-bg-tertiary overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {quitadas.length > 0 && (
                      <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowQuitadas((v) => !v)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-gray-500 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <ChevronRight
                              className={`w-3.5 h-3.5 transition-transform ${showQuitadas ? "rotate-90" : ""}`}
                            />
                            {quitadas.length} parcela
                            {quitadas.length > 1 ? "s" : ""} quitada
                            {quitadas.length > 1 ? "s" : ""}
                          </span>
                          <span className="text-green-600">
                            {formatCurrency(totalPagoQuitadas)}
                          </span>
                        </button>
                        {showQuitadas && (
                          <div className="divide-y divide-gray-100 dark:divide-dark-border">
                            {quitadas.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 dark:text-dark-text-secondary"
                              >
                                <span className="w-7 shrink-0 text-gray-400">
                                  #{p.numero}
                                </span>
                                <span className="flex-1">
                                  {new Date(
                                    p.dataVencimento + "T00:00:00",
                                  ).toLocaleDateString("pt-BR")}
                                </span>
                                <span className="font-bold text-gray-700 dark:text-dark-text">
                                  {formatCurrency(p.valorParcela)}
                                </span>
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">
                        Parcelas pendentes
                      </label>
                      {pendentes.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          Todas as parcelas estão quitadas.
                        </p>
                      ) : (
                        <div className="border border-gray-200 dark:border-dark-border rounded-xl divide-y divide-gray-100 dark:divide-dark-border max-h-72 overflow-y-auto minimal-scrollbar">
                          {pendentes.map((p) => {
                            const saldo = saldoDaParcela(p.id, p.valorParcela);
                            return (
                              <div key={p.id}>
                                <div className="flex items-center gap-2 px-3 py-2 text-sm">
                                  <span className="w-7 shrink-0 text-xs text-gray-400">
                                    #{p.numero}
                                  </span>
                                  <span className="w-20 shrink-0 text-xs text-gray-500 dark:text-dark-text-secondary">
                                    {new Date(
                                      p.dataVencimento + "T00:00:00",
                                    ).toLocaleDateString("pt-BR")}
                                  </span>
                                  <span className="flex-1 font-bold text-gray-900 dark:text-dark-text">
                                    {formatCurrency(p.valorParcela)}
                                  </span>
                                  {saldo < p.valorParcela - 0.01 && (
                                    <span className="text-[11px] text-amber-600 shrink-0">
                                      saldo {formatCurrency(saldo)}
                                    </span>
                                  )}
                                  {acordo.status === "ativo" && (
                                    <button
                                      onClick={() => openPayForm(p)}
                                      className="shrink-0 px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700"
                                    >
                                      Pagar
                                    </button>
                                  )}
                                </div>

                                {payingParcelaId === p.id && (
                                  <div className="px-3 pb-3 flex items-end gap-2">
                                    <div className="flex-1">
                                      <label className="text-[10px] font-bold text-gray-400">
                                        Valor pago
                                      </label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min={0}
                                        value={payValue}
                                        onChange={(e) =>
                                          setPayValue(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="text-[10px] font-bold text-gray-400">
                                        Data
                                      </label>
                                      <input
                                        type="date"
                                        value={payDate}
                                        onChange={(e) =>
                                          setPayDate(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                                      />
                                    </div>
                                    <button
                                      onClick={confirmPayment}
                                      disabled={saving}
                                      className="px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      onClick={() => setPayingParcelaId(null)}
                                      className="px-3 py-2 text-gray-500 text-xs font-bold"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {acordo.status === "ativo" &&
                (showCancelForm ? (
                  <div className="border border-red-200 rounded-xl p-3 space-y-2">
                    <label className="text-xs font-bold text-gray-400">
                      Motivo do cancelamento (obrigatório)
                    </label>
                    <select
                      value={cancelMotivoKey}
                      onChange={(e) => setCancelMotivoKey(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                      autoFocus
                    >
                      <option value="">Selecione um motivo...</option>
                      {ACORDO_CANCEL_REASONS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <label className="text-xs font-bold text-gray-400">
                      Observação{" "}
                      {cancelMotivoKey === ACORDO_CANCEL_REASON_OTHER
                        ? "(obrigatória)"
                        : "(opcional)"}
                    </label>
                    <textarea
                      value={cancelObservacao}
                      onChange={(e) => setCancelObservacao(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                      placeholder={
                        cancelMotivoKey === ACORDO_CANCEL_REASON_OTHER
                          ? "Descreva o motivo do cancelamento"
                          : "Detalhe adicional, se precisar"
                      }
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={confirmCancelar}
                        disabled={saving}
                        className="flex-1 px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirmar cancelamento
                      </button>
                      <button
                        onClick={() => {
                          setShowCancelForm(false);
                          setCancelMotivoKey("");
                          setCancelObservacao("");
                          setError("");
                        }}
                        disabled={saving}
                        className="px-3 py-2 text-gray-500 text-xs font-bold"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCancelForm(true)}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-all disabled:opacity-50"
                  >
                    <Ban className="w-4 h-4" />
                    Cancelar acordo
                  </button>
                ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AcordoDetailModal;
