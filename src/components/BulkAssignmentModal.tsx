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
    const total = totalBatches;
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
          (batchDone: number, batchTotal: number) => {
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
          (batchDone: number, batchTotal: number) => {
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
      await refreshData();
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
    <div className="flex items-center gap-2 px-1">
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black transition-all ${
            step > s ? "bg-green-600 text-white shadow-lg shadow-green-900/20" :
            step === s ? "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/30 shadow-lg shadow-blue-900/20" :
            "bg-gray-100 dark:bg-dark-bg text-gray-400"
          }`}>
            {step > s ? <CheckCircle className="w-4 h-4" /> : s}
          </div>
          {s < 3 && <div className={`flex-1 h-1 rounded-full transition-all ${step > s ? "bg-green-600" : step === s ? "bg-blue-100 dark:bg-dark-bg" : "bg-gray-100 dark:bg-dark-bg"}`} />}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={step === 3 && !done ? () => {} : onClose} title="" size="lg">
      <div className="space-y-6 sm:space-y-8 -mt-2">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-black text-gray-800 dark:text-dark-text uppercase tracking-widest leading-none">
                  Atribuição em Massa
                </h2>
                <p className="text-[9px] font-bold text-gray-400 dark:text-dark-text-secondary mt-1 uppercase tracking-widest">
                  {step === 3 && done ? "Processo Finalizado" : `Etapa ${step} de 3`}
                </p>
              </div>
            </div>
          </div>
          <StepIndicator />
        </div>

        {/* Etapa 1 — Cobrador */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <p className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-3">
                O que fazer com o cobrador?
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {(["assign", "remove", "skip"] as CollectorAction[]).map((action) => (
                  <label key={action} className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    collectorAction === action
                      ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 ring-2 ring-blue-500/20"
                      : "border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/30"
                  }`}>
                    <div className="relative flex items-center justify-center">
                      <input
                        type="radio"
                        name="collectorAction"
                        value={action}
                        checked={collectorAction === action}
                        onChange={() => setCollectorAction(action)}
                        className="h-4 w-4 accent-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${
                        action === "assign" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" :
                        action === "remove" ? "bg-red-100 dark:bg-red-900/30 text-red-600" :
                        "bg-gray-100 dark:bg-gray-800 text-gray-500"
                      }`}>
                        {action === "assign" && <UserPlus className="w-3.5 h-3.5" />}
                        {action === "remove" && <UserMinus className="w-3.5 h-3.5" />}
                        {action === "skip" && <Users className="w-3.5 h-3.5" />}
                      </div>
                      <span className="text-xs font-black text-gray-700 dark:text-dark-text uppercase tracking-tight">
                        {action === "assign" ? "Atribuir a um cobrador" :
                         action === "remove" ? "Remover cobrador atual" :
                         "Não alterar atribuição"}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {collectorAction === "assign" && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <label className="block text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-2">
                  Selecionar Cobrador
                </label>
                <select
                  value={selectedCollector}
                  onChange={(e) => setSelectedCollector(e.target.value)}
                  className="w-full px-4 py-3 text-xs font-black border border-gray-200 dark:border-dark-border rounded-2xl bg-gray-50 dark:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest"
                >
                  <option value="">SELECIONE UM COBRADOR...</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl transition-all active:scale-[0.98]"
            >
              Continuar <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Etapa 2 — Status */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <label className="block text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-2">
                Status das Parcelas
              </label>
              <select
                value={statusAction}
                onChange={(e) => setStatusAction(e.target.value)}
                className="w-full px-4 py-3 text-xs font-black border border-gray-200 dark:border-dark-border rounded-2xl bg-gray-50 dark:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label.toUpperCase()}</option>
                ))}
              </select>
            </div>

            {/* Resumo — Estilo Card Executivo */}
            <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-2xl border border-gray-100 dark:border-dark-border shadow-inner">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 border-b border-gray-100 dark:border-dark-border pb-2">Resumo da Operação</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
                  <span className="text-gray-500">Clientes Afetados</span>
                  <span className="font-black text-gray-900 dark:text-dark-text bg-white dark:bg-dark-bg-secondary px-2 py-0.5 rounded-lg border border-gray-100 dark:border-dark-border shadow-sm">{clientsList.length}</span>
                </div>
                {collectorAction !== "skip" && (
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
                    <span className="text-gray-500">Lotes de Sincronização</span>
                    <span className="font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-900/30">{Math.ceil(clientsList.length / 200)}</span>
                  </div>
                )}
                {statusAction !== "skip" && (
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
                    <span className="text-gray-500">Parcelas para Atualizar</span>
                    <span className="font-black text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-lg border border-purple-100 dark:border-purple-900/30">
                      {clientsList.flatMap((c) => c.collections).length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center justify-center gap-1.5 px-4 py-3.5 border border-gray-200 dark:border-dark-border text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                type="button"
                onClick={execute}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-700 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-green-900/10 transition-all active:scale-[0.98]"
              >
                <Zap className="w-4 h-4 text-yellow-400" /> Confirmar Execução
              </button>
            </div>
          </div>
        )}

        {/* Etapa 3 — Progresso */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            {/* Barra de progresso — Estilo Dashboard */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-[10px] font-black text-gray-400 dark:text-dark-text-secondary uppercase tracking-[0.2em]">
                    Status do Processamento
                  </span>
                  <p className="text-lg font-black text-gray-900 dark:text-dark-text leading-none mt-1">
                    {done ? "100% Concluído" : "Sincronizando..."}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-black px-2 py-1 rounded-lg uppercase tracking-tight ${done ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700 animate-pulse"}`}>
                    {done ? "OK" : `${pct}%`}
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-100 dark:bg-dark-bg rounded-full h-3 overflow-hidden p-0.5 border border-gray-200 dark:border-dark-border shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out shadow-sm ${done ? "bg-green-500" : "bg-gradient-to-r from-blue-500 to-indigo-600 animate-pulse"}`}
                  style={{ width: `${done ? 100 : pct}%` }}
                />
              </div>
            </div>

            {/* Log — Estilo Terminal Minimalista */}
            <div className="bg-gray-900 dark:bg-black rounded-2xl p-4 h-48 overflow-y-auto custom-scrollbar border border-gray-800 shadow-xl">
              <div className="flex items-center gap-2 mb-3 border-b border-gray-800 pb-2">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/50" />
                  <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                  <div className="w-2 h-2 rounded-full bg-green-500/50" />
                </div>
                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-2">Operação em Lote</span>
              </div>
              <div className="space-y-2">
                {progressLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                    <span className="text-[10px] font-bold text-gray-700 mt-0.5 font-mono">[{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}]</span>
                    {entry.type === "ok"
                      ? <span className="text-green-400 mt-0.5 font-bold">✓</span>
                      : <span className="text-blue-400 mt-0.5 animate-pulse">»</span>
                    }
                    <span className="text-[11px] text-gray-300 font-medium leading-relaxed">{entry.text}</span>
                  </div>
                ))}
                {!done && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
                    <span className="text-[11px] text-gray-500 font-mono italic">Aguardando resposta do servidor...</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Done state */}
            {done && (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-2xl animate-in fade-in zoom-in-95 duration-500">
                <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                </div>
                <div>
                  <p className="text-xs font-black text-green-800 dark:text-green-400 uppercase tracking-tight">Sincronização Concluída</p>
                  <p className="text-[10px] font-bold text-green-600/70 dark:text-green-400/70 uppercase">{clientsList.length} clientes atualizados na base de dados</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={!done}
              className="w-full py-4 bg-gray-900 hover:bg-black disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl active:scale-[0.98]"
            >
              Fechar Janela
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BulkAssignmentModal;
