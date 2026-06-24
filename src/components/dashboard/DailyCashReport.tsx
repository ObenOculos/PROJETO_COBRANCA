import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Calendar,
  Download,
  DollarSign,
  FileText,
  Printer,
  Filter,
  RefreshCw,
  ChevronDown,
  FileSpreadsheet,
  TrendingUp,
  User,
  Award,
  Activity,
  Receipt,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Collection, isCollectorType } from "../../types";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import ClientDetailModal from "./ClientDetailModal";
import { ClientGroup } from "../../types";

interface DailyCashReportProps {
  collections: Collection[];
}

interface DailyReportData {
  date: string;
  totalReceived: number;
  totalTransactions: number;
  collectorSummary: {
    collectorId: string;
    collectorName: string;
    receivedAmount: number;
    transactionCount: number;
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
    totalDiscount: number;
    totalDebt: number;
    remainingDebt: number;
    receivedDate: string;
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

const DailyCashReport: React.FC<DailyCashReportProps> = ({ collections }) => {
  const { users, salePayments, refreshData, getClientGroups } = useCollection();
  const { user } = useAuth();
  
  const [selectedClientForModal, setSelectedClientForModal] = useState<ClientGroup | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateBR());
  const [endDate, setEndDate] = useState<string>(getCurrentDateBR());
  const [showDetails, setShowDetails] = useState(false);
  const [dateRangeMode, setDateRangeMode] = useState<"single" | "range">(
    "single",
  );
  const [selectedCollector, setSelectedCollector] = useState<string>("all");
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [, setLastUpdate] = useState<Date>(new Date());
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const [] = useState(false);

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

  // Contador de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCollector !== "all") count++;
    if (selectedStore !== "all") count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    if (dateRangeMode === "range") count++;
    return count;
  }, [selectedCollector, selectedStore, minAmount, maxAmount, dateRangeMode]);

  // Detectar mudanças nos salePayments para mostrar notificação
  useEffect(() => {
    setLastUpdate(new Date());
    setShowUpdateNotification(true);
    setForceUpdate((prev) => prev + 1); // Força re-render

    // Esconder notificação após 3 segundos
    const timer = setTimeout(() => {
      setShowUpdateNotification(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [salePayments, collections]);

  // Quick date range selection
  const applyQuickDateRange = (
    rangeKey: keyof ReturnType<typeof getQuickDateRanges>,
  ) => {
    const ranges = getQuickDateRanges();
    const range = ranges[rangeKey];

    if (range.single) {
      setDateRangeMode("single");
      setSelectedDate(range.start);
    } else {
      setDateRangeMode("range");
      setSelectedDate(range.start);
      setEndDate(range.end);
    }
  };

  // Auto-apply "Mês Passado" when switching to range mode
  React.useEffect(() => {
    if (dateRangeMode === "range") {
      // Check if current dates are still default (today)
      const today = getCurrentDateBR();
      if (selectedDate === today && endDate === today) {
        applyQuickDateRange("mesPassado");
      }
    }
  }, [dateRangeMode]);

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

  const reportData = useMemo((): DailyReportData => {
    // Usar dados da tabela sale_payments em vez de collections

    const filteredPayments = salePayments.filter((payment) => {
      // Filtro de data
      const paymentDate = payment.paymentDate;
      if (!paymentDate) return false;

      const isInDateRange =
        dateRangeMode === "single"
          ? paymentDate === selectedDate
          : paymentDate >= selectedDate && paymentDate <= endDate;

      if (!isInDateRange) return false;

      // Filtro de cobrador
      if (
        selectedCollector !== "all" &&
        payment.collectorId !== selectedCollector
      )
        return false;

      // Filtro de loja (buscar loja das collections para compatibilidade)
      if (selectedStore !== "all") {
        let relatedCollection = collections.find(
          (c) =>
            c.documento === payment.clientDocument &&
            c.venda_n === payment.saleNumber,
        );

        // Fallback para buscar a loja por documento se não achar pela venda específica
        if (!relatedCollection) {
          relatedCollection = collections.find(
            (c) => c.documento === payment.clientDocument,
          );
        }

        if (
          !relatedCollection ||
          relatedCollection.nome_da_loja !== selectedStore
        ) {
          return false;
        }
      }

      // Filtro de valor
      const paymentAmount = payment.paymentAmount;
      if (minAmount && paymentAmount < parseFloat(minAmount)) return false;
      if (maxAmount && paymentAmount > parseFloat(maxAmount)) return false;

      return true;
    });

    // Agrupar por pagamento individual (cada pagamento é uma transação única)
    const salesMap = new Map<
      string,
      {
        saleKey: string;
        collectorId: string;
        client: string;
        totalReceived: number;
        originalValue: number;
        store: string;
        saleNumber: string;
      }
    >();

    filteredPayments.forEach((payment) => {
      const saleKey = `${payment.saleNumber}-${payment.clientDocument}-${payment.collectorId}-${payment.id}`;

      // Buscar dados da collection para obter valores originais e loja
      // Tentar match específico primeiro, se falhar (ex: venda 0), buscar qualquer registro do cliente
      let relatedCollection = collections.find(
        (c) =>
          c.documento === payment.clientDocument &&
          c.venda_n === payment.saleNumber,
      );

      if (!relatedCollection) {
        relatedCollection = collections.find(
          (c) => c.documento === payment.clientDocument,
        );
      }

      if (!salesMap.has(saleKey)) {
        salesMap.set(saleKey, {
          saleKey,
          collectorId: payment.collectorId || "unknown",
          client:
            payment.clientName ||
            relatedCollection?.cliente ||
            payment.clientDocument ||
            "Cliente não informado",
          totalReceived: 0,
          originalValue: relatedCollection?.valor_original || 0,
          store: relatedCollection?.nome_da_loja || "",
          saleNumber: payment.saleNumber?.toString() || "",
        });
      }

      const saleData = salesMap.get(saleKey)!;
      saleData.totalReceived += payment.paymentAmount;
    });

    // Agrupar por cobrador
    const collectorMap = new Map<
      string,
      {
        collectorId: string;
        collectorName: string;
        receivedAmount: number;
        transactionCount: number;
        clients: Set<string>;
        saleNumbers: Set<string>;
      }
    >();

    Array.from(salesMap.values()).forEach((sale) => {
      const collectorId = sale.collectorId;
      const collector = users.find((u) => u.id === collectorId);
      const collectorName = collector?.name || "Não atribuído";

      if (!collectorMap.has(collectorId)) {
        collectorMap.set(collectorId, {
          collectorId,
          collectorName,
          receivedAmount: 0,
          transactionCount: 0,
          clients: new Set(),
          saleNumbers: new Set(),
        });
      }

      const collectorData = collectorMap.get(collectorId)!;
      collectorData.receivedAmount += sale.totalReceived;
      collectorData.transactionCount += 1; // Conta uma transação por venda
      collectorData.clients.add(sale.client);
      if (sale.saleNumber) {
        collectorData.saleNumbers.add(sale.saleNumber);
      }
    });

    // Converter para array
    const collectorSummary = Array.from(collectorMap.values()).map((c) => ({
      ...c,
      clients: Array.from(c.clients),
      saleNumbers: Array.from(c.saleNumbers).sort(),
    }));

    // Mapear pagamentos para detalhes usando sale_payments
    const salesPaymentMap = new Map<
      string,
      {
        saleKey: string;
        client: string;
        clientDocument: string;
        saleNumber: string;
        store: string;
        totalOriginalValue: number;
        totalReceivedValue: number;
        totalPaidOnDebt: number;
        totalPendingValue: number;
        totalDiscount: number;
        totalDebt: number;
        remainingDebt: number;
        receivedDate: string;
        collector: string;
        paymentMethod: string;
        installments: {
          collectionId: string;
          originalValue: number;
          receivedValue: number;
          pendingValue: number;
        }[];
      }
    >();

    filteredPayments.forEach((payment) => {
      const saleKey = `${payment.id}`;

      // 1. Tentar encontrar a parcela específica que foi paga
      let specificInstallment = collections.find(
        (c) =>
          c.documento === payment.clientDocument &&
          c.venda_n === payment.saleNumber &&
          c.id_parcela.toString() === payment.distribution_details?.[0]?.installmentId?.toString()
      );

      // 2. Se não achou a específica (ex: venda 0 ou ajuste manual), buscar qualquer registro do cliente para pegar Nome/Loja
      const anyClientRecord = collections.find(c => c.documento === payment.clientDocument);

      // 3. CALCULAR DÍVIDA TOTAL DO CLIENTE (para esta venda específica ou geral se venda 0)
      // Buscamos todas as parcelas desse cliente para ter o quadro completo
      const clientInstallments = collections.filter(c => 
        c.documento === payment.clientDocument && 
        (payment.saleNumber && payment.saleNumber !== 0 ? c.venda_n === payment.saleNumber : true)
      );

      const totalDebtValue = clientInstallments.reduce((sum, c) => sum + (c.valor_original || 0), 0);
      const totalAlreadyPaidValue = clientInstallments.reduce((sum, c) => sum + (c.valor_recebido || 0), 0);
      const totalDiscountValue = clientInstallments.reduce((sum, c) => sum + (c.desconto || 0), 0);
      
      // O pendente da dívida é o total original menos tudo que já foi recebido E descontos aplicados
      const currentRemainingDebt = Math.max(0, totalDebtValue - (totalAlreadyPaidValue + totalDiscountValue));

      if (!salesPaymentMap.has(saleKey)) {
        salesPaymentMap.set(saleKey, {
          saleKey,
          client:
            payment.clientName ||
            anyClientRecord?.cliente ||
            payment.clientDocument ||
            "Cliente não informado",
          clientDocument: payment.clientDocument || anyClientRecord?.documento || "",
          saleNumber: payment.saleNumber?.toString() || "",
          store: anyClientRecord?.nome_da_loja || "",
          totalOriginalValue: specificInstallment?.valor_original || 0,
          totalReceivedValue: payment.paymentAmount,
          totalPaidOnDebt: totalAlreadyPaidValue,
          totalPendingValue: Math.max(0, (specificInstallment?.valor_original || 0) - (specificInstallment?.valor_recebido || 0)),
          totalDiscount: totalDiscountValue,
          totalDebt: totalDebtValue,
          remainingDebt: currentRemainingDebt,
          receivedDate: payment.paymentDate || selectedDate,
          collector:
            payment.collectorName ||
            users.find((u) => u.id === payment.collectorId)?.name ||
            "Não atribuído",
          paymentMethod: payment.paymentMethod || "Não informado",
          installments: [],
        });
      }

      const saleData = salesPaymentMap.get(saleKey)!;
      // Para sale_payments, cada registro representa um pagamento completo
      if (
        payment.distribution_details &&
        Array.isArray(payment.distribution_details)
      ) {
        payment.distribution_details.forEach((detail: any) => {
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
        // Fallback se não houver detalhes de distribuição
        saleData.installments.push({
          collectionId: payment.id,
          originalValue: 0,
          receivedValue: payment.paymentAmount,
          pendingValue: 0,
        });
      }
    });

    // Converter para array e calcular valor pendente total
    const payments = Array.from(salesPaymentMap.values()).map((sale) => ({
      ...sale,
      totalPendingValue: Math.max(
        0,
        sale.totalOriginalValue - sale.totalReceivedValue,
      ),
    }));

    return {
      date:
        dateRangeMode === "single"
          ? formatDate(selectedDate)
          : `${formatDate(selectedDate)} - ${formatDate(endDate)}`,
      totalReceived: payments.reduce((sum, p) => sum + p.totalReceivedValue, 0),
      totalTransactions: salesMap.size, // Conta vendas únicas em vez de parcelas
      collectorSummary,
      payments,
    };
  }, [
    salePayments,
    collections,
    selectedDate,
    endDate,
    dateRangeMode,
    selectedCollector,
    selectedStore,
    minAmount,
    maxAmount,
    users,
    forceUpdate,
  ]);

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
    // 1. Preparar Aba de Resumo
    const summaryHeader = [
      ["RELATÓRIO DE CAIXA - FOCCO BRASIL"],
      [`Período: ${reportData.date}`],
      [`Data de Extração: ${new Date().toLocaleString("pt-BR")}`],
      [""],
      ["MÉTRICAS GERAIS"],
      ["Total Arrecadado", reportData.totalReceived],
      ["Total de Descontos", reportData.payments.reduce((sum, p) => sum + p.totalDiscount, 0)],
      ["Quantidade de Vendas", reportData.totalTransactions],
      ["Cobradores Ativos", reportData.collectorSummary.length],
      ["Ticket Médio", reportData.totalTransactions > 0 ? reportData.totalReceived / reportData.totalTransactions : 0],
      [""],
      ["DESEMPENHO POR COBRADOR"],
      ["Cobrador", "Valor Recebido", "Qtd Vendas", "% Participação", "Ticket Médio"]
    ];

    const collectorRows = reportData.collectorSummary
      .sort((a, b) => b.receivedAmount - a.receivedAmount)
      .map(c => [
        c.collectorName,
        c.receivedAmount,
        c.transactionCount,
        reportData.totalReceived > 0 ? (c.receivedAmount / reportData.totalReceived) : 0,
        c.transactionCount > 0 ? c.receivedAmount / c.transactionCount : 0
      ]);

    const summaryWS = XLSX.utils.aoa_to_sheet([...summaryHeader, ...collectorRows]);

    // Configurar larguras das colunas do Resumo
    summaryWS["!cols"] = [
      { wch: 30 }, // Cobrador
      { wch: 15 }, // Valor
      { wch: 12 }, // Vendas
      { wch: 15 }, // %
      { wch: 15 }  // Ticket
    ];

    // 2. Preparar Aba de Transações Detalhadas
    const detailsHeader = [
      ["LISTAGEM DETALHADA DE RECEBIMENTOS"],
      [""],
      [
        "Cliente", 
        "CPF/CNPJ", 
        "Venda", 
        "Loja", 
        "Cobrador", 
        "Forma Pagamento", 
        "Valor Recebido (Hoje)", 
        "Total Pago (Histórico)",
        "Desconto",
        "Total da Dívida", 
        "Pendente Atual",
        "Data Pagamento"
      ]
    ];

    const detailRows = reportData.payments.map(p => [
      p.client,
      p.clientDocument,
      p.saleNumber ? `#${p.saleNumber}` : "-",
      p.store,
      p.collector,
      p.paymentMethod,
      p.totalReceivedValue,
      p.totalPaidOnDebt,
      p.totalDiscount,
      p.totalDebt,
      p.remainingDebt,
      p.receivedDate
    ]);

    const detailsWS = XLSX.utils.aoa_to_sheet([...detailsHeader, ...detailRows]);

    // Configurar larguras das colunas de Detalhes
    detailsWS["!cols"] = [
      { wch: 35 }, // Cliente
      { wch: 18 }, // CPF
      { wch: 10 }, // Venda
      { wch: 15 }, // Loja
      { wch: 20 }, // Cobrador
      { wch: 15 }, // Forma
      { wch: 18 }, // Recebido Hoje
      { wch: 18 }, // Total Pago Histórico
      { wch: 12 }, // Desconto
      { wch: 15 }, // Total Dívida
      { wch: 15 }, // Pendente
      { wch: 15 }  // Data
    ];

    // Criar o Workbook e Salvar
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summaryWS, "Resumo Executivo");
    XLSX.utils.book_append_sheet(wb, detailsWS, "Transações");

    const filenameDate = dateRangeMode === "single" ? selectedDate : `${selectedDate}_a_${endDate}`;
    XLSX.writeFile(wb, `Relatorio_Caixa_${filenameDate}.xlsx`);
    setShowExportOptions(false);
  };

  const handlePrintReport = () => {
    const printContent = generatePrintableReport(
      reportData,
      dateRangeMode === "range",
      showDetails,
    );
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleClearFilters = () => {
    setDateRangeMode("single");
    setSelectedDate(getCurrentDateBR());
    setEndDate(getCurrentDateBR());
    setSelectedCollector("all");
    setSelectedStore("all");
    setMinAmount("");
    setMaxAmount("");
  };

  return (
    <div className="space-y-4">
      {/* Header Simplificado */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Relatório do Caixa
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {dateRangeMode === "single"
                ? formatDate(selectedDate)
                : `${formatDate(selectedDate)} até ${formatDate(endDate)}`}
            </p>
          </div>

          {/* Ações Principais */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await refreshData();
                setForceUpdate((prev) => prev + 1);
              }}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="h-5 w-5" />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors relative"
            >
              <Filter className="h-5 w-5" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            <button
              onClick={handlePrintReport}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors"
              title="Imprimir"
            >
              <Printer className="h-5 w-5" />
            </button>

            {/* Dropdown de Exportação */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => setShowExportOptions(!showExportOptions)}
                className="flex items-center gap-1 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-colors"
                title="Exportar"
              >
                <Download className="h-5 w-5" />
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${showExportOptions ? "rotate-180" : ""}`}
                />
              </button>

              {showExportOptions && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={handleExportReport}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-blue-500" />
                    Salvar em TXT
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Salvar em Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showUpdateNotification && (
          <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Atualizado</span>
          </div>
        )}
      </div>

      {/* Filtros Colapsáveis */}
      {showFilters && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-4">
            {/* Date Range Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Período
              </label>
              <div className="flex bg-gray-100 rounded-2xl p-1 w-full sm:w-auto">
                <button
                  onClick={() => setDateRangeMode("single")}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    dateRangeMode === "single"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Data Única
                </button>
                <button
                  onClick={() => setDateRangeMode("range")}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    dateRangeMode === "range"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Período
                </button>
              </div>
            </div>

            {/* Quick Date Range Buttons */}
            <div>
              <label className="block text-xs font-black text-gray-400 tracking-wider mb-2">
                Ações Rápidas
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(getQuickDateRanges()).map(([key, range]) => (
                  <button
                    key={key}
                    onClick={() =>
                      applyQuickDateRange(
                        key as keyof ReturnType<typeof getQuickDateRanges>,
                      )
                    }
                    className="px-4 py-2 text-xs font-bold bg-gray-50 text-gray-600 rounded-full hover:bg-blue-50 hover:text-blue-600 border border-gray-100 transition-all duration-200 whitespace-nowrap active:scale-95 shadow-sm"
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Date Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dateRangeMode === "single" ? "Data" : "Data Inicial"}
                </label>
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* End Date (only in range mode) */}
              {dateRangeMode === "range" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Final
                  </label>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={selectedDate}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Collector Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cobrador
                </label>
                <select
                  value={selectedCollector}
                  onChange={(e) => setSelectedCollector(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Todos os Cobradores</option>
                  {availableCollectors.map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Store Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loja
                </label>
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Todas as Lojas</option>
                  {availableStores.map((store) => (
                    <option key={store} value={store}>
                      {store}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor Mínimo
                </label>
                <div className="flex items-center">
                  <DollarSign className="h-4 w-4 text-gray-500 mr-2" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor Máximo
                </label>
                <div className="flex items-center">
                  <DollarSign className="h-4 w-4 text-gray-500 mr-2" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="∞"
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Clear Filters Button */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleClearFilters}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-2xl hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  Limpar Filtros
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card Principal - Dashboard Style */}
      <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-700 text-white rounded-[2rem] shadow-xl p-8 relative overflow-hidden group">
        {/* Padrão decorativo de fundo */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl transition-transform duration-1000 group-hover:scale-110" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-teal-400/20 rounded-full blur-2xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                <TrendingUp className="h-4 w-4 text-emerald-100" />
              </div>
              <p className="text-emerald-100 text-sm font-black tracking-wide">Arrecadação Total</p>
            </div>
            <p className="text-5xl font-black mt-1 tracking-tight">
              {formatCurrency(reportData.totalReceived)}
            </p>
            {reportData.totalTransactions > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10">
                <Activity className="h-3.5 w-3.5 text-emerald-200" />
                <p className="text-emerald-100 text-xs font-bold">
                  Ticket médio: <span className="text-white">{formatCurrency(reportData.totalReceived / reportData.totalTransactions)}</span>
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-inner">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-1.5 bg-emerald-400/30 rounded-lg">
                  <Receipt className="h-4 w-4 text-white" />
                </div>
                <p className="text-emerald-50) text-[10px] font-black tracking-wide">Vendas</p>
              </div>
              <p className="text-2xl font-black">{reportData.totalTransactions}</p>
            </div>
            
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-inner">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-1.5 bg-teal-400/30 rounded-lg">
                  <User className="h-4 w-4 text-white" />
                </div>
                <p className="text-emerald-50) text-[10px] font-black tracking-wide">Cobradores</p>
              </div>
              <p className="text-2xl font-black">{reportData.collectorSummary.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Cobradores - Design melhorado */}
      {reportData.collectorSummary.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Desempenho por Cobrador
            </h3>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
            </button>
          </div>

          {/* Cards de Cobradores */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reportData.collectorSummary
              .sort((a, b) => b.receivedAmount - a.receivedAmount)
              .map((collector, index) => {
                const percentage = reportData.totalReceived > 0 
                  ? (collector.receivedAmount / reportData.totalReceived) * 100 
                  : 0;
                
                return (
                  <div
                    key={collector.collectorId}
                    className="bg-white rounded-[1.5rem] border border-gray-100 p-5 hover:shadow-xl transition-all duration-300 group animate-in fade-in slide-in-from-bottom-2"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center font-black text-lg shadow-sm border-2 ${
                          index === 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-blue-50 border-blue-100 text-blue-700"
                        }`}>
                          {collector.collectorName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-gray-900 leading-tight">
                              {collector.collectorName}
                            </h4>
                            {index === 0 && <Award className="h-4 w-4 text-amber-500 fill-amber-500" />}
                          </div>
                          <p className="text-[10px] font-black text-gray-400 tracking-wider">
                            {collector.transactionCount} Transações
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-gray-900">
                          {formatCurrency(collector.receivedAmount)}
                        </p>
                        <p className="text-[10px] font-bold text-gray-400">
                          {percentage.toFixed(1)}% do total
                        </p>
                      </div>
                    </div>

                    {/* Barra de Progresso */}
                    <div className="space-y-1.5">
                      <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ease-out ${
                            index === 0 ? "bg-amber-500" : "bg-blue-500"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 tracking-tighter">
                        <span>Ticket: {formatCurrency(collector.transactionCount > 0 ? collector.receivedAmount / collector.transactionCount : 0)}</span>
                        <span>{collector.clients.length} Clientes</span>
                      </div>
                    </div>

                    {collector.saleNumbers.length > 0 && showDetails && (
                      <div className="mt-4 pt-4 border-t border-dashed border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 tracking-wider mb-2 flex items-center gap-1">
                          <Receipt className="h-3 w-3" /> Vendas Realizadas
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {collector.saleNumbers.slice(0, 5).map(num => (
                            <span key={num} className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-[10px] font-bold border border-gray-100">
                              #{num}
                            </span>
                          ))}
                          {collector.saleNumbers.length > 5 && (
                            <span className="text-[10px] font-bold text-gray-400 self-center ml-1">
                              +{collector.saleNumbers.length - 5}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Transações Detalhadas - Melhor organização */}
      {showDetails && reportData.payments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Transações Detalhadas
          </h3>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              {/* Tabela Responsiva Otimizada */}
              <table className="w-full table-auto border-collapse">
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 tracking-wide min-w-[200px]">
                      Cliente / Venda
                    </th>
                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 tracking-wide hidden 2xl:table-cell">
                      Loja
                    </th>
                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 tracking-wide hidden xl:table-cell">
                      Forma
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 tracking-wide">
                      Recebido
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 tracking-wide hidden xl:table-cell">
                      Pago (Acum.)
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 tracking-wide hidden md:table-cell">
                      Desconto
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 tracking-wide hidden lg:table-cell">
                      Total Dívida
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 tracking-wide">
                      Pendente
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportData.payments.map((payment, index) => {
                    const method = payment.paymentMethod?.toLowerCase() || "";
                    const methodColor = 
                      method.includes("pix") ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                      method.includes("dinheiro") ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      method.includes("cart") ? "bg-blue-50 text-blue-700 border-blue-100" :
                      method.includes("boleto") ? "bg-amber-50 text-amber-700 border-amber-100" :
                      "bg-gray-50 text-gray-700 border-gray-100";

                    return (
                      <tr
                        key={`${payment.saleKey}-${index}`}
                        className="hover:bg-blue-50/30 transition-colors group animate-in fade-in slide-in-from-left-2"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleOpenClientModal(payment.clientDocument)}
                              className="text-sm font-bold text-gray-900 leading-none mb-1 text-left hover:text-blue-600 transition-colors"
                            >
                              {payment.client}
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded tracking-tighter">
                                {payment.saleNumber ? `Venda #${payment.saleNumber}` : "Sem número"}
                              </span>
                              <span className="text-[10px] font-medium text-gray-400 font-mono hidden sm:inline">
                                {payment.clientDocument}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden 2xl:table-cell">
                          <p className="text-xs font-semibold text-gray-500 truncate max-w-[120px]">{payment.store}</p>
                        </td>
                        <td className="px-4 py-4 hidden xl:table-cell">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black border tracking-tighter ${methodColor}`}>
                            {payment.paymentMethod?.split(" ")[0]}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="text-sm font-black text-emerald-600">
                            {formatCurrency(payment.totalReceivedValue)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right hidden xl:table-cell">
                          <p className="text-xs font-bold text-gray-500">
                            {formatCurrency(payment.totalPaidOnDebt)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right hidden md:table-cell">
                          <p className={`text-xs font-bold ${payment.totalDiscount > 0 ? "text-orange-600" : "text-gray-300"}`}>
                            {payment.totalDiscount > 0 ? formatCurrency(payment.totalDiscount) : "-"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right hidden lg:table-cell">
                          <p className="text-xs font-bold text-gray-400">
                            {formatCurrency(payment.totalDebt)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className={`text-sm font-black ${payment.remainingDebt > 0 ? "text-red-600" : "text-gray-400"}`}>
                            {payment.remainingDebt > 0 ? formatCurrency(payment.remainingDebt) : "Quitado"}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {reportData.totalTransactions === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum recebimento encontrado
          </h3>
          <p className="text-gray-600">
            Não há recebimentos registrados para{" "}
            {dateRangeMode === "single"
              ? formatDate(selectedDate)
              : `${formatDate(selectedDate)} até ${formatDate(endDate)}`}{" "}
            com os filtros selecionados.
          </p>
        </div>
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
    `Total de Descontos: ${formatCurrency(data.payments.reduce((sum, p) => sum + p.totalDiscount, 0))}`,
    `Total de Vendas: ${data.totalTransactions}`,
    `Cobradores Ativos: ${data.collectorSummary.length}`,
    "",
    "RESUMO POR COBRADOR:",
    "-".repeat(60),
  ];

  data.collectorSummary.forEach((collector) => {
    lines.push(
      `${collector.collectorName}:`,
      `  Valor Recebido: ${formatCurrency(collector.receivedAmount)}`,
      `  Vendas: ${collector.transactionCount}`,
      `  Clientes: ${collector.clients.length}`,
      `  Números das Vendas: ${collector.saleNumbers.length > 0 ? `#${collector.saleNumbers.join(", #")}` : "Nenhuma venda com número"}`,
      "",
    );
  });

  if (data.payments.length > 0) {
    lines.push("TRANSAÇÕES DETALHADAS:", "-".repeat(60));

    data.payments.forEach((payment) => {
      lines.push(
        `Cliente: ${payment.client}`,
        `${payment.saleNumber ? `Venda: #${payment.saleNumber}` : "Venda sem número"} | Loja: ${payment.store}`,
        `Forma de Pagamento: ${payment.paymentMethod}`,
        `Valor Recebido: ${formatCurrency(payment.totalReceivedValue)} | Desconto: ${formatCurrency(payment.totalDiscount)}`,
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
  showDetails: boolean = false,
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
          </div>
          <div class="summary-item">
            <div class="label">Total Descontos</div>
            <div class="value">${formatCurrency(data.payments.reduce((sum, p) => sum + p.totalDiscount, 0))}</div>
          </div>
          <div class="summary-item">
            <div class="label">Total de Vendas</div>
            <div class="value">${data.totalTransactions}</div>
          </div>
          <div class="summary-item">
            <div class="label">Cobradores Ativos</div>
            <div class="value">${data.collectorSummary.length}</div>
          </div>
        </div>
      </div>

      <h3 class="section-title">Resumo por Cobrador</h3>
      <table>
        <tr>
          <th>Cobrador</th>
          <th>Valor Recebido</th>
          <th>Vendas</th>
          <th>Clientes</th>
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
            <td class="small-text">${c.saleNumbers.length > 0 ? `#${c.saleNumbers.join(", #")}` : "-"}</td>
          </tr>
        `,
          )
          .join("")}
      </table>

      ${
        showDetails && data.payments.length > 0
          ? `
      <h3 class="section-title">Transações Detalhadas</h3>
      <table>
        <tr>
          <th>Cliente</th>
          <th>Documento</th>
          <th>Venda</th>
          <th>Loja</th>
          <th>Forma Pag.</th>
          <th>Recebido Hoje</th>
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
            <td>${p.client}</td>
            <td>${p.clientDocument}</td>
            <td>${p.saleNumber ? `#${p.saleNumber}` : "Sem número"}</td>
            <td>${p.store}</td>
            <td>${p.paymentMethod}</td>
            <td style="font-weight: bold; text-align: right;">${formatCurrency(p.totalReceivedValue)}</td>
            <td style="text-align: right;">${formatCurrency(p.totalPaidOnDebt)}</td>
            <td style="text-align: right; color: #e67e22;">${p.totalDiscount > 0 ? formatCurrency(p.totalDiscount) : "-"}</td>
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
              <span class="label">Total de Vendas:</span>
              <span class="value">${data.totalTransactions}</span>
            </div>
            <div class="total-row">
              <span class="label">Total Original da Dívida:</span>
              <span class="value">${formatCurrency(data.payments.reduce((sum, p) => sum + p.totalDebt, 0))}</span>
            </div>
            <div class="total-row">
              <span class="label">Total já Pago (Histórico):</span>
              <span class="value">${formatCurrency(data.payments.reduce((sum, p) => sum + p.totalPaidOnDebt, 0))}</span>
            </div>
          </div>
          <div class="totals-column">
            <div class="total-row">
              <span class="label">Total Recebido (Hoje):</span>
              <span class="value">${formatCurrency(data.totalReceived)}</span>
            </div>
            <div class="total-row">
              <span class="label">Total Descontos:</span>
              <span class="value">${formatCurrency(data.payments.reduce((sum, p) => sum + p.totalDiscount, 0))}</span>
            </div>
            <div class="total-row">
              <span class="label">Total Pendente:</span>
              <span class="value">${formatCurrency(data.payments.reduce((sum, p) => sum + p.remainingDebt, 0))}</span>
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
      
      ${
        !showDetails && data.payments.length > 0
          ? `
      <div class="total-section">
        <h3 style="margin-top: 0;">Totais Gerais</h3>
        <div class="totals-grid">
          <div class="totals-column">
            <div class="total-row">
              <span class="label">Total de Vendas:</span>
              <span class="value">${data.totalTransactions}</span>
            </div>
            <div class="total-row">
              <span class="label">Total Devido:</span>
              <span class="value">${formatCurrency(data.payments.reduce((sum, p) => sum + p.totalOriginalValue, 0))}</span>
            </div>
          </div>
          <div class="totals-column">
            <div class="total-row">
              <span class="label">Total Recebido:</span>
              <span class="value">${formatCurrency(data.totalReceived)}</span>
            </div>
            <div class="total-row">
              <span class="label">Total Pendente:</span>
              <span class="value">${formatCurrency(data.payments.reduce((sum, p) => sum + p.totalPendingValue, 0))}</span>
            </div>
          </div>
        </div>
        <div class="total-row grand-total">
          <span class="label">RESULTADO FINAL:</span>
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
