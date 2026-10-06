import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Camera,
  FileSpreadsheet,
  History,
  LogIn,
  LogOut,
  Smartphone,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { formatCurrency } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import { User } from "../../types";
import { Database } from "../../types/database.types";

// Linha do tempo do cliente a partir dos registros append-only do banco
// (migration 20261005000002): quem teve a carteira e quando, e cada mudanca de
// valor recebido/desconto com a origem. So leitura; nada aqui recalcula saldo.

type CarteiraRow = Database["public"]["Tables"]["atribuicoes_historico"]["Row"];
type RecebimentoRow =
  Database["public"]["Tables"]["recebimentos_historico"]["Row"];

interface PagamentoApp {
  id: string;
  collector_name: string | null;
  payment_method: string | null;
  payment_amount: number;
  payment_date: string | null;
}

type Evento =
  | { tipo: "carteira"; quando: string; row: CarteiraRow }
  | {
      tipo: "recebimento";
      quando: string;
      origem: RecebimentoRow["origem"];
      linhas: RecebimentoRow[];
      pagamento?: PagamentoApp;
    };

interface ClientHistoryViewerProps {
  clientDocument: string;
  users: User[];
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

const delta = (antes: number | null, depois: number | null) =>
  round2((depois ?? 0) - (antes ?? 0));

const ClientHistoryViewer: React.FC<ClientHistoryViewerProps> = ({
  clientDocument,
  users,
}) => {
  const [carteira, setCarteira] = useState<CarteiraRow[]>([]);
  const [recebimentos, setRecebimentos] = useState<RecebimentoRow[]>([]);
  const [pagamentos, setPagamentos] = useState<Map<string, PagamentoApp>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientDocument) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [carteiraRows, recebimentoRows] = await Promise.all([
        fetchAllRows<CarteiraRow>(
          (from, to) =>
            supabase
              .from("atribuicoes_historico")
              .select("*")
              .eq("documento", clientDocument)
              .order("assigned_at", { ascending: false })
              .order("id", { ascending: true })
              .range(from, to),
          () => cancelled,
        ),
        fetchAllRows<RecebimentoRow>(
          (from, to) =>
            supabase
              .from("recebimentos_historico")
              .select("*")
              .eq("documento", clientDocument)
              .order("registrado_em", { ascending: false })
              .order("id", { ascending: true })
              .range(from, to),
          () => cancelled,
        ),
      ]);

