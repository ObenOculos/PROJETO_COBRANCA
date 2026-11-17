import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Store,
  AlertTriangle,
  Download,
  BarChart3,
  Building,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MapPin,
  Users,
  X,
  Search,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import {
  formatCurrency,
  formatCurrencyCompact,
  criarCalculoAtraso,
} from "../../utils/formatters";
import Pagination from "../common/Pagination";
import FilterBar from "../common/FilterBar";
import { ClientGroup, Collection, FilterOptions } from "../../types";
import ClientDetailModal from "./ClientDetailModal";
import { countVendas, resolveSaleKey } from "../../filters/sales";
import { documentoCombina } from "../../filters/documento";
import { clientKey } from "../../filters/clientStatus";
import { todayLocalStr } from "../../config/visitStatus";
import {
  composicaoCarteira,
  descricaoRecorteInadimplencia,
  formatarInadimplencia,
  INADIMPLENCIA_CORTE_DIAS,
  janelaDoRecorte,
  nivelInadimplencia,
  NivelInadimplencia,
} from "../../filters/inadimplencia";

// Cores por nivel de inadimplencia (loja sem cobrador fica em ambar).
const COR_NIVEL: Record<
  NivelInadimplencia | "sem",
  { bg: string; text: string; light: string; border: string }
> = {
  baixa: {
    bg: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
    light: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-500/10 dark:border-green-500/20",
  },
  media: {
    bg: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    light: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-500/10 dark:border-blue-500/20",
  },
  alta: {
    bg: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    light: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-500/10 dark:border-red-500/20",
  },
  sem: {
    bg: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    light: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-500/10 dark:border-amber-500/20",
  },
};

interface StoreCollector {
  id: string;
  name: string;
  /** Clientes distintos da loja na carteira deste cobrador. */
  clients: number;
}

interface StoreStats {
  storeName: string;
  /** Cidade com mais titulos. Toda loja atende varias (16/11: as 11). */
  city: string;
  citiesCount: number;
  /** Cobradores com carteira na loja, do que tem mais clientes ao que tem
   * menos. Antes mostrava so o primeiro ("Operador"), e 10 das 11 lojas tem
   * mais de um. */
  collectors: StoreCollector[];
  titlesCount: number; // total de títulos/parcelas do período
  totalSales: number;
  completedSales: number;
  pendingSales: number;
  /** Clientes distintos com saldo em aberto (antes contava fichas). */
  clientsWithPending: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  discountAmount: number;
  overdueAmount: number; // saldo em aberto de parcelas já vencidas
  overdueTitles: number; // nº de parcelas vencidas com saldo
  /** Base da inadimplencia: valor original das parcelas com atraso acima do
   * corte, no periodo (filters/inadimplencia). */
  dueAmount: number;
  /** Saldo em aberto dessas parcelas. */
  inadNaoPago: number;
  /** inadNaoPago / dueAmount (%) -- filters/inadimplencia. */
  inadimplencia: number;
  /** Saldo vencido ha ate 30 dias: atraso, ainda nao inadimplencia. */
  atrasoRecente: number;
  averageTicket: number;
  clientsCount: number;
}

/** "Fulano, Ciclano +2" -- cabe numa linha do card. */
const nomesCobradores = (lista: StoreCollector[], max = 2): string =>
  lista.length === 0
    ? "Sem cobrador"
    : lista
        .slice(0, max)
        .map((c) => c.name)
        .join(", ") + (lista.length > max ? ` +${lista.length - max}` : "");

