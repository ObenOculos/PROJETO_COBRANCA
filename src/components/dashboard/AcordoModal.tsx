import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, AlertCircle, Plus, Trash2 } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { hasInstallmentBalance } from "../../filters/clientStatus";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
import { ClientGroup } from "../../types";

interface AcordoModalProps {
  client: ClientGroup;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParcelaDraft {
  numero: number;
  valor: string;
  data: string;
}

/** Soma dois dias YYYY-MM-DD evitando problema de fuso (ver todayLocalStr). */
const addDaysLocal = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const AcordoModal: React.FC<AcordoModalProps> = ({
  client,
  onClose,
  onSuccess,
}) => {
  const { criarAcordo } = useCollection();

  const titulosEmAberto = useMemo(() => {
    const list: {
      collectionId: number;
      saldo: number;
      vencimento: string | null;
      descricao: string;
    }[] = [];
    client.sales?.forEach((sale) => {
      sale.installments?.forEach((inst) => {
        if (hasInstallmentBalance(inst)) {
          list.push({
            collectionId: inst.id_parcela,
            saldo:
              (inst.valor_original || 0) -
              (inst.valor_recebido || 0) -
              (inst.desconto || 0),
            vencimento: inst.data_vencimento,
            descricao: sale.description || `Venda ${sale.titleNumber}`,
          });
        }
      });
    });
    return list;
  }, [client]);

  const [selecionados, setSelecionados] = useState<Set<number>>(
    new Set(titulosEmAberto.map((t) => t.collectionId)),
  );
  const [numeroParcelas, setNumeroParcelas] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const saldoSelecionado = useMemo(
    () =>
      titulosEmAberto
        .filter((t) => selecionados.has(t.collectionId))
        .reduce((sum, t) => sum + t.saldo, 0),
    [titulosEmAberto, selecionados],
  );

  const gerarParcelas = (saldo: number, n: number): ParcelaDraft[] => {
    if (n < 1 || saldo <= 0) return [];
    const valorBase = Math.floor((saldo / n) * 100) / 100;
    const draft: ParcelaDraft[] = [];
    let acumulado = 0;
    for (let i = 1; i <= n; i++) {
      const isLast = i === n;
      const valor = isLast
        ? Math.round((saldo - acumulado) * 100) / 100
        : valorBase;
      acumulado += valor;
      draft.push({
        numero: i,
        valor: valor.toFixed(2),
        data: addDaysLocal(todayLocalStr(), 30 * i),
      });
    }
    return draft;
  };

  // Parcelas sao geradas automaticamente a partir do saldo selecionado —
  // sem botao manual. parcelasDirty marca que o usuario editou algo a mao;
  // se a selecao de titulos ou o numero de parcelas mudar depois disso, as
  // parcelas sao recalculadas (nunca ficam desatualizadas) mas avisamos em
  // vez de descartar silenciosamente a edicao.
  const [parcelas, setParcelas] = useState<ParcelaDraft[]>(() =>
    gerarParcelas(saldoSelecionado, numeroParcelas),
  );
  const [parcelasDirty, setParcelasDirty] = useState(false);
  const [recalcNotice, setRecalcNotice] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setParcelas(gerarParcelas(saldoSelecionado, numeroParcelas));
    setRecalcNotice(parcelasDirty);
    setParcelasDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldoSelecionado, numeroParcelas]);

  const toggleTitulo = (collectionId: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  };

  const updateParcela = (index: number, field: "valor" | "data", value: string) => {
    setParcelas((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
    setParcelasDirty(true);
    setRecalcNotice(false);
  };

  const removerParcela = (index: number) => {
    setParcelas((prev) =>
      prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, numero: i + 1 })),
    );
    setParcelasDirty(true);
    setRecalcNotice(false);
  };

  const adicionarParcela = () => {
    setParcelas((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          numero: prev.length + 1,
          valor: "0.00",
          data: last ? addDaysLocal(last.data, 30) : addDaysLocal(todayLocalStr(), 30),
        },
      ];
    });
    setParcelasDirty(true);
    setRecalcNotice(false);
  };

  const totalParcelas = useMemo(
    () => parcelas.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0),
    [parcelas],
  );
  const totalBate = Math.abs(totalParcelas - saldoSelecionado) <= 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (selecionados.size === 0) {
      setError("Selecione ao menos um título.");
      return;
    }
    if (parcelas.length === 0) {
      setError("Monte ao menos uma parcela.");
      return;
    }
    for (const p of parcelas) {
      if (!p.data || !(parseFloat(p.valor) > 0)) {
        setError("Toda parcela precisa de valor positivo e data.");
        return;
      }
    }
    if (!totalBate) {
      setError(
        `A soma das parcelas (${formatCurrency(totalParcelas)}) não bate com o saldo selecionado (${formatCurrency(saldoSelecionado)}). Ajuste os valores antes de continuar.`,
      );
      return;
    }

    setLoading(true);
    try {
      await criarAcordo({
        clientDocument: client.document,
        titulos: titulosEmAberto
          .filter((t) => selecionados.has(t.collectionId))
          .map((t) => ({ collectionId: t.collectionId, saldoNoMomento: t.saldo })),
        parcelas: parcelas.map((p) => ({
          numero: p.numero,
          valorParcela: parseFloat(p.valor),
          dataVencimento: p.data,
        })),
      });
      onSuccess();
    } catch (err) {
      console.error("Erro ao criar acordo:", err);
      setError(
        "Falha ao criar acordo: " +
          (err instanceof Error ? err.message : "erro desconhecido"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Novo Acordo
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {client.client} — {client.document}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-5 overflow-y-auto minimal-scrollbar"
        >
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400">
              Títulos em aberto ({titulosEmAberto.length})
            </label>
            <div className="border border-gray-200 dark:border-dark-border rounded-xl divide-y divide-gray-100 dark:divide-dark-border max-h-48 overflow-y-auto minimal-scrollbar">
              {titulosEmAberto.length === 0 && (
                <p className="p-3 text-sm text-gray-400">
                  Este cliente não tem título em aberto.
                </p>
              )}
              {titulosEmAberto.map((t) => (
                <label
                  key={t.collectionId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selecionados.has(t.collectionId)}
                      onChange={() => toggleTitulo(t.collectionId)}
                    />
                    <span className="truncate text-gray-700 dark:text-dark-text-secondary">
                      {t.descricao} — venc. {formatDate(t.vencimento)}
                    </span>
                  </div>
                  <span className="font-bold text-gray-900 dark:text-dark-text shrink-0">
                    {formatCurrency(t.saldo)}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-sm text-right font-bold text-indigo-600">
              Saldo selecionado: {formatCurrency(saldoSelecionado)}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400">
              Número de parcelas
            </label>
            <input
              type="number"
              min={1}
              value={numeroParcelas}
              onChange={(e) => setNumeroParcelas(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
            />
          </div>

          {parcelas.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-400">
                  Parcelas do acordo (ajuste livremente)
                </label>
                <button
                  type="button"
                  onClick={adicionarParcela}
                  className="text-xs font-bold text-indigo-600 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> adicionar
                </button>
              </div>
              {recalcNotice && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Seleção mudou — parcelas recalculadas, revise os valores.
                </p>
              )}
              <div className="space-y-2 max-h-56 overflow-y-auto minimal-scrollbar">
                {parcelas.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-6 shrink-0">
                      #{p.numero}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={p.valor}
                      onChange={(e) => updateParcela(i, "valor", e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                    />
                    <input
                      type="date"
                      value={p.data}
                      min={todayLocalStr()}
                      onChange={(e) => updateParcela(i, "data", e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                    />
                    <button
                      type="button"
                      onClick={() => removerParcela(i)}
                      className="p-2 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p
                className={`text-sm text-right font-bold ${totalBate ? "text-gray-900 dark:text-dark-text" : "text-red-600"}`}
              >
                Total combinado: {formatCurrency(totalParcelas)}
                {!totalBate && " — não bate com o saldo selecionado"}
              </p>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || parcelas.length === 0}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Criar Acordo
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AcordoModal;
