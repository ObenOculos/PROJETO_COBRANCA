import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { ClientGroup } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import {
  DIAS_DIVERGENCIA_ATRASADA,
  ERP_LABEL,
} from "../../config/divergencias";
import {
  LinhaDivergenciaCancelamento,
  carregarDivergenciasCancelamento,
  mensagemErroDivergencia,
  reabrirVendaCancelada,
} from "../../utils/divergencias";
import ClientDetailModal from "./ClientDetailModal";

// Item 89 (2026-11-24): divergencias entre o app e o ERP -- comeca pelo
// cancelamento de venda. Venda cancelada no app vale ate o ERP confirmar; o
// sync do Ciclone nao desfaz e registra o que o ERP mostra. Aqui o gestor ve
// a historia de cada venda (quem cancelou no app, quando, desde quando o ERP
// segue aberto) para saber onde ficou a falha, e pode reabrir no app.

type Grupo = "atrasadas" | "recentes" | "sem_conferencia" | "resolvidas";

const GRUPOS: { key: Grupo; label: string }[] = [
  { key: "atrasadas", label: `Atrasadas (+${DIAS_DIVERGENCIA_ATRASADA} dias)` },
  { key: "recentes", label: "Recentes" },
  { key: "sem_conferencia", label: "Sem conferência" },
  { key: "resolvidas", label: "Resolvidas" },
];

const dataBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
const dataHoraBR = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const diasDesde = (iso: string, ate: number = Date.now()) =>
  Math.max(0, Math.floor((ate - new Date(iso).getTime()) / 86_400_000));

const grupoDe = (l: LinhaDivergenciaCancelamento): Grupo => {
  if (l.reaberta_em || l.confirmado_em) return "resolvidas";
  if (!l.status_erp) return "sem_conferencia";
  return diasDesde(l.cancelado_em) > DIAS_DIVERGENCIA_ATRASADA
    ? "atrasadas"
    : "recentes";
};