const EnhancedStoreManagement: React.FC = () => {
  const {
    users,
    collections,
    getAvailableStores,
    getFilteredCollections,
    loading,
  } = useCollection();

  // Filtros compartilhados (status, cidade, vencimento, lancamento, valor) que
  // refinam a fonte de dados das lojas.
  const [filters, setFilters] = useState<FilterOptions>({});
  // Inadimplencia: com filtro de vencimento vale o recorte do usuario; sem
  // ele, os vencimentos dos ultimos 12 meses (filters/inadimplencia).
  // Seletor do card (12 meses | Tudo); filtro de vencimento prevalece.
  const [periodoInad, setPeriodoInad] = useState<"janela" | "tudo">("janela");
  const recorteInad =
    filters.dateFrom || filters.dateTo ? ("filtro" as const) : periodoInad;
  const janelaInad = janelaDoRecorte(recorteInad);
  const sourceCollections = useMemo(
    () => getFilteredCollections(filters, "manager"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, collections],
  );

  const [sortBy, setSortBy] = useState<
    "storeName" | "inadimplencia" | "totalAmount"
  >("storeName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  // Guarda o NOME da loja aberta: o modal le os numeros de storeStats, que
  // acompanham filtros e recargas (antes ficava com a foto do clique).
  const [selectedStoreName, setSelectedStoreName] = useState<string | null>(
    null,
  );

  const hasActiveFilters = Object.values(filters).some(Boolean);
  // Memo: filtrar inline criava um array novo a cada render da pagina e o
  // modal refazia todos os agrupamentos (milhares de titulos) a cada vez.
  const selectedStoreCollections = useMemo(
    () =>
      selectedStoreName
        ? sourceCollections.filter((c) => c.nome_da_loja === selectedStoreName)
        : [],
    [selectedStoreName, sourceCollections],
  );

  // Nome de quem tem carteira na loja (qualquer usuario: o dono da carteira
  // pode ter mudado de perfil).
  const userNames = useMemo(
    () => new Map(users.map((u) => [u.id, u.name] as const)),
    [users],
  );
  const availableStores = useMemo(
    () => getAvailableStores(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collections],
  );

  // Dias de atraso com cache por data: a pagina soma a carteira inteira em
  // varias passadas (lojas, inadimplencia de cada uma, geral, modal). Sem o
  // cache eram ~3 chamadas de calculateOverdueDays por titulo a cada filtro
  // (~0,9 s com 150 mil titulos; com cache ~0,05 s).
  // Cache novo a cada recalculo (dados ou recorte mudaram): assim um dia
  // virado nao fica preso no cache.
  const atrasoDias = useMemo(
    () => criarCalculoAtraso(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceCollections, janelaInad],
  );

  // Calculate store statistics
  const storeStats = useMemo((): StoreStats[] => {
    const stats: StoreStats[] = [];

    // Titulos de cada loja numa passada so. Antes cada loja filtrava a
    // carteira inteira duas vezes (e com o mesmo criterio). Os grupos mantem
    // a ordem original, entao as somas saem identicas.
    const byStore = new Map<string, Collection[]>();
    sourceCollections.forEach((c) => {
      if (!c.nome_da_loja) return;
      const list = byStore.get(c.nome_da_loja);
      if (list) list.push(c);
      else byStore.set(c.nome_da_loja, [c]);
    });

    availableStores.forEach((storeName) => {
      const periodCollections = byStore.get(storeName) ?? [];

      if (periodCollections.length === 0) return;

      const salesMap = new Map<
        string,
        {
          totalValue: number;
          paidValue: number;
          discountValue: number;
          clientDocument: string;
        }
      >();
      const cityCounts = new Map<string, number>();
      const clientsByCollector = new Map<string, Set<string>>();
      let overdueTitles = 0;

      // Uma passada por titulo: vendas, cidades, cobradores e atraso.
      periodCollections.forEach((c) => {
        const key = `${resolveSaleKey(c)}:::${c.documento}`;
        let s = salesMap.get(key);
        if (!s) {
          s = {
            totalValue: 0,
            paidValue: 0,
            discountValue: 0,
            clientDocument: c.documento || "",
          };
          salesMap.set(key, s);
        }
        const original = Number(c.valor_original || 0);
        const recebido = Number(c.valor_recebido || 0);
        const desconto = Number(c.desconto || 0);
        s.totalValue += original;
        s.paidValue += recebido;
        s.discountValue += desconto;

        if (c.cidade)
          cityCounts.set(c.cidade, (cityCounts.get(c.cidade) || 0) + 1);

        if (c.user_id) {
          let set = clientsByCollector.get(c.user_id);
          if (!set) {
            set = new Set();
            clientsByCollector.set(c.user_id, set);
          }
          set.add(clientKey(c));
        }

        // Parcelas vencidas com saldo (o valor vem da composicaoCarteira).
        const open = original - recebido - desconto;
        if (open > 0.01 && atrasoDias(c.data_vencimento) > 0) {
          overdueTitles += 1;
        }
      });

      const salesArray = Array.from(salesMap.values());

      // Valores por PARCELA, na mesma regra do card do topo
      // (filters/inadimplencia: composicaoCarteira). Antes Em aberto e
      // Recebido eram por venda e o vencido por parcela -- nao somavam.
      const comp = composicaoCarteira(periodCollections, {
        janelaDias: janelaInad,
        atrasoDias,
      });
      const inad = comp.inadimplencia;

      const openSales = salesArray.filter(
        (s) => s.totalValue - s.paidValue - s.discountValue > 0.01,
      );

      const storeCity =
        Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        "Não informada";

      const storeCollectors: StoreCollector[] = Array.from(
        clientsByCollector.entries(),
      )
        .map(([id, set]) => ({
          id,
          name: userNames.get(id) || "Usuário removido",
          clients: set.size,
        }))
        .sort((a, b) => b.clients - a.clients);

      stats.push({
        storeName,
        city: storeCity,
        citiesCount: cityCounts.size,
        collectors: storeCollectors,
        titlesCount: periodCollections.length,
        totalSales: salesArray.length,
        completedSales: salesArray.length - openSales.length,
        pendingSales: openSales.length,
        clientsWithPending: new Set(openSales.map((s) => s.clientDocument))
          .size,
        totalAmount: comp.vendido,
        receivedAmount: comp.recebido,
        pendingAmount: comp.emAberto,
        discountAmount: comp.desconto,
        overdueAmount: comp.vencido,
        overdueTitles,
        dueAmount: inad.venceu,
        inadNaoPago: inad.naoPago,
        inadimplencia: inad.pct,
        atrasoRecente: inad.atrasoRecente,
        averageTicket:
          salesArray.length > 0 ? comp.vendido / salesArray.length : 0,
        clientsCount: new Set(salesArray.map((s) => s.clientDocument)).size,
      });
    });

    return stats;
  }, [availableStores, userNames, sourceCollections, janelaInad, atrasoDias]);

  const selectedStoreForModal = selectedStoreName
    ? (storeStats.find((s) => s.storeName === selectedStoreName) ?? null)
    : null;

  // Ordena as lojas (busca/cobrador/status sao aplicados na fonte via FilterBar).
  const filteredAndSortedStores = useMemo(() => {
    const filtered = [...storeStats]; // Create a copy to avoid mutating the original array

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortOrder === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortOrder === "asc"
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

    return filtered;
  }, [storeStats, sortBy, sortOrder]);

  // Calculate overview statistics
  const overviewStats = useMemo(() => {
    const totalStores = storeStats.length;
    const assignedStores = storeStats.filter(
      (s) => s.collectors.length > 0,
    ).length;
    const unassignedStores = totalStores - assignedStores;
    // Fichas/Vendas: contagem global por cliente (mesma regra de Cobrança e
    // Atribuição). Antes somava o total por loja (s.totalCollections) e
    // duplicava vendas espalhadas em mais de uma loja.
    const totalSales = countVendas(sourceCollections);
    // Títulos/parcelas: total de linhas da fonte (já sem cancelados e filtrado).
    // Clientes distintos (documento) na fonte filtrada — global, sem duplicar
    // clientes que aparecem em mais de uma loja.
    const totalClients = new Set(
      sourceCollections.map((c) => c.documento).filter((d): d is string => !!d),
    ).size;
    // Composicao da carteira inteira (soma dos valores, nao media das
    // lojas): as partes somam o vendido e o % sai da mesma passada.
    const comp = composicaoCarteira(sourceCollections, {
      janelaDias: janelaInad,
      atrasoDias,
    });

    return {
      totalStores,
      assignedStores,
      unassignedStores,
      totalSales,
      totalClients,
      comp,
    };
  }, [storeStats, sourceCollections, janelaInad, atrasoDias]);

  // Card unico do topo: as partes do vendido, na ordem da barra.
  const compTopo = overviewStats.comp;
  const inadTopo = compTopo.inadimplencia;
  const partesTopo: {
    id: string;
    label: string;
    valor: number;
    barra: string;
    texto: string;
    dica: string;
    /** Parte do saldo em aberto: vai dentro do "Em aberto" na legenda,
     * como no card da loja (Em aberto com o vencido dentro). */
    emAberto?: boolean;
  }[] = [
    {
      id: "recebido",
      label: "Recebido",
      valor: Math.max(0, compTopo.recebido),
      barra: "bg-green-500",
      texto: "text-green-600 dark:text-green-400",
      dica: "Já entrou",
    },
    {
      id: "desconto",
      label: "Desconto",
      valor: compTopo.desconto,
      barra: "bg-gray-300 dark:bg-gray-600",
      texto: "text-gray-600 dark:text-dark-text-secondary",
      dica: "Abatido nas negociações: não entra e não é dívida",
    },
    // Em aberto = a vencer + vencido, igual ao card da loja. O "não pago"
    // da inadimplência fica só na frase do %, como na barra do card da loja
    // (o "em atraso até 30 dias" separado só atrapalhava -- usuário, 16/11).
    {
      id: "aVencer",
      label: "a vencer",
      valor: compTopo.aVencer,
      barra: "bg-blue-300 dark:bg-blue-700",
      texto: "text-gray-700 dark:text-dark-text",
      dica: "Em aberto, ainda não venceu",
      emAberto: true,
    },
    {
      id: "vencido",
      label: "vencido",
      valor: compTopo.vencido,
      barra: "bg-red-500",
      texto: "text-red-600 dark:text-red-400",
      dica: "Em aberto, com vencimento já passado (qualquer atraso)",
      emAberto: true,
    },
  ];
  const legendaParte = (p: (typeof partesTopo)[number], dentro = false) => (
    <div
      key={p.id}
      className={`flex items-center justify-between gap-2 min-w-0 ${dentro ? "pl-3" : ""}`}
      title={p.dica}
    >
      <span className="flex items-center gap-1.5 min-w-0 text-gray-600 dark:text-dark-text-secondary">
        <span className={`h-2 w-2 rounded-full shrink-0 ${p.barra}`} />
        <span className="truncate">{p.label}</span>
      </span>
      {/* Sem % por parte: ao lado do % da inadimplencia, a fatia do
          vendido (outra base) confundia. */}
      <span className={`font-semibold shrink-0 ${p.texto}`}>
        {formatCurrency(p.valor)}
      </span>
    </div>
  );

  const exportStoreData = () => {
    // Headers with better formatting
    const headers = [
      "Loja",
      "Cobradores",
      "Cidades",
      "Total de Títulos",
      "Total de Vendas",
      "Vendas Finalizadas",
      "Vendas Pendentes",
      "Clientes com Pendências",
      "Inadimplência (%)",
      "Valor Total (R$)",
      "Valor Recebido (R$)",
      "Valor Pendente (R$)",
      "Valor Atrasado (R$)",
      "Títulos Atrasados",
      "Total de Clientes",
      "Esperado - Inadimplência (R$)",
      "Não Pago (R$)",
      "Ticket Médio (R$)",
    ];

    // Data rows with proper formatting
    const rows = filteredAndSortedStores.map((s) => [
      s.storeName,
      s.collectors.length
        ? s.collectors.map((c) => `${c.name} (${c.clients})`).join("; ")
        : "Sem cobrador",
      s.citiesCount.toString(),
      s.titlesCount.toString(),
      s.totalSales.toString(),
      s.completedSales.toString(),
      s.pendingSales.toString(),
      s.clientsWithPending.toString(),
      s.inadimplencia.toFixed(1),
      s.totalAmount.toFixed(2),
      s.receivedAmount.toFixed(2),
      s.pendingAmount.toFixed(2),
      s.overdueAmount.toFixed(2),
      s.overdueTitles.toString(),
      s.clientsCount.toString(),
      s.dueAmount.toFixed(2),
      s.inadNaoPago.toFixed(2),
      s.averageTicket.toFixed(2),
    ]);

    // Create CSV content with proper encoding
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            const escaped = cell.toString().replace(/"/g, '""');
            return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
          })
          .join(","),
      ),
    ].join("\n");

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-lojas-${todayLocalStr()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
        <div className="h-16 bg-gray-200 rounded-2xl" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-gray-700 dark:text-dark-text">
      {/* Header */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 sm:p-5 transition-all duration-300">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl shrink-0">
              <Building className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text tracking-tight leading-none truncate">
                Desempenho Loja
              </h2>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary mt-1 tracking-wide truncate">
                Inadimplência e carteira por loja
              </p>
            </div>
          </div>

          {/* Ações Principais */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={exportStoreData}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-gray-700 dark:text-dark-text bg-white dark:bg-dark-bg hover:text-blue-600 hover:dark:text-blue-400 border border-gray-200 dark:border-dark-border rounded-xl transition-all duration-200 text-sm font-medium shadow-sm shrink-0"
              title="Exportar dados para CSV"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Resumo executivo — 3 cards temáticos (Carteira · Financeiro · Performance).
          Todos os totais respeitam os filtros ativos. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Card: Carteira (volume) */}
        <div className="bg-white dark:bg-dark-bg-secondary p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl shrink-0">
                <Building className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-text tracking-tight">
                Carteira
              </h3>
            </div>
            {overviewStats.unassignedStores > 0 ? (
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md tracking-wide border border-amber-200 dark:border-amber-900/30 shrink-0">
                {overviewStats.unassignedStores} sem cobrador
              </span>
            ) : (
              <span className="text-[9px] sm:text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-md tracking-wide border border-green-200 dark:border-green-900/30 shrink-0">
                OK
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {[
              { label: "Lojas", value: overviewStats.totalStores },
              { label: "Clientes", value: overviewStats.totalClients },
              { label: "Vendas", value: overviewStats.totalSales },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide truncate">
                  {s.label}
                </p>
                <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-dark-text tracking-tight truncate">
                  {s.value.toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Card único: inadimplência + para onde foi o que foi vendido.
            As partes somam o Vendido (filters/inadimplencia:
            composicaoCarteira) e a parte "Inadimplente" é exatamente o
            "não pago" do % -- antes Financeiro e Inadimplência mostravam o
            mesmo dinheiro em cortes diferentes (16/11). */}
        <div className="md:col-span-2 bg-white dark:bg-dark-bg-secondary p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-xl shrink-0">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-dark-text tracking-tight">
              Inadimplência e carteira
            </h3>
            {recorteInad !== "filtro" && (
              <div className="ml-auto flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5 shrink-0">
                {(
                  [
                    ["janela", "12 meses"],
                    ["tudo", "Tudo"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPeriodoInad(id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      periodoInad === id
                        ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-500 dark:text-dark-text-secondary hover:text-gray-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* O % e de onde ele sai -- mesmas palavras do card da loja
              ("não pago de ... esperado") e a linha do recorte do modal. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
            <p
              className={`text-3xl font-extrabold tracking-tight ${inadTopo.venceu > 0 ? COR_NIVEL[nivelInadimplencia(inadTopo.pct)].text : "text-gray-400 dark:text-dark-text-secondary"}`}
            >
              {formatarInadimplencia(inadTopo.pct, inadTopo.venceu)}
            </p>
            <div className="flex-1 min-w-[220px]">
              <p
                className="text-sm text-gray-600 dark:text-dark-text-secondary"
                title="Esperado: o que já deveria ter sido pago (parcelas vencidas há mais de 30 dias). Não pago: o que disso ainda não entrou."
              >
                {inadTopo.venceu > 0 ? (
                  <>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatCurrencyCompact(inadTopo.naoPago)}
                    </span>{" "}
                    não pago de {formatCurrencyCompact(inadTopo.venceu)}{" "}
                    esperado
                  </>
                ) : (
                  <>
                    Nada venceu há mais de {INADIMPLENCIA_CORTE_DIAS} dias: por
                    enquanto é só atraso
                  </>
                )}
              </p>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">
                {descricaoRecorteInadimplencia(recorteInad)}
              </p>
            </div>
          </div>

          {/* Vendido dividido em partes que somam o total */}
          <div className="flex justify-between gap-2 text-[11px] mb-1">
            <span className="font-semibold text-gray-500 dark:text-dark-text-secondary">
              Vendido
            </span>
            <span className="font-bold text-gray-900 dark:text-dark-text">
              {formatCurrency(compTopo.vendido)}
            </span>
          </div>
          <div className="flex w-full h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-dark-bg mb-3">
            {partesTopo.map((p) =>
              p.valor > 0 && compTopo.vendido > 0 ? (
                <div
                  key={p.id}
                  className={p.barra}
                  style={{ width: `${(p.valor / compTopo.vendido) * 100}%` }}
                  title={`${p.label}: ${formatCurrency(p.valor)}`}
                />
              ) : null,
            )}
          </div>
          {/* Legenda na forma do card da loja: Recebido ao lado de Em
              aberto, e dentro do Em aberto as partes dele. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] font-medium">
            <div className="space-y-1">
              {partesTopo
                .filter((p) => !p.emAberto)
                .map((p) => legendaParte(p))}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-700 dark:text-dark-text">
                  Em aberto
                </span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(compTopo.emAberto)}
                </span>
              </div>
              {partesTopo
                .filter((p) => p.emAberto)
                .map((p) => legendaParte(p, true))}
            </div>
          </div>
        </div>
      </div>

      {/* Barra de filtros unificada (busca por loja/cliente/cidade + status,
          cobrador, vencimento, lançamento, valor — refina a fonte das lojas) */}
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        userType="manager"
        context="stores"
        searchPlaceholder="Buscar loja, cliente ou cidade..."
      />

      {/* Controles de lista: contagem + ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <span className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">
          {filteredAndSortedStores.length}{" "}
          {filteredAndSortedStores.length === 1 ? "loja" : "lojas"}
        </span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="pl-10 pr-9 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium text-gray-700 dark:text-dark-text appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 transition-all"
            >
              <option value="storeName">Nome</option>
              <option value="inadimplencia">Inadimplência</option>
              <option value="totalAmount">Valor</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
              sortOrder === "desc"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white dark:bg-dark-bg text-gray-600 dark:text-dark-text border border-gray-100 dark:border-dark-border hover:border-blue-200 hover:text-blue-500"
            }`}
            title={
              sortOrder === "desc" ? "Ordem decrescente" : "Ordem crescente"
            }
          >
            {sortOrder === "desc" ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Lista de Lojas com Cards Aprimorados */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6 p-1">
        {filteredAndSortedStores.map((store) => {
          const isUnassigned = store.collectors.length === 0;

          const cor =
            COR_NIVEL[
              isUnassigned ? "sem" : nivelInadimplencia(store.inadimplencia)
            ];
          // Inadimplencia aparece UMA vez no card (a etiqueta); a barra so
          // mostra os valores de onde ela sai.
          const inadTexto = formatarInadimplencia(
            store.inadimplencia,
            store.dueAmount,
          );
          const inadDica = `Inadimplência: ${formatCurrency(store.inadNaoPago)} não pago de ${formatCurrency(store.dueAmount)} esperado (atraso > ${INADIMPLENCIA_CORTE_DIAS} dias)`;
          const temVencido = store.overdueAmount > 0.01;
          const cidades =
            store.citiesCount > 1
              ? `${store.city} +${store.citiesCount - 1} ${store.citiesCount === 2 ? "cidade" : "cidades"}`
              : store.city;
          const cobradores = nomesCobradores(store.collectors);

          return (
            <button
              type="button"
              key={store.storeName}
              onClick={() => setSelectedStoreName(store.storeName)}
              className="group text-left w-full bg-white dark:bg-dark-bg-secondary rounded-2xl border border-gray-100 dark:border-dark-border p-3 sm:p-5 hover:-translate-y-1 hover:shadow-lg hover:shadow-gray-200/20 dark:hover:shadow-black/20 transition-all duration-300 cursor-pointer flex flex-col justify-between"
            >
              {/* MOBILE: linha compacta (detalhe completo no modal ao tocar) */}
              <div className="sm:hidden flex items-center gap-3 w-full">
                <div
                  className={`p-2 rounded-lg ${cor.light} border ${cor.border} shrink-0`}
                >
                  <Store className={`h-4 w-4 ${cor.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-dark-text truncate leading-tight">
                      {store.storeName}
                    </h4>
                    <span
                      className={`text-xs font-bold shrink-0 ${cor.text}`}
                      title={inadDica}
                    >
                      {inadTexto}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 text-[11px] truncate ${isUnassigned ? "font-semibold text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-dark-text-secondary"}`}
                  >
                    {cobradores}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold truncate">
                    <span className="text-amber-600 dark:text-amber-400">
                      {formatCurrency(store.pendingAmount)} em aberto
                    </span>
                    {temVencido && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600 mx-1.5">
                          ·
                        </span>
                        <span className="text-red-600 dark:text-red-400">
                          {formatCurrency(store.overdueAmount)} vencido
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
              </div>

              {/* DESKTOP: card completo */}
              <div className="hidden sm:block w-full">
                {/* Cabeçalho: loja, onde atende e a inadimplência */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl ${cor.light} border ${cor.border} transition-colors shrink-0`}
                    >
                      <Store className={`h-5 w-5 ${cor.text}`} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-gray-900 dark:text-dark-text truncate leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {store.storeName}
                      </h4>
                      <p className="text-xs text-gray-400 dark:text-dark-text-secondary mt-1 flex items-center min-w-0">
                        <MapPin className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <span className="truncate">{cidades}</span>
                      </p>
                    </div>
                  </div>
                  <div
                    className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold ${cor.text} ${cor.light} border ${cor.border} shrink-0`}
                    title={inadDica}
                  >
                    {inadTexto}
                  </div>
                </div>

                {/* Quem cobra */}
                <p
                  className={`flex items-center gap-1.5 text-xs mb-3 min-w-0 ${isUnassigned ? "font-semibold text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-dark-text-secondary"}`}
                  title={store.collectors
                    .map((c) => `${c.name}: ${c.clients} clientes`)
                    .join("\n")}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{cobradores}</span>
                </p>

                {/* Carteira: em aberto (e quanto dele venceu) + recebido */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2.5 rounded-xl border bg-amber-50/30 dark:bg-amber-950/10 border-amber-100/40 dark:border-amber-900/20 min-w-0">
                    <span className="text-[9px] font-bold tracking-wider uppercase block mb-0.5 text-amber-700 dark:text-amber-400">
                      Em aberto
                    </span>
                    <div className="text-sm font-extrabold truncate text-amber-600 dark:text-amber-400">
                      {formatCurrency(store.pendingAmount)}
                    </div>
                    <div
                      className={`text-[10px] font-semibold truncate ${temVencido ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-dark-text-secondary"}`}
                      title="Saldo das parcelas com vencimento já passado (qualquer atraso)"
                    >
                      {temVencido
                        ? `${formatCurrency(store.overdueAmount)} vencido (${store.overdueTitles} tít.)`
                        : "nada vencido"}
                    </div>
                  </div>
                  <div className="p-2.5 bg-green-50/30 dark:bg-green-950/10 rounded-xl border border-green-100/40 dark:border-green-900/20 min-w-0">
                    <span className="text-[9px] font-bold text-green-700 dark:text-green-400 tracking-wider uppercase block mb-0.5">
                      Recebido
                    </span>
                    <div className="text-sm font-extrabold text-green-600 dark:text-green-400 truncate">
                      {formatCurrency(store.receivedAmount)}
                    </div>
                    <div className="text-[10px] font-medium text-gray-400 dark:text-dark-text-secondary truncate">
                      {store.clientsCount.toLocaleString("pt-BR")} clientes ·{" "}
                      {store.totalSales.toLocaleString("pt-BR")} vendas
                    </div>
                  </div>
                </div>

                {/* Barra da inadimplência: de onde sai o % da etiqueta */}
                <div>
                  <p className="text-[10px] font-semibold tracking-wide text-gray-400 dark:text-dark-text-secondary truncate mb-1">
                    {store.dueAmount > 0
                      ? `${formatCurrencyCompact(store.inadNaoPago)} não pago de ${formatCurrencyCompact(store.dueAmount)} esperado`
                      : `Nada venceu há mais de ${INADIMPLENCIA_CORTE_DIAS} dias`}
                  </p>
                  <div className="w-full bg-gray-100 dark:bg-dark-bg rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${cor.bg} transition-all duration-1000 ease-out`}
                      style={{
                        width: `${Math.min(store.inadimplencia, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Empty State Customizado */}
      {filteredAndSortedStores.length === 0 && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-20 text-center transition-all">
          <div className="h-24 w-24 bg-gray-50 dark:bg-dark-bg rounded-full flex items-center justify-center mx-auto mb-6">
            <Store className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-3 tracking-tight">
            Nenhuma loja foi encontrada
          </h3>
          <p className="text-sm font-semibold text-gray-400 dark:text-dark-text-secondary max-w-md mx-auto leading-relaxed">
            {hasActiveFilters
              ? "Nenhuma loja corresponde aos filtros aplicados."
              : "A base de dados de lojas está vazia ou ainda está sendo carregada."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={() => setFilters({})}
              className="mt-8 px-6 py-3 bg-gray-900 text-white rounded-2xl text-sm font-bold hover:bg-gray-800 transition-all active:scale-95 shadow-md"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Modal de Detalhes da Loja — recebe a MESMA fonte filtrada da página
          (sourceCollections), para herdar exatamente os filtros ativos. */}
      {selectedStoreForModal && (
        <StoreDetailModal
          store={selectedStoreForModal}
          storeCollections={selectedStoreCollections}
          recorteTexto={descricaoRecorteInadimplencia(recorteInad)}
          atrasoDias={atrasoDias}
          userNames={userNames}
          onClose={() => setSelectedStoreName(null)}
        />
      )}
    </div>
  );
};

interface StoreDetailModalProps {
  store: StoreStats;
  /** Collections da loja JÁ filtradas (herdadas da página) — fonte única do modal. */
  storeCollections: Collection[];
  /** Texto do recorte da inadimplencia (12 meses, tudo ou filtro). */
  recorteTexto: string;
  /** Mesmo calculo de atraso (com cache) da pagina. */
  atrasoDias: (vencimento: string | null | undefined) => number;
  userNames: Map<string, string>;
  onClose: () => void;
}

/** Cliente da lista "Quem deve" do modal (so quem tem saldo em aberto). */
interface StoreDebtor {
  key: string;
  name: string;
  document: string;
  city: string;
  /** Cobrador da carteira (o que tem mais titulos em aberto do cliente). */
  collectorId: string;
  sales: number;
  pending: number;
  overdue: number;
  /** Maior atraso entre as parcelas vencidas com saldo. */
  maxDays: number;
}

const SEM_COBRADOR = "__sem__";

// Modal da loja (16/11): o card ja compara as lojas; o modal responde "quem
// deve nesta loja e quem cobra". Saude (inadimplencia, no recorte dela) e
// carteira (hoje) em blocos separados para nao misturar bases de tempo.
const StoreDetailModal: React.FC<StoreDetailModalProps> = ({
  store,
  storeCollections,
  recorteTexto,
  atrasoDias,
  userNames,
  onClose,
}) => {
  const { getClientGroups } = useCollection();
  const PAGE_SIZE = 20;
  const [search, setSearch] = useState("");
  const [collectorFilter, setCollectorFilter] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [page, setPage] = useState(1);
  // Ficha aberta por cima: o modal da loja fica escondido (montado, volta
  // igual ao fechar) -- um modal por vez.
  const [ficha, setFicha] = useState<ClientGroup | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, collectorFilter, onlyOverdue]);

  // Uma passada pelos titulos da loja: agrupa por cliente.
  const { debtors, paidClients } = useMemo(() => {
    const byClient = new Map<
      string,
      {
        name: string;
        document: string;
        city: string;
        sales: Set<string>;
        pending: number;
        overdue: number;
        maxDays: number;
        openByCollector: Map<string, number>;
      }
    >();
    storeCollections.forEach((c) => {
      const key = clientKey(c);
      if (!key) return;
      let e = byClient.get(key);
      if (!e) {
        e = {
          name: c.cliente || c.documento || "Sem nome",
          document: c.documento || "",
          city: c.cidade || "",
          sales: new Set(),
          pending: 0,
          overdue: 0,
          maxDays: 0,
          openByCollector: new Map(),
        };
        byClient.set(key, e);
      }
      e.sales.add(String(resolveSaleKey(c)));
      const open =
        Number(c.valor_original || 0) -
        Number(c.valor_recebido || 0) -
        Number(c.desconto || 0);
      if (open <= 0.01) return;
      e.pending += open;
      const cob = c.user_id || SEM_COBRADOR;
      e.openByCollector.set(cob, (e.openByCollector.get(cob) || 0) + 1);
      const dias = atrasoDias(c.data_vencimento);
      if (dias > 0) {
        e.overdue += open;
        if (dias > e.maxDays) e.maxDays = dias;
      }
    });

    const list: StoreDebtor[] = [];
    let paid = 0;
    byClient.forEach((e, key) => {
      if (e.pending <= 0.01) {
        paid += 1;
        return;
      }
      const collectorId =
        Array.from(e.openByCollector.entries()).sort(
          (a, b) => b[1] - a[1],
        )[0]?.[0] ?? SEM_COBRADOR;
      list.push({
        key,
        name: e.name,
        document: e.document,
        city: e.city,
        collectorId,
        sales: e.sales.size,
        pending: e.pending,
        overdue: e.overdue,
        maxDays: e.maxDays,
      });
    });
    list.sort((a, b) => b.overdue - a.overdue || b.pending - a.pending);
    return { debtors: list, paidClients: paid };
  }, [storeCollections, atrasoDias]);

  // Cobradores de quem deve (chips que filtram a lista).
  const collectorChips = useMemo(() => {
    const count = new Map<string, number>();
    debtors.forEach((d) =>
      count.set(d.collectorId, (count.get(d.collectorId) || 0) + 1),
    );
    return Array.from(count.entries())
      .map(([id, n]) => ({
        id,
        name:
          id === SEM_COBRADOR
            ? "Sem cobrador"
            : userNames.get(id) || "Usuário removido",
        count: n,
      }))
      .sort((a, b) =>
        a.id === SEM_COBRADOR ? 1 : b.id === SEM_COBRADOR ? -1 : b.count - a.count,
      );
  }, [debtors, userNames]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return debtors.filter((d) => {
      if (collectorFilter && d.collectorId !== collectorFilter) return false;
      if (onlyOverdue && d.overdue <= 0.01) return false;
      if (!term) return true;
      return (
        d.name.toLowerCase().includes(term) ||
        d.city.toLowerCase().includes(term) ||
        documentoCombina(d.document, term)
      );
    });
  }, [debtors, search, collectorFilter, onlyOverdue]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = !!search || !!collectorFilter || onlyOverdue;

  // Ficha pelo documento (mesma base da Cobrancas e da Conferencia;
  // getClientGroups tem cache no contexto).
  const abrirFicha = (d: StoreDebtor) => {
    if (!d.document) return;
    const grupo = getClientGroups().find(
      (g) => g.document === d.document,
    );
    if (grupo) setFicha(grupo);
  };

  const cor =
    COR_NIVEL[
      store.collectors.length === 0
        ? "sem"
        : nivelInadimplencia(store.inadimplencia)
    ];
  const aVencer = Math.max(0, store.pendingAmount - store.overdueAmount);

  // Boas práticas de modal: trava o scroll do fundo enquanto aberto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Fecha com a tecla ESC (nao enquanto a Ficha estiver por cima).
  useEffect(() => {
    if (ficha) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, ficha]);

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-modal-title"
        onMouseDown={onClose}
        className={`fixed inset-0 bg-black/50 items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-300 ${ficha ? "hidden" : "flex"}`}
      >
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-dark-border"
        >
          {/* Cabeçalho */}
          <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-dark-border flex items-center justify-between gap-3 bg-gray-50 dark:bg-dark-bg">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`h-11 w-11 rounded-xl ${cor.light} flex items-center justify-center shrink-0`}
              >
                <Store className={`h-6 w-6 ${cor.text}`} />
              </div>
              <div className="min-w-0">
                <h3
                  id="store-modal-title"
                  className="text-lg sm:text-xl font-bold text-gray-900 dark:text-dark-text tracking-tight truncate"
                >
                  {store.storeName}
                </h3>
                <p className="flex items-center text-xs text-gray-400 dark:text-dark-text-secondary mt-0.5 min-w-0">
                  <MapPin className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span className="truncate">
                    {store.citiesCount > 1
                      ? `${store.citiesCount} cidades · mais títulos em ${store.city}`
                      : store.city}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="h-10 w-10 flex items-center justify-center bg-gray-100 hover:bg-red-50 hover:text-red-500 dark:bg-dark-bg dark:hover:bg-red-950/20 dark:hover:text-red-400 text-gray-500 dark:text-dark-text-secondary rounded-xl transition-all active:scale-95 shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 sm:p-5 overflow-y-auto flex-1 minimal-scrollbar space-y-4">
            {/* Saúde (recorte da inadimplência) × Carteira (hoje) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl border border-gray-100 dark:border-dark-border">
                <p className="text-sm font-bold text-gray-900 dark:text-dark-text">
                  Inadimplência
                </p>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">
                  {recorteTexto}
                </p>
                <p
                  className={`text-3xl font-extrabold tracking-tight my-2 ${store.dueAmount > 0 ? cor.text : "text-gray-400 dark:text-dark-text-secondary"}`}
                >
                  {formatarInadimplencia(store.inadimplencia, store.dueAmount)}
                </p>
                <div className="pt-2 border-t border-gray-100 dark:border-dark-border space-y-1 text-[11px] font-medium">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-dark-text-secondary">
                      Esperado
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-dark-text">
                      {formatCurrency(store.dueAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-dark-text-secondary">
                      Não pago
                    </span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(store.inadNaoPago)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-gray-100 dark:border-dark-border">
                <p className="text-sm font-bold text-gray-900 dark:text-dark-text">
                  Carteira hoje
                </p>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary tracking-wide">
                  {store.clientsCount.toLocaleString("pt-BR")} clientes ·{" "}
                  {store.completedSales.toLocaleString("pt-BR")} de{" "}
                  {store.totalSales.toLocaleString("pt-BR")} vendas quitadas
                </p>
                <p className="text-3xl font-extrabold tracking-tight my-2 text-amber-600 dark:text-amber-400">
                  {formatCurrency(store.pendingAmount)}
                  <span className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary ml-1.5">
                    em aberto
                  </span>
                </p>
                <div className="pt-2 border-t border-gray-100 dark:border-dark-border space-y-1 text-[11px] font-medium">
                  <div
                    className="flex justify-between gap-2"
                    title="Saldo das parcelas com vencimento já passado (qualquer atraso)"
                  >
                    <span className="text-gray-500 dark:text-dark-text-secondary">
                      vencido ({store.overdueTitles.toLocaleString("pt-BR")}{" "}
                      títulos)
                    </span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(store.overdueAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-dark-text-secondary">
                      a vencer
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-dark-text">
                      {formatCurrency(aVencer)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-dark-text-secondary">
                      Recebido
                    </span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(store.receivedAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quem deve */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                <h4 className="text-sm font-bold text-gray-900 dark:text-dark-text">
                  Quem deve{" "}
                  <span className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary">
                    {hasFilters
                      ? `${filtered.length.toLocaleString("pt-BR")} de ${debtors.length.toLocaleString("pt-BR")}`
                      : debtors.length.toLocaleString("pt-BR")}{" "}
                    clientes
                  </span>
                </h4>
                {paidClients > 0 && (
                  <span className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                    {paidClients.toLocaleString("pt-BR")} quitados não aparecem
                  </span>
                )}
              </div>

              {/* Cobradores: quem cobra quantos dos que devem (filtra a lista) */}
              {collectorChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {collectorChips.map((c) => {
                    const ativo = collectorFilter === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCollectorFilter(ativo ? "" : c.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                          ativo
                            ? "bg-blue-600 border-blue-600 text-white"
                            : c.id === SEM_COBRADOR
                              ? "border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              : "border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg"
                        }`}
                      >
                        {c.name} · {c.count.toLocaleString("pt-BR")}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="relative flex-1">
                  <span className="sr-only">Buscar cliente</span>
                  <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nome, CPF/CNPJ ou cidade"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-dark-text-secondary cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={onlyOverdue}
                    onChange={(e) => setOnlyOverdue(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Só com valor vencido
                </label>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
                    {debtors.length === 0
                      ? "Ninguém devendo nesta loja."
                      : "Nenhum cliente para os filtros aplicados."}
                  </div>
                ) : (
                  paged.map((d) => {
                    const cobrador =
                      d.collectorId === SEM_COBRADOR
                        ? "Sem cobrador"
                        : userNames.get(d.collectorId) || "Usuário removido";
                    const temVencido = d.overdue > 0.01;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        disabled={!d.document}
                        onClick={() => abrirFicha(d)}
                        title={
                          d.document
                            ? "Abrir a Ficha do cliente"
                            : "Cliente sem CPF/CNPJ: Ficha indisponível"
                        }
                        className="w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left hover:bg-blue-50/40 dark:hover:bg-blue-900/10 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-dark-text truncate">
                            {d.name}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-dark-text-secondary truncate">
                            <span
                              className={
                                d.collectorId === SEM_COBRADOR
                                  ? "text-amber-600 dark:text-amber-400 font-semibold"
                                  : ""
                              }
                            >
                              {cobrador}
                            </span>
                            {d.city && ` · ${d.city}`} · {d.sales}{" "}
                            {d.sales === 1 ? "venda" : "vendas"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {temVencido ? (
                            <p className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400">
                              {formatCurrency(d.overdue)}{" "}
                              <span className="text-[10px] font-semibold">
                                vencido há {d.maxDays.toLocaleString("pt-BR")}{" "}
                                {d.maxDays === 1 ? "dia" : "dias"}
                              </span>
                            </p>
                          ) : (
                            <p className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary">
                              nada vencido
                            </p>
                          )}
                          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            {formatCurrency(d.pending)} em aberto
                          </p>
                        </div>
                        {d.document && (
                          <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <Pagination
                page={page}
                total={filtered.length}
                perPage={PAGE_SIZE}
                onChange={setPage}
              />
            </div>
          </div>
        </div>
      </div>

      {ficha && (
        <ClientDetailModal
          clientGroup={ficha}
          userType="manager"
          onClose={() => setFicha(null)}
        />
      )}
    </>,
    document.body,
  );
};
export default EnhancedStoreManagement;
