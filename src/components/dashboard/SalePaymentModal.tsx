import React, { useState } from "react";
import {
  X,
  CreditCard,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Calculator,
  Receipt,
  Clock,
} from "lucide-react";
import { SaleGroup, SalePaymentInput } from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { formatCurrency, formatDate } from "../../utils/mockData";

interface SalePaymentModalProps {
  saleGroup: SaleGroup;
  onClose: () => void;
  onSuccess: () => void;
}

const SalePaymentModal: React.FC<SalePaymentModalProps> = ({
  saleGroup,
  onClose,
  onSuccess,
}) => {
  const { processSalePayment, calculateSaleBalance } = useCollection();
  const { user } = useAuth();
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("dinheiro");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const saleBalance = calculateSaleBalance(
    saleGroup.saleNumber,
    saleGroup.clientDocument,
  );

  // Simular distribuição para preview
  const previewDistribution = () => {
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return [];

    const pendingInstallments = saleGroup.installments
      .filter((inst) => inst.valor_recebido < inst.valor_original)
      .sort((a, b) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const aDate = new Date(a.data_vencimento || "");
        const bDate = new Date(b.data_vencimento || "");
        aDate.setHours(0, 0, 0, 0);
        bDate.setHours(0, 0, 0, 0);

        const aOverdue = aDate < today;
        const bOverdue = bDate < today;

        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        return aDate.getTime() - bDate.getTime();
      });

    let remainingAmount = amount;
    const distribution = [];

    for (const installment of pendingInstallments) {
      if (remainingAmount <= 0) break;

      const pendingAmount =
        installment.valor_original - installment.valor_recebido;
      const appliedAmount = Math.min(remainingAmount, pendingAmount);

      if (appliedAmount > 0) {
        distribution.push({
          installment,
          appliedAmount,
          newTotal: installment.valor_recebido + appliedAmount,
          willBeComplete:
            installment.valor_recebido + appliedAmount >=
            installment.valor_original,
        });

        remainingAmount -= appliedAmount;
      }
    }

    return distribution;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert("Usuário não identificado");
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (amount <= 0) {
      alert("Digite um valor válido para o pagamento");
      return;
    }

    if (amount > saleBalance.remainingBalance) {
      const shouldProceed = confirm(
        `O valor informado (${formatCurrency(amount)}) é maior que o saldo devedor (${formatCurrency(saleBalance.remainingBalance)}).\n\nDeseja prosseguir assim mesmo?`,
      );
      if (!shouldProceed) return;
    }

    try {
      setLoading(true);

      const payment: SalePaymentInput = {
        saleNumber: saleGroup.saleNumber,
        clientDocument: saleGroup.clientDocument,
        paymentAmount: amount,
        paymentMethod,
        notes: notes.trim() || undefined,
      };

      await processSalePayment(payment, user.id);

      // Notificação de sucesso
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center";
      notification.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
        Pagamento de ${formatCurrency(amount)} processado com sucesso!
      `;
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);

      // Chamar callback de sucesso e fechar modal
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Erro ao processar pagamento:", error);

      // Notificação de erro
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center";
      notification.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        Erro ao processar pagamento. Tente novamente.
      `;
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 5000);
    } finally {
      setLoading(false);
    }
  };

  const distribution = previewDistribution();
  const hasValidAmount = parseFloat(paymentAmount) > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg sm:rounded-xl max-w-6xl w-full max-h-[98vh] sm:max-h-[95vh] lg:max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center min-w-0 flex-1">
            <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 mr-2 sm:mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 truncate">
                Receber Pagamento da Venda
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                Venda #{saleGroup.saleNumber} -{" "}
                {saleGroup.installments[0]?.cliente}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-3 sm:p-6">
          {/* Resumo da Venda */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg sm:rounded-xl p-3 sm:p-6 mb-4 sm:mb-6 border border-blue-200">
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center">
              <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 mr-2" />
              Resumo da Venda
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
              <div className="text-center p-2 sm:p-4 bg-white rounded-lg shadow-sm">
                <div className="text-sm sm:text-xl lg:text-2xl font-bold text-gray-900">
                  {formatCurrency(saleBalance.totalValue)}
                </div>
                <div className="text-xs sm:text-sm text-gray-600">Valor Total</div>
              </div>

              <div className="text-center p-2 sm:p-4 bg-white rounded-lg shadow-sm">
                <div className="text-sm sm:text-xl lg:text-2xl font-bold text-green-600">
                  {formatCurrency(saleBalance.totalPaid)}
                </div>
                <div className="text-xs sm:text-sm text-gray-600">Já Recebido</div>
              </div>

              <div className="text-center p-2 sm:p-4 bg-white rounded-lg shadow-sm">
                <div className="text-sm sm:text-xl lg:text-2xl font-bold text-red-600">
                  {formatCurrency(saleBalance.remainingBalance)}
                </div>
                <div className="text-xs sm:text-sm text-gray-600">Saldo Devedor</div>
              </div>
            </div>

            {/* Status Badge */}
            <div className="mt-3 sm:mt-4 flex justify-center">
              <span
                className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                  saleBalance.status === "fully_paid"
                    ? "bg-green-100 text-green-800"
                    : saleBalance.status === "partially_paid"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                }`}
              >
                {saleBalance.status === "fully_paid" && (
                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                )}
                {saleBalance.status === "partially_paid" && (
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                )}
                {saleBalance.status === "pending" && (
                  <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                )}

                {saleBalance.status === "fully_paid"
                  ? "Pago Integralmente"
                  : saleBalance.status === "partially_paid"
                    ? "Parcialmente Pago"
                    : "Pendente"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Formulário de Pagamento */}
            <div className="space-y-4 sm:space-y-6">
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    Valor do Pagamento
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => {
                        setPaymentAmount(e.target.value);
                        setShowPreview(false);
                      }}
                      onBlur={() => setShowPreview(true)}
                      className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-lg font-semibold"
                      placeholder="0,00"
                      required
                    />
                  </div>

                  {/* Atalhos de valor */}
                  <div className="flex flex-wrap gap-1 sm:gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentAmount(
                          saleBalance.remainingBalance.toString(),
                        );
                        setShowPreview(true);
                      }}
                      className="px-2 sm:px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                    >
                      <span className="hidden sm:inline">Saldo Total (</span>
                      <span className="sm:hidden">Total: </span>
                      {formatCurrency(saleBalance.remainingBalance)}
                      <span className="hidden sm:inline">)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    Forma de Pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
                  >
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="pix">PIX</option>
                    <option value="transferencia">
                      Transferência Bancária
                    </option>
                    <option value="boleto">Boleto</option>
                    <option value="cheque">Cheque</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    Observações (opcional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
                    placeholder="Observações sobre o pagamento..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !hasValidAmount}
                  className="w-full flex items-center justify-center px-4 py-2 sm:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold text-sm sm:text-base"
                >
                  {loading ? (
                    <div className="animate-spin h-4 w-4 sm:h-5 sm:w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  ) : (
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  )}
                  {loading ? "Processando..." : "Confirmar Pagamento"}
                </button>
              </form>
            </div>

            {/* Preview da Distribuição */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 flex items-center">
                <Calculator className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 mr-2" />
                Distribuição do Pagamento
              </h3>

              {hasValidAmount && showPreview ? (
                <div className="space-y-2 sm:space-y-3 max-h-64 sm:max-h-96 overflow-y-auto">
                  {distribution.length > 0 ? (
                    distribution.map((item) => (
                      <div
                        key={item.installment.id_parcela}
                        className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm sm:text-base">
                              Parcela {item.installment.parcela}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 truncate">
                              Venc: {formatDate(item.installment.data_vencimento)}
                            </div>
                          </div>

                          <div className="text-right ml-2">
                            <div className="text-xs sm:text-sm text-gray-600">
                              Aplicar:{" "}
                              <span className="font-semibold text-green-600">
                                {formatCurrency(item.appliedAmount)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Total: {formatCurrency(item.newTotal)} /{" "}
                              {formatCurrency(item.installment.valor_original)}
                            </div>
                          </div>
                        </div>

                        {item.willBeComplete && (
                          <div className="mt-2 flex items-center text-green-600 text-xs sm:text-sm">
                            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            Parcela será quitada
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 sm:py-8 text-gray-500">
                      <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs sm:text-sm">Todas as parcelas já estão quitadas</p>
                    </div>
                  )}

                  {parseFloat(paymentAmount) > saleBalance.remainingBalance && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-center text-yellow-800">
                        <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-2 flex-shrink-0" />
                        <span className="font-medium text-xs sm:text-sm">
                          Valor maior que o saldo
                        </span>
                      </div>
                      <p className="text-yellow-700 text-xs sm:text-sm mt-1">
                        O valor excede o saldo devedor em{" "}
                        {formatCurrency(
                          parseFloat(paymentAmount) -
                            saleBalance.remainingBalance,
                        )}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 sm:py-8 text-gray-500">
                  <Calculator className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs sm:text-sm">Digite um valor para ver a distribuição</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalePaymentModal;
