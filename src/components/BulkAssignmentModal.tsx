import React, { useState, useRef, useEffect } from "react";
import { Users, UserPlus, UserMinus, CheckCircle, Loader2, ChevronRight, ChevronLeft, Zap } from "lucide-react";
import { Modal } from "./Modal";
import { useCollection } from "../contexts/CollectionContext";
import { supabase } from "../lib/supabase";

interface ClientWithCollections {
  uniqueKey: string;
  documento: string;
  cliente: string;
  collections: { id_parcela: number; situacao?: string | null }[];
  collectorId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedClients: Set<string>;
  clientsData: ClientWithCollections[];
  collectors: { id: string; name: string }[];
  onComplete?: () => void;
}

type CollectorAction = "assign" | "remove" | "skip";

const STATUS_OPTIONS = [
  { value: "skip", label: "Não alterar status" },
  { value: "Em mãos", label: "Em mãos" },
  { value: "Em tratamento", label: "Em tratamento" },
  { value: "Aguardando Interno", label: "Aguardando Interno" },
  { value: "Cobrança Interna", label: "Cobrança Interna" },
  { value: "empty", label: "Vazio (limpar)" },
];

const BulkAssignmentModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedClients,
  clientsData,
  collectors,
  onComplete,
}) => {
  const { assignCollectorToClients, removeCollectorFromClients, refreshData } = useCollection();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [collectorAction, setCollectorAction] = useState<CollectorAction>("assign");
  const [selectedCollector, setSelectedCollector] = useState("");
  const [statusAction, setStatusAction] = useState("skip");
  const [progressCompleted, setProgressCompleted] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressLog, setProgressLog] = useState<{ text: string; type: "ok" | "info" }[]>([]);
  const [done, setDone] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCollectorAction("assign");
      setSelectedCollector("");
      setStatusAction("skip");
      setProgressCompleted(0);
      setProgressTotal(0);
      setProgressLog([]);
      setDone(false);
    }
  }, [isOpen]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progressLog]);

  const clientsList = Array.from(selectedClients)
    .map((key) => clientsData.find((c) => c.uniqueKey === key))
    .filter(Boolean) as ClientWithCollections[];

  const totalBatches =
    (collectorAction !== "skip" ? Math.ceil(clientsList.length / 200) : 0) +
    (statusAction !== "skip" ? 1 : 0);

  const canProceedStep1 =
    collectorAction === "skip" ||
    collectorAction === "remove" ||
    (collectorAction === "assign" && selectedCollector !== "");

  const addLog = (text: string, type: "ok" | "info" = "ok") => {
    setProgressLog((prev) => [...prev, { text, type }]);
  };

  const execute = async () => {
    setStep(3);
    let total = totalBatches;
    setProgressTotal(total);
    let completed = 0;

    const identifiers = clientsList.map((c) => ({
      document: c.documento || undefined,
      clientName: !c.documento ? c.cliente : undefined,
    }));

    try {
      if (collectorAction === "assign" && selectedCollector) {
        const collectorName = collectors.find((c) => c.id === selectedCollector)?.name ?? selectedCollector;
        addLog(`Atribuindo ${clientsList.length} clientes a ${collectorName}...`, "info");
        await assignCollectorToClients(
          selectedCollector,
          identifiers,
          true,
          (batchDone, batchTotal) => {
            completed++;
            setProgressCompleted(completed);
            const start = (batchDone - 1) * 200 + 1;
            const end = Math.min(batchDone * 200, clientsList.length);
            addLog(`Lote ${batchDone}/${batchTotal} — clientes ${start}–${end}`);
          },
        );
      } else if (collectorAction === "remove") {
        addLog(`Removendo cobrador de ${clientsList.length} clientes...`, "info");
        await removeCollectorFromClients(
          identifiers,
          true,
          (batchDone, batchTotal) => {
            completed++;
            setProgressCompleted(completed);
            const start = (batchDone - 1) * 200 + 1;
            const end = Math.min(batchDone * 200, clientsList.length);
            addLog(`Lote ${batchDone}/${batchTotal} — clientes ${start}–${end}`);
          },
        );
      }

      if (statusAction !== "skip") {
        addLog("Atualizando status das parcelas...", "info");
        const statusValue = statusAction === "empty" ? null : statusAction;
        const allIds = clientsList.flatMap((c) => c.collections.map((col) => col.id_parcela));
        const chunkSize = 500;
        for (let i = 0; i < allIds.length; i += chunkSize) {
          const chunk = allIds.slice(i, i + chunkSize);
          const { error } = await supabase
            .from("BANCO_DADOS")
            .update({ situacao: statusValue })
            .in("id_parcela", chunk);
          if (error) throw new Error(error.message);
        }
        completed++;
        setProgressCompleted(completed);
        addLog(`Status atualizado em ${allIds.length} parcelas`);
      }

      addLog("Sincronizando dados...", "info");
      await refreshData(false);
      addLog("Concluído com sucesso!");
      setDone(true);
      onComplete?.();
    } catch (err) {
      addLog(`Erro: ${err instanceof Error ? err.message : "Erro desconhecido"}`, "info");
      setDone(true);
    }
  };

  const pct = progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0;

  const StepIndicator = () => (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
            step > s ? "bg-blue-600 text-white" :
            step === s ? "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/30" :
            "bg-gray-100 dark:bg-dark-bg text-gray-400"
          }`}>
            {step > s ? <CheckCircle className="w-3.5 h-3.5" /> : s}
          </div>
          {s < 3 && <div className={`flex-1 h-0.5 transition-all ${step > s ? "bg-blue-600" : "bg-gray-100 dark:bg-dark-bg"}`} />}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={step === 3 && !done ? undefined : onClose} title="" size="lg">
      <div className="space-y-5 -mt-2">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-black text-gray-800 dark:text-dark-text uppercase tracking-widest">
                Atribuição em Massa
              </h2>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {step === 3 && done ? "Concluído" : `Etapa ${step} de 3`}
            </span>
          </div>
          <StepIndicator />
        </div>

        {/* Etapa 1 — Cobrador */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                O que fazer com o cobrador?
              </p>
              <div className="space-y-2">
                {(["assign", "remove", "skip"] as CollectorAction[]).map((action) => (
                  <label key={action} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    collectorAction === action
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
                      : "border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/30"
                  }`}>
                    <input
                      type="radio"
                      name="collectorAction"
                      value={action}
                      checked={collectorAction === action}
                      onChange={() => setCollectorAction(action)}
                      className="accent-blue-600"
                    />
                    <div className="flex items-center gap-2">
                      {action === "assign" && <UserPlus className="w-4 h-4 text-blue-500" />}
                      {action === "remove" && <UserMinus className="w-4 h-4 text-rose-500" />}
                      {action === "skip" && <Users className="w-4 h-4 text-gray-400" />}
                      <span className="text-xs font-bold text-gray-700 dark:text-dark-text">
                        {action === "assign" ? "Atribuir a um cobrador" :
                         action === "remove" ? "Remover cobrador" :
                         "Não alterar cobrador"}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {collectorAction === "assign" && (
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Cobrador
                </label>
                <select
                  value={selectedCollector}
                  onChange={(e) => setSelectedCollector(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione um cobrador...</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Etapa 2 — Status */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Status das parcelas
              </label>
              <select
                value={statusAction}
                onChange={(e) => setStatusAction(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Resumo */}
            <div className="p-3 bg-gray-50 dark:bg-dark-bg/50 rounded-xl border border-gray-100 dark:border-dark-border">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Resumo</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Clientes selecionados</span>
                  <span className="font-black text-gray-800 dark:text-dark-text">{clientsList.length}</span>
                </div>
                {collectorAction !== "skip" && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Lotes de cobrador</span>
                    <span className="font-black text-blue-600">{Math.ceil(clientsList.length / 200)}</span>
                  </div>
                )}
                {statusAction !== "skip" && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Parcelas a atualizar</span>
                    <span className="font-black text-purple-600">
                      {clientsList.flatMap((c) => c.collections).length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-2.5 border border-gray-200 dark:border-dark-border text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg text-xs font-black uppercase tracking-widest rounded-xl transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <button
                type="button"
                onClick={execute}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
              >
                <Zap className="w-4 h-4" /> Confirmar e Executar
              </button>
            </div>
          </div>
        )}

        {/* Etapa 3 — Progresso */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Barra de progresso */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {done ? "Concluído" : "Processando..."}
                </span>
                <span className="text-[10px] font-black text-blue-600">{done ? "100%" : `${pct}%`}</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-dark-bg rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${done ? "bg-green-500" : "bg-blue-500"}`}
                  style={{ width: `${done ? 100 : pct}%` }}
                />
              </div>
            </div>

            {/* Log */}
            <div className="bg-gray-50 dark:bg-dark-bg/50 border border-gray-100 dark:border-dark-border rounded-xl p-3 h-40 overflow-y-auto custom-scrollbar space-y-1.5">
              {progressLog.map((entry, i) => (
                <div key={i} className="flex items-start gap-2">
                  {entry.type === "ok"
                    ? <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                    : <Loader2 className="w-3 h-3 text-blue-400 mt-0.5 shrink-0 animate-spin" />
                  }
                  <span className="text-[11px] text-gray-600 dark:text-dark-text-secondary">{entry.text}</span>
                </div>
              ))}
              {!done && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />
                  <span className="text-[11px] text-gray-400">Aguardando...</span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            {/* Done state */}
            {done && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-xl">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-xs font-bold text-green-700 dark:text-green-400">
                  {clientsList.length} clientes processados com sucesso
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={!done}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BulkAssignmentModal;
