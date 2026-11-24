import { formatCurrency } from "../utils/formatters";
import { parseAndNormalizeDate } from "../filters/dates";
import { hasInstallmentBalance, hasOpenBalance } from "../filters/clientStatus";
import {
  ClientGroup,
  FilterOptions,
  SalePayment,
  ScheduledVisit,
  User,
  UserType,
} from "../types";
import { isVisitOpen, isVisitOverdue, todayLocalStr } from "./visitStatus";
import { isAjusteOuEstorno, valorRecebidoTotal } from "../filters/sales";
import type { DecisaoDescontoMinha } from "../services/pedidosDesconto";

// ---------------------------------------------------------------------------
// Regras das notificacoes automaticas
// ---------------------------------------------------------------------------
//
// Contam CLIENTES da carteira ativa (quem ainda deve: hasOpenBalance), nao
// parcelas. Parcela "em aberto" = hasInstallmentBalance (valores com desconto),
// nunca a coluna status. Datas comparadas como YYYY-MM-DD locais.
//
// O id de cada notificacao e uma "impressao digital": chave + dia + valor.
// Lida/dispensada vale para aquela impressao; quando o numero muda (ou vira o
// dia) e outra notificacao, que aparece de novo. Quando a contagem zera, ela
// simplesmente deixa de ser gerada.

/**
 * Para onde o clique leva. `aba` e o id de config/navigation; o App troca a
 * aba e o dashboard aplica o resto.
 */
export interface NotificacaoDestino {
  aba: string;
  /** Filtros da tela de Cobrancas / Minha Carteira. */
  filtros?: FilterOptions;
  /** Cobrancas do gestor: abrir no Relatorio do Caixa. */
  visao?: "cash-report";
  /** Atribuicao de Cobradores: filtro de cobrador. */
  atribuicao?: "without_collector";
  /** Pagina Cobradores: abrir nesta aba. */
  cobradores?: "conferencia";
}

export interface NotificacaoGerada {
  id: string;
  type: "payment" | "overdue" | "assignment" | "visit";
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  relatedId?: string;
  targetUserType?: UserType | "all";
  destino?: NotificacaoDestino;
  /** Quando aconteceu (ISO). Sem isto vale a hora em que apareceu. */
  quando?: string;
}

/** Dias em que a decisao do gestor sobre um pedido de desconto aparece no
 * sino do cobrador (= validade da liberacao). */
export const DIAS_DECISAO_DESCONTO = 3;

const dataCurta = (ymd: string | null) =>
  ymd ? ymd.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "";

const pctCurto = (v: number | null) =>
  v == null ? "" : `${String(v).replace(".", ",")}%`;

/**
 * Sino do cobrador (2026-11-24): o gestor decidiu um pedido de desconto dele
 * (acordo ou Receber pagamento). Um aviso por pedido; clicar abre a Ficha do
 * cliente (relatedId "cliente-<documento>").
 */
export const notificacoesDecisoesDesconto = (
  decisoes: DecisaoDescontoMinha[],
): NotificacaoGerada[] =>
  decisoes.map((d) => {
    const cliente = d.cliente ?? d.documento;
    const acordo = d.tipo === "acordo";
    const aprovado = d.decisao === "aprovado";
    const resposta = d.resposta ? ` “${d.resposta}”` : "";
    return {
      id: `pedido-desconto|${d.id}`,
      type: "payment",
      title: aprovado
        ? acordo
          ? "Desconto do acordo liberado"
          : "Desconto liberado"
        : acordo
          ? "Desconto do acordo recusado"
          : "Desconto recusado",
      message: aprovado
        ? acordo
          ? `O gestor liberou até ${pctCurto(d.desconto_percentual_aprovado)} de desconto no acordo de ${cliente}, até ${dataCurta(d.valido_ate)}. Toque para abrir a ficha e refazer o acordo.${resposta}`
          : `O gestor liberou ${formatCurrency(d.desconto_aprovado ?? 0)} de desconto para ${cliente}, até ${dataCurta(d.valido_ate)}. Toque para abrir a ficha e receber.${resposta}`
        : `O gestor recusou o pedido de desconto${acordo ? " do acordo" : ""} de ${cliente}.${resposta}`,
      priority: aprovado ? "high" : "medium",
      relatedId: `cliente-${d.documento}`,
      quando: d.decidido_em,
    };
  });

