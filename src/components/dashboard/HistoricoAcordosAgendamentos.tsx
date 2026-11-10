import React, { useEffect, useMemo, useState } from "react";
import { CalendarX, Handshake } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { comRetentativa } from "../../utils/supabaseRetry";
import { formatCurrency } from "../../utils/formatters";
import { ScheduledVisit, User } from "../../types";

// Eventos de acordo (criado, cancelado, quebrado, cumprido) e de contato/
// visita agendado que foi cancelado -- o que o "Histórico de Contatos" não
// mostrava (item 22). Só leitura do que já está gravado: a linha do acordo
// (status, motivo, datas, encargos reimputados) e a do agendamento (motivo
// do cancelamento). Pagamentos de parcela aparecem no histórico de
// recebimentos, logo abaixo na ficha.

interface AcordoLinha {
  id: string;
  status: string;
  valor_negociado: number;
  numero_parcelas: number;
  created_at: string;
  resolved_at: string | null;
  motivo_cancelamento: string | null;
  collector_id: string;
  created_by_id: string | null;
  encargos_reimputados: number | null;
}

type Evento =
  | { tipo: "acordo_criado"; quando: string; acordo: AcordoLinha }
  | { tipo: "acordo_fim"; quando: string; acordo: AcordoLinha }
  | { tipo: "agendamento_cancelado"; quando: string; visita: ScheduledVisit };

const CANAL: Record<string, string> = {
  presencial: "Visita",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
};

const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

interface Props {
  clientDocument: string;
  users: User[];
  scheduledVisits: ScheduledVisit[];
}

const HistoricoAcordosAgendamentos: React.FC<Props> = ({
  clientDocument,
  users,
  scheduledVisits,
}) => {
  const [acordos, setAcordos] = useState<AcordoLinha[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setErro(false);
    void (async () => {
      const { data, error } = await comRetentativa(() =>
        supabase
          .from("acordos")
          .select(
            "id, status, valor_negociado, numero_parcelas, created_at, resolved_at, motivo_cancelamento, collector_id, created_by_id, encargos_reimputados",
          )
          .eq("client_document", clientDocument)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      );
      if (cancelado) return;
      if (error) {
        console.error("Erro ao carregar acordos do cliente:", error);
        setErro(true);
        return;
      }
      setAcordos((data ?? []) as AcordoLinha[]);
    })();
    return () => {
      cancelado = true;
    };
  }, [clientDocument]);

  const nome = (id: string | null | undefined) =>
    (id && users.find((u) => u.id === id)?.name) || "usuário não identificado";

  const eventos = useMemo<Evento[]>(() => {
    const lista: Evento[] = [];
    acordos.forEach((a) => {
      lista.push({ tipo: "acordo_criado", quando: a.created_at, acordo: a });
      if (a.status !== "ativo" && a.resolved_at) {
        lista.push({ tipo: "acordo_fim", quando: a.resolved_at, acordo: a });
      }
    });
    scheduledVisits
      .filter(
        (v) => v.clientDocument === clientDocument && v.status === "cancelada",
      )
      .forEach((v) =>
        lista.push({
          tipo: "agendamento_cancelado",
          quando: v.cancellationApprovedAt || v.updatedAt || v.createdAt,
          visita: v,
        }),
      );
    return lista.sort(
      (a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime(),
    );
  }, [acordos, scheduledVisits, clientDocument]);

  if (erro) {
    return (
      <p className="text-sm text-red-600">
        Não foi possível carregar os acordos deste cliente. Feche e abra a
        ficha de novo.
      </p>
    );
  }
  if (eventos.length === 0) return null;

  const renderEvento = (ev: Evento) => {
    if (ev.tipo === "acordo_criado") {
      const a = ev.acordo;
      const emNome =
        a.created_by_id && a.created_by_id !== a.collector_id
          ? ` (em nome de ${nome(a.collector_id)})`
          : "";
      return (
        <>
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <Handshake className="h-4 w-4 text-amber-600" />
            Acordo criado
          </p>
          <p className="text-xs text-gray-700 mt-1 ml-6">
            {formatCurrency(a.valor_negociado)} em {a.numero_parcelas}{" "}
            parcela{a.numero_parcelas !== 1 ? "s" : ""} — por{" "}
            {nome(a.created_by_id ?? a.collector_id)}
            {emNome}
          </p>
        </>
      );
    }
    if (ev.tipo === "acordo_fim") {
      const a = ev.acordo;
      const titulo =
        a.status === "cancelado"
          ? "Acordo cancelado"
          : a.status === "quebrado"
            ? "Acordo quebrado (atraso)"
            : a.status === "cumprido"
              ? "Acordo cumprido"
              : `Acordo ${a.status}`;
      const cor =
        a.status === "cumprido"
          ? "text-emerald-600"
          : a.status === "cancelado"
            ? "text-gray-500"
            : "text-red-600";
      return (
        <>
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <Handshake className={`h-4 w-4 ${cor}`} />
            {titulo}
          </p>
          {a.motivo_cancelamento?.trim() && (
            <p className="text-xs text-gray-700 mt-1 ml-6 whitespace-pre-wrap">
              Motivo: {a.motivo_cancelamento.trim()}
            </p>
          )}
          {a.status === "cancelado" && (a.encargos_reimputados ?? 0) > 0 && (
            <p className="text-xs text-gray-500 mt-0.5 ml-6">
              Juros já pagos no acordo ({formatCurrency(a.encargos_reimputados ?? 0)})
              passaram a abater a dívida original.
            </p>
          )}
        </>
      );
    }
    const v = ev.visita;
    return (
      <>
        <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <CalendarX className="h-4 w-4 text-gray-500" />
          {CANAL[v.channel ?? "presencial"] ?? "Agendamento"} agendado cancelado
        </p>
        <p className="text-xs text-gray-700 mt-1 ml-6">
          Era para {v.scheduledDate.split("-").reverse().join("/")} —{" "}
          {nome(v.collectorId)}
        </p>
        {v.cancellationRequestReason?.trim() && (
          <p className="text-xs text-gray-500 mt-0.5 ml-6 whitespace-pre-wrap">
            Motivo: {v.cancellationRequestReason.trim()}
          </p>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
        <Handshake className="h-5 w-5 mr-2 text-amber-600" />
        Acordos e agendamentos cancelados
      </h3>
      <ol className="space-y-3 max-h-80 overflow-y-auto pr-2">
        {eventos.map((ev, i) => (
          <li
            key={`${ev.tipo}-${i}`}
            className="bg-gray-50 p-4 rounded-2xl border border-gray-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{renderEvento(ev)}</div>
              <span className="text-[10px] text-gray-400 shrink-0">
                {dataHora(ev.quando)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default HistoricoAcordosAgendamentos;