const PainelDivergencias: React.FC = () => {
  const { getClientGroups, refreshCollections } = useCollection();
  const [linhas, setLinhas] = useState<LinhaDivergenciaCancelamento[] | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<Grupo>("atrasadas");
  const [reabrindo, setReabrindo] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ficha, setFicha] = useState<ClientGroup | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setLinhas(await carregarDivergenciasCancelamento());
    } catch (e) {
      console.error("Erro ao carregar divergências:", e);
      setErro(mensagemErroDivergencia(e));
      setLinhas([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porGrupo = useMemo(() => {
    const m = new Map<Grupo, LinhaDivergenciaCancelamento[]>(
      GRUPOS.map((g) => [g.key, []]),
    );
    (linhas ?? []).forEach((l) => m.get(grupoDe(l))?.push(l));
    return m;
  }, [linhas]);

  // Abre no primeiro grupo com algo, na primeira carga.
  useEffect(() => {
    if (!linhas) return;
    if ((porGrupo.get(grupo) ?? []).length === 0) {
      const primeiro = GRUPOS.find(
        (g) => (porGrupo.get(g.key) ?? []).length > 0,
      );
      if (primeiro) setGrupo(primeiro.key);
    }
    // so na carga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas]);

  const lista = porGrupo.get(grupo) ?? [];

  const abrirFicha = (documento: string) => {
    const g = getClientGroups().find((c) => c.document === documento);
    if (g) setFicha(g);
  };

  const confirmarReabertura = async (l: LinhaDivergenciaCancelamento) => {
    if (!motivo.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await reabrirVendaCancelada(l.venda_cancelada_id, motivo.trim());
      setAviso(
        `Venda ${l.chave_venda} de ${l.cliente ?? l.documento} reaberta: volta para a cobrança.`,
      );
      setReabrindo(null);
      setMotivo("");
      await Promise.all([carregar(), refreshCollections()]);
    } catch (e) {
      setErro(mensagemErroDivergencia(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <GitCompareArrows className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-indigo-600 flex-shrink-0" />
          Divergências app × ERP
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
          Vendas canceladas no app que o ERP ainda não cancelou. No app elas
          continuam canceladas; o sync confere o ERP a cada rodada e resolve
          sozinho quando o ERP cancelar.
        </p>
      </div>

      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {aviso}
        </p>
      )}

      <div
        role="tablist"
        className="flex gap-1.5 overflow-x-auto text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GRUPOS.map((g) => {
          const n = (porGrupo.get(g.key) ?? []).length;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={grupo === g.key}
              onClick={() => setGrupo(g.key)}
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full border font-medium transition-colors ${
                grupo === g.key
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              } ${g.key === "atrasadas" && n > 0 && grupo !== g.key ? "text-red-600 border-red-200" : ""}`}
            >
              {g.label} ({n})
            </button>
          );
        })}
      </div>

      {linhas === null ? (
        <p className="text-sm text-gray-500 animate-pulse">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          {grupo === "resolvidas"
            ? "Nenhuma divergência resolvida ainda."
            : "Nenhuma divergência aqui."}
        </p>
      ) : (
        <ul className="space-y-2">
          {lista.map((l) => {
            const dias = diasDesde(l.cancelado_em);
            const erp = l.erp ? ERP_LABEL[l.erp] ?? l.erp : "ERP";
            const resolvida = !!(l.reaberta_em || l.confirmado_em);
            return (
              <li
                key={l.venda_cancelada_id}
                className="rounded-xl bg-gray-50 dark:bg-dark-bg px-3 py-3 space-y-1.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => abrirFicha(l.documento)}
                      className="text-sm font-semibold text-gray-900 dark:text-dark-text hover:text-blue-600 text-left"
                      title="Abrir a ficha do cliente"
                    >
                      {l.cliente ?? l.documento}
                    </button>
                    <div className="text-xs text-gray-500">
                      Venda {l.chave_venda} · {l.parcelas} parcela
                      {l.parcelas !== 1 ? "s" : ""} ·{" "}
                      {formatCurrency(Number(l.valor_em_aberto) || 0)} em aberto
                      ao cancelar
                    </div>
                  </div>
                  {!resolvida && (
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        dias > DIAS_DIVERGENCIA_ATRASADA
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      Divergente há {dias} dia{dias !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* A historia, lado do app e lado do ERP. */}
                <div className="text-xs text-gray-700 dark:text-dark-text-secondary space-y-0.5">
                  <p>
                    <span className="font-medium text-gray-900 dark:text-dark-text">
                      App:
                    </span>{" "}
                    cancelada em {dataBR(l.cancelado_em)}
                    {l.cancelado_por ? ` por ${l.cancelado_por}` : ""} — “
                    {l.motivo}”
                  </p>
                  <p>
                    <span className="font-medium text-gray-900 dark:text-dark-text">
                      {erp}:
                    </span>{" "}
                    {l.confirmado_em ? (
                      <span className="text-emerald-700">
                        confirmou o cancelamento em {dataBR(l.confirmado_em)} (
                        {diasDesde(
                          l.cancelado_em,
                          new Date(l.confirmado_em).getTime(),
                        )}{" "}
                        dias depois)
                      </span>
                    ) : !l.status_erp ? (
                      <span className="text-gray-500">
                        sem conferência automática ainda (venda fora do
                        Ciclone ou o sync ainda não rodou)
                      </span>
                    ) : l.status_erp === "pago" ? (
                      <span className="text-amber-800">
                        mostra a venda como paga, não cancelada · conferido{" "}
                        {dataHoraBR(l.conferido_em)}
                      </span>
                    ) : (
                      <span className="text-red-700">
                        ainda em aberto
                        {l.em_aberto_desde
                          ? ` (visto aberto desde ${dataBR(l.em_aberto_desde)})`
                          : ""}{" "}
                        · conferido {dataHoraBR(l.conferido_em)}
                      </span>
                    )}
                  </p>
                  {l.reaberta_em && (
                    <p>
                      <span className="font-medium text-gray-900 dark:text-dark-text">
                        Reaberta:
                      </span>{" "}
                      em {dataBR(l.reaberta_em)}
                      {l.reaberta_por ? ` por ${l.reaberta_por}` : ""} — “
                      {l.reaberta_motivo}”
                    </p>
                  )}
                </div>

                {l.pode_reabrir &&
                  (reabrindo === l.venda_cancelada_id ? (
                    <div className="pt-1 space-y-2">
                      <textarea
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        rows={2}
                        autoFocus
                        placeholder="Por que reabrir? Ex.: cancelei por engano, a venda segue valendo no ERP"
                        className="w-full rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg px-2 py-1.5 text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReabrindo(null);
                            setMotivo("");
                          }}
                          className="px-3 h-8 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          disabled={!motivo.trim() || salvando}
                          onClick={() => void confirmarReabertura(l)}
                          className="px-3 h-8 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
                        >
                          {salvando ? "Reabrindo…" : "Reabrir no app"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setReabrindo(l.venda_cancelada_id);
                          setMotivo("");
                        }}
                        className="px-3 h-8 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-sm font-medium text-gray-700 dark:text-dark-text hover:bg-gray-100"
                        title="Desfaz o cancelamento no app (fica registrado); a venda volta para a cobrança"
                      >
                        Reabrir no app
                      </button>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {ficha && (
        <ClientDetailModal
          clientGroup={ficha}
          userType="manager"
          onClose={() => setFicha(null)}
        />
      )}
    </div>
  );
};

export default PainelDivergencias;
