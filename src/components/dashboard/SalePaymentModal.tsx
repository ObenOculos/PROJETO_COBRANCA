import React, { useState, useEffect } from "react";
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
import { formatCurrency, formatDate } from "../../utils/formatters";

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

  useEffect(() => {
    // Desabilitar scroll do body quando o modal estiver aberto
    document.body.style.overflow = "hidden";

    // Cleanup: restaurar scroll quando o componente for desmontado
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

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
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center flex-1 min-w-0">
            <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-white mr-2 sm:mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                Receber Pagamento da Venda
              </h2>
              <p className="text-sm text-green-100 truncate">
                Venda #{saleGroup.saleNumber} -{" "}
                {saleGroup.installments[0]?.cliente}
              </p>
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
            {/* Resumo da Venda */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 sm:p-6 mb-6 border border-green-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Receipt className="h-5 w-5 text-green-600 mr-2" />
                Resumo da Venda
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="text-center p-3 sm:p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-lg sm:text-xl font-bold text-gray-900">
                    {formatCurrency(saleBalance.totalValue)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Valor Total
                  </div>
                </div>

                <div className="text-center p-3 sm:p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-lg sm:text-xl font-bold text-green-600">
                    {formatCurrency(saleBalance.totalPaid)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Já Recebido
                  </div>
                </div>

                <div className="text-center p-3 sm:p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-lg sm:text-xl font-bold text-red-600">
                    {formatCurrency(saleBalance.remainingBalance)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Saldo Devedor
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-4 flex justify-center">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    saleBalance.status === "fully_paid"
                      ? "bg-green-100 text-green-800"
                      : saleBalance.status === "partially_paid"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {saleBalance.status === "fully_paid" && (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  )}
                  {saleBalance.status === "partially_paid" && (
                    <Clock className="h-4 w-4 mr-1" />
                  )}
                  {saleBalance.status === "pending" && (
                    <AlertCircle className="h-4 w-4 mr-1" />
                  )}

                  {saleBalance.status === "fully_paid"
                    ? "Pago Integralmente"
                    : saleBalance.status === "partially_paid"
                      ? "Parcialmente Pago"
                      : "Pendente"}
                </span>
              </div>
            </div>

            {/* Campo de Valor para Pagamento */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Valor do Pagamento
              </label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 h-6 w-6 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => {
                    setPaymentAmount(e.target.value);
                    setShowPreview(false);
                  }}
                  onBlur={() => setShowPreview(true)}
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-2xl font-bold"
                  placeholder="0,00"
                  required
                />
              </div>

              {/* Atalhos de valor */}
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentAmount(saleBalance.remainingBalance.toString());
                    setShowPreview(true);
                  }}
                  className="px-4 py-2 text-sm bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors font-medium"
                >
                  Saldo Total ({formatCurrency(saleBalance.remainingBalance)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentAmount("100");
                    setShowPreview(true);
                  }}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                >
                  R$ 100
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentAmount("500");
                    setShowPreview(true);
                  }}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                >
                  R$ 500
                </button>
              </div>
            </div>

            {/* Forma de Pagamento */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-base"
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao_debito">Cartão de Débito</option>
                <option value="cartao_credito">Cartão de Crédito</option>
                <option value="pix">PIX</option>
                <option value="transferencia">Transferência Bancária</option>
                <option value="boleto">Boleto</option>
                <option value="cheque">Cheque</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            {/* Observações */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Observações (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-base"
                placeholder="Observações sobre o pagamento..."
              />
            </div>

            {/* Preview da Distribuição */}
            {hasValidAmount && showPreview && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Calculator className="h-5 w-5 text-green-600 mr-2" />
                  Distribuição do Pagamento por Parcela
                </h3>

                {distribution.length > 0 ? (
                  <div className="space-y-3">
                    {distribution.map((item) => (
                      <div
                        key={item.installment.id_parcela}
                        className={`bg-white rounded-xl border-2 p-4 transition-all duration-200 ${
                          item.willBeComplete
                            ? "border-green-300 bg-green-50 shadow-md"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900">
                              Parcela {item.installment.parcela}
                            </h4>
                            <div className="text-sm text-gray-600">
                              Venc:{" "}
                              {formatDate(item.installment.data_vencimento)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-600">
                              Valor Original
                            </div>
                            <div className="font-semibold text-gray-900">
                              {formatCurrency(item.installment.valor_original)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 mb-1">
                              Já Recebido
                            </div>
                            <div className="font-semibold text-gray-900">
                              {formatCurrency(item.installment.valor_recebido)}
                            </div>
                          </div>

                          <div className="bg-green-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 mb-1">
                              Será Aplicado
                            </div>
                            <div className="font-semibold text-green-600">
                              +{formatCurrency(item.appliedAmount)}
                            </div>
                          </div>

                          <div className="bg-blue-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 mb-1">
                              Novo Total
                            </div>
                            <div className="font-semibold text-blue-600">
                              {formatCurrency(item.newTotal)}
                            </div>
                          </div>
                        </div>

                        {item.willBeComplete && (
                          <div className="mt-3 flex items-center text-green-600 text-sm font-medium">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Parcela será quitada
                          </div>
                        )}
                      </div>
                    ))}

                    {parseFloat(paymentAmount) >
                      saleBalance.remainingBalance && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-center text-yellow-800">
                          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="font-medium text-sm">
                            Valor maior que o saldo devedor
                          </span>
                        </div>
                        <p className="text-yellow-700 text-sm mt-1">
                          O valor excede o saldo em{" "}
                          {formatCurrency(
                            parseFloat(paymentAmount) -
                              saleBalance.remainingBalance,
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      Todas as parcelas já estão quitadas
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Botões de Ação */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={loading || !hasValidAmount}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center shadow-lg"
                >
                  {loading ? (
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  ) : (
                    <CheckCircle className="h-5 w-5 mr-2" />
                  )}
                  {loading ? "Processando..." : "Confirmar Pagamento"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SalePaymentModal;
