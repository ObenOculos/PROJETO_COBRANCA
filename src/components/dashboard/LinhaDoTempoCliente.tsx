import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  CalendarX,
  Camera,
  Car,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Handshake,
  History,
  LogIn,
  LogOut,
  MessageCircle,
  Phone,
  RefreshCw,
  Smartphone,
  UserX,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { comRetentativa } from "../../utils/supabaseRetry";
import { formatCurrency, parseAndFormatDate } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import {
  ATTEMPT_TYPE_LABELS,
  ATTEMPT_RESULT_LABELS,
  notaContatoExibicao,
} from "../../config/collectionAttempts";
import {
  clientesReincidentes,
  rescheduleReasonLabel,
} from "../../config/rescheduleReasons";
import { isVisitOverdue, todayLocalStr } from "../../config/visitStatus";
import { useCollection } from "../../contexts/CollectionContext";
import { SaleGroup } from "../../types";
import { Database } from "../../types/database.types";

// Historico do cliente numa linha do tempo so (antes eram 5 blocos com
// ordem, estilo e rolagem proprios). Junta, sem recalcular nada:
// - contatos do Atender (collection_attempts, agrupados por contato);
// - visitas presenciais com desfecho e agendamentos cancelados
//   (scheduled_visits -- contato agendado concluido ja aparece como contato);
// - acordos criados/encerrados (acordos);
// - recebimentos/baixas e, para o gestor, a carteira (recebimentos_historico,
//   atribuicoes_historico -- append-only, migration 20261005000002).
// Cobrador nao ve a carteira nem quem registrou pagamento (o banco tambem
// filtra -- migration 20261109000007).

type Categoria = "contato" | "visita" | "pagamento" | "acordo" | "carteira";

interface EventoLinha {
  chave: string;
  /** Instante para ordenar (ms). Data sem hora conta como fim do dia. */
  ordem: number;
  /** Data (e hora, quando houver) como aparece na linha. */
  quandoTexto: string;
  categoria: Categoria;
  icone: React.ReactNode;
  titulo: React.ReactNode;
  autor?: string | null;
  detalhes?: React.ReactNode[];
}

const CATEGORIAS: { id: Categoria; rotulo: string }[] = [
  { id: "contato", rotulo: "Contatos" },
  { id: "visita", rotulo: "Visitas" },
  { id: "pagamento", rotulo: "Pagamentos" },
  { id: "acordo", rotulo: "Acordos" },
  { id: "carteira", rotulo: "Carteira" },
];

const CANAL: Record<string, string> = {
  presencial: "Visita",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
};

const POR_PAGINA = 30;

type CarteiraRow = Database["public"]["Tables"]["atribuicoes_historico"]["Row"];
type RecebimentoRow =
  Database["public"]["Tables"]["recebimentos_historico"]["Row"];

interface PagamentoApp {
  id: string;
  collector_name: string | null;
  payment_method: string | null;
  notes: string | null;
}

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
  destino_pagamentos: string | null;
}

interface ContatoRow {
  id: string;
  collection_id: string;
  created_at: string;
  type: string;
  result: string;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  collector_id: string | null;
}

// ---------- datas ----------

/** Timestamp ISO -> ms; data pura YYYY-MM-DD -> fim do dia LOCAL. */
const instante = (valor: string | null | undefined): number => {
  if (!valor) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [y, m, d] = valor.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59).getTime();
  }
  const t = Date.parse(valor);
  return Number.isNaN(t) ? 0 : t;
};

const dataHoraTexto = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

/** dd/mm de uma data YYYY-MM-DD (sem passar por Date: sem fuso). */
const diaMes = (data: string): string => {
  const [, m, d] = data.split("T")[0].split("-");
  return d && m ? `${d}/${m}` : data;
};

const mesAno = (ms: number): string =>
  new Date(ms)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase());

const delta = (antes: number | null, depois: number | null) =>
  round2((depois ?? 0) - (antes ?? 0));

// ---------- componente ----------

