import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Download,
  ChevronDown,
  ChevronRight,
  Users,
  ArrowRightLeft,
  UserPlus,
  Loader2,
} from "lucide-react";
import { Modal } from "../Modal";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { User } from "../../types";

interface AssignmentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
}

// Espelha a tabela atribuicoes_historico (1 registro por cliente por evento).
interface AssignmentRecord {
  id: string;
  documento: string;
  cliente_nome: string | null;
  nome_da_loja: string | null;
  cobrador_novo_id: string;
  cobrador_anterior_id: string | null;
  gerente_id: string;
  assigned_at: string;
}

// Um "evento" de atribuição = um lote gravado numa única transação da RPC.
// Como o now() é constante por transação, todas as linhas do lote compartilham
// o mesmo assigned_at; por isso a chave do evento é assigned_at + cobrador novo.
interface AssignmentEvent {
  key: string;
  assignedAt: string;
  collectorId: string;
  gerenteId: string;
  total: number;
  novos: number;
  transferidos: number;
  clients: AssignmentRecord[];
}

const toLocalISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const AssignmentReportModal: React.FC<AssignmentReportModalProps> = ({
  isOpen,
  onClose,
  users,
}) => {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalISODate(d);
  });
  const [dateTo, setDateTo] = useState(() => toLocalISODate(new Date()));
  const [collectorId, setCollectorId] = useState<string>("");
  const [records, setRecords] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Mapa id -> nome para resolver cobradores e gestores.
  const userName = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.name));
    return (id: string | null | undefined) =>
      id && map.has(id) ? map.get(id)! : "—";
  }, [users]);

  const collectorOptions = useMemo(
    () =>
      users
        .filter((u) => u.type !== "manager")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setExpandedKey(null);

      // Janela [from 00:00, to+1 00:00) em horário local, convertida para ISO.
      const fromIso = new Date(`${dateFrom}T00:00:00`).toISOString();
      const toExclusive = new Date(`${dateTo}T00:00:00`);
      toExclusive.setDate(toExclusive.getDate() + 1);
      const toIso = toExclusive.toISOString();

      const rows = await fetchAllRows<AssignmentRecord>(
        (from, to) => {
          let q = supabase
            .from("atribuicoes_historico")
            .select("*")
            .gte("assigned_at", fromIso)
            .lt("assigned_at", toIso);
          if (collectorId) q = q.eq("cobrador_novo_id", collectorId);
          return q
            .order("assigned_at", { ascending: false })
            .range(from, to);
        },
        () => cancelled,
      );

      if (!cancelled) {
        setRecords(rows);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, dateFrom, dateTo, collectorId]);

  const events = useMemo<AssignmentEvent[]>(() => {
    const map = new Map<string, AssignmentEvent>();
    records.forEach((r) => {
      const key = `${r.assigned_at}|${r.cobrador_novo_id}`;
      let ev = map.get(key);
      if (!ev) {
        ev = {
          key,
          assignedAt: r.assigned_at,
          collectorId: r.cobrador_novo_id,
          gerenteId: r.gerente_id,
          total: 0,
          novos: 0,
          transferidos: 0,
          clients: [],
        };
        map.set(key, ev);
      }
      ev.total += 1;
      if (r.cobrador_anterior_id) ev.transferidos += 1;
      else ev.novos += 1;
      ev.clients.push(r);
    });
    return Array.from(map.values()).sort((a, b) =>
      b.assignedAt.localeCompare(a.assignedAt),
    );
  }, [records]);

  const handleExport = () => {
    const rows = records.map((r) => ({
      Data: formatDateTime(r.assigned_at),
      Cobrador: userName(r.cobrador_novo_id),
      Gestor: userName(r.gerente_id),
      Cliente: r.cliente_nome || "—",
      Documento: r.documento,
      Loja: r.nome_da_loja || "—",
      "Cobrador Anterior": r.cobrador_anterior_id
        ? userName(r.cobrador_anterior_id)
        : "Sem cobrador",
      Tipo: r.cobrador_anterior_id ? "Transferido" : "Novo na carteira",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atribuicoes");
    XLSX.writeFile(wb, `relatorio_atribuicoes_${dateFrom}_a_${dateTo}.xlsx`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Relatório de Atribuições"
      size="4xl"
      tallHeight
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-200 dark:border-dark-border shrink-0">
          <div className="flex flex-col">
            <label className="text-[10px] font-black tracking-wide text-gray-400 mb-1">
              De
            </label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-black tracking-wide text-gray-400 mb-1">
              Até
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm"
            />
          </div>
          <div className="flex flex-col min-w-[180px] flex-1">
            <label className="text-[10px] font-black tracking-wide text-gray-400 mb-1">
              Cobrador
            </label>
            <select
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm"
            >
              <option value="">Todos os cobradores</option>
              {collectorOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExport}
            disabled={records.length === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>
        </div>

        {/* Resumo */}
        <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-dark-bg text-xs font-bold text-gray-600 dark:text-dark-text-secondary shrink-0">
          <span>{events.length} evento(s)</span>
          <span>•</span>
          <span>{records.length} cliente(s) atribuído(s) no período</span>
        </div>

        {/* Lista de eventos */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Carregando...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-dark-text-secondary text-sm">
              Nenhuma atribuição encontrada no período selecionado.
            </div>
          ) : (
            events.map((ev) => {
              const isOpenRow = expandedKey === ev.key;
              return (
                <div
                  key={ev.key}
                  className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedKey(isOpenRow ? null : ev.key)
                    }
                    className="w-full flex items-center justify-between gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpenRow ? (
                        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 dark:text-dark-text truncate">
                          {userName(ev.collectorId)}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-dark-text-secondary">
                          {formatDateTime(ev.assignedAt)} · Gestor:{" "}
                          {userName(ev.gerenteId)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                        <Users className="h-3 w-3" />
                        {ev.total}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                        <UserPlus className="h-3 w-3" />
                        {ev.novos} novos
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                        <ArrowRightLeft className="h-3 w-3" />
                        {ev.transferidos} transf.
                      </span>
                    </div>
                  </button>

                  {isOpenRow && (
                    <div className="border-t border-gray-100 dark:border-dark-border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-dark-bg">
                          <tr className="text-[10px] tracking-wide text-gray-400">
                            <th className="px-3 py-2 text-left">Cliente</th>
                            <th className="px-3 py-2 text-left">Documento</th>
                            <th className="px-3 py-2 text-left">Loja</th>
                            <th className="px-3 py-2 text-left">
                              Cobrador anterior
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                          {ev.clients.map((c) => (
                            <tr key={c.id}>
                              <td className="px-3 py-2 text-gray-900 dark:text-dark-text">
                                {c.cliente_nome || "—"}
                              </td>
                              <td className="px-3 py-2 text-gray-500 dark:text-dark-text-secondary">
                                {c.documento}
                              </td>
                              <td className="px-3 py-2 text-gray-500 dark:text-dark-text-secondary">
                                {c.nome_da_loja || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {c.cobrador_anterior_id ? (
                                  <span className="text-amber-700 dark:text-amber-400">
                                    {userName(c.cobrador_anterior_id)}
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 dark:text-emerald-400">
                                    Sem cobrador (novo)
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};

export default AssignmentReportModal;
