import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Ban,
  ChevronRight,
  Download,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import { nomeJuridicoCliente } from "../../utils/clienteNome";
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
import { gerarTermoAcordoPdf, nomeArquivoTermoAcordo } from "../../utils/termoAcordo";
import AcordoLancamentoCiclone from "./AcordoLancamentoCiclone";

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
  const {
    fetchAcordoDetalhe,
    registrarPagamentoAcordo,
    cancelarAcordo,
    getClientGroups,
    acordoConfiguracaoPadrao,
    clientesRegistry,
  } = useCollection();

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
  // Acordo com pagamento: o que fazer com ele ao cancelar (obrigatorio).
  const [cancelDestino, setCancelDestino] = useState<
    "estornar" | "manter" | ""
  >("");
  const [showQuitadas, setShowQuitadas] = useState(false);
  const [showTitulosOrigem, setShowTitulosOrigem] = useState(false);
  const [baixandoTermo, setBaixandoTermo] = useState(false);

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

  // Liquido ja pago no acordo (estornos entram negativos).
  const totalPagoNoAcordo = pagamentos.reduce((s, p) => s + p.valorPago, 0);
  const acordoTemPagamento = totalPagoNoAcordo > 0.009;

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

  const baixarTermo = async () => {
    if (!acordo) return;
    setBaixandoTermo(true);
    setError("");
    try {
      const clientGroup = getClientGroups().find(
        (g) => g.document === acordo.clientDocument,
      );
      const endereco = clientGroup
        ? [
            [clientGroup.address, clientGroup.number]
              .filter(Boolean)
              .join(", "),
            clientGroup.complemento,
            clientGroup.neighborhood,
            clientGroup.cep ? `CEP: ${clientGroup.cep}` : "",
            [clientGroup.city, clientGroup.state].filter(Boolean).join("/"),
          ]
            .filter(Boolean)
            .join(", ")
        : "";
      const pdf = await gerarTermoAcordoPdf({
        acordo,
        titulos,
        parcelas,
        empresa: acordoConfiguracaoPadrao,
        devedor: {
          // Razao social do CPF/CNPJ (ERP) quando existe; senao o nome
          // gravado no acordo.
          nome: nomeJuridicoCliente(
            clientesRegistry.get(acordo.clientDocument)?.razao_social,
            acordo.clientName || clientGroup?.client || acordo.clientDocument,
          ),
          documento: acordo.clientDocument,
          endereco: endereco || "endereço não informado",
        },
      });
      pdf.save(nomeArquivoTermoAcordo(acordo));
    } catch (err) {
      setError(
        "Falha ao gerar o Termo de Acordo: " +
          (err instanceof Error ? err.message : "erro"),
      );
    } finally {
      setBaixandoTermo(false);
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
    if (acordoTemPagamento && !cancelDestino) {
      setError("Escolha o que fazer com o valor já pago neste acordo.");
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
      await cancelarAcordo(
        acordoId,
        motivo,
        acordoTemPagamento && cancelDestino ? cancelDestino : undefined,
      );
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
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLOR[acordo.status]}`}
                >
                  {STATUS_LABEL[acordo.status]}
                </span>
                <span className="text-[10px] font-mono text-gray-400">
                  Nº {acordo.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {acordo && (
              <button
                onClick={baixarTermo}
                disabled={baixandoTermo}
                title="Baixar Termo de Acordo"
                className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors disabled:opacity-50"
              >
                {baixandoTermo ? (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                ) : (
                  <Download className="w-5 h-5 text-gray-500" />
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
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

              <AcordoLancamentoCiclone acordoId={acordo.id} />

              {(() => {
                const entrada = parcelas.find((p) => p.numero === 1);
                if (!entrada) return null;
                const saldoEntrada = saldoDaParcela(
                  entrada.id,
                  entrada.valorParcela,
                );
                const entradaPaga = saldoEntrada <= 0.01;
                const pagamentoEntrada = pagamentos
                  .filter((p) => p.acordoParcelaId === entrada.id)
                  .sort((a, b) => b.dataPagamento.localeCompare(a.dataPagamento))[0];
                return (
                  <div
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                      entradaPaga
                        ? "bg-green-50 border-green-100 text-green-700"
                        : "bg-amber-50 border-amber-100 text-amber-700"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-bold">
                      {entradaPaga ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      Entrada ({formatCurrency(entrada.valorParcela)}){" "}
                      {entradaPaga
                        ? `paga${pagamentoEntrada ? ` em ${new Date(pagamentoEntrada.dataPagamento + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}`
                        : "ainda não paga"}
                    </span>
                    {!entradaPaga && acordo.status === "ativo" && (
                      <button
                        onClick={() => openPayForm(entrada)}
                        className="shrink-0 px-2.5 py-1 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700"
                      >
                        Registrar
                      </button>
                    )}
                  </div>
                );
              })()}

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
                    {acordoTemPagamento && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-bold text-gray-400">
                          Já foi pago {formatCurrency(totalPagoNoAcordo)} neste
                          acordo. O que fazer com esse valor? (obrigatório)
                        </p>
                        {(
                          [
                            [
                              "estornar",
                              "Estornar",
                              "O acordo vai ser refeito (a entrada será lançada de novo no acordo novo) ou o pagamento não aconteceu. A dívida volta ao valor de antes.",
                            ],
                            [
                              "manter",
                              "Manter como recebido",
                              "O cliente pagou e desistiu do acordo. O valor pago (inclusive os juros) abate a dívida.",
                            ],
                          ] as const
                        ).map(([valor, titulo, explicacao]) => (
                          <label
                            key={valor}
                            className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                              cancelDestino === valor
                                ? "border-red-300 bg-red-50 dark:bg-red-900/10"
                                : "border-gray-200 dark:border-dark-border"
                            }`}
                          >
                            <input
                              type="radio"
                              name="cancel-destino"
                              className="mt-1"
                              checked={cancelDestino === valor}
                              onChange={() => setCancelDestino(valor)}
                            />
                            <span>
                              <span className="font-bold text-gray-800 dark:text-dark-text">
                                {titulo}
                              </span>
                              <span className="block text-xs text-gray-500">
                                {explicacao}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
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
                          setCancelDestino("");
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
