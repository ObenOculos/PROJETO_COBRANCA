import React, { useState, useEffect } from "react";
import {
  X,
  Edit,
  DollarSign,
  CheckCircle,
  Receipt,
  Calculator,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { ClientGroup, SaleGroup } from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { useOffline } from "../../hooks/useOffline";
import { formatCurrency } from "../../utils/formatters";

interface GeneralPaymentModalProps {
  clientGroup: ClientGroup;
  clientSales: SaleGroup[];
  onClose: () => void;
  onSuccess: () => void;
}

interface SaleDistributionItem {
  sale: SaleGroup;
  currentReceived: number;
  newAmount: number;
  appliedAmount: number;
}

const GeneralPaymentModal: React.FC<GeneralPaymentModalProps> = ({
  clientGroup,
  clientSales,
  onClose,
  onSuccess,
}) => {
  const { processGeneralPayment } = useCollection();
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const [loading, setLoading] = useState(false);
  const [distributionAmount, setDistributionAmount] = useState<string>("");
  const [distributionMode, setDistributionMode] = useState<"auto" | "manual">(
    "auto",
  );
  const [saleDistribution, setSaleDistribution] = useState<
    SaleDistributionItem[]
  >([]);
  const [manualSaleEdits, setManualSaleEdits] = useState<
    Record<number, string>
  >({});

  // Calcular totais com validações
  const totalValue =
    clientSales?.reduce((sum, sale) => {
      return sum + (sale.totalValue || 0);
    }, 0) || 0;

  const totalReceived =
    clientSales?.reduce((sum, sale) => {
      return sum + (sale.totalReceived || 0);
    }, 0) || 0;

  const totalPending =
    clientSales?.reduce((sum, sale) => {
      return sum + (sale.pendingValue || 0);
    }, 0) || 0;

  // Calcular distribuição automática por venda
  const calculateSaleDistribution = React.useCallback(() => {
    const amount = parseFloat(distributionAmount) || 0;
    if (amount <= 0) {
      setSaleDistribution([]);
      return;
    }

    let remainingAmount = amount;
    const newDistribution: SaleDistributionItem[] = [];

    // Ordenar vendas por prioridade (vendas com menor saldo devedor primeiro)
    const sortedSales = [...(clientSales || [])].sort((a, b) => {
      return (a.pendingValue || 0) - (b.pendingValue || 0);
    });

    for (const sale of sortedSales) {
      if (remainingAmount <= 0) break;

      const currentReceived = sale.totalReceived || 0;
      const pendingValue = sale.pendingValue || 0;

      if (pendingValue > 0) {
        const appliedAmount = Math.min(remainingAmount, pendingValue);
        const newAmount = currentReceived + appliedAmount;

        newDistribution.push({
          sale,
          currentReceived,
          newAmount,
          appliedAmount,
        });

        remainingAmount -= appliedAmount;
      }
    }

    setSaleDistribution(newDistribution);

    // Inicializar valores manuais por venda
    const initialManualValues: Record<number, string> = {};
    newDistribution.forEach((item) => {
      initialManualValues[item.sale.saleNumber] = item.newAmount.toFixed(2);
    });
    setManualSaleEdits(initialManualValues);
  }, [distributionAmount, clientSales]);

  // Recalcular distribuição quando o valor mudar
  useEffect(() => {
    if (distributionMode === "auto") {
      calculateSaleDistribution();
    }
  }, [distributionAmount, distributionMode, calculateSaleDistribution]);

  const handleManualSaleEdit = (saleNumber: number, value: string) => {
    setManualSaleEdits((prev) => ({
      ...prev,
      [saleNumber]: value,
    }));

    // Atualizar distribuição com valor manual
    setSaleDistribution((prev) =>
      prev.map((item) => {
        if (item.sale.saleNumber === saleNumber) {
          const newAmount = parseFloat(value) || 0;
          return {
            ...item,
            newAmount,
            appliedAmount: newAmount - item.currentReceived,
          };
        }
        return item;
      }),
    );
  };

  const getTotalDistributed = () => {
    return saleDistribution.reduce((sum, item) => sum + item.appliedAmount, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert("Usuário não identificado");
      return;
    }

    if (saleDistribution.length === 0) {
      alert("Nenhuma distribuição foi calculada");
      return;
    }

    const totalDistributed = getTotalDistributed();
    const inputAmount = parseFloat(distributionAmount) || 0;

    if (Math.abs(totalDistributed - inputAmount) > 0.01) {
      const confirm = window.confirm(
        `O valor distribuído (${formatCurrency(totalDistributed)}) é diferente do valor informado (${formatCurrency(inputAmount)}).\n\nDeseja continuar?`,
      );
      if (!confirm) return;
    }

    try {
      setLoading(true);

      // Chamar processGeneralPayment com os parâmetros corretos
      await processGeneralPayment(
        clientGroup.document || "",
        parseFloat(distributionAmount) || 0,
        "dinheiro", // Valor padrão, pode ser adicionado ao formulário futuramente
        `Distribuição geral de ${formatCurrency(parseFloat(distributionAmount) || 0)}`,
        user.id,
      );

      // Notificação de sucesso
      showSuccessNotification();

      // Chamar callback de sucesso e fechar modal
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Erro ao aplicar distribuição:", error);
      showErrorNotification(error);
    } finally {
      setLoading(false);
    }
  };

  const showSuccessNotification = () => {
    const notification = document.createElement("div");
    notification.className =
      "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center";
    
    const successMessage = isOnline 
      ? "Pagamento distribuído com sucesso!"
      : "Pagamento adicionado à fila offline!";
    
    notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      ${successMessage}
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  };

  const showErrorNotification = (error: any) => {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";

    const notification = document.createElement("div");
    notification.className =
      "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center max-w-md";
    notification.innerHTML = `
      <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
      </svg>
      <div>
        <div class="font-semibold">Erro ao distribuir pagamento</div>
        <div class="text-sm">${errorMessage}</div>
      </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 8000);
  };

  const totalDistributed = getTotalDistributed();
  const remainingToDistribute =
    (parseFloat(distributionAmount) || 0) - totalDistributed;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center flex-1 min-w-0">
            <Calculator className="h-5 w-5 sm:h-6 sm:w-6 text-white mr-2 sm:mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                Distribuir Pagamento
              </h2>
              <p className="text-sm text-purple-100 truncate">
                {clientGroup.client || "Cliente"} -{" "}
                {clientGroup.document || "Sem documento"}
              </p>
              {!isOnline && (
                <div className="flex items-center mt-2">
                  <div className="w-2 h-2 bg-yellow-300 rounded-full mr-2 animate-pulse"></div>
                  <span className="text-xs text-yellow-200">
                    Modo offline - Pagamentos serão adicionados à fila
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-180px)] sm:max-h-[calc(90vh-180px)]">
          <form onSubmit={handleSubmit} className="p-4 sm:p-6">
            {/* Resumo do Cliente */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 sm:p-6 mb-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Receipt className="h-5 w-5 text-purple-600 mr-2" />
                Resumo Financeiro
              </h3>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="text-center p-3 sm:p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-lg sm:text-xl font-bold text-gray-900">
                    {formatCurrency(totalValue)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Valor Total
                  </div>
                </div>

                <div className="text-center p-3 sm:p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-lg sm:text-xl font-bold text-green-600">
                    {formatCurrency(totalReceived)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Já Recebido
                  </div>
                </div>

                <div className="text-center p-3 sm:p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-lg sm:text-xl font-bold text-red-600">
                    {formatCurrency(totalPending)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Saldo Devedor
                  </div>
                </div>

                <div className="text-center p-3 sm:p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-lg sm:text-xl font-bold text-purple-600">
                    {clientSales?.length || 0}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Total Vendas
                  </div>
                </div>
              </div>
            </div>

            {/* Campo de Valor para Distribuição */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Valor a Distribuir
              </label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 h-6 w-6 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  value={distributionAmount}
                  onChange={(e) => setDistributionAmount(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-2xl font-bold"
                  placeholder="0,00"
                  required
                />
              </div>

              {/* Atalhos de valor e ações */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDistributionAmount(totalPending.toFixed(2))
                    }
                    className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors font-medium"
                  >
                    Saldo Total ({formatCurrency(totalPending)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionAmount("100")}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    R$ 100
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionAmount("500")}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    R$ 500
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionAmount("1000")}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    R$ 1.000
                  </button>
                </div>
              </div>
            </div>

            {/* Modo de Distribuição */}
            <div className="mb-6">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setDistributionMode("auto")}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                    distributionMode === "auto"
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Distribuição Automática
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionMode("manual")}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                    distributionMode === "manual"
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Ajuste Manual
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {distributionMode === "auto"
                  ? "O valor será distribuído automaticamente entre as vendas com saldo devedor"
                  : "Você pode ajustar manualmente o valor recebido de cada venda"}
              </p>
            </div>

            {/* Preview da Distribuição */}
            {saleDistribution.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Distribuição do Pagamento por Venda
                  </h3>
                  <div className="flex items-center gap-3">
                    {distributionMode === "auto" && (
                      <button
                        type="button"
                        onClick={calculateSaleDistribution}
                        className="flex items-center text-sm text-purple-600 hover:text-purple-800"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Recalcular
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {saleDistribution.map((item) => (
                    <div
                      key={item.sale.saleNumber}
                      className={`bg-white rounded-xl border-2 p-4 transition-all duration-200 ${
                        item.appliedAmount > 0
                          ? "border-purple-300 bg-purple-50 shadow-md"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {/* Cabeçalho da Venda */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900">
                            Venda #{item.sale.saleNumber}
                          </h4>
                          <div className="text-sm text-gray-600">
                            {item.sale.installments?.length || 0} parcela
                            {(item.sale.installments?.length || 0) !== 1
                              ? "s"
                              : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-600">
                            Valor Total
                          </div>
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(item.sale.totalValue || 0)}
                          </div>
                        </div>
                      </div>

                      {/* Informações de Pagamento */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-xs text-gray-600 mb-1">
                            Recebido Atualmente
                          </div>
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(item.currentReceived)}
                          </div>
                        </div>

                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-xs text-gray-600 mb-1">
                            Novo Total Recebido
                          </div>
                          {distributionMode === "manual" ? (
                            <div className="flex items-center">
                              <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={
                                  manualSaleEdits[item.sale.saleNumber] || ""
                                }
                                onChange={(e) =>
                                  handleManualSaleEdit(
                                    item.sale.saleNumber,
                                    e.target.value,
                                  )
                                }
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-semibold"
                              />
                            </div>
                          ) : (
                            <div className="font-semibold text-green-600">
                              {formatCurrency(item.newAmount)}
                            </div>
                          )}
                        </div>

                        <div className="bg-purple-50 rounded-lg p-3">
                          <div className="text-xs text-gray-600 mb-1">
                            Valor Aplicado
                          </div>
                          <div className="font-semibold text-purple-600">
                            +{formatCurrency(item.appliedAmount)}
                          </div>
                        </div>
                      </div>

                      {/* Status da Venda */}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          Saldo devedor:{" "}
                          <span className="font-medium text-red-600">
                            {formatCurrency(
                              Math.max(
                                0,
                                (item.sale.totalValue || 0) - item.newAmount,
                              ),
                            )}
                          </span>
                        </div>

                        {item.newAmount >= (item.sale.totalValue || 0) && (
                          <div className="flex items-center text-green-600 text-sm font-medium">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Venda será quitada
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resumo da Distribuição */}
                <div className="mt-4 p-4 bg-purple-100 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      Valor Informado:
                    </span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(parseFloat(distributionAmount) || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="font-medium text-gray-700">
                      Total Distribuído:
                    </span>
                    <span className="font-bold text-green-600">
                      {formatCurrency(totalDistributed)}
                    </span>
                  </div>
                  {Math.abs(remainingToDistribute) > 0.01 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="font-medium text-gray-700">
                        Diferença:
                      </span>
                      <span
                        className={`font-bold ${remainingToDistribute > 0 ? "text-orange-600" : "text-red-600"}`}
                      >
                        {formatCurrency(Math.abs(remainingToDistribute))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="mt-6 pt-4 sm:pt-6 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    loading ||
                    saleDistribution.length === 0 ||
                    !distributionAmount
                  }
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center shadow-lg"
                >
                  {loading ? (
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  ) : (
                    <CheckCircle className="h-5 w-5 mr-2" />
                  )}
                  {loading ? "Processando..." : "Confirmar Distribuição"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default GeneralPaymentModal;
