import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useDeferredValue,
} from "react";
import {
  Calendar,
  Download,
  DollarSign,
  FileText,
  Printer,
  RefreshCw,
  ChevronDown,
  FileSpreadsheet,
  User,
  Wallet,
} from "lucide-react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { Collection, isCollectorType } from "../../types";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { resolveSaleKey, valorRecebidoTotal } from "../../filters/sales";
import { useAuth } from "../../contexts/AuthContext";
import ClientDetailModal from "./ClientDetailModal";
import SummaryCard from "../common/SummaryCard";
import Pagination from "../common/Pagination";
import {
  formaPagamentoGrupo,
  formaPagamentoRotulo,
} from "../../config/formasPagamento";
import { ClientGroup } from "../../types";

interface DailyCashReportProps {
  collections: Collection[];
}

interface DailyReportData {
  date: string;
  totalReceived: number;
  /** Quantidade de pagamentos (cada registro de pagamento conta 1). */
  totalPayments: number;
  /** Soma dos descontos dados NOS pagamentos do período. */
  totalPaymentDiscount: number;
  /** Juros/multa cobrados junto (ja incluidos em totalReceived). */
  totalPaymentJuros: number;
  /** Recebido por forma de pagamento (maior valor primeiro). */
  byMethod: { grupo: string; rotulo: string; valor: number; qtd: number }[];
  /** Situação atual das dívidas envolvidas, cada cliente/venda contado uma vez. */
  debtTotals: {
    totalDebt: number;
    totalPaidOnDebt: number;
    remainingDebt: number;
  };
  collectorSummary: {
    collectorId: string;
    collectorName: string;
    receivedAmount: number;
    /** Quantidade de pagamentos do cobrador. */
    transactionCount: number;
    jurosAmount: number;
    discountAmount: number;
    clients: string[];
    saleNumbers: string[];
  }[];
  payments: {
    saleKey: string;
    client: string;
    saleNumber: string;
    store: string;
    totalOriginalValue: number;
    totalReceivedValue: number;
    totalPaidOnDebt: number;
    totalPendingValue: number;
    /** Desconto dado neste pagamento. */
    paymentDiscount: number;
    /** Juros/multa deste pagamento (ja incluidos em totalReceivedValue). */
    paymentJuros: number;
    /** Chave cliente/venda da dívida (para não somar a mesma dívida 2x). */
    debtKey: string;
    totalDebt: number;
    remainingDebt: number;
    receivedDate: string;
    collectorId: string;
    collector: string;
    paymentMethod: string;
    installments: {
      collectionId: number | string;
      originalValue: number;
      receivedValue: number;
      pendingValue: number;
    }[];
    clientDocument: string;
  }[];
}

// Helper function to get current date in Brazilian timezone
const getCurrentDateBR = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper function to format date to YYYY-MM-DD
const formatDateToInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper functions for quick date ranges
const getQuickDateRanges = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  return {
    hoje: {
      label: "Hoje",
      start: formatDateToInput(today),
      end: formatDateToInput(today),
      single: true,
    },
    ontem: {
      label: "Ontem",
      start: formatDateToInput(new Date(year, month, day - 1)),
      end: formatDateToInput(new Date(year, month, day - 1)),
      single: true,
    },
    semanaPassada: {
      label: "Semana Passada",
      start: formatDateToInput(new Date(year, month, day - 7)),
      end: formatDateToInput(new Date(year, month, day - 1)),
      single: false,
    },
    mesAtual: {
      label: "Mês Atual",
      start: formatDateToInput(new Date(year, month, 1)),
      end: formatDateToInput(today),
      single: false,
    },
    mesPassado: {
      label: "Mês Passado",
      start: formatDateToInput(new Date(year, month - 1, 1)),
      end: formatDateToInput(new Date(year, month, 0)), // Last day of previous month
      single: false,
    },
    ultimos30Dias: {
      label: "Últimos 30 dias",
      start: formatDateToInput(new Date(year, month, day - 30)),
      end: formatDateToInput(today),
      single: false,
    },
    trimestre: {
      label: "Último Trimestre",
      start: formatDateToInput(new Date(year, month - 3, day)),
      end: formatDateToInput(today),
      single: false,
    },
    semestre: {
      label: "Último Semestre",
      start: formatDateToInput(new Date(year, month - 6, day)),
      end: formatDateToInput(today),
      single: false,
    },
  };
};

// Linhas por página na lista de pagamentos (padrão 10).
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

type QuickRangeKey = keyof ReturnType<typeof getQuickDateRanges>;