const plural = (n: number, um: string, varios: string) =>
  `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

const vencimentoLocal = (raw: string | null | undefined): string | null => {
  const d = parseAndNormalizeDate(raw);
  return d ? todayLocalStr(d) : null;
};

const clienteTemParcela = (
  g: ClientGroup,
  pred: (venc: string) => boolean,
): boolean =>
  g.sales.some((s) =>
    s.installments.some((i) => {
      if (!hasInstallmentBalance(i)) return false;
      const venc = vencimentoLocal(i.data_vencimento);
      return venc !== null && pred(venc);
    }),
  );

export const gerarNotificacoes = (params: {
  user: User;
  grupos: ClientGroup[];
  salePayments: SalePayment[];
  scheduledVisits: ScheduledVisit[];
  hoje: string;
  agora: Date;
}): NotificacaoGerada[] => {
  const { user, grupos, salePayments, scheduledVisits, hoje, agora } = params;
  const isManager = user.type === "manager";
  const lista: NotificacaoGerada[] = [];
  const id = (chave: string, valor: string | number) =>
    `${chave}|${hoje}|${valor}`;

  const carteira = grupos.filter((g) => hasOpenBalance(g.pendingValue));

  // Visitas: so o cobrador de campo. Interno, Terceirizado e Juridico
  // trabalham a carteira sem visita.
  if (user.type === "collector") {
    const minhas = scheduledVisits.filter((v) => v.collectorId === user.id);

    const atrasadas = minhas.filter((v) => isVisitOverdue(v, hoje)).length;
    if (atrasadas > 0) {
      lista.push({
        id: id("visitas-atrasadas", atrasadas),
        type: "visit",
        title: "Visitas Atrasadas",
        message: `${plural(atrasadas, "visita", "visitas")} sem desfecho com data passada`,
        priority: "high",
        destino: { aba: "visits" },
      });
    }

    const deHoje = minhas.filter(
      (v) => v.status === "agendada" && v.scheduledDate === hoje,
    ).length;
    if (deHoje > 0) {
      lista.push({
        id: id("visitas-hoje", deHoje),
        type: "visit",
        title: "Visitas de Hoje",
        message: `${plural(deHoje, "visita agendada", "visitas agendadas")} para hoje`,
        priority: "medium",
        destino: { aba: "visits" },
      });
    }

    const comVisitaAberta = new Set(
      minhas.filter((v) => isVisitOpen(v)).map((v) => v.clientDocument),
    );
    const semVisita = carteira.filter(
      (g) => !comVisitaAberta.has(g.document),
    ).length;
    if (semVisita > 0) {
      lista.push({
        id: id("clientes-sem-visita", semVisita),
        type: "visit",
        title: "Clientes Sem Visita",
        message: `${plural(semVisita, "cliente da carteira", "clientes da carteira")} sem visita agendada`,
        priority: "medium",
        destino: { aba: "visits" },
      });
    }
  }

  const emAtraso = carteira.filter((g) =>
    clienteTemParcela(g, (venc) => venc < hoje),
  ).length;
  if (emAtraso > 0) {
    lista.push({
      id: id("clientes-em-atraso", emAtraso),
      type: "overdue",
      title: "Clientes em Atraso",
      message: `${plural(emAtraso, "cliente", "clientes")} com parcela vencida em aberto`,
      priority: "high",
      destino: { aba: "collections", filtros: { overdueOnly: true } },
    });
  }

  const vencemHoje = carteira.filter((g) =>
    clienteTemParcela(g, (venc) => venc === hoje),
  ).length;
  if (vencemHoje > 0) {
    lista.push({
      id: id("vencimentos-hoje", vencemHoje),
      type: "payment",
      title: "Vencimentos de Hoje",
      message: `${plural(vencemHoje, "cliente tem", "clientes têm")} parcela vencendo hoje`,
      priority: "medium",
      // Status = clientes que ainda devem (pendente ou parcial).
      destino: {
        aba: "collections",
        filtros: { dueDate: hoje, status: ["pendente", "parcial"] },
      },
    });
  }

  const recebidosHoje = salePayments.filter(
    (p) =>
      (isManager || p.collectorId === user.id) &&
      (p.paymentDate ?? "").slice(0, 10) === hoje &&
      // Estorno/ajuste tambem vai para sale_payments; nao e recebimento.
      !isAjusteOuEstorno(p),
  );
  if (recebidosHoje.length > 0) {
    const total = recebidosHoje.reduce((s, p) => s + valorRecebidoTotal(p), 0);
    lista.push({
      id: id("recebidos-hoje", `${recebidosHoje.length}-${total.toFixed(2)}`),
      type: "payment",
      title: "Recebidos Hoje",
      message: `${plural(recebidosHoje.length, "pagamento", "pagamentos")} registrado${recebidosHoje.length === 1 ? "" : "s"} no app hoje, total de ${formatCurrency(total)}`,
      priority: "low",
      // So o gestor tem o Relatorio do Caixa.
      destino: isManager
        ? { aba: "collections", visao: "cash-report" }
        : undefined,
    });
  }

  if (isManager) {
    // Inclui as filas aguardando atribuicao (ex.: Aguardando Interno).
    const semCobrador = carteira.filter(
      (g) => !g.sales.some((s) => s.installments.some((i) => i.user_id)),
    ).length;
    if (semCobrador > 0) {
      lista.push({
        id: id("clientes-sem-cobrador", semCobrador),
        type: "assignment",
        title: "Clientes Sem Cobrador",
        message: `${plural(semCobrador, "cliente devendo", "clientes devendo")} sem cobrador atribuído`,
        priority: "medium",
        destino: { aba: "clients", atribuicao: "without_collector" },
      });
    }

    // Um aviso por pagamento com desconto nas ultimas 24h (createdAt e
    // instante, nao data de calendario).
    const limite = agora.getTime() - 24 * 60 * 60 * 1000;
    salePayments.forEach((p) => {
      if (!p.discountAmount || p.discountAmount <= 0 || !p.createdAt) return;
      if (new Date(p.createdAt).getTime() < limite) return;
      const venda =
        p.saleNumber === 0 ? "Renegociada" : `#${p.saleNumber ?? "?"}`;
      lista.push({
        id: `desconto|${p.id}`,
        type: "payment",
        title: `Desconto na Venda ${venda}`,
        message: `${p.collectorName || "Cobrador"} aplicou ${formatCurrency(p.discountAmount)} de desconto na venda ${venda}${p.clientName ? ` de ${p.clientName}` : ""}. Clique para ver detalhes.`,
        priority: "medium",
        targetUserType: "manager",
        relatedId: `sale-${p.saleNumber}-client-${p.clientDocument}`,
      });
    });
  }

  return lista;
};
