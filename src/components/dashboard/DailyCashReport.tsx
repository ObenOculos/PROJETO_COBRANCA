import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  Download,
  DollarSign,
  TrendingUp,
  Users,
  FileText,
  Eye,
  Printer,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Collection } from "../../types";
import { formatCurrency, formatDate } from "../../utils/mockData";
import { useCollection } from "../../contexts/CollectionContext";

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
    totalPendingValue: number;
    receivedDate: string;
    collector: string;
    installments: {
      collectionId: number | string;
      originalValue: number;
      receivedValue: number;
      pendingValue: number;
    }[];
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
  const { users, salePayments, refreshData } = useCollection();
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
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);

  // Detectar mudanças nos salePayments para mostrar notificação
  useEffect(() => {
    setLastUpdate(new Date());
    setShowUpdateNotification(true);
    setForceUpdate(prev => prev + 1); // Força re-render
    
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
      .filter((u) => u.type === "collector")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

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
      if (selectedCollector !== "all" && payment.collectorId !== selectedCollector)
        return false;

      // Filtro de loja (buscar loja das collections para compatibilidade)
      if (selectedStore !== "all") {
        const relatedCollection = collections.find(c => 
          c.documento === payment.clientDocument && 
          c.venda_n === payment.saleNumber
        );
        if (!relatedCollection || relatedCollection.nome_da_loja !== selectedStore) {
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
      const relatedCollection = collections.find(c => 
        c.documento === payment.clientDocument && 
        c.venda_n === payment.saleNumber
      );

      if (!salesMap.has(saleKey)) {
        salesMap.set(saleKey, {
          saleKey,
          collectorId: payment.collectorId || "unknown",
          client: payment.clientDocument || "Cliente não informado",
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
    const salesPaymentMap = new Map<string, {
      saleKey: string;
      client: string;
      saleNumber: string;
      store: string;
      totalOriginalValue: number;
      totalReceivedValue: number;
      receivedDate: string;
      collector: string;
      installments: {
        collectionId: string;
        originalValue: number;
        receivedValue: number;
        pendingValue: number;
      }[];
    }>();

    filteredPayments.forEach((payment) => {
      const saleKey = `${payment.id}`;
      
      // Buscar dados da collection para obter valores originais e loja
      const relatedCollection = collections.find(c => 
        c.documento === payment.clientDocument && 
        c.venda_n === payment.saleNumber
      );
      
      if (!salesPaymentMap.has(saleKey)) {
        salesPaymentMap.set(saleKey, {
          saleKey,
          client: relatedCollection?.cliente || payment.clientDocument || "Cliente não informado",
          saleNumber: payment.saleNumber?.toString() || "",
          store: relatedCollection?.nome_da_loja || "",
          totalOriginalValue: 0,
          totalReceivedValue: payment.paymentAmount,
          receivedDate: payment.paymentDate || selectedDate,
          collector: payment.collectorName || users.find((u) => u.id === payment.collectorId)?.name || "Não atribuído",
          installments: [],
        });
      }

      const saleData = salesPaymentMap.get(saleKey)!;
      // Para sale_payments, cada registro representa um pagamento completo
      if (payment.distributionDetails && Array.isArray(payment.distributionDetails)) {
        payment.distributionDetails.forEach((detail: any) => {
          saleData.installments.push({
            collectionId: detail.installmentId || payment.id,
            originalValue: detail.originalAmount || 0,
            receivedValue: detail.appliedAmount || 0,
            pendingValue: Math.max(0, (detail.originalAmount || 0) - (detail.appliedAmount || 0)),
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
      totalPendingValue: Math.max(0, sale.totalOriginalValue - sale.totalReceivedValue),
    }));

    return {
      date:
        dateRangeMode === "single"
          ? formatDate(selectedDate)
          : `${formatDate(selectedDate)} - ${formatDate(endDate)}`,
      totalReceived: payments.reduce(
        (sum, p) => sum + p.totalReceivedValue,
        0,
      ),
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
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 lg:p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                <FileText className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
                <span className="truncate">
                  Relatório do Caixa
                  {dateRangeMode === "range" ? " do Período" : ""}
                </span>
              </h2>
              <p className="text-gray-600 mt-1 text-sm lg:text-base">
                Relatório detalhado de recebimentos
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await refreshData();
                  setForceUpdate(prev => prev + 1);
                }}
                className="flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                title="Atualizar dados"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`flex items-center justify-center px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium whitespace-nowrap ${
                  showDetails
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Eye className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">
                  {showDetails ? "Ocultar Detalhes" : "Ver Detalhes"}
                </span>
                <span className="sm:hidden">
                  {showDetails ? "Ocultar" : "Detalhes"}
                </span>
              </button>
            </div>
          </div>

          {/* Notificação de atualização */}
          {showUpdateNotification && (
            <div className="mt-2 flex items-center gap-2 text-sm text-green-600 animate-pulse">
              <RefreshCw className="h-4 w-4" />
              <span>Dados atualizados automaticamente</span>
            </div>
          )}
        </div>

        {/* Enhanced Filters */}
        <div className="p-4 lg:p-6">
          <div className="space-y-4">
            {/* Date Range Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Período
              </label>
              <div className="flex bg-gray-100 rounded-lg p-1 w-full sm:w-auto">
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors whitespace-nowrap"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Clear Filters Button */}
              <div className="flex items-end">
                <button
                  onClick={handleClearFilters}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Limpar Filtros
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 lg:p-6 rounded-xl border border-green-200">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-green-700">
                  Total Recebido
                </p>
                <p className="text-2xl lg:text-3xl font-bold text-green-900 truncate">
                  {formatCurrency(reportData.totalReceived)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 lg:h-10 lg:w-10 text-green-600 flex-shrink-0 ml-3" />
            </div>
          </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 lg:p-6 rounded-xl border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-700">Vendas</p>
              <p className="text-2xl lg:text-3xl font-bold text-blue-900">
                {reportData.totalTransactions}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 lg:h-10 lg:w-10 text-blue-600 flex-shrink-0 ml-3" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 lg:p-6 rounded-xl border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-purple-700">
                Cobradores Ativos
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-purple-900">
                {reportData.collectorSummary.length}
              </p>
            </div>
            <Users className="h-8 w-8 lg:h-10 lg:w-10 text-purple-600 flex-shrink-0 ml-3" />
          </div>
        </div>
      </div>

      {/* Indicador de última atualização */}
      <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
        <RefreshCw className="h-3 w-3" />
        <span>
          Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
        </span>
      </div>
    </div>

      {/* Collector Summary */}
      {reportData.collectorSummary.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Resumo por Cobrador
              </h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handlePrintReport}
                  className="flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </button>
                <button
                  onClick={handleExportReport}
                  className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </button>
              </div>
            </div>
          </div>

          {/* Mobile-friendly cards */}
          <div className="lg:hidden">
            <div className="divide-y divide-gray-200">
              {reportData.collectorSummary.map((collector) => (
                <div key={collector.collectorId} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">
                      {collector.collectorName}
                    </h4>
                    <span className="text-lg font-bold text-green-600">
                      {formatCurrency(collector.receivedAmount)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div>
                      <div className="font-medium text-gray-900">
                        {collector.transactionCount}
                      </div>
                      <div className="text-xs text-gray-600">Vendas</div>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {collector.clients.length}
                      </div>
                      <div className="text-xs text-gray-600">Clientes</div>
                    </div>
                    <div>
                      <div className="font-medium text-blue-600">
                        {formatCurrency(
                          collector.transactionCount > 0
                            ? collector.receivedAmount /
                                collector.transactionCount
                            : 0,
                        )}
                      </div>
                      <div className="text-xs text-gray-600">Ticket Médio</div>
                    </div>
                  </div>
                  {collector.saleNumbers.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">Vendas:</p>
                      <p className="text-sm text-gray-800">
                        #{collector.saleNumbers.join(", #")}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cobrador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor Recebido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clientes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ticket Médio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Números das Vendas
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reportData.collectorSummary.map((collector) => (
                  <tr key={collector.collectorId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {collector.collectorName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-green-600">
                        {formatCurrency(collector.receivedAmount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {collector.transactionCount}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {collector.clients.length}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(
                          collector.transactionCount > 0
                            ? collector.receivedAmount /
                                collector.transactionCount
                            : 0,
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {collector.saleNumbers.length > 0 
                          ? `#${collector.saleNumbers.join(", #")}`
                          : "-"
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Transactions */}
      {showDetails && reportData.payments.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Eye className="h-5 w-5 mr-2 text-blue-600" />
              Transações Detalhadas
            </h3>
          </div>

          {/* Mobile-friendly cards */}
          <div className="lg:hidden divide-y divide-gray-200">
            {reportData.payments.map((payment, index) => (
              <div key={`${payment.saleKey}-${index}`} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">
                      {payment.client}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {payment.saleNumber ? `Venda #${payment.saleNumber}` : `Venda sem número`}
                    </p>
                    <p className="text-sm text-gray-600">{payment.store}</p>
                    <p className="text-xs text-gray-500">
                      {payment.installments.length} parcela(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">
                      {formatCurrency(payment.totalReceivedValue)}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-600">
                    Cobrador: {payment.collector}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Devido:</span>
                      <div className="font-medium">{formatCurrency(payment.totalOriginalValue)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Recebido:</span>
                      <div className="font-medium text-green-600">{formatCurrency(payment.totalReceivedValue)}</div>
                    </div>
                    {payment.totalPendingValue > 0 && (
                      <div>
                        <span className="text-gray-500">Pendente:</span>
                        <div className="font-medium text-red-600">{formatCurrency(payment.totalPendingValue)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Venda
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parcelas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Loja
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor Devido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor Recebido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor Pendente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cobrador
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reportData.payments.map((payment, index) => (
                  <tr
                    key={`${payment.saleKey}-${index}`}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {payment.client}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.saleNumber ? `#${payment.saleNumber}` : 'Sem número'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.installments.length}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.store}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(payment.totalOriginalValue)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-green-600">
                        {formatCurrency(payment.totalReceivedValue)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-red-600">
                        {payment.totalPendingValue > 0 ? formatCurrency(payment.totalPendingValue) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.collector}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {reportData.totalTransactions === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
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
        `${payment.saleNumber ? `Venda: #${payment.saleNumber}` : 'Venda sem número'} | Loja: ${payment.store}`,
        `Parcelas: ${payment.installments.length}`,
        `Valor Devido: ${formatCurrency(payment.totalOriginalValue)} | Valor Recebido: ${formatCurrency(payment.totalReceivedValue)}`,
        `Valor Pendente: ${payment.totalPendingValue > 0 ? formatCurrency(payment.totalPendingValue) : 'Quitado'}`,
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
            <div class="label">Total de Vendas</div>
            <div class="value">${data.totalTransactions}</div>
          </div>
          <div class="summary-item">
            <div class="label">Cobradores Ativos</div>
            <div class="value">${data.collectorSummary.length}</div>
          </div>
          <div class="summary-item">
            <div class="label">Ticket Médio</div>
            <div class="value">${data.totalTransactions > 0 ? formatCurrency(data.totalReceived / data.totalTransactions) : formatCurrency(0)}</div>
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

      ${showDetails && data.payments.length > 0 ? `
      <h3 class="section-title">Transações Detalhadas</h3>
      <table>
        <tr>
          <th>Cliente</th>
          <th>Venda</th>
          <th>Parcelas</th>
          <th>Loja</th>
          <th>Valor Devido</th>
          <th>Valor Recebido</th>
          <th>Valor Pendente</th>
          <th>Cobrador</th>
        </tr>
        ${data.payments
          .map(
            (p) => `
          <tr>
            <td>${p.client}</td>
            <td>${p.saleNumber ? `#${p.saleNumber}` : 'Sem número'}</td>
            <td>${p.installments.length}</td>
            <td>${p.store}</td>
            <td style="text-align: right;">${formatCurrency(p.totalOriginalValue)}</td>
            <td style="font-weight: bold; text-align: right;">${formatCurrency(p.totalReceivedValue)}</td>
            <td style="text-align: right;">${p.totalPendingValue > 0 ? formatCurrency(p.totalPendingValue) : '-'}</td>
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
      ` : ''}
      
      ${!showDetails && data.payments.length > 0 ? `
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
      ` : ''}
      
      <div class="generated-info">
        <strong>Relatório Gerado Automaticamente</strong><br>
        Data de Geração: ${new Date().toLocaleString('pt-BR', { 
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
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
