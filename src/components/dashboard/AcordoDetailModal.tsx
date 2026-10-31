import React, { useEffect, useState } from "react";
import { X, CheckCircle2, AlertCircle, Ban } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
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
  const [cancelMotivo, setCancelMotivo] = useState("");

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
    const motivo = cancelMotivo.trim();
    if (!motivo) {
      setError("Motivo do cancelamento é obrigatório.");
      return;
    }
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

              {acordo.motivoCancelamento && (
                <p className="text-xs text-gray-500 italic">
                  Motivo: {acordo.motivoCancelamento}
                </p>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400">
                  Parcelas
                </label>
                <div className="space-y-2">
                  {parcelas.map((p) => {
                    const saldo = saldoDaParcela(p.id, p.valorParcela);
                    const quitada = saldo <= 0.01;
                    return (
                      <div
                        key={p.id}
                        className="border border-gray-200 dark:border-dark-border rounded-xl p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-sm text-gray-900 dark:text-dark-text">
                              Parcela {p.numero} — {formatCurrency(p.valorParcela)}
                            </p>
                            <p className="text-xs text-gray-400">
                              Vencimento:{" "}
                              {new Date(
                                p.dataVencimento + "T00:00:00",
                              ).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                          {quitada ? (
                            <span className="flex items-center gap-1 text-green-600 text-xs font-bold">
                              <CheckCircle2 className="w-4 h-4" /> Quitada
                            </span>
                          ) : (
                            acordo.status === "ativo" && (
                              <button
                                onClick={() => openPayForm(p)}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700"
                              >
                                Registrar pagamento
                              </button>
                            )
                          )}
                        </div>
                        {!quitada && (
                          <p className="text-xs text-right text-red-500 mt-1">
                            Saldo: {formatCurrency(saldo)}
                          </p>
                        )}

                        {payingParcelaId === p.id && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-border flex items-end gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] font-bold text-gray-400">
                                Valor pago
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={payValue}
                                onChange={(e) => setPayValue(e.target.value)}
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
                                onChange={(e) => setPayDate(e.target.value)}
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
              </div>

              {acordo.status === "ativo" &&
                (showCancelForm ? (
                  <div className="border border-red-200 rounded-xl p-3 space-y-2">
                    <label className="text-xs font-bold text-gray-400">
                      Motivo do cancelamento (obrigatório)
                    </label>
                    <textarea
                      value={cancelMotivo}
                      onChange={(e) => setCancelMotivo(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                      placeholder="Ex.: cliente renegociou em condições melhores"
                      autoFocus
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
                          setCancelMotivo("");
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
