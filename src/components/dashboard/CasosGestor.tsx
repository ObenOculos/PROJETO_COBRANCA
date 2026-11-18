import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Hourglass,
  ListChecks,
  PhoneOff,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import SummaryCard from "../common/SummaryCard";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { Database } from "../../types/database.types";
import { MOTIVO_CASO_LABEL } from "../../config/reincidencia";
import { rescheduleReasonLabel } from "../../config/rescheduleReasons";

// Item 83: clientes reincidentes levados ao gestor -- remarcacao depois da
// 3a vez seguida, ou 5+ tentativas sem retorno reportadas pelo cobrador.
// O gestor mantem (no limite de remarcacao, a remarcacao pedida e aplicada)
// ou manda para o SPC ('Aguardando Jurídico'). RPC decidir_caso_gestor.

type Caso = Database["public"]["Tables"]["casos_gestor"]["Row"];

/** Decididos que ainda aparecem na aba (dias). */
const DIAS_HISTORICO = 30;

const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

const CasosGestor: React.FC = () => {
  const { users, fetchScheduledVisits, refreshCollections } = useCollection();
  const [casos, setCasos] = useState<Caso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [acao, setAcao] = useState<"manter" | "spc">("manter");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [secao, setSecao] = useState<"analise" | "decididos">("analise");

  const nomePorId = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );

  const carregar = useCallback(async () => {
    setErro(null);
    const desde = new Date(Date.now() - DIAS_HISTORICO * 86400000).toISOString();
    const { data, error } = await supabase
      .from("casos_gestor")
      .select("*")
      .or(`status.eq.pendente,decidido_em.gte.${desde}`)
      .order("criado_em", { ascending: false })
      .order("id");
    if (error) {
      console.error("Erro ao carregar casos de reincidência:", error);
      setErro(
        error.code === "42P01" || error.code === "PGRST205"
          ? "A tabela de casos ainda não existe no banco (falta aplicar a migration)."
          : error.message || "Falha ao carregar os casos.",
      );
      setCasos([]);
      return;
    }
    setCasos(data ?? []);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = (c: Caso, tipo: "manter" | "spc") => {
    setAberto(c.id);
    setAcao(tipo);
    setObservacao("");
    setErroAcao(null);
  };

  const decidir = async (c: Caso) => {
    setSalvando(true);
    setErroAcao(null);
    try {
      const { data, error } = await supabase.rpc("decidir_caso_gestor", {
        p_caso_id: c.id,
        p_decisao: acao,
        p_observacao: observacao.trim() || undefined,
      });
      if (error) throw error;
      const remarcou = !!(data as { remarcou?: boolean } | null)?.remarcou;
      const nome = c.cliente_nome ?? c.documento;
      setAviso(
        acao === "spc"
          ? `${nome} saiu da carteira e foi para o SPC (Aguardando Jurídico).`
          : remarcou
            ? `${nome} continua na carteira. Remarcado para ${dataBR(c.nova_data)}.`
            : `${nome} continua na carteira.`,
      );
      setAberto(null);
      await Promise.all([
        carregar(),
        fetchScheduledVisits(false),
        acao === "spc" ? refreshCollections() : Promise.resolve(),
      ]);
    } catch (e) {
      const msg = (e as { message?: string } | null)?.message;
      setErroAcao(msg || "Falha ao registrar a decisão.");
    } finally {
      setSalvando(false);
    }
  };

  const abertos = (casos ?? []).filter((c) => c.status === "pendente");
  const decididos = (casos ?? []).filter((c) => c.status !== "pendente");
  const qtdRemarcacao = abertos.filter(
    (c) => c.motivo === "limite_remarcacao",
  ).length;

  const descricao = (c: Caso) =>
    c.motivo === "limite_remarcacao"
      ? `Já remarcado ${c.quantidade}x seguidas. Pediu nova data: ${dataBR(c.nova_data)}${c.motivo_reagendamento ? ` (${rescheduleReasonLabel(c.motivo_reagendamento)})` : ""}.`
      : `${c.quantidade} tentativas de contato sem retorno, com pendência em aberto.`;

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <ShieldAlert className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-amber-600 flex-shrink-0" />
          Clientes reincidentes
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
          Remarcações depois da 3ª vez seguida e clientes com 5 ou mais
          tentativas sem retorno que o cobrador reportou. Decida se o cliente
          continua na carteira ou vai para o SPC.
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

      {casos === null ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Carregando…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SummaryCard
              selecionado={secao === "analise"}
              icon={Hourglass}
              title="Em análise"
              value={String(abertos.length)}
              valueTone={abertos.length > 0 ? "red" : "neutral"}
              caption={abertos.length === 1 ? "caso" : "casos"}
              rows={[
                { label: "Limite de remarcações", value: String(qtdRemarcacao) },
                {
                  label: "Tentativas sem retorno",
                  value: String(abertos.length - qtdRemarcacao),
                },
              ]}
              compact
              onClick={() => setSecao("analise")}
              hint="Mostrar esta lista"
            />
            <SummaryCard
              selecionado={secao === "decididos"}
              icon={ListChecks}
              title={`Decididos (${DIAS_HISTORICO} dias)`}
              value={String(decididos.length)}
              valueTone="neutral"
              caption={decididos.length === 1 ? "caso" : "casos"}
              rows={[
                {
                  label: "Mantidos na carteira",
                  value: String(decididos.filter((c) => c.status === "mantido").length),
                  tone: "green",
                },
                {
                  label: "Mandados para o SPC",
                  value: String(decididos.filter((c) => c.status === "spc").length),
                },
              ]}
              compact
              onClick={() => setSecao("decididos")}
              hint="Mostrar esta lista"
            />
          </div>

          {secao === "analise" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                Em análise ({abertos.length})
              </h3>
              {abertos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-dark-border py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Nenhum caso esperando decisão.
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                  {abertos.map((c) => (
                    <div key={c.id} className="px-3 py-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                            {c.cliente_nome ?? "(sem nome)"}{" "}
                            <span className="text-xs font-normal text-gray-400">
                              {c.documento}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-dark-text-secondary">
                            {c.motivo === "limite_remarcacao" ? (
                              <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
                            ) : (
                              <PhoneOff className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            <span className="font-semibold">
                              {MOTIVO_CASO_LABEL[c.motivo] ?? c.motivo}
                            </span>
                            · {nomePorId.get(c.collector_id) ?? "Cobrador"} em{" "}
                            {new Date(c.atualizado_em).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </div>
                          <div className="text-sm text-gray-800 dark:text-dark-text">
                            {descricao(c)}
                          </div>
                          {c.observacao && (
                            <div className="text-sm text-gray-700 dark:text-dark-text italic">
                              “{c.observacao}”
                            </div>
                          )}
                        </div>
                        {aberto !== c.id && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => abrir(c, "manter")}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Manter na carteira
                            </button>
                            <button
                              onClick={() => abrir(c, "spc")}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Mandar para o SPC
                            </button>
                          </div>
                        )}
                      </div>

                      {aberto === c.id && (
                        <div className="rounded-lg border border-gray-200 dark:border-dark-border p-3 space-y-2">
                          <p className="text-xs text-gray-700 dark:text-dark-text">
                            {acao === "spc"
                              ? "O cliente sai da carteira do cobrador e vai para Aguardando Jurídico. O agendamento dele é encerrado."
                              : c.motivo === "limite_remarcacao"
                                ? `O cliente continua com o cobrador e o agendamento é remarcado para ${dataBR(c.nova_data)}.`
                                : "O cliente continua com o cobrador, que segue tentando."}
                          </p>
                          <label className="block">
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-dark-text-secondary">
                              Observação (opcional)
                            </span>
                            <input
                              type="text"
                              value={observacao}
                              onChange={(e) => setObservacao(e.target.value)}
                              className="mt-0.5 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </label>
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
                              onClick={() => void decidir(c)}
                              disabled={salvando}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
                                acao === "spc"
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-teal-600 hover:bg-teal-700"
                              }`}
                            >
                              {salvando
                                ? "Gravando…"
                                : acao === "spc"
                                  ? "Confirmar SPC"
                                  : "Confirmar"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {secao === "decididos" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                Decididos nos últimos {DIAS_HISTORICO} dias
              </h3>
              {decididos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-dark-border py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Nenhum caso decidido nos últimos {DIAS_HISTORICO} dias.
                </div>
              ) : (
                <ul className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                  {decididos.map((c) => (
                    <li
                      key={c.id}
                      className="px-3 py-2 text-xs text-gray-600 dark:text-dark-text-secondary"
                    >
                      <span
                        className={`font-semibold ${
                          c.status === "spc"
                            ? "text-red-600 dark:text-red-400"
                            : "text-teal-600 dark:text-teal-400"
                        }`}
                      >
                        {c.status === "spc" ? "SPC" : "Mantido"}
                      </span>{" "}
                      · {c.cliente_nome ?? c.documento} ·{" "}
                      {MOTIVO_CASO_LABEL[c.motivo] ?? c.motivo} ·{" "}
                      {nomePorId.get(c.collector_id) ?? "cobrador"} · decidido
                      por{" "}
                      {c.decidido_por
                        ? (nomePorId.get(c.decidido_por) ?? "gestor")
                        : "gestor"}{" "}
                      em {dataBR(c.decidido_em)}
                      {c.observacao_gestor && ` — ${c.observacao_gestor}`}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default CasosGestor;
