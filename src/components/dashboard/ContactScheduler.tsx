import React, { useMemo, useState } from "react";
import {
  Search,
  Calendar,
  Clock,
  Save,
  X,
  CheckSquare,
  Square,
  AlertCircle,
  CheckCircle,
  Users,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useCollection } from "../../contexts/CollectionContext";
import { todayLocalStr } from "../../config/visitStatus";
import { documentoCombina } from "../../filters/documento";
import { ScheduledVisit, ScheduledVisitChannel } from "../../types";

interface ContactSchedulerProps {
  /** Cobrador para quem os contatos serão agendados. */
  collectorId: string;
  /**
   * Presente quando aberto como modal (gestor, a partir do Resumo por
   * Cobrador). Ausente = página própria do menu lateral do cobrador.
   */
  onClose?: () => void;
}

const CLIENTS_PER_PAGE = 25;

// Agendamento em MASSA de contato (ligação/WhatsApp) para o cobrador de
// carteira (interno/terceirizado/jurídico) -- equivalente funcional ao
// VisitScheduler do externo (mesma scheduleVisit/scheduled_visits por
// baixo, mesmos indicadores do gestor), mas sem herdar a complexidade de
// rota/mapa/endereço: so filtra por nome/documento/cidade e agenda a mesma
// data/hora para todos os selecionados. Ver docs/plans (plano salvo desta
// feature) e LogContactModal ("Atender", etapa 2: agendamento individual
// de um contato pontual).
const ContactScheduler: React.FC<ContactSchedulerProps> = ({
  collectorId,
  onClose,
}) => {
  const { user } = useAuth();
  const { getClientGroups, scheduleVisit, scheduledVisits, users } =
    useCollection();

  const collectorName = useMemo(
    () => users.find((u) => u.id === collectorId)?.name,
    [users, collectorId],
  );

  const allClients = getClientGroups(collectorId);

  // Mesma regra do índice único do banco (uniq_active_visit_per_client):
  // cliente com contato ativo (qualquer canal) não pode ser selecionado de
  // novo -- primeiro precisa concluir ou reagendar o que já existe.
  const scheduledDocuments = useMemo(() => {
    const set = new Set<string>();
    scheduledVisits.forEach((v) => {
      if (v.collectorId === collectorId && v.status === "agendada") {
        set.add(v.clientDocument);
      }
    });
    return set;
  }, [scheduledVisits, collectorId]);

  const selectableClients = useMemo(
    () => allClients.filter((c) => !scheduledDocuments.has(c.document)),
    [allClients, scheduledDocuments],
  );

  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [page, setPage] = useState(1);

  const cities = useMemo(
    () =>
      Array.from(
        new Set(selectableClients.map((c) => c.city).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [selectableClients],
  );

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return selectableClients.filter((c) => {
      if (cityFilter && c.city !== cityFilter) return false;
      if (!term) return true;
      return (
        c.client.toLowerCase().includes(term) ||
        Boolean(c.razaoSocial?.toLowerCase().includes(term)) ||
        documentoCombina(c.document, term) ||
        Boolean(c.codigoErp?.includes(term))
      );
    });
  }, [selectableClients, search, cityFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredClients.length / CLIENTS_PER_PAGE),
  );
  const paginatedClients = filteredClients.slice(
    (page - 1) * CLIENTS_PER_PAGE,
    page * CLIENTS_PER_PAGE,
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOne = (doc: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) next.delete(doc);
      else next.add(doc);
      return next;
    });
  };

  const allFilteredSelected =
    filteredClients.length > 0 &&
    filteredClients.every((c) => selected.has(c.document));

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredClients.forEach((c) => next.delete(c.document));
      } else {
        filteredClients.forEach((c) => next.add(c.document));
      }
      return next;
    });
  };

  const [channel, setChannel] = useState<ScheduledVisitChannel>("ligacao");
  const [date, setDate] = useState(todayLocalStr());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    errors: string[];
  } | null>(null);

  const handleSubmit = async () => {
    if (selected.size === 0 || !date || submitting) return;
    setSubmitting(true);
    setResult(null);

    let success = 0;
    const errors: string[] = [];
    const clientsByDoc = new Map(allClients.map((c) => [c.document, c]));

    // Sequencial (nao Promise.all): mesmo padrao do VisitScheduler -- evita
    // corrida excessiva contra o indice unico do banco e mantem a contagem
    // de sucesso/erro simples de acompanhar.
    for (const doc of selected) {
      const client = clientsByDoc.get(doc);
      if (!client) continue;
      try {
        await scheduleVisit({
          collectorId,
          clientDocument: client.document,
          clientName: client.client,
          scheduledDate: date,
          scheduledTime: time || undefined,
          status: "agendada",
          notes: notes.trim() || undefined,
          channel,
          scheduled_by_manager_id:
            user?.type === "manager" ? user.id : undefined,
        } as Omit<ScheduledVisit, "id" | "createdAt">);
        success++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(
          `${client.client}: ${
            message.includes("duplicate key") || message.includes("unique")
              ? "já tem um contato agendado em aberto"
              : message
          }`,
        );
      }
    }

    setSubmitting(false);
    setSelected(new Set());
    setResult({ success, errors });
  };

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Agendamento em Massa
          </h2>
          {collectorName && (
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              Cobrador: {collectorName}
            </p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      {result && (
        <div
          className={`p-3 rounded-xl text-sm flex items-start gap-2 ${
            result.errors.length === 0
              ? "bg-green-50 border border-green-100 text-green-700"
              : "bg-amber-50 border border-amber-100 text-amber-700"
          }`}
        >
          {result.errors.length === 0 ? (
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div>
            <p className="font-bold">
              {result.success}{" "}
              {result.success === 1 ? "contato agendado" : "contatos agendados"}
              {result.errors.length > 0 && `, ${result.errors.length} com erro`}
            </p>
            {result.errors.length > 0 && (
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nome, razão social, CPF/CNPJ ou código..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
            />
          </div>
          <select
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
          >
            <option value="">Todas as cidades</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={toggleAllFiltered}
            className="flex items-center gap-2 text-indigo-600 font-bold hover:text-indigo-700"
          >
            {allFilteredSelected ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {allFilteredSelected
              ? "Desmarcar todos filtrados"
              : `Selecionar todos filtrados (${filteredClients.length})`}
          </button>
          <span className="text-gray-500 dark:text-dark-text-secondary font-bold">
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
        </div>

        <div className="border border-gray-100 dark:border-dark-border rounded-xl divide-y divide-gray-100 dark:divide-dark-border max-h-96 overflow-y-auto">
          {paginatedClients.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">
              Nenhum cliente disponível para agendar (todos já têm contato
              agendado, ou nenhum resultado para o filtro).
            </p>
          ) : (
            paginatedClients.map((c) => (
              <label
                key={c.document}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-bg-secondary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.document)}
                  onChange={() => toggleOne(c.document)}
                  className="w-4 h-4 accent-indigo-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 dark:text-dark-text truncate">
                    {c.client}
                  </p>
                  {c.razaoSocial && (
                    <p
                      className="text-[11px] text-gray-500 dark:text-dark-text-secondary truncate"
                      title={`Razão social: ${c.razaoSocial}`}
                    >
                      {c.razaoSocial}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {c.document}
                    {c.codigoErp ? ` • Cód. ${c.codigoErp}` : ""}
                    {c.city ? ` • ${c.city}` : ""}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 font-bold border border-gray-200 rounded-lg disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 font-bold border border-gray-200 rounded-lg disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400">Canal</label>
          <div className="flex gap-2">
            {(["ligacao", "whatsapp"] as ScheduledVisitChannel[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`flex-1 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all ${
                  channel === c
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-dark-bg-secondary dark:border-dark-border"
                }`}
              >
                {c === "ligacao" ? "Ligação" : "WhatsApp"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400">
              Data (pra todos selecionados)
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={todayLocalStr()}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400">
              Horário (opcional)
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400">
            Observação (opcional, igual pra todos)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all resize-none dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.size === 0 || !date || submitting}
          className="w-full px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              Agendar {selected.size > 0 ? `(${selected.size})` : ""}
            </>
          )}
        </button>
      </div>
    </div>
  );

  // Modal (gestor, via Resumo por Cobrador): o chamador ja envolve em
  // overlay fixo, aqui so o cartao de conteudo. Pagina propria (cobrador):
  // sem moldura extra, o layout da aba ja cuida disso.
  if (!onClose) return <div className="p-4 sm:p-6">{content}</div>;
  return (
    <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
      {content}
    </div>
  );
};

export default ContactScheduler;
