import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  Download,
  DollarSign,
  FileText,
  Printer,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Collection } from "../../types";
import { formatCurrency, formatDate } from "../../utils/formatters";
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
  const [, setLastUpdate] = useState<Date>(new Date());
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [] = useState(false);
  
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
    <div className="space-y-4">
      {/* Header Simplificado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
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
                setForceUpdate(prev => prev + 1);
              }}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors relative"
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
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Printer className="h-5 w-5" />
            </button>
            
            <button
              onClick={handleExportReport}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Download className="h-5 w-5" />
            </button>
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-in slide-in-from-top-2">
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
      )}

      {/* Card Principal - Informação mais importante primeiro */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-100 text-sm font-medium">Total Recebido</p>
            <p className="text-4xl font-bold mt-1">
              {formatCurrency(reportData.totalReceived)}
            </p>
            {reportData.totalTransactions > 0 && (
              <p className="text-green-100 text-sm mt-2">
                Ticket médio: {formatCurrency(reportData.totalReceived / reportData.totalTransactions)}
              </p>
            )}
          </div>
          <DollarSign className="h-16 w-16 text-green-200 opacity-50" />
        </div>
        
        {/* Métricas secundárias */}
        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-green-400">
          <div>
            <p className="text-green-100 text-xs">Vendas</p>
            <p className="text-2xl font-semibold">{reportData.totalTransactions}</p>
          </div>
          <div>
            <p className="text-green-100 text-xs">Cobradores</p>
            <p className="text-2xl font-semibold">{reportData.collectorSummary.length}</p>
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
            {reportData.collectorSummary.map((collector) => (
              <div 
                key={collector.collectorId} 
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {collector.collectorName}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {collector.transactionCount} vendas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(collector.receivedAmount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Ticket: {formatCurrency(
                        collector.transactionCount > 0
                          ? collector.receivedAmount / collector.transactionCount
                          : 0
                      )}
                    </p>
                  </div>
                </div>
                
                {collector.saleNumbers.length > 0 && showDetails && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-600 mb-1">Vendas realizadas:</p>
                    <p className="text-xs text-gray-700 line-clamp-2">
                      #{collector.saleNumbers.join(", #")}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}



      {/* Transações Detalhadas - Melhor organização */}
      {showDetails && reportData.payments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Transações Detalhadas
          </h3>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              {/* Tabela Responsiva */}
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Cliente / Venda
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                      Loja
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider hidden md:table-cell">
                      Cobrador
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reportData.payments.map((payment, index) => (
                    <tr key={`${payment.saleKey}-${index}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{payment.client}</p>
                          <p className="text-xs text-gray-500">
                            {payment.saleNumber ? `Venda #${payment.saleNumber}` : 'Sem número'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-sm text-gray-600">{payment.store}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-sm text-gray-600">{payment.collector}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-bold text-green-600">
                          {formatCurrency(payment.totalReceivedValue)}
                        </p>
                        {payment.totalPendingValue > 0 && (
                          <p className="text-xs text-red-600">
                            Pendente: {formatCurrency(payment.totalPendingValue)}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