interface Props {
  clientDocument: string;
  /** Vendas completas do cliente (para dizer a qual venda foi o contato). */
  sales: SaleGroup[];
  /** Gestor: carteira e nomes de quem registrou pagamento. */
  mostrarCarteira: boolean;
}

const LinhaDoTempoCliente: React.FC<Props> = ({
  clientDocument,
  sales,
  mostrarCarteira,
}) => {
  const { scheduledVisits, users, reincidenciaResets } = useCollection();

  const [contatos, setContatos] = useState<ContatoRow[]>([]);
  const [acordos, setAcordos] = useState<AcordoLinha[]>([]);
  const [carteira, setCarteira] = useState<CarteiraRow[]>([]);
  const [recebimentos, setRecebimentos] = useState<RecebimentoRow[]>([]);
  const [pagamentos, setPagamentos] = useState<Map<string, PagamentoApp>>(
    new Map(),
  );
  const [carregando, setCarregando] = useState(true);
  const [falhas, setFalhas] = useState<string[]>([]);

  const [filtro, setFiltro] = useState<Categoria | "todos">("todos");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [reagAberto, setReagAberto] = useState(false);

  // parcela -> descricao da venda
  const vendaDaParcela = useMemo(() => {
    const m = new Map<string, string>();
    sales.forEach((sale) =>
      sale.installments?.forEach((inst) =>
        m.set(
          inst.id_parcela.toString(),
          sale.description || `Venda ${sale.titleNumber}`,
        ),
      ),
    );
    return m;
  }, [sales]);
  const idsParcelas = useMemo(
    () => Array.from(vendaDaParcela.keys()).sort().join(","),
    [vendaDaParcela],
  );

  useEffect(() => {
    if (!clientDocument) return;
    let cancelado = false;
    setCarregando(true);
    setFalhas([]);

    const ids = idsParcelas ? idsParcelas.split(",") : [];

    const carregarContatos = async (): Promise<ContatoRow[]> => {
      if (ids.length === 0) return [];
      const { data, error } = await comRetentativa(() =>
        supabase
          .from("collection_attempts")
          .select(
            "id, collection_id, created_at, type, result, notes, next_action, next_action_date, collector_id",
          )
          .in("collection_id", ids)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      );
      if (error) throw new Error("contatos");
      return (data ?? []) as ContatoRow[];
    };

    const carregarAcordos = async (): Promise<AcordoLinha[]> => {
      const { data, error } = await comRetentativa(() =>
        supabase
          .from("acordos")
          .select(
            "id, status, valor_negociado, numero_parcelas, created_at, resolved_at, motivo_cancelamento, collector_id, created_by_id, encargos_reimputados, destino_pagamentos",
          )
          .eq("client_document", clientDocument)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      );
      if (error) throw new Error("acordos");
      return (data ?? []) as AcordoLinha[];
    };

    const carregarCarteira = async (): Promise<CarteiraRow[]> =>
      mostrarCarteira
        ? fetchAllRows<CarteiraRow>(
            (from, to) =>
              supabase
                .from("atribuicoes_historico")
                .select("*")
                .eq("documento", clientDocument)
                .order("assigned_at", { ascending: false })
                .order("id", { ascending: true })
                .range(from, to),
            () => cancelado,
          )
        : [];

    const carregarRecebimentos = async () => {
      const linhas = await fetchAllRows<RecebimentoRow>(
        (from, to) =>
          supabase
            .from("recebimentos_historico")
            .select("*")
            .eq("documento", clientDocument)
            .order("registrado_em", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to),
        () => cancelado,
      );
      // Quem registrou cada pagamento do app (merito do cobrador).
      const idsPag = [
        ...new Set(
          linhas
            .map((r) => r.sale_payment_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const mapa = new Map<string, PagamentoApp>();
      if (idsPag.length > 0) {
        const { data, error } = await supabase
          .from("sale_payments")
          .select("id, collector_name, payment_method, notes")
          .in("id", idsPag);
        if (error) console.error("Erro ao buscar pagamentos do app:", error);
        (data ?? []).forEach((p) => mapa.set(p.id, p as PagamentoApp));
      }
      return { linhas, mapa };
    };

    void (async () => {
      const [rc, ra, rcart, rrec] = await Promise.allSettled([
        carregarContatos(),
        carregarAcordos(),
        carregarCarteira(),
        carregarRecebimentos(),
      ]);
      if (cancelado) return;
      const erros: string[] = [];
      if (rc.status === "fulfilled") setContatos(rc.value);
      else erros.push("contatos");
      if (ra.status === "fulfilled") setAcordos(ra.value);
      else erros.push("acordos");
      if (rcart.status === "fulfilled") setCarteira(rcart.value);
      else erros.push("carteira");
      if (rrec.status === "fulfilled") {
        setRecebimentos(rrec.value.linhas);
        setPagamentos(rrec.value.mapa);
      } else erros.push("pagamentos");
      [rc, ra, rcart, rrec].forEach((r) => {
        if (r.status === "rejected") {
          console.error("Erro ao carregar o histórico do cliente:", r.reason);
        }
      });
      setFalhas(erros);
      setCarregando(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [clientDocument, mostrarCarteira, idsParcelas]);

  const nome = useCallback(
    (id: string | null | undefined): string | null => {
      if (!id) return null;
      return (
        users?.find((u) => u.id === id)?.name ?? "usuário não identificado"
      );
    },
    [users],
  );

  const visitasDoCliente = useMemo(
    () => (scheduledVisits ?? []).filter((v) => v.clientDocument === clientDocument),
    [scheduledVisits, clientDocument],
  );

  // Proximo agendamento (contato ou visita) ainda sem desfecho.
  const proximo = useMemo(() => {
    const abertos = visitasDoCliente
      .filter((v) => v.status === "agendada")
      .sort(
        (a, b) =>
          a.scheduledDate.localeCompare(b.scheduledDate) ||
          (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""),
      );
    return abertos.length > 0
      ? { visita: abertos[0], outros: abertos.length - 1 }
      : null;
  }, [visitasDoCliente]);

  const reincidencia = useMemo(
    () => clientesReincidentes(visitasDoCliente, 2, reincidenciaResets)[0] ?? null,
    [visitasDoCliente, reincidenciaResets],
  );

  const eventos = useMemo<EventoLinha[]>(() => {
    const lista: EventoLinha[] = [];

    // --- Contatos: um contato grava uma linha por titulo em aberto
    // (registrar_contato); agrupa as gravadas juntas.
    const porContato = new Map<string, { row: ContatoRow; vendas: string[] }>();
    contatos.forEach((row) => {
      const chave = [row.created_at, row.type, row.result, row.notes ?? ""].join("|");
      const venda = vendaDaParcela.get(row.collection_id) ?? "Título";
      const atual = porContato.get(chave);
      if (atual) {
        if (!atual.vendas.includes(venda)) atual.vendas.push(venda);
      } else {
        porContato.set(chave, { row, vendas: [venda] });
      }
    });
    porContato.forEach(({ row, vendas }) => {
      const tipo =
        ATTEMPT_TYPE_LABELS[row.type as keyof typeof ATTEMPT_TYPE_LABELS] ??
        row.type;
      const resultado =
        ATTEMPT_RESULT_LABELS[row.result as keyof typeof ATTEMPT_RESULT_LABELS] ??
        row.result;
      const detalhes: React.ReactNode[] = [];
      if (row.notes) detalhes.push(`“${notaContatoExibicao(row.notes)}”`);
      if (row.next_action || row.next_action_date) {
        detalhes.push(
          `Próximo: ${row.next_action ?? "contato"}${
            row.next_action_date ? ` em ${parseAndFormatDate(row.next_action_date)}` : ""
          }`,
        );
      }
      detalhes.push(<span className="text-gray-400">{vendas.join(", ")}</span>);
      lista.push({
        chave: `contato-${row.id}`,
        ordem: instante(row.created_at),
        quandoTexto: dataHoraTexto(row.created_at),
        categoria: "contato",
        icone:
          row.type === "whatsapp" ? (
            <MessageCircle className="h-4 w-4 text-indigo-600" />
          ) : (
            <Phone className="h-4 w-4 text-indigo-600" />
          ),
        titulo: (
          <>
            {tipo} · <span className="font-normal">{resultado}</span>
          </>
        ),
        autor: nome(row.collector_id),
        detalhes,
      });
    });

    // --- Visitas presenciais com desfecho + agendamentos cancelados.
    visitasDoCliente.forEach((v) => {
      const canal = v.channel ?? "presencial";
      const autor = nome(v.collectorId);
      if (v.status === "cancelada") {
        const quando = v.cancellationApprovedAt || v.updatedAt || v.createdAt;
        lista.push({
          chave: `visita-${v.id}`,
          ordem: instante(quando),
          quandoTexto: dataHoraTexto(quando),
          categoria: canal === "presencial" ? "visita" : "contato",
          icone: <CalendarX className="h-4 w-4 text-gray-500" />,
          titulo: `${CANAL[canal] ?? "Agendamento"} agendada cancelada (era ${diaMes(v.scheduledDate)})`,
          autor,
          detalhes: v.cancellationRequestReason?.trim()
            ? [`Motivo: ${v.cancellationRequestReason.trim()}`]
            : undefined,
        });
        return;
      }
      // Contato agendado concluido ja aparece pelo registro do Atender.
      if (canal !== "presencial") return;
      if (v.status === "realizada" || v.status === "nao_encontrado") {
        const dia = v.dataVisitaRealizada || v.scheduledDate;
        lista.push({
          chave: `visita-${v.id}`,
          ordem: instante(dia),
          quandoTexto: parseAndFormatDate(dia).slice(0, 5),
          categoria: "visita",
          icone:
            v.status === "realizada" ? (
              <Car className="h-4 w-4 text-blue-600" />
            ) : (
              <UserX className="h-4 w-4 text-amber-600" />
            ),
          titulo:
            v.status === "realizada" ? "Visita realizada" : "Visita: cliente não encontrado",
          autor,
          detalhes: v.notes?.trim() ? [`“${v.notes.trim()}”`] : undefined,
        });
      } else if (v.status === "reagendada") {
        const quando = v.updatedAt || v.scheduledDate;
        lista.push({
          chave: `visita-${v.id}`,
          ordem: instante(quando),
          quandoTexto: v.updatedAt
            ? dataHoraTexto(v.updatedAt)
            : parseAndFormatDate(v.scheduledDate).slice(0, 5),
          categoria: "visita",
          icone: <RefreshCw className="h-4 w-4 text-amber-600" />,
          titulo: `Visita de ${diaMes(v.scheduledDate)} reagendada${
            v.rescheduledTo ? ` para ${diaMes(v.rescheduledTo)}` : ""
          }`,
          autor,
          detalhes: [
            v.rescheduleReason ? `Motivo: ${rescheduleReasonLabel(v.rescheduleReason)}` : null,
            v.notes?.trim() ? `“${v.notes.trim()}”` : null,
          ].filter(Boolean) as string[],
        });
      }
    });

    // --- Acordos
    acordos.forEach((a) => {
      const emNome =
        a.created_by_id && a.created_by_id !== a.collector_id
          ? ` (em nome de ${nome(a.collector_id)})`
          : "";
      lista.push({
        chave: `acordo-${a.id}`,
        ordem: instante(a.created_at),
        quandoTexto: dataHoraTexto(a.created_at),
        categoria: "acordo",
        icone: <Handshake className="h-4 w-4 text-amber-600" />,
        titulo: `Acordo criado: ${formatCurrency(a.valor_negociado)} em ${a.numero_parcelas}x`,
        autor: `${nome(a.created_by_id ?? a.collector_id)}${emNome}`,
      });
      if (a.status === "ativo" || !a.resolved_at) return;
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
      const detalhes: string[] = [];
      if (a.motivo_cancelamento?.trim()) {
        detalhes.push(`Motivo: ${a.motivo_cancelamento.trim()}`);
      }
      if (a.status === "cancelado" && a.destino_pagamentos === "estornar") {
        detalhes.push(
          "Valor pago no acordo estornado (a dívida voltou ao valor de antes).",
        );
      }
      if (a.status === "cancelado" && (a.encargos_reimputados ?? 0) > 0) {
        detalhes.push(
          `Juros já pagos no acordo (${formatCurrency(a.encargos_reimputados ?? 0)}) passaram a abater a dívida original.`,
        );
      }
      lista.push({
        chave: `acordo-fim-${a.id}`,
        ordem: instante(a.resolved_at),
        quandoTexto: dataHoraTexto(a.resolved_at),
        categoria: "acordo",
        icone: <Handshake className={`h-4 w-4 ${cor}`} />,
        titulo,
        detalhes,
      });
    });

    // --- Carteira (so gestor)
    carteira.forEach((row) => {
      const anterior = nome(row.cobrador_anterior_id);
      const novo = nome(row.cobrador_novo_id);
      const motivo = row.motivo ?? "";
      let icone = <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
      let titulo: string;
      if (!row.cobrador_novo_id) {
        icone = <LogOut className="h-4 w-4 text-red-600" />;
        if (motivo.startsWith("liberacao: ")) {
          titulo = `Liberado da carteira de ${anterior ?? "—"} → ${motivo.slice("liberacao: ".length)}`;
        } else if (motivo === "remocao") {
          titulo = `Removido da carteira de ${anterior ?? "—"}`;
        } else {
          titulo = `Saiu da carteira de ${anterior ?? "—"}`;
        }
      } else if (!row.cobrador_anterior_id) {
        icone = <LogIn className="h-4 w-4 text-green-600" />;
        titulo =
          motivo === "importacao"
            ? `Entrou na carteira de ${novo} (importação da planilha)`
            : `Entrou na carteira de ${novo}`;
      } else if (row.cobrador_anterior_id === row.cobrador_novo_id) {
        titulo = `Reatribuído a ${novo}`;
      } else {
        titulo = `Transferido de ${anterior} para ${novo}`;
      }
      const quem = nome(row.gerente_id || null);
      lista.push({
        chave: `carteira-${row.id}`,
        ordem: instante(row.assigned_at),
        quandoTexto: dataHoraTexto(row.assigned_at),
        categoria: "carteira",
        icone,
        titulo,
        autor:
          quem ??
          (motivo.endsWith("sem_registro")
            ? "sem registro de quem fez (caminho antigo)"
            : "sem registro de quem fez"),
      });
    });

    // --- Recebimentos: um pagamento do app, ou um mesmo instante de
    // gravacao (importacao/edicao, ou a foto inicial).
    const grupos = new Map<string, RecebimentoRow[]>();
    recebimentos.forEach((r) => {
      const chave = r.sale_payment_id
        ? `app|${r.sale_payment_id}`
        : `${r.origem}|${r.registrado_em}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(r);
    });
    grupos.forEach((linhas, chave) => {
      const primeira = linhas[0];
      const pagamento = primeira.sale_payment_id
        ? pagamentos.get(primeira.sale_payment_id)
        : undefined;
      const recebido = round2(
        linhas.reduce((s, r) => s + delta(r.recebido_antes, r.recebido_depois), 0),
      );
      const desconto = round2(
        linhas.reduce((s, r) => s + delta(r.desconto_antes, r.desconto_depois), 0),
      );
      const parcelas = new Set(linhas.map((r) => r.id_parcela)).size;
      const config = {
        app: {
          icone: <Smartphone className="h-4 w-4 text-emerald-600" />,
          titulo: "Pagamento registrado no app",
        },
        erp_ou_manual: {
          icone: <FileSpreadsheet className="h-4 w-4 text-indigo-600" />,
          titulo: "Baixa pelo ERP ou edição manual",
        },
        ssotica: {
          icone: <FileSpreadsheet className="h-4 w-4 text-indigo-600" />,
          titulo: "Baixa pela SSÓtica (atualização automática)",
        },
        foto_inicial: {
          icone: <Camera className="h-4 w-4 text-gray-500" />,
          titulo: "Recebido até o início do histórico",
        },
        acordo: {
          icone: <Handshake className="h-4 w-4 text-amber-600" />,
          titulo: "Acordo: pagamento de parcela ou estorno",
        },
        acordo_cancelado: {
          icone: <Handshake className="h-4 w-4 text-gray-500" />,
          titulo: "Acordo cancelado: ajuste dos juros já pagos",
        },
      }[primeira.origem] ?? {
        icone: <History className="h-4 w-4 text-gray-400" />,
        titulo: `Origem desconhecida (${primeira.origem})`,
      };
      const valores = [
        recebido !== 0 &&
          `${recebido > 0 ? "Recebido" : "Estornado"} ${formatCurrency(Math.abs(recebido))}`,
        desconto !== 0 &&
          `${desconto > 0 ? "Desconto" : "Desconto removido"} ${formatCurrency(Math.abs(desconto))}`,
      ].filter(Boolean);
      const detalhes: React.ReactNode[] = [
        `${valores.join(" · ") || "Sem mudança de valor"} — ${parcelas} parcela${
          parcelas !== 1 ? "s" : ""
        }${pagamento?.payment_method ? ` · ${pagamento.payment_method}` : ""}`,
      ];
      if (pagamento?.notes?.trim()) detalhes.push(`Obs.: ${pagamento.notes.trim()}`);
      if (mostrarCarteira) {
        const donos = [
          ...new Set(linhas.map((r) => nome(r.cobrador_carteira_id))),
        ].map((n) => n ?? "sem cobrador");
        detalhes.push(
          <span className="text-gray-400">Carteira de: {donos.join(", ")}</span>,
        );
      }
      lista.push({
        chave: `receb-${chave}`,
        ordem: instante(primeira.registrado_em),
        quandoTexto: dataHoraTexto(primeira.registrado_em),
        categoria: "pagamento",
        icone: config.icone,
        titulo: config.titulo,
        autor: mostrarCarteira ? pagamento?.collector_name ?? null : null,
        detalhes,
      });
    });

    return lista.sort((a, b) => b.ordem - a.ordem);
  }, [
    contatos,
    visitasDoCliente,
    acordos,
    carteira,
    recebimentos,
    pagamentos,
    vendaDaParcela,
    mostrarCarteira,
    nome,
  ]);

  const contagem = useMemo(() => {
    const c = new Map<Categoria, number>();
    eventos.forEach((e) => c.set(e.categoria, (c.get(e.categoria) ?? 0) + 1));
    return c;
  }, [eventos]);

  const filtrados =
    filtro === "todos" ? eventos : eventos.filter((e) => e.categoria === filtro);
  const visiveis = filtrados.slice(0, limite);

  // Separador por mes
  let mesAnterior = "";

  const hoje = todayLocalStr();

  return (
    <div className="space-y-4">
      {/* O que vem a seguir */}
      {proximo && (
        <div
          className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-sm ${
            isVisitOverdue(proximo.visita, hoje)
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-indigo-50 border-indigo-100 text-indigo-900"
          }`}
        >
          <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Próximo:</strong>{" "}
            {CANAL[proximo.visita.channel ?? "presencial"] ?? "Agendamento"} em{" "}
            {parseAndFormatDate(proximo.visita.scheduledDate)}
            {proximo.visita.scheduledTime
              ? ` às ${proximo.visita.scheduledTime.slice(0, 5)}`
              : ""}{" "}
            — {nome(proximo.visita.collectorId)}
            {isVisitOverdue(proximo.visita, hoje) && " (atrasado)"}
            {proximo.outros > 0 && (
              <span className="text-xs opacity-75">
                {" "}
                · mais {proximo.outros} agendado{proximo.outros !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Reagendamentos: resumo fechado, cadeia ao clicar */}
      {reincidencia && (
        <div className="border border-amber-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setReagAberto((v) => !v)}
            className="w-full px-3 py-2 bg-amber-50 flex flex-wrap items-center gap-2 text-left"
            aria-expanded={reagAberto}
          >
            {reagAberto ? (
              <ChevronDown className="h-4 w-4 text-amber-600 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span className="text-sm font-semibold text-amber-900">
              Reagendado {reincidencia.totalRemarcacoes}x
            </span>
            {reincidencia.maiorCadeia >= 2 && (
              <span
                className="text-[10px] font-medium text-amber-700 bg-white border border-amber-200 rounded-md px-1.5 py-0.5"
                title="Maior sequência da MESMA cobrança sendo empurrada."
              >
                seq. {reincidencia.maiorCadeia}x
              </span>
            )}
            <span className="flex flex-wrap gap-1.5 sm:ml-auto">
              {reincidencia.motivos.map((m) => (
                <span
                  key={m.key}
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white text-amber-800 border border-amber-200"
                >
                  {m.label} ({m.count})
                </span>
              ))}
            </span>
          </button>
          {reagAberto && (
            <ol className="divide-y divide-amber-100 bg-white">
              {reincidencia.elos.map((step, i) => (
                <li
                  key={step.visitId}
                  className="px-3 py-1.5 text-xs text-gray-600 flex items-center gap-2"
                >
                  <span className="w-5 shrink-0 text-gray-400 tabular-nums">
                    {i + 1}.
                  </span>
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {parseAndFormatDate(step.date)}
                  </span>
                  <span className="text-gray-400">—</span>
                  <span>{rescheduleReasonLabel(step.reasonKey)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Filtros: so os que tem registro */}
      {contagem.size > 1 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[
            { id: "todos" as const, rotulo: "Todos", total: eventos.length },
            ...CATEGORIAS.filter((c) => contagem.has(c.id)).map((c) => ({
              ...c,
              total: contagem.get(c.id) ?? 0,
            })),
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setFiltro(c.id);
                setLimite(POR_PAGINA);
              }}
              className={`px-2.5 py-1 rounded-full border font-medium transition-colors ${
                filtro === c.id
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {c.rotulo} ({c.total})
            </button>
          ))}
        </div>
      )}

      {falhas.length > 0 && (
        <p className="text-sm text-red-600">
          Não foi possível carregar: {falhas.join(", ")}. O histórico abaixo
          está incompleto — feche e abra a ficha de novo.
        </p>
      )}

      {carregando ? (
        <p className="text-sm text-gray-500 animate-pulse">
          Carregando histórico...
        </p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum registro para este cliente.</p>
      ) : (
        <ol className="relative">
          {visiveis.map((ev) => {
            const mes = mesAno(ev.ordem);
            const novoMes = mes !== mesAnterior;
            mesAnterior = mes;
            return (
              <React.Fragment key={ev.chave}>
                {novoMes && (
                  <li className="pt-3 pb-1 first:pt-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {mes}
                  </li>
                )}
                <li className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="w-[4.5rem] shrink-0 text-[11px] text-gray-400 tabular-nums pt-0.5">
                    {ev.quandoTexto}
                  </span>
                  <span className="shrink-0 pt-0.5">{ev.icone}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {ev.titulo}
                      {ev.autor && (
                        <span className="font-normal text-gray-500">
                          {" "}
                          — {ev.autor}
                        </span>
                      )}
                    </p>
                    {ev.detalhes?.map((d, i) => (
                      <p
                        key={i}
                        className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words"
                      >
                        {d}
                      </p>
                    ))}
                  </div>
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      )}

      {filtrados.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + POR_PAGINA)}
          className="w-full py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 rounded-xl"
        >
          Ver mais antigos ({filtrados.length - limite})
        </button>
      )}

      <details className="text-xs text-gray-400">
        <summary className="cursor-pointer select-none">
          Desde quando há registro
        </summary>
        <p className="mt-1">
          {mostrarCarteira && "Carteira registrada desde 18/05/2026. "}
          Recebimentos desde 06/10/2026 (o que já estava recebido aparece como
          "Recebido até o início do histórico"). O mérito do cobrador é o
          pagamento registrado no app; a baixa do ERP confirma depois e pode
          repetir o mesmo valor.
        </p>
      </details>
    </div>
  );
};

export default LinhaDoTempoCliente;