const DailyCashReport: React.FC<DailyCashReportProps> = ({ collections }) => {
  const { users, salePayments, refreshData, getClientGroups } = useCollection();
  const { user } = useAuth();

  const [selectedClientForModal, setSelectedClientForModal] =
    useState<ClientGroup | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateBR());
  const [endDate, setEndDate] = useState<string>(getCurrentDateBR());
  // Paginação da lista de pagamentos: intervalos grandes podem gerar milhares
  // de linhas; renderizar tudo de uma vez trava o navegador.
  const [detailsPage, setDetailsPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);
  const [dateRangeMode, setDateRangeMode] = useState<"single" | "range">(
    "single",
  );
  // "Escolher datas" aberto (datas livres em vez de um atalho).
  const [customDates, setCustomDates] = useState(false);
  const [selectedCollector, setSelectedCollector] = useState<string>("all");
  const [selectedStore, setSelectedStore] = useState<string>("all");
  // Cobrador clicado nos cards: filtra só a lista de pagamentos.
  const [focusCollector, setFocusCollector] = useState<string | null>(null);
  // Forma de pagamento clicada no card do total: filtra só a lista.
  const [focusForma, setFocusForma] = useState<string | null>(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Versões diferidas dos filtros que alimentam o cálculo pesado (reportData).
  // Os controles continuam usando o estado bruto (respondem na hora); o
  // recálculo roda numa renderização de baixa prioridade, o que permite pintar
  // o aviso de carregamento ANTES de ocupar a thread com o período.
  const dfSelectedDate = useDeferredValue(selectedDate);
  const dfEndDate = useDeferredValue(endDate);
  const dfDateRangeMode = useDeferredValue(dateRangeMode);
  const dfSelectedCollector = useDeferredValue(selectedCollector);
  const dfSelectedStore = useDeferredValue(selectedStore);

  // Enquanto o valor bruto e o diferido divergem, há um recálculo pendente.
  const isCalculating =
    selectedDate !== dfSelectedDate ||
    endDate !== dfEndDate ||
    dateRangeMode !== dfDateRangeMode ||
    selectedCollector !== dfSelectedCollector ||
    selectedStore !== dfSelectedStore;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Aviso "Atualizado" quando chegam dados novos. O recálculo já acontece
  // sozinho (reportData depende de salePayments/collections).
  const isFirstDataRef = useRef(true);
  useEffect(() => {
    if (isFirstDataRef.current) {
      isFirstDataRef.current = false;
      return;
    }
    setShowUpdateNotification(true);

    // Esconder notificação após 3 segundos
    const timer = setTimeout(() => {
      setShowUpdateNotification(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [salePayments, collections]);

  const quickRanges = getQuickDateRanges();

  const applyQuickDateRange = (rangeKey: QuickRangeKey) => {
    const range = quickRanges[rangeKey];
    setCustomDates(false);
    setDateRangeMode(range.single ? "single" : "range");
    setSelectedDate(range.start);
    setEndDate(range.end);
  };

  // Atalho que corresponde às datas escolhidas (chip azul).
  const activeQuickRange = customDates
    ? null
    : ((Object.keys(quickRanges) as QuickRangeKey[]).find(
        (key) =>
          quickRanges[key].start === selectedDate &&
          (dateRangeMode === "single"
            ? quickRanges[key].single
            : quickRanges[key].end === endDate),
      ) ?? null);

  const openCustomDates = () => {
    setCustomDates(true);
    setDateRangeMode("range");
    if (endDate < selectedDate) setEndDate(selectedDate);
  };

  // Get unique stores and collectors for filter options
  const availableStores = useMemo(() => {
    const stores = new Set<string>();
    collections.forEach((c) => {
      if (c.nome_da_loja) stores.add(c.nome_da_loja);
    });
    return Array.from(stores).sort();
  }, [collections]);

  const availableCollectors = useMemo(() => {
    return users
      .filter((u) => isCollectorType(u.type))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const handleOpenClientModal = (document: string) => {
    const groups = getClientGroups();
    const group = groups.find((g) => g.document === document);
    if (group) {
      setSelectedClientForModal(group);
    }
  };

  // Parcelas agrupadas por documento do cliente. Antes, cada pagamento
  // varria a carteira inteira 3–4 vezes (find/filter em `collections`). A
  // ordem dentro de cada grupo é a mesma de `collections`, então o "primeiro
  // que bate" continua o mesmo.
  const collectionsByDoc = useMemo(() => {
    const map = new Map<string, Collection[]>();
    for (const c of collections) {
      if (!c.documento) continue;
      const list = map.get(c.documento);
      if (list) list.push(c);
      else map.set(c.documento, [c]);
    }
    return map;
  }, [collections]);

  const reportData = useMemo((): DailyReportData => {
    // Lê os filtros diferidos (o cálculo pesado roda em baixa prioridade).
    const selectedDate = dfSelectedDate;
    const endDate = dfEndDate;
    const dateRangeMode = dfDateRangeMode;
    const selectedCollector = dfSelectedCollector;
    const selectedStore = dfSelectedStore;

    const NO_ROWS: Collection[] = [];
    const rowsOf = (doc: string | undefined) =>
      (doc && collectionsByDoc.get(doc)) || NO_ROWS;
    // Parcela da mesma venda; sem ela (ex.: venda 0), qualquer parcela do cliente.
    const relatedOf = (payment: (typeof salePayments)[number]) => {
      const rows = rowsOf(payment.clientDocument);
      return (
        rows.find((c) => resolveSaleKey(c) === payment.saleNumber) ?? rows[0]
      );
    };

    const filteredPayments = salePayments.filter((payment) => {
      const paymentDate = payment.paymentDate;
      if (!paymentDate) return false;

      const isInDateRange =
        dateRangeMode === "single"
          ? paymentDate === selectedDate
          : paymentDate >= selectedDate && paymentDate <= endDate;
      if (!isInDateRange) return false;

      if (
        selectedCollector !== "all" &&
        payment.collectorId !== selectedCollector
      )
        return false;

      // Loja vem da parcela (sale_payments não guarda a loja).
      if (selectedStore !== "all") {
        const relatedCollection = relatedOf(payment);
        if (
          !relatedCollection ||
          relatedCollection.nome_da_loja !== selectedStore
        ) {
          return false;
        }
      }

      return true;
    });

    // Agrupar por cobrador (cada pagamento conta uma vez).
    const collectorMap = new Map<
      string,
      {
        collectorId: string;
        collectorName: string;
        receivedAmount: number;
        transactionCount: number;
        jurosAmount: number;
        discountAmount: number;
        clients: Set<string>;
        saleNumbers: Set<string>;
      }
    >();

    filteredPayments.forEach((payment) => {
      const collectorId = payment.collectorId || "unknown";
      if (!collectorMap.has(collectorId)) {
        collectorMap.set(collectorId, {
          collectorId,
          collectorName:
            users.find((u) => u.id === collectorId)?.name || "Não atribuído",
          receivedAmount: 0,
          transactionCount: 0,
          jurosAmount: 0,
          discountAmount: 0,
          clients: new Set(),
          saleNumbers: new Set(),
        });
      }
      const relatedCollection = relatedOf(payment);
      const collectorData = collectorMap.get(collectorId)!;
      collectorData.receivedAmount += valorRecebidoTotal(payment);
      collectorData.transactionCount += 1;
      collectorData.jurosAmount += Number(payment.jurosAmount) || 0;
      collectorData.discountAmount += Number(payment.discountAmount) || 0;
      collectorData.clients.add(
        payment.clientName ||
          relatedCollection?.cliente ||
          payment.clientDocument ||
          "Cliente não informado",
      );
      const saleNumber = payment.saleNumber?.toString() || "";
      if (saleNumber) collectorData.saleNumbers.add(saleNumber);
    });

    // Do maior recebido para o menor (tela e exportações usam essa ordem).
    const collectorSummary = Array.from(collectorMap.values())
      .map((c) => ({
        ...c,
        clients: Array.from(c.clients),
        saleNumbers: Array.from(c.saleNumbers).sort(),
      }))
      .sort((a, b) => b.receivedAmount - a.receivedAmount);

    // Uma linha por pagamento.
    const salesPaymentMap = new Map<
      string,
      DailyReportData["payments"][number]
    >();

    filteredPayments.forEach((payment) => {
      const saleKey = `${payment.id}`;
      const clientRows = rowsOf(payment.clientDocument);

      // 1. Tentar encontrar a parcela específica que foi paga
      const specificInstallment = clientRows.find(
        (c) =>
          resolveSaleKey(c) === payment.saleNumber &&
          c.id_parcela.toString() ===
            payment.distribution_details?.[0]?.installmentId?.toString(),
      );

      // 2. Se não achou a específica (ex: venda 0 ou ajuste manual), qualquer registro do cliente para pegar Nome/Loja
      const anyClientRecord = clientRows[0];

      // 3. Dívida do cliente (desta venda, ou geral se venda 0)
      const clientInstallments =
        payment.saleNumber && payment.saleNumber !== 0
          ? clientRows.filter((c) => resolveSaleKey(c) === payment.saleNumber)
          : clientRows;

      const totalDebtValue = clientInstallments.reduce(
        (sum, c) => sum + (c.valor_original || 0),
        0,
      );
      const totalAlreadyPaidValue = clientInstallments.reduce(
        (sum, c) => sum + (c.valor_recebido || 0),
        0,
      );
      const totalDiscountValue = clientInstallments.reduce(
        (sum, c) => sum + (c.desconto || 0),
        0,
      );

      // Pendente = original menos tudo que já foi recebido E descontos aplicados
      const currentRemainingDebt = Math.max(
        0,
        totalDebtValue - (totalAlreadyPaidValue + totalDiscountValue),
      );

      if (!salesPaymentMap.has(saleKey)) {
        salesPaymentMap.set(saleKey, {
          saleKey,
          client:
            payment.clientName ||
            anyClientRecord?.cliente ||
            payment.clientDocument ||
            "Cliente não informado",
          clientDocument:
            payment.clientDocument || anyClientRecord?.documento || "",
          saleNumber: payment.saleNumber?.toString() || "",
          store: anyClientRecord?.nome_da_loja || "",
          totalOriginalValue: specificInstallment?.valor_original || 0,
          // Recebido = parcela + juros (o que o cobrador entregou).
          totalReceivedValue: valorRecebidoTotal(payment),
          totalPaidOnDebt: totalAlreadyPaidValue,
          totalPendingValue: 0,
          paymentDiscount: Number(payment.discountAmount) || 0,
          paymentJuros: Number(payment.jurosAmount) || 0,
          debtKey: `${payment.clientDocument}|${
            payment.saleNumber && payment.saleNumber !== 0
              ? payment.saleNumber
              : "*"
          }`,
          totalDebt: totalDebtValue,
          remainingDebt: currentRemainingDebt,
          receivedDate: payment.paymentDate || selectedDate,
          collectorId: payment.collectorId || "unknown",
          collector:
            payment.collectorName ||
            users.find((u) => u.id === payment.collectorId)?.name ||
            "Não atribuído",
          paymentMethod: payment.paymentMethod || "Não informado",
          installments: [],
        });
      }

      const saleData = salesPaymentMap.get(saleKey)!;
      if (
        payment.distribution_details &&
        Array.isArray(payment.distribution_details)
      ) {
        payment.distribution_details.forEach((d) => {
          // Registros antigos trazem também o valor original da parcela.
          const detail = d as typeof d & { originalAmount?: number };
          saleData.installments.push({
            collectionId: detail.installmentId || payment.id,
            originalValue: detail.originalAmount || 0,
            receivedValue: detail.appliedAmount || 0,
            pendingValue: Math.max(
              0,
              (detail.originalAmount || 0) - (detail.appliedAmount || 0),
            ),
          });
          saleData.totalOriginalValue += detail.originalAmount || 0;
        });
      } else {
        // Sem detalhes de distribuição
        saleData.installments.push({
          collectionId: payment.id,
          originalValue: 0,
          receivedValue: payment.paymentAmount,
          pendingValue: 0,
        });
      }
    });

    const payments = Array.from(salesPaymentMap.values()).map((sale) => ({
      ...sale,
      totalPendingValue: Math.max(
        0,
        // Juros nao abatem parcela: o pendente usa so o principal.
        sale.totalOriginalValue - (sale.totalReceivedValue - sale.paymentJuros),
      ),
    }));

    // Dívida (total, pago, pendente) é a situação ATUAL do cliente/venda e se
    // repete em cada pagamento dele: cada cliente/venda entra uma vez.
    const seenDebt = new Set<string>();
    const debtTotals = { totalDebt: 0, totalPaidOnDebt: 0, remainingDebt: 0 };
    payments.forEach((p) => {
      if (seenDebt.has(p.debtKey)) return;
      seenDebt.add(p.debtKey);
      debtTotals.totalDebt += p.totalDebt;
      debtTotals.totalPaidOnDebt += p.totalPaidOnDebt;
      debtTotals.remainingDebt += p.remainingDebt;
    });

    const methodMap = new Map<
      string,
      { grupo: string; rotulo: string; valor: number; qtd: number }
    >();
    payments.forEach((p) => {
      const grupo = formaPagamentoGrupo(p.paymentMethod);
      const m = methodMap.get(grupo) ?? {
        grupo,
        rotulo: formaPagamentoRotulo(grupo),
        valor: 0,
        qtd: 0,
      };
      m.valor += p.totalReceivedValue;
      m.qtd += 1;
      methodMap.set(grupo, m);
    });
    const byMethod = Array.from(methodMap.values()).sort(
      (a, b) => b.valor - a.valor,
    );

    return {
      date:
        dateRangeMode === "single"
          ? formatDate(selectedDate)
          : `${formatDate(selectedDate)} - ${formatDate(endDate)}`,
      totalReceived: payments.reduce((sum, p) => sum + p.totalReceivedValue, 0),
      totalPaymentDiscount: payments.reduce(
        (sum, p) => sum + p.paymentDiscount,
        0,
      ),
      totalPaymentJuros: payments.reduce((sum, p) => sum + p.paymentJuros, 0),
      debtTotals,
      totalPayments: payments.length,
      byMethod,
      collectorSummary,
      payments,
    };
  }, [
    salePayments,
    collectionsByDoc,
    dfSelectedDate,
    dfEndDate,
    dfDateRangeMode,
    dfSelectedCollector,
    dfSelectedStore,
    users,
  ]);

  // Lista de pagamentos (com o cobrador clicado, se houver).
  const listedPayments = useMemo(
    () =>
      reportData.payments.filter(
        (p) =>
          (!focusCollector || p.collectorId === focusCollector) &&
          (!focusForma || formaPagamentoGrupo(p.paymentMethod) === focusForma),
      ),
    [reportData.payments, focusCollector, focusForma],
  );

  const paginatedPayments = useMemo(
    () =>
      listedPayments.slice((detailsPage - 1) * perPage, detailsPage * perPage),
    [listedPayments, detailsPage, perPage],
  );

  // Novo cálculo: some o foco num cobrador que não está mais no resultado.
  useEffect(() => {
    setFocusCollector((current) =>
      current &&
      reportData.collectorSummary.some((c) => c.collectorId === current)
        ? current
        : null,
    );
  }, [reportData.collectorSummary]);
  useEffect(() => {
    setFocusForma((current) =>
      current && reportData.byMethod.some((m) => m.grupo === current)
        ? current
        : null,
    );
  }, [reportData.byMethod]);

  // Qualquer mudança na lista volta à 1ª página.
  useEffect(() => {
    setDetailsPage(1);
  }, [listedPayments, perPage]);

  const handleExportReport = () => {
    const reportContent = generateReportContent(
      reportData,
      dateRangeMode === "range",
    );
    const blob = new Blob([reportContent], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const exportDate =
      dateRangeMode === "single" ? selectedDate : `${selectedDate}_${endDate}`;
    link.download = `relatorio-caixa-${exportDate}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportOptions(false);
  };

  const handleExportExcel = () => {
    // 1. Aba de Resumo
    const summaryHeader = [
      ["RELATÓRIO DE CAIXA - FOCCO BRASIL"],
      [`Período: ${reportData.date}`],
      [`Data de Extração: ${new Date().toLocaleString("pt-BR")}`],
      [""],
      ["RESUMO"],
      ["Recebido no período", reportData.totalReceived],
      ["Juros (incluídos no recebido)", reportData.totalPaymentJuros],
      ["Descontos dados", reportData.totalPaymentDiscount],
      ["Pagamentos", reportData.totalPayments],
      ["Cobradores", reportData.collectorSummary.length],
      [""],
      ["POR FORMA DE PAGAMENTO"],
      ["Forma", "Recebido", "Pagamentos"],
      ...reportData.byMethod.map((m) => [m.rotulo, m.valor, m.qtd]),
      [""],
      ["POR COBRADOR"],
      [
        "Cobrador",
        "Recebido",
        "% do total",
        "Pagamentos",
        "Clientes",
        "Juros",
        "Descontos",
      ],
    ];

    const collectorRows = reportData.collectorSummary.map((c) => [
      c.collectorName,
      c.receivedAmount,
      reportData.totalReceived > 0
        ? c.receivedAmount / reportData.totalReceived
        : 0,
      c.transactionCount,
      c.clients.length,
      c.jurosAmount,
      c.discountAmount,
    ]);

    const summaryWS = XLSX.utils.aoa_to_sheet([
      ...summaryHeader,
      ...collectorRows,
    ]);

    summaryWS["!cols"] = [
      { wch: 30 }, // Cobrador
      { wch: 15 }, // Recebido
      { wch: 12 }, // %
      { wch: 12 }, // Pagamentos
      { wch: 10 }, // Clientes
      { wch: 12 }, // Juros
      { wch: 12 }, // Descontos
    ];

    // 2. Aba de Pagamentos
    const detailsHeader = [
      ["PAGAMENTOS"],
      [""],
      [
        "Cliente",
        "CPF/CNPJ",
        "Venda",
        "Loja",
        "Cobrador",
        "Forma Pagamento",
        "Valor Recebido",
        "Juros (incluídos)",
        "Total Pago (Histórico)",
        "Desconto",
        "Total da Dívida",
        "Pendente Atual",
        "Data Pagamento",
      ],
    ];

    const detailRows = reportData.payments.map((p) => [
      p.client,
      p.clientDocument,
      p.saleNumber ? `#${p.saleNumber}` : "-",
      p.store,
      p.collector,
      formaPagamentoRotulo(p.paymentMethod),
      p.totalReceivedValue,
      p.paymentJuros,
      p.totalPaidOnDebt,
      p.paymentDiscount,
      p.totalDebt,
      p.remainingDebt,
      formatDate(p.receivedDate),
    ]);

    const detailsWS = XLSX.utils.aoa_to_sheet([
      ...detailsHeader,
      ...detailRows,
    ]);

    detailsWS["!cols"] = [
      { wch: 35 }, // Cliente
      { wch: 18 }, // CPF
      { wch: 10 }, // Venda
      { wch: 15 }, // Loja
      { wch: 20 }, // Cobrador
      { wch: 15 }, // Forma
      { wch: 18 }, // Recebido
      { wch: 14 }, // Juros
      { wch: 18 }, // Total Pago Histórico
      { wch: 12 }, // Desconto
      { wch: 15 }, // Total Dívida
      { wch: 15 }, // Pendente
      { wch: 15 }, // Data
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summaryWS, "Resumo");
    XLSX.utils.book_append_sheet(wb, detailsWS, "Pagamentos");

    const filenameDate =
      dateRangeMode === "single"
        ? selectedDate
        : `${selectedDate}_a_${endDate}`;
    XLSX.writeFile(wb, `Relatorio_Caixa_${filenameDate}.xlsx`);
    setShowExportOptions(false);
  };

  const handlePrintReport = () => {
    const printContent = generatePrintableReport(
      reportData,
      dateRangeMode === "range",
    );
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-colors touch-manipulation ${
      active
        ? "bg-blue-600 text-white"
        : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
    }`;
  const selectClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation ${
      active
        ? "bg-blue-600 text-white"
        : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary"
    }`;
  const dateInputClass =
    "px-2 py-1 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text";

  const periodoLabel =
    dateRangeMode === "single"
      ? formatDate(selectedDate)
      : `${formatDate(selectedDate)} até ${formatDate(endDate)}`;
  const focusName = focusCollector
    ? reportData.collectorSummary.find((c) => c.collectorId === focusCollector)
        ?.collectorName
    : null;
  const focusLabels = [
    focusName,
    focusForma ? formaPagamentoRotulo(focusForma) : null,
  ].filter((x): x is string => !!x);

  return (
    <div className="space-y-4">
      {/* Aviso de carregamento (via portal no body): cobre a aplicação e
          bloqueia interações enquanto um período longo é processado. */}
      {isCalculating &&
        createPortal(
          <div
            className="flex items-center justify-center bg-black/50 cursor-wait"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 9999,
            }}
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary px-8 py-6 shadow-xl">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-semibold text-gray-700 dark:text-dark-text">
                Processando consulta…
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                Isso pode levar alguns segundos para períodos longos.
              </p>
            </div>
          </div>,
          document.body,
        )}

      {/* Cabeçalho + período + filtros, sempre à vista */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
              <DollarSign className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              Relatório do Caixa
            </h2>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-0.5 flex items-center gap-2">
              {periodoLabel}
              {showUpdateNotification && (
                <span className="text-green-600 dark:text-green-400">
                  · Atualizado
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => refreshData()}
              className="p-2 text-gray-500 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handlePrintReport}
              className="p-2 text-gray-500 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg transition-colors"
              title="Imprimir"
            >
              <Printer className="h-4 w-4" />
            </button>
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => setShowExportOptions(!showExportOptions)}
                className="flex items-center gap-1 p-2 text-gray-500 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg transition-colors"
                title="Exportar"
              >
                <Download className="h-4 w-4" />
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${showExportOptions ? "rotate-180" : ""}`}
                />
              </button>
              {showExportOptions && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-bg-secondary rounded-xl shadow-lg border border-gray-200 dark:border-dark-border py-1 z-50">
                  <button
                    onClick={handleExportReport}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <FileText className="h-4 w-4 text-blue-500" />
                    Salvar em TXT
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Salvar em Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(quickRanges) as QuickRangeKey[]).map((key) => (
            <button
              key={key}
              onClick={() => applyQuickDateRange(key)}
              className={chipClass(activeQuickRange === key)}
            >
              {quickRanges[key].label}
            </button>
          ))}
          <button
            onClick={openCustomDates}
            className={chipClass(customDates || !activeQuickRange)}
          >
            Escolher datas
          </button>

          <select
            aria-label="Cobrador"
            value={selectedCollector}
            onChange={(e) => setSelectedCollector(e.target.value)}
            className={selectClass(selectedCollector !== "all")}
          >
            <option value="all">Todos os cobradores</option>
            {availableCollectors.map((collector) => (
              <option key={collector.id} value={collector.id}>
                {collector.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Loja"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className={selectClass(selectedStore !== "all")}
          >
            <option value="all">Todas as lojas</option>
            {availableStores.map((store) => (
              <option key={store} value={store}>
                {store}
              </option>
            ))}
          </select>
        </div>

        {(customDates || !activeQuickRange) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-dark-text-secondary">
            <Calendar className="h-3.5 w-3.5" />
            <label htmlFor="cash-date-start">De</label>
            <input
              type="date"
              id="cash-date-start"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className={dateInputClass}
            />
            <label htmlFor="cash-date-end">até</label>
            <input
              type="date"
              id="cash-date-end"
              value={dateRangeMode === "single" ? selectedDate : endDate}
              min={selectedDate}
              onChange={(e) => {
                setDateRangeMode("range");
                setEndDate(e.target.value);
              }}
              className={dateInputClass}
            />
          </div>
        )}
      </div>

      {reportData.totalPayments === 0 ? (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border px-6 py-12 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Nenhum recebimento em {periodoLabel} com os filtros escolhidos.
        </div>
      ) : (
        <>
          {/* Total do período, com a divisão por forma de pagamento */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 md:gap-6">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
                  <Wallet className="h-4 w-4 flex-shrink-0" />
                  Recebido no período
                </div>
                <div className="mt-1 text-3xl lg:text-4xl font-bold text-green-600 dark:text-green-400 truncate">
                  {formatCurrency(reportData.totalReceived)}
                </div>
                <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  {reportData.totalPayments}{" "}
                  {reportData.totalPayments === 1 ? "pagamento" : "pagamentos"}{" "}
                  · {reportData.collectorSummary.length}{" "}
                  {reportData.collectorSummary.length === 1
                    ? "cobrador"
                    : "cobradores"}
                </div>
                <div className="mt-3 pt-2 border-t border-gray-100 dark:border-dark-border/40 space-y-1 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-gray-500 dark:text-dark-text-secondary">
                      Juros incluídos
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-dark-text">
                      {formatCurrency(reportData.totalPaymentJuros)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-gray-500 dark:text-dark-text-secondary">
                      Descontos dados
                    </span>
                    <span
                      className={`font-semibold ${reportData.totalPaymentDiscount > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-700 dark:text-dark-text"}`}
                    >
                      {formatCurrency(reportData.totalPaymentDiscount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="min-w-0 md:border-l md:border-gray-100 md:dark:border-dark-border/40 md:pl-6">
                <div className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary mb-2">
                  Por forma de pagamento
                </div>
                <div className="space-y-1">
                  {reportData.byMethod.map((m) => {
                    const share =
                      reportData.totalReceived > 0
                        ? Math.max(
                            0,
                            (m.valor / reportData.totalReceived) * 100,
                          )
                        : 0;
                    const ativo = focusForma === m.grupo;
                    return (
                      <button
                        key={m.grupo}
                        type="button"
                        onClick={() =>
                          setFocusForma((current) =>
                            current === m.grupo ? null : m.grupo,
                          )
                        }
                        title="Mostrar só os pagamentos desta forma na lista"
                        className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${ativo ? "bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-800" : "hover:bg-gray-50 dark:hover:bg-dark-bg/40"}`}
                      >
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-gray-700 dark:text-dark-text truncate">
                            {m.rotulo}
                            <span className="ml-1.5 text-[11px] text-gray-400 dark:text-dark-text-secondary">
                              {m.qtd}
                            </span>
                          </span>
                          <span
                            className={`font-semibold whitespace-nowrap ${m.valor < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-dark-text"}`}
                          >
                            {formatCurrency(m.valor)}
                          </span>
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-gray-100 dark:bg-dark-bg overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500/70"
                            style={{ width: `${Math.min(100, share)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Por cobrador */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text">
                Por cobrador
              </h3>
              {reportData.collectorSummary.length > 1 && (
                <span className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                  Clique num cobrador para ver só os pagamentos dele na lista
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {reportData.collectorSummary.map((collector, index) => {
                const percentage =
                  reportData.totalReceived > 0
                    ? (collector.receivedAmount / reportData.totalReceived) *
                      100
                    : 0;
                return (
                  <SummaryCard
                    key={collector.collectorId}
                    icon={User}
                    title={`${index + 1}º ${collector.collectorName}`}
                    value={formatCurrency(collector.receivedAmount)}
                    caption={`${percentage.toFixed(1)}% do total`}
                    selecionado={focusCollector === collector.collectorId}
                    onClick={() =>
                      setFocusCollector((current) =>
                        current === collector.collectorId
                          ? null
                          : collector.collectorId,
                      )
                    }
                    hint="Mostrar só os pagamentos deste cobrador na lista"
                    rows={[
                      {
                        label: "Pagamentos",
                        value: String(collector.transactionCount),
                      },
                      {
                        label: "Clientes",
                        value: String(collector.clients.length),
                      },
                      {
                        label: "Juros",
                        value: formatCurrency(collector.jurosAmount),
                      },
                      {
                        label: "Descontos",
                        value: formatCurrency(collector.discountAmount),
                        tone:
                          collector.discountAmount > 0 ? "amber" : undefined,
                      },
                    ]}
                  />
                );
              })}
            </div>
          </div>

          {/* Pagamentos */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text">
                Pagamentos ({listedPayments.length})
                {focusLabels.length > 0 && (
                  <span className="font-normal text-gray-500 dark:text-dark-text-secondary">
                    {" "}
                    · {focusLabels.join(" · ")}
                  </span>
                )}
              </h3>
              {focusLabels.length > 0 && (
                <button
                  onClick={() => {
                    setFocusCollector(null);
                    setFocusForma(null);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Mostrar todos
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-wider bg-gray-50 dark:bg-dark-bg/50">
                    <th className="px-4 py-2 text-left">Cliente / Venda</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">
                      Data
                    </th>
                    <th className="px-4 py-2 text-left hidden lg:table-cell">
                      Cobrador
                    </th>
                    <th className="px-4 py-2 text-left hidden 2xl:table-cell">
                      Loja
                    </th>
                    <th className="px-4 py-2 text-left hidden xl:table-cell">
                      Forma
                    </th>
                    <th className="px-4 py-2 text-right">Recebido</th>
                    <th className="px-4 py-2 text-right hidden md:table-cell">
                      Desconto
                    </th>
                    <th className="px-4 py-2 text-right hidden xl:table-cell">
                      Dívida
                    </th>
                    <th className="px-4 py-2 text-right">Pendente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {paginatedPayments.map((payment) => (
                    <tr
                      key={payment.saleKey}
                      className="hover:bg-gray-50 dark:hover:bg-dark-bg/40 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() =>
                            handleOpenClientModal(payment.clientDocument)
                          }
                          className="font-semibold text-gray-900 dark:text-dark-text text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {payment.client}
                        </button>
                        <div className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                          {payment.saleNumber
                            ? `Venda #${payment.saleNumber}`
                            : "Sem número"}
                          <span className="hidden sm:inline">
                            {" "}
                            · {payment.clientDocument}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-dark-text-secondary tabular-nums whitespace-nowrap">
                        {formatDate(payment.receivedDate)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-dark-text-secondary hidden lg:table-cell">
                        {payment.collector}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-dark-text-secondary hidden 2xl:table-cell">
                        <span className="block truncate max-w-[140px]">
                          {payment.store}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-dark-text-secondary hidden xl:table-cell">
                        {formaPagamentoRotulo(payment.paymentMethod)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                          {formatCurrency(payment.totalReceivedValue)}
                        </div>
                        {payment.paymentJuros > 0 && (
                          <div className="text-[11px] text-gray-400 dark:text-dark-text-secondary whitespace-nowrap">
                            {formatCurrency(payment.paymentJuros)} de juros
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs hidden md:table-cell">
                        {payment.paymentDiscount > 0 ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {formatCurrency(payment.paymentDiscount)}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-dark-text-secondary">
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-dark-text-secondary hidden xl:table-cell whitespace-nowrap">
                        {formatCurrency(payment.totalDebt)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {payment.remainingDebt > 0 ? (
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {formatCurrency(payment.remainingDebt)}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary">
                            Quitado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={detailsPage}
              total={listedPayments.length}
              perPage={perPage}
              onChange={setDetailsPage}
              perPageOptions={PER_PAGE_OPTIONS}
              onPerPageChange={setPerPage}
              className="px-4 py-3 border-t border-gray-100 dark:border-dark-border"
            />
          </div>
        </>
      )}

      {/* Modal de Detalhes do Cliente */}
      {selectedClientForModal && (
        <ClientDetailModal
          clientGroup={selectedClientForModal}
          userType={user?.type || "collector"}
          onClose={() => setSelectedClientForModal(null)}
        />
      )}
    </div>
  );
};

const generateReportContent = (
  data: DailyReportData,
  isRangeMode: boolean = false,
): string => {
  const lines = [
    "=".repeat(60),
    `RELATÓRIO DO CAIXA ${isRangeMode ? "DO PERÍODO" : "DO DIA"} - ${data.date}`,
    "=".repeat(60),
    "",
    `Total Recebido: ${formatCurrency(data.totalReceived)}`,
    `Juros (incluídos no total): ${formatCurrency(data.totalPaymentJuros)}`,
    `Total de Descontos: ${formatCurrency(data.totalPaymentDiscount)}`,
    `Pagamentos: ${data.totalPayments}`,
    `Cobradores: ${data.collectorSummary.length}`,
    "",
    "POR FORMA DE PAGAMENTO:",
    "-".repeat(60),
    ...data.byMethod.map(
      (m) => `  ${m.rotulo}: ${formatCurrency(m.valor)} (${m.qtd})`,
    ),
    "",
    "RESUMO POR COBRADOR:",
    "-".repeat(60),
  ];

  data.collectorSummary.forEach((collector) => {
    lines.push(
      `${collector.collectorName}:`,
      `  Valor Recebido: ${formatCurrency(collector.receivedAmount)}`,
      `  Pagamentos: ${collector.transactionCount}`,
      `  Clientes: ${collector.clients.length}`,
      `  Juros: ${formatCurrency(collector.jurosAmount)} | Descontos: ${formatCurrency(collector.discountAmount)}`,
      `  Números das Vendas: ${collector.saleNumbers.length > 0 ? `#${collector.saleNumbers.join(", #")}` : "Nenhuma venda com número"}`,
      "",
    );
  });

  if (data.payments.length > 0) {
    lines.push("PAGAMENTOS:", "-".repeat(60));

    data.payments.forEach((payment) => {
      lines.push(
        `Cliente: ${payment.client}`,
        `Data do Pagamento: ${formatDate(payment.receivedDate)}`,
        `${payment.saleNumber ? `Venda: #${payment.saleNumber}` : "Venda sem número"} | Loja: ${payment.store}`,
        `Forma de Pagamento: ${formaPagamentoRotulo(payment.paymentMethod)}`,
        `Valor Recebido: ${formatCurrency(payment.totalReceivedValue)}${payment.paymentJuros > 0 ? ` (juros ${formatCurrency(payment.paymentJuros)})` : ""} | Desconto: ${formatCurrency(payment.paymentDiscount)}`,
        `Total da Dívida: ${formatCurrency(payment.totalDebt)} | Pendente Atual: ${payment.remainingDebt > 0 ? formatCurrency(payment.remainingDebt) : "Quitado"}`,
        `Cobrador: ${payment.collector}`,
        "",
      );
    });
  }

  lines.push("=".repeat(60));
  return lines.join("\n");
};

const generatePrintableReport = (
  data: DailyReportData,
  isRangeMode: boolean = false,
): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Relatório do Caixa - ${data.date}</title>
      <style>
        @page { margin: 15mm; size: A4 landscape; }
        * { box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif; 
          margin: 0; 
          padding: 0; 
          line-height: 1.3;
          color: #333;
          background: #fff;
          text-align: center;
          font-size: 13px;
        }
        
        .container {
          max-width: 95%;
          margin: 0 auto;
          text-align: left;
        }
        
        .header { 
          text-align: center; 
          border-bottom: 2px solid #333; 
          padding: 8px 0; 
          margin-bottom: 15px; 
        }
        
        .header h1 { 
          margin: 0 0 4px 0; 
          color: #333; 
          font-size: 20px; 
          font-weight: bold;
        }
        
        .header h2 { 
          margin: 0; 
          color: #666; 
          font-size: 14px; 
          font-weight: normal;
        }
        
        .summary { 
          margin: 0 auto 15px auto; 
          padding: 8px;
          border: 1px solid #ddd;
          max-width: 100%;
        }
        
        .summary h3 {
          margin: 0 0 8px 0;
          color: #333;
          font-size: 16px;
          font-weight: bold;
          border-bottom: 1px solid #ddd;
          padding-bottom: 4px;
        }
        
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 8px;
        }
        
        .summary-item { 
          border: 1px solid #eee;
          padding: 6px;
        }
        
        .summary-item .label {
          font-size: 11px;
          color: #666;
          margin-bottom: 2px;
        }
        
        .summary-item .value {
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        
        .section-title {
          color: #333;
          font-size: 16px;
          font-weight: bold;
          margin: 20px 0 8px 0;
          padding: 4px 0;
          border-bottom: 1px solid #ddd;
        }
        
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 8px auto 15px auto;
          border: 1px solid #ddd;
        }
        
        th { 
          background: #f5f5f5;
          color: #333;
          font-weight: bold;
          padding: 6px 8px;
          text-align: center;
          font-size: 12px;
          border: 1px solid #ddd;
        }
        
        td { 
          padding: 6px 8px;
          border: 1px solid #ddd;
          font-size: 12px;
          vertical-align: top;
          text-align: center;
        }
        
        tr:nth-child(even) { background-color: #fafafa; }
        
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .small-text { font-size: 10px; color: #666; }
        
        .total-section { 
          margin: 15px auto 0 auto; 
          padding: 8px;
          border: 1px solid #ddd;
          max-width: 100%;
        }
        
        .totals-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-top: 8px;
        }
        
        .totals-column {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .total-section h3 {
          margin: 0 0 8px 0;
          color: #333;
          font-size: 16px;
          font-weight: bold;
        }
        
        .total-row { 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          margin: 4px 0; 
          font-size: 13px;
          padding: 2px 0;
        }
        
        .total-row .label {
          color: #333;
          font-weight: normal;
        }
        
        .total-row .value {
          font-weight: bold;
        }
        
        .total-row.grand-total { 
          font-size: 15px;
          border-top: 2px solid #333; 
          padding-top: 8px; 
          margin-top: 8px;
        }
        
        .grand-total .label {
          color: #333;
          font-weight: bold;
        }
        
        .grand-total .value {
          color: #333;
          font-weight: bold;
        }
        
        .footer {
          margin-top: 20px;
          padding-top: 8px;
          border-top: 1px solid #ddd;
          text-align: center;
          color: #666;
          font-size: 10px;
        }
        
        .generated-info {
          padding: 6px;
          margin-top: 15px;
          font-size: 10px;
          color: #666;
          text-align: center;
          border: 1px solid #ddd;
        }
        
        @media print {
          .header { break-inside: avoid; }
          .summary { break-inside: avoid; }
          .total-section { break-inside: avoid; }
          table { break-inside: avoid; }
          tr { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Relatório do Caixa ${isRangeMode ? "do Período" : "do Dia"}</h1>
          <h2>${data.date}</h2>
        </div>
      
      <div class="summary">
        <h3>Resumo Financeiro</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="label">Total Recebido</div>
            <div class="value">${formatCurrency(data.totalReceived)}</div>
            ${data.totalPaymentJuros > 0 ? `<div class="label">inclui ${formatCurrency(data.totalPaymentJuros)} de juros</div>` : ""}
          </div>
          <div class="summary-item">
            <div class="label">Descontos dados</div>
            <div class="value">${formatCurrency(data.totalPaymentDiscount)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Pagamentos</div>
            <div class="value">${data.totalPayments}</div>
          </div>
          <div class="summary-item">
            <div class="label">Cobradores</div>
            <div class="value">${data.collectorSummary.length}</div>
          </div>
        </div>
      </div>

      <h3 class="section-title">Por Forma de Pagamento</h3>
      <table>
        <tr>
          <th>Forma</th>
          <th>Recebido</th>
          <th>Pagamentos</th>
        </tr>
        ${data.byMethod
          .map(
            (m) => `
          <tr>
            <td>${m.rotulo}</td>
            <td style="font-weight: bold; text-align: right;">${formatCurrency(m.valor)}</td>
            <td>${m.qtd}</td>
          </tr>
        `,
          )
          .join("")}
      </table>

      <h3 class="section-title">Resumo por Cobrador</h3>
      <table>
        <tr>
          <th>Cobrador</th>
          <th>Valor Recebido</th>
          <th>Pagamentos</th>
          <th>Clientes</th>
          <th>Juros</th>
          <th>Descontos</th>
          <th>Números das Vendas</th>
        </tr>
        ${data.collectorSummary
          .map(
            (c) => `
          <tr>
            <td>${c.collectorName}</td>
            <td style="font-weight: bold; text-align: right;">${formatCurrency(c.receivedAmount)}</td>
            <td>${c.transactionCount}</td>
            <td>${c.clients.length}</td>
            <td style="text-align: right;">${formatCurrency(c.jurosAmount)}</td>
            <td style="text-align: right;">${formatCurrency(c.discountAmount)}</td>
            <td class="small-text">${c.saleNumbers.length > 0 ? `#${c.saleNumbers.join(", #")}` : "-"}</td>
          </tr>
        `,
          )
          .join("")}
      </table>

      ${
        data.payments.length > 0
          ? `
      <h3 class="section-title">Pagamentos</h3>
      <table>
        <tr>
          <th>Data Pgto.</th>
          <th>Cliente</th>
          <th>Documento</th>
          <th>Venda</th>
          <th>Loja</th>
          <th>Forma Pag.</th>
          <th>Recebido</th>
          <th>Total Pago (Hist.)</th>
          <th>Desconto</th>
          <th>Total Dívida</th>
          <th>Pendente Atual</th>
          <th>Cobrador</th>
        </tr>
        ${data.payments
          .map(
            (p) => `
          <tr>
            <td style="white-space: nowrap;">${formatDate(p.receivedDate)}</td>
            <td>${p.client}</td>
            <td>${p.clientDocument}</td>
            <td>${p.saleNumber ? `#${p.saleNumber}` : "Sem número"}</td>
            <td>${p.store}</td>
            <td>${formaPagamentoRotulo(p.paymentMethod)}</td>
            <td style="font-weight: bold; text-align: right;">${formatCurrency(p.totalReceivedValue)}${p.paymentJuros > 0 ? `<div class="small-text" style="font-weight: normal;">juros ${formatCurrency(p.paymentJuros)}</div>` : ""}</td>
            <td style="text-align: right;">${formatCurrency(p.totalPaidOnDebt)}</td>
            <td style="text-align: right; color: #e67e22;">${p.paymentDiscount > 0 ? formatCurrency(p.paymentDiscount) : "-"}</td>
            <td style="text-align: right;">${formatCurrency(p.totalDebt)}</td>
            <td style="font-weight: bold; text-align: right; color: ${p.remainingDebt > 0 ? "#e74c3c" : "#2ecc71"};">${p.remainingDebt > 0 ? formatCurrency(p.remainingDebt) : "Quitado"}</td>
            <td>${p.collector}</td>
          </tr>
        `,
          )
          .join("")}
      </table>
      
      <div class="total-section">
        <h3 style="margin-top: 0;">Totais Gerais</h3>
        <div class="totals-grid">
          <div class="totals-column">
            <div class="total-row">
              <span class="label">Pagamentos:</span>
              <span class="value">${data.totalPayments}</span>
            </div>
            <div class="total-row">
              <span class="label">Dívida Total dos Clientes:</span>
              <span class="value">${formatCurrency(data.debtTotals.totalDebt)}</span>
            </div>
            <div class="total-row">
              <span class="label">Já Pago pelos Clientes (Histórico):</span>
              <span class="value">${formatCurrency(data.debtTotals.totalPaidOnDebt)}</span>
            </div>
          </div>
          <div class="totals-column">
            <div class="total-row">
              <span class="label">Total Recebido${isRangeMode ? " no Período" : " no Dia"}:</span>
              <span class="value">${formatCurrency(data.totalReceived)}</span>
            </div>
            <div class="total-row">
              <span class="label">Juros (incluídos no total):</span>
              <span class="value">${formatCurrency(data.totalPaymentJuros)}</span>
            </div>
            <div class="total-row">
              <span class="label">Descontos dados:</span>
              <span class="value">${formatCurrency(data.totalPaymentDiscount)}</span>
            </div>
            <div class="total-row">
              <span class="label">Pendente Atual dos Clientes:</span>
              <span class="value">${formatCurrency(data.debtTotals.remainingDebt)}</span>
            </div>
          </div>
        </div>
        <div class="total-row grand-total">
          <span class="label">ARRECADAÇÃO LÍQUIDA:</span>
          <span class="value">${formatCurrency(data.totalReceived)}</span>
        </div>
      </div>
      `
          : ""
      }
      
      <div class="generated-info">
        <strong>Relatório Gerado Automaticamente</strong><br>
        Data de Geração: ${new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}<br>
        Sistema de Gestão de Cobrança
      </div>
      
        <div class="footer">
          <p>Este relatório contém informações confidenciais da empresa.</p>
          <p>Para dúvidas ou esclarecimentos, entre em contato com o setor financeiro.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export default DailyCashReport;