      // Quem registrou cada pagamento do app (merito do cobrador).
      const ids = [
        ...new Set(
          recebimentoRows
            .map((r) => r.sale_payment_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const pagamentosMap = new Map<string, PagamentoApp>();
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from("sale_payments")
          .select(
            "id, collector_name, payment_method, payment_amount, payment_date",
          )
          .in("id", ids);
        if (error) console.error("Erro ao buscar pagamentos do app:", error);
        (data ?? []).forEach((p) => pagamentosMap.set(p.id, p));
      }

      if (!cancelled) {
        setCarteira(carteiraRows);
        setRecebimentos(recebimentoRows);
        setPagamentos(pagamentosMap);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [clientDocument]);

  const userName = (id: string | null | undefined) => {
    if (!id) return null;
    return users.find((u) => u.id === id)?.name ?? "Usuário não identificado";
  };

  const eventos = useMemo<Evento[]>(() => {
    const lista: Evento[] = carteira.map((row) => ({
      tipo: "carteira",
      quando: row.assigned_at,
      row,
    }));

    // Um evento de recebimento = um pagamento do app, ou um mesmo instante de
    // gravacao (uma importacao/edicao, ou a foto inicial).
    const grupos = new Map<string, RecebimentoRow[]>();
    recebimentos.forEach((r) => {
      const chave = r.sale_payment_id
        ? `app|${r.sale_payment_id}`
        : `${r.origem}|${r.registrado_em}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(r);
    });
    grupos.forEach((linhas) => {
      const primeira = linhas[0];
      lista.push({
        tipo: "recebimento",
        quando: primeira.registrado_em,
        origem: primeira.origem,
        linhas,
        pagamento: primeira.sale_payment_id
          ? pagamentos.get(primeira.sale_payment_id)
          : undefined,
      });
    });

    return lista.sort((a, b) => b.quando.localeCompare(a.quando));
  }, [carteira, recebimentos, pagamentos]);

  const renderCarteira = (row: CarteiraRow) => {
    const anterior = userName(row.cobrador_anterior_id);
    const novo = userName(row.cobrador_novo_id);
    const quem = userName(row.gerente_id || null);
    const motivo = row.motivo ?? "";

    let icon = <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
    let titulo: string;
    if (!row.cobrador_novo_id) {
      icon = <LogOut className="h-4 w-4 text-red-600" />;
      if (motivo.startsWith("liberacao: ")) {
        titulo = `Liberado da carteira de ${anterior ?? "—"} → ${motivo.slice("liberacao: ".length)}`;
      } else if (motivo === "remocao") {
        titulo = `Removido da carteira de ${anterior ?? "—"}`;
      } else {
        titulo = `Saiu da carteira de ${anterior ?? "—"}`;
      }
    } else if (!row.cobrador_anterior_id) {
      icon = <LogIn className="h-4 w-4 text-green-600" />;
      titulo =
        motivo === "importacao"
          ? `Entrou na carteira de ${novo} (importação da planilha)`
          : `Entrou na carteira de ${novo}`;
    } else if (row.cobrador_anterior_id === row.cobrador_novo_id) {
      titulo = `Reatribuído a ${novo}`;
    } else {
      titulo = `Transferido de ${anterior} para ${novo}`;
    }

    return (
      <>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-gray-900">{titulo}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1 ml-6">
          {quem
            ? `Por ${quem}`
            : motivo.endsWith("sem_registro")
              ? "Sem registro de quem fez (caminho antigo do sistema)"
              : "Sem registro de quem fez"}
        </p>
      </>
    );
  };

  const renderRecebimento = (ev: Extract<Evento, { tipo: "recebimento" }>) => {
    const recebido = round2(
      ev.linhas.reduce(
        (s, r) => s + delta(r.recebido_antes, r.recebido_depois),
        0,
      ),
    );
    const desconto = round2(
      ev.linhas.reduce(
        (s, r) => s + delta(r.desconto_antes, r.desconto_depois),
        0,
      ),
    );
    const parcelas = new Set(ev.linhas.map((r) => r.id_parcela)).size;
    const donos = [
      ...new Set(ev.linhas.map((r) => userName(r.cobrador_carteira_id))),
    ].map((n) => n ?? "sem cobrador");

    const config = {
      app: {
        icon: <Smartphone className="h-4 w-4 text-emerald-600" />,
        titulo: `Pagamento registrado no app${
          ev.pagamento?.collector_name
            ? ` por ${ev.pagamento.collector_name}`
            : ""
        }`,
      },
      erp_ou_manual: {
        icon: <FileSpreadsheet className="h-4 w-4 text-indigo-600" />,
        titulo: "Baixa pelo ERP ou edição manual",
      },
      foto_inicial: {
        icon: <Camera className="h-4 w-4 text-gray-500" />,
        titulo: "Recebido até o início do histórico",
      },
    }[ev.origem];

    const valores = [
      recebido !== 0 &&
        `${recebido > 0 ? "Recebido" : "Estornado"} ${formatCurrency(Math.abs(recebido))}`,
      desconto !== 0 &&
        `${desconto > 0 ? "Desconto" : "Desconto removido"} ${formatCurrency(Math.abs(desconto))}`,
    ].filter(Boolean);

    return (
      <>
        <div className="flex items-center gap-2">
          {config.icon}
          <span className="text-sm font-medium text-gray-900">
            {config.titulo}
          </span>
        </div>
        <p className="text-xs text-gray-700 mt-1 ml-6">
          {valores.join(" · ") || "Sem mudança de valor"} — {parcelas} parcela
          {parcelas !== 1 ? "s" : ""}
          {ev.pagamento?.payment_method
            ? ` · ${ev.pagamento.payment_method}`
            : ""}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 ml-6">
          Carteira de: {donos.join(", ")}
        </p>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
        <History className="h-5 w-5 mr-2 text-blue-600" />
        Histórico de carteira e recebimentos
      </h3>

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse">
          Carregando histórico...
        </p>
      ) : eventos.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nenhum registro para este cliente.
        </p>
      ) : (
        <ol className="space-y-3">
          {eventos.map((ev, i) => (
            <li
              key={
                ev.tipo === "carteira"
                  ? `c-${ev.row.id}`
                  : `r-${ev.linhas[0].id}-${i}`
              }
              className="bg-gray-50 p-3 rounded-2xl border border-gray-200"
            >
              <p className="text-[11px] text-gray-400 mb-1">
                {formatDateTime(ev.quando)}
              </p>
              {ev.tipo === "carteira"
                ? renderCarteira(ev.row)
                : renderRecebimento(ev)}
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-gray-400">
        Carteira registrada desde 18/05/2026; recebimentos desde 06/10/2026 (o
        que já estava recebido aparece como "Recebido até o início do
        histórico"). O mérito do cobrador é o pagamento registrado no app; a
        baixa do ERP confirma depois e pode repetir o mesmo valor.
      </p>
    </div>
  );
};

export default ClientHistoryViewer;
