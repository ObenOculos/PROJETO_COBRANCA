import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { comRetentativa } from "../../utils/supabaseRetry";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { Database } from "../../types/database.types";

type Conferencia = Database["public"]["Tables"]["vendas_conferencia"]["Row"];

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Gestor: vendas que o cobrador registrou no Atender como "Cliente informa
 * venda cancelada" (migration 20261110000008). As parcelas em aberto ja
 * sairam da carteira; aqui o gestor confirma o cancelamento (cancela a
 * venda, como no cancelamento manual) ou devolve ao cobrador. So aparece
 * quando ha pendencia.
 */
const VendasAguardandoConferencia: React.FC = () => {
  const { users, clientesRegistry, collectionsRequested, refreshCollections } =
    useCollection();
  const [pendentes, setPendentes] = useState<Conferencia[]>([]);
  const [aberto, setAberto] = useState(true);
  const [decidindo, setDecidindo] = useState<{
    id: string;
    decisao: "confirmar" | "devolver";
  } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await comRetentativa(() =>
      supabase
        .from("vendas_conferencia")
        .select("*")
        .eq("status", "pendente")
        .order("informado_em", { ascending: true })
        .order("id", { ascending: true }),
    );
    if (error) {
      // Sem a migration (ou falha): o painel so nao aparece.
      console.warn("Vendas aguardando conferência indisponíveis:", error);
      return;
    }
    setPendentes((data ?? []) as Conferencia[]);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nome = (id: string | null) =>
    (id && users.find((u) => u.id === id)?.name) || "—";

  const decidir = async () => {
    if (!decidindo) return;
    if (!motivo.trim()) {
      setErro("Informe o motivo da decisão.");
      return;
    }
    setSalvando(true);
    setErro("");
    const { error } = await supabase.rpc("decidir_venda_cancelada", {
      p_conferencia_id: decidindo.id,
      p_decisao: decidindo.decisao,
      p_motivo: motivo.trim(),
    });
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setDecidindo(null);
    setMotivo("");
    await carregar();
    if (collectionsRequested) void refreshCollections();
  };

  if (pendentes.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200 dark:border-amber-900/40 p-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5" />
          Vendas aguardando conferência ({pendentes.length})
        </span>
        {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {aberto && (
        <>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            O cliente informou no atendimento que a venda foi cancelada. As
            parcelas já saíram da carteira do cobrador. Confirme o cancelamento
            (lembre o financeiro de cancelar também no Ciclone) ou devolva ao
            cobrador.
          </p>
          <ul className="mt-3 space-y-2">
            {pendentes.map((c) => {
              const cliente = clientesRegistry.get(c.documento);
              const emDecisao = decidindo?.id === c.id;
              return (
                <li
                  key={c.id}
                  className="bg-white dark:bg-dark-bg rounded-xl border border-amber-100 dark:border-dark-border p-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-dark-text truncate">
                        {cliente?.nome || c.documento}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c.documento} ·{" "}
                        {c.chave_venda === 0 ? "parcelas avulsas" : `Venda #${c.chave_venda}`} ·{" "}
                        {c.parcelas.length} parcela{c.parcelas.length !== 1 ? "s" : ""} ·{" "}
                        <span className="font-semibold">{formatCurrency(Number(c.valor_em_aberto))}</span>{" "}
                        em aberto
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Informado por {nome(c.informado_por)} em {dataHora(c.informado_em)}
                        {c.cobrador_id && c.cobrador_id !== c.informado_por
                          ? ` · carteira de ${nome(c.cobrador_id)}`
                          : ""}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-dark-text mt-1 whitespace-pre-wrap">
                        “{c.observacao}”
                      </p>
                    </div>
                    {!emDecisao && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDecidindo({ id: c.id, decisao: "confirmar" });
                            setMotivo("");
                            setErro("");
                          }}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700"
                        >
                          <CheckCircle className="h-4 w-4" /> Confirmar cancelamento
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecidindo({ id: c.id, decisao: "devolver" });
                            setMotivo("");
                            setErro("");
                          }}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:text-dark-text dark:border-dark-border"
                        >
                          <Undo2 className="h-4 w-4" /> Devolver ao cobrador
                        </button>
                      </div>
                    )}
                  </div>
                  {emDecisao && (
                    <div className="mt-3 space-y-2">
                      <label className="text-xs font-bold text-gray-500">
                        {decidindo?.decisao === "confirmar"
                          ? "Motivo / conferência do cancelamento (obrigatório)"
                          : "Por que volta para a carteira? (obrigatório)"}
                      </label>
                      <textarea
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                        autoFocus
                      />
                      {erro && <p className="text-xs text-red-600">{erro}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={decidir}
                          disabled={salvando}
                          className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg text-white disabled:opacity-50 ${
                            decidindo?.decisao === "confirmar"
                              ? "bg-red-600 hover:bg-red-700"
                              : "bg-blue-600 hover:bg-blue-700"
                          }`}
                        >
                          {salvando
                            ? "Salvando..."
                            : decidindo?.decisao === "confirmar"
                              ? "Cancelar a venda"
                              : "Devolver as parcelas ao cobrador"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecidindo(null);
                            setErro("");
                          }}
                          disabled={salvando}
                          className="px-3 py-2 text-xs font-bold text-gray-500"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default VendasAguardandoConferencia;
