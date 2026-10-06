import React, { useState, useEffect, useMemo, memo } from "react";
import {
  X,
  Edit,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Receipt,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { ClientGroup, SaleGroup, SalePayment } from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { formatCurrency } from "../../utils/formatters";
import { CollectionStatus } from "../../types/status";
import { todayLocalStr } from "../../config/visitStatus";
import { isAjusteOuEstorno } from "../../filters/sales";
import { round2 } from "../../filters/clientStatus";

// Valor da escolha "a reducao nao corrige pagamento do app".
const SEM_PAGAMENTO_APP = "nenhum";

interface GeneralPaymentEditModalProps {
  clientGroup: ClientGroup;
  clientSales: SaleGroup[];
  onClose: () => void;
  onSuccess: () => void;
}

const GeneralPaymentEditModal: React.FC<GeneralPaymentEditModalProps> = memo(
  ({ clientGroup, clientSales, onClose, onSuccess }) => {
    const { updateCollection, registrarAjusteRecebimento, salePayments } =
      useCollection();
    const { user } = useAuth();
    // Motivo obrigatorio de toda correcao (vai para sale_payments.motivo).
    const [motivo, setMotivo] = useState("");
    // Venda -> pagamento do app que a reducao estorna (ou SEM_PAGAMENTO_APP).
    const [estornos, setEstornos] = useState<Record<number, string>>({});

    // Pagamentos do app deste cliente que ainda tem saldo para estornar.
    const pagamentosEstornaveis = useMemo(() => {
      const doCliente = (salePayments ?? []).filter(
        (p) => p.clientDocument === clientGroup.document,
      );
      const jaEstornado = new Map<string, number>();
      doCliente.forEach((p) => {
        if (p.estornoDe) {
          jaEstornado.set(
            p.estornoDe,
            (jaEstornado.get(p.estornoDe) ?? 0) - p.paymentAmount,
          );
        }
      });
      return doCliente
        .filter((p) => !isAjusteOuEstorno(p))
        .map((p) => ({
          ...p,
          disponivel: round2(p.paymentAmount - (jaEstornado.get(p.id) ?? 0)),
        }))
        .filter((p) => p.disponivel >= 0.01)
        .sort((a, b) =>
          (b.paymentDate ?? "").localeCompare(a.paymentDate ?? ""),
        );
    }, [salePayments, clientGroup.document]);

    // Recebido maximo de uma venda: o desconto ja quita parte dela.
    const saleNetValue = (sale: SaleGroup) =>
      Math.max(0, (sale.totalValue || 0) - (sale.totalDiscount || 0));
    const [loading, setLoading] = useState(false);
    const [salePaymentEdits, setSalePaymentEdits] = useState<
      Record<number, string>
    >({});
    const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

    // Desabilitar scroll do body quando o modal estiver aberto
    useEffect(() => {
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = "unset";
      };
    }, []);

    // Calcular totais com validações
    const totalValue =
      clientSales?.reduce((sum, sale) => {
        return sum + (sale.totalValue || 0);
      }, 0) || 0;

    const totalReceived =
      clientSales?.reduce((sum, sale) => {
        return sum + (sale.totalReceived || 0);
      }, 0) || 0;

    // Inicializar valores de edição com os valores atuais por venda
    useEffect(() => {
      console.log("Inicializando valores de edição por venda");
      const initialEdits: Record<number, string> = {};

      clientSales?.forEach((sale) => {
        const totalReceived =
          sale.installments?.reduce(
            (sum, installment) => sum + (installment.valor_recebido || 0),
            0,
          ) || 0;
        initialEdits[sale.saleNumber] = totalReceived.toString();
      });

      console.log("Valores iniciais por venda:", initialEdits);
      setSalePaymentEdits(initialEdits);
    }, [clientSales]);

    const handleSaleValueChange = (saleNumber: number, value: string) => {
      // Permitir valores vazios durante a digitação
      if (value === "" || value === ".") {
        setSalePaymentEdits((prev) => ({
          ...prev,
          [saleNumber]: value,
        }));
        return;
      }

      // Validar se é um número válido
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setSalePaymentEdits((prev) => ({
          ...prev,
          [saleNumber]: value,
        }));
      }
    };

    const adjustSaleValue = (saleNumber: number, adjustment: number) => {
      const currentValue = parseFloat(salePaymentEdits[saleNumber] || "0");
      const newValue = Math.max(0, currentValue + adjustment);
      handleSaleValueChange(saleNumber, newValue.toFixed(2));
    };

    const setSaleFullValue = (saleNumber: number, netValue: number) => {
      handleSaleValueChange(saleNumber, netValue.toFixed(2));
    };

    const clearSaleValue = (saleNumber: number) => {
      handleSaleValueChange(saleNumber, "0");
    };

    const handleClearAll = () => {
      setShowClearConfirmModal(true);
    };

    const confirmClearAll = () => {
      const clearedEdits: Record<number, string> = {};
      clientSales?.forEach((sale) => {
        clearedEdits[sale.saleNumber] = "0";
      });
      setSalePaymentEdits(clearedEdits);
      setShowClearConfirmModal(false);
    };

    // Calcular novos totais baseados nas edições por venda
    const calculateNewTotals = () => {
      let newTotalReceived = 0;
      const changes: Array<{
        sale: any;
        oldValue: number;
        newValue: number;
        difference: number;
      }> = [];

      clientSales?.forEach((sale) => {
        const editValue = salePaymentEdits[sale.saleNumber] || "0";
        const newValue = parseFloat(editValue) || 0;
        const originalReceived =
          sale.installments?.reduce(
            (sum, installment) => sum + (installment.valor_recebido || 0),
            0,
          ) || 0;

        newTotalReceived += newValue;

        if (Math.abs(newValue - originalReceived) > 0.01) {
          // Considerar diferenças maiores que 1 centavo
          changes.push({
            sale,
            oldValue: originalReceived,
            newValue,
            difference: newValue - originalReceived,
          });
        }
      });

      return {
        newTotalReceived,
        newTotalPending: totalValue - newTotalReceived,
        totalDifference: newTotalReceived - totalReceived,
        changes,
      };
    };

    const { newTotalReceived, newTotalPending, totalDifference, changes } =
      calculateNewTotals();

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!user) {
        alert("Usuário não identificado");
        return;
      }

      if (changes.length === 0) {
        alert("Nenhuma alteração foi feita");
        return;
      }

      // Validar se há valores negativos
      const hasNegativeValues = changes.some((change) => change.newValue < 0);
      if (hasNegativeValues) {
        alert("Não é possível definir valores negativos");
        return;
      }

      if (!motivo.trim()) {
        alert("Informe o motivo da correção.");
        return;
      }

      const semEscolha = changes.filter(
        (c) => c.difference < 0 && !estornos[c.sale.saleNumber],
      );
      if (semEscolha.length > 0) {
        alert(
          `Escolha qual pagamento é estornado na venda ${semEscolha
            .map((c) => `#${c.sale.saleNumber}`)
            .join(", ")} (ou indique que não foi pagamento do app).`,
        );
        return;
      }

      // Confirmar se há valores maiores que o valor da venda (já com desconto)
      const hasExcessiveValues = changes.some(
        (change) => change.newValue > saleNetValue(change.sale) + 0.01,
      );

      if (hasExcessiveValues) {
        const shouldProceed = confirm(
          "Algumas vendas têm valores recebidos maiores que o valor total. Deseja continuar?",
        );
        if (!shouldProceed) return;
      }

      try {
        setLoading(true);

        console.log("Aplicando edições de pagamento por venda:", changes);

        // Primeiro o registro da correcao: a RPC valida motivo e o saldo do
        // pagamento estornado; se recusar, nenhuma parcela foi alterada.
        for (const change of changes) {
          const escolha = estornos[change.sale.saleNumber];
          await registrarAjusteRecebimento({
            saleNumber: change.sale.saleNumber,
            clientDocument: clientGroup.document,
            clientName: clientGroup.client,
            diferenca: change.difference,
            motivo: motivo.trim(),
            usuarioId: user.id,
            pagamentoEstornadoId:
              change.difference < 0 && escolha && escolha !== SEM_PAGAMENTO_APP
                ? escolha
                : null,
          });
        }

        // Aplicar cada mudança de venda
        for (const change of changes) {
          const { sale, newValue } = change;

          // Distribuir o valor entre as parcelas da venda
          const installments =
            sale.installments?.sort(
              (a: any, b: any) => (a.parcela || 0) - (b.parcela || 0),
            ) || [];
          let remainingAmount = newValue;

          // Distribui o novo recebido pelas parcelas. O desconto negociado e
          // mantido (antes era zerado em toda a venda) e ja quita parte de
          // cada parcela.
          for (const installment of installments) {
            if (!installment.id_parcela) continue;

            const installmentValue = installment.valor_original || 0;
            const discount = installment.desconto || 0;
            const capacity = Math.max(0, installmentValue - discount);
            const appliedAmount = round2(Math.min(remainingAmount, capacity));
            remainingAmount = round2(remainingAmount - appliedAmount);

            // Parcela sem mudanca nao e regravada (nem a data de recebimento).
            if (
              Math.abs(appliedAmount - (installment.valor_recebido || 0)) < 0.01
            )
              continue;

            const updates: any = {
              valor_recebido: appliedAmount,
              data_de_recebimento: appliedAmount > 0 ? todayLocalStr() : null,
            };

            if (appliedAmount + discount >= installmentValue - 0.01) {
              updates.status = CollectionStatus.PAGO;
            } else if (appliedAmount + discount > 0) {
              updates.status = CollectionStatus.PARCIAL;
            } else {
              updates.status = CollectionStatus.PENDENTE;
            }

            console.log(
              `Atualizando parcela ${installment.id_parcela}:`,
              updates,
            );
            await updateCollection(installment.id_parcela, updates);
          }
        }

        // Notificação de sucesso
        showSuccessNotification(changes.length);

        // Chamar callback de sucesso e fechar modal
        onSuccess();
        onClose();
      } catch (error) {
        console.error("Erro ao editar pagamentos:", error);
        showErrorNotification(error);
      } finally {
        setLoading(false);
      }
    };

    const showSuccessNotification = (changeCount: number) => {
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center";
      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      ${changeCount} venda${changeCount !== 1 ? "s" : ""} editada${changeCount !== 1 ? "s" : ""} com sucesso!
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
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center max-w-md";
      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
      </svg>
      <div>
        <div class="font-semibold">Erro ao editar pagamentos</div>
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

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110]"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center flex-1 min-w-0">
              <Edit className="h-5 w-5 sm:h-6 sm:w-6 text-white mr-2 sm:mr-3 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                  Editar Pagamentos
                </h2>
                <p className="text-sm text-purple-100 truncate">
                  {clientGroup.client || "Cliente"} -{" "}
                  {clientGroup.document || "Sem documento"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-2xl transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(95vh-180px)] sm:max-h-[calc(90vh-180px)]">
            <div className="p-4 sm:p-6">
              {/* Resumo do Cliente */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-4 sm:p-6 mb-6 border border-purple-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Receipt className="h-5 w-5 text-purple-600 mr-2" />
                  Resumo dos Pagamentos
                </h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="text-center p-4 bg-white rounded-2xl shadow-sm h-20 flex flex-col justify-center">
                    <div className="text-xl font-bold text-gray-900">
                      {formatCurrency(totalValue)}
                    </div>
                    <div className="text-sm text-gray-600">Valor Total</div>
                  </div>

                  <div className="text-center p-4 bg-white rounded-2xl shadow-sm h-20 flex flex-col justify-center">
                    <div className="text-xl font-bold text-green-600">
                      {formatCurrency(newTotalReceived)}
                    </div>
                    <div className="text-sm text-gray-600">Novo Recebido</div>
                    {totalDifference !== 0 && (
                      <div
                        className={`text-xs font-medium mt-1 ${totalDifference > 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {totalDifference > 0 ? "+" : ""}
                        {formatCurrency(totalDifference)}
                      </div>
                    )}
                  </div>

                  <div className="text-center p-4 bg-white rounded-2xl shadow-sm h-20 flex flex-col justify-center">
                    <div className="text-xl font-bold text-red-600">
                      {formatCurrency(newTotalPending)}
                    </div>
                    <div className="text-sm text-gray-600">Novo Pendente</div>
                  </div>

                  <div className="text-center p-4 bg-white rounded-2xl shadow-sm h-20 flex flex-col justify-center">
                    <div className="text-xl font-bold text-purple-600">
                      {changes.length}
                    </div>
                    <div className="text-sm text-gray-600">Alterações</div>
                  </div>
                </div>

                {/* Ações Rápidas */}
                {newTotalReceived > 0 && (
                  <div className="mt-4 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="flex items-center px-4 py-2 text-sm bg-red-100 text-red-700 rounded-full hover:bg-red-200 transition-colors font-medium"
                      title="Zerar todos os valores"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Zerar Tudo
                    </button>
                  </div>
                )}
              </div>

              {clientSales?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">
                    Nenhuma venda encontrada para este cliente
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {/* Lista de Vendas para Edição */}
                  <div className="space-y-4 sm:space-y-6">
                    {clientSales?.map((sale) => {
                      if (!sale.installments || sale.installments.length === 0)
                        return null;

                      const currentSaleEdit =
                        salePaymentEdits[sale.saleNumber] || "0";
                      const currentSaleValue = parseFloat(currentSaleEdit) || 0;
                      const originalSaleReceived =
                        sale.installments?.reduce(
                          (sum, installment) =>
                            sum + (installment.valor_recebido || 0),
                          0,
                        ) || 0;
                      const hasSaleChanged =
                        Math.abs(currentSaleValue - originalSaleReceived) >
                        0.01;

                      return (
                        <div
                          key={sale.saleNumber}
                          className={`bg-white rounded-2xl border-2 transition-all duration-200 p-4 sm:p-6 ${
                            hasSaleChanged
                              ? "border-purple-300 bg-purple-50 shadow-md"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {/* Header da Venda */}
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-lg font-semibold text-gray-900">
                                Venda #{sale.saleNumber}
                              </h4>
                              <div className="text-sm text-gray-600">
                                {sale.installments.length} parcela
                                {sale.installments.length !== 1 ? "s" : ""} •
                                Valor total: {formatCurrency(sale.totalValue)}
                                {hasSaleChanged && (
                                  <span className="ml-2 text-purple-600 font-medium">
                                    (Editado)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-600">
                                Recebido Atual
                              </div>
                              <div className="font-semibold text-gray-900">
                                {formatCurrency(originalSaleReceived)}
                              </div>
                            </div>
                          </div>

                          {/* Controles de Edição da Venda */}
                          <div className="space-y-4">
                            {/* Sale-level editing controls */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Controles de Edição */}
                              <div className="space-y-3">
                                <label className="block text-sm font-semibold text-gray-700">
                                  Valor Total Recebido da Venda
                                </label>
                                <div className="flex items-center space-x-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      adjustSaleValue(sale.saleNumber, -50)
                                    }
                                    className="p-2 bg-red-100 text-red-600 rounded-2xl hover:bg-red-200 transition-colors"
                                    title="Diminuir R$ 50"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>

                                  <div className="relative flex-1">
                                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={currentSaleEdit}
                                      onChange={(e) =>
                                        handleSaleValueChange(
                                          sale.saleNumber,
                                          e.target.value,
                                        )
                                      }
                                      className="w-full pl-9 pr-3 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center font-semibold text-lg"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      adjustSaleValue(sale.saleNumber, 50)
                                    }
                                    className="p-2 bg-green-100 text-green-600 rounded-2xl hover:bg-green-200 transition-colors"
                                    title="Aumentar R$ 50"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>

                                {/* Ações Rápidas */}
                                <div className="flex space-x-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      clearSaleValue(sale.saleNumber)
                                    }
                                    className="flex-1 p-2 text-sm bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-colors font-medium"
                                  >
                                    Zerar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSaleFullValue(
                                        sale.saleNumber,
                                        saleNetValue(sale),
                                      )
                                    }
                                    className="flex-1 p-2 text-sm bg-green-100 text-green-700 rounded-2xl hover:bg-green-200 transition-colors font-medium"
                                  >
                                    Quitar Total
                                  </button>
                                </div>
                              </div>

                              {/* Preview do Resultado */}
                              <div className="bg-gray-50 rounded-2xl p-4">
                                <h5 className="text-sm font-semibold text-gray-700 mb-3">
                                  Preview da Distribuição
                                </h5>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span>Valor da venda:</span>
                                    <span className="font-medium">
                                      {formatCurrency(sale.totalValue)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Novo total recebido:</span>
                                    <span className="font-medium text-green-600">
                                      {formatCurrency(currentSaleValue)}
                                    </span>
                                  </div>
                                  {(sale.totalDiscount || 0) > 0 && (
                                    <div className="flex justify-between">
                                      <span>Desconto (mantido):</span>
                                      <span className="font-medium text-blue-600">
                                        {formatCurrency(
                                          sale.totalDiscount || 0,
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span>Saldo devedor:</span>
                                    <span
                                      className={`font-medium ${
                                        saleNetValue(sale) - currentSaleValue >
                                        0.01
                                          ? "text-red-600"
                                          : "text-green-600"
                                      }`}
                                    >
                                      {formatCurrency(
                                        Math.max(
                                          0,
                                          saleNetValue(sale) - currentSaleValue,
                                        ),
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between pt-2 border-t border-gray-200">
                                    <span>Status:</span>
                                    <span
                                      className={`font-medium ${
                                        currentSaleValue >=
                                        saleNetValue(sale) - 0.01
                                          ? "text-green-600"
                                          : currentSaleValue > 0
                                            ? "text-yellow-600"
                                            : "text-red-600"
                                      }`}
                                    >
                                      {currentSaleValue >=
                                      saleNetValue(sale) - 0.01
                                        ? "Quitada"
                                        : currentSaleValue > 0
                                          ? "Parcial"
                                          : "Pendente"}
                                    </span>
                                  </div>
                                </div>

                                {/* Indicador de Mudança */}
                                {hasSaleChanged && (
                                  <div className="mt-3 p-2 bg-purple-100 rounded-2xl">
                                    <div className="flex items-center text-purple-700 text-xs">
                                      <Edit className="h-3 w-3 mr-1" />
                                      <span className="font-medium">
                                        {formatCurrency(originalSaleReceived)} →{" "}
                                        {formatCurrency(currentSaleValue)}
                                      </span>
                                      <span
                                        className={`ml-2 font-semibold ${
                                          currentSaleValue >
                                          originalSaleReceived
                                            ? "text-green-600"
                                            : "text-red-600"
                                        }`}
                                      >
                                        (
                                        {currentSaleValue > originalSaleReceived
                                          ? "+"
                                          : ""}
                                        {formatCurrency(
                                          currentSaleValue -
                                            originalSaleReceived,
                                        )}
                                        )
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {currentSaleValue < originalSaleReceived - 0.01 && (
                              <EstornoPicker
                                saleNumber={sale.saleNumber}
                                valor={originalSaleReceived - currentSaleValue}
                                pagamentos={pagamentosEstornaveis}
                                escolha={estornos[sale.saleNumber] ?? ""}
                                onChange={(id) =>
                                  setEstornos((prev) => ({
                                    ...prev,
                                    [sale.saleNumber]: id,
                                  }))
                                }
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Motivo obrigatorio da correcao */}
                  {changes.length > 0 && (
                    <div className="mt-6">
                      <label
                        htmlFor="motivo-correcao"
                        className="block text-sm font-semibold text-gray-700 mb-1"
                      >
                        Motivo da correção{" "}
                        <span className="text-red-600">*</span>
                      </label>
                      <textarea
                        id="motivo-correcao"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        rows={2}
                        placeholder="Ex.: pagamento lançado em duplicidade"
                        className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                      />
                    </div>
                  )}

                  {/* Botões de Ação */}
                  <div className="mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end">
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full sm:w-auto px-6 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors font-medium"
                      >
                        Cancelar
                      </button>

                      <button
                        type="submit"
                        disabled={loading || changes.length === 0}
                        className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center shadow-lg"
                      >
                        {loading ? (
                          <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        ) : (
                          <CheckCircle className="h-5 w-5 mr-2" />
                        )}
                        {loading
                          ? "Salvando..."
                          : changes.length > 0
                            ? `Salvar ${changes.length} Alteração${changes.length !== 1 ? "ões" : ""}`
                            : "Nenhuma Alteração"}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Modal de Confirmação para Zerar Tudo */}
        {showClearConfirmModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120] p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Confirmar Ação
                </h3>
              </div>

              <p className="text-gray-600 mb-6">
                Tem certeza que deseja zerar todos os valores recebidos? Esta
                ação não pode ser desfeita.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirmModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmClearAll}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-colors font-medium"
                >
                  Zerar Tudo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

type PagamentoEstornavel = SalePayment & { disponivel: number };

// Escolha do pagamento do app que uma reducao do recebido estorna. O estorno
// sai do credito do cobrador desse pagamento; o que passar do disponivel vira
// ajuste administrativo de quem editou.
const EstornoPicker: React.FC<{
  saleNumber: number;
  valor: number;
  pagamentos: PagamentoEstornavel[];
  escolha: string;
  onChange: (id: string) => void;
}> = ({ saleNumber, valor, pagamentos, escolha, onChange }) => {
  // Pagamentos desta venda primeiro.
  const ordenados = [
    ...pagamentos.filter((p) => p.saleNumber === saleNumber),
    ...pagamentos.filter((p) => p.saleNumber !== saleNumber),
  ];
  const escolhido = pagamentos.find((p) => p.id === escolha);
  const doCobrador = escolhido ? Math.min(valor, escolhido.disponivel) : 0;
  const resto = valor - doCobrador;
  const dataBR = (iso?: string) =>
    iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

  return (
    <div className="mt-4 p-3 rounded-2xl border border-red-200 bg-red-50">
      <label className="block text-sm font-semibold text-red-800 mb-2">
        Redução de {formatCurrency(valor)}: qual pagamento está sendo estornado?
      </label>
      <select
        value={escolha}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm bg-white"
      >
        <option value="" disabled>
          Escolha o pagamento…
        </option>
        {ordenados.map((p) => (
          <option key={p.id} value={p.id}>
            {dataBR(p.paymentDate)} · {p.collectorName || "Cobrador"} ·{" "}
            {formatCurrency(p.paymentAmount)}
            {p.saleNumber ? ` (venda #${p.saleNumber})` : " (pagamento geral)"}
            {p.disponivel < p.paymentAmount
              ? ` — disponível ${formatCurrency(p.disponivel)}`
              : ""}
          </option>
        ))}
        <option value={SEM_PAGAMENTO_APP}>
          Não foi pagamento do app (ERP ou correção de lançamento)
        </option>
      </select>
      {pagamentos.length === 0 && (
        <p className="text-xs text-red-700 mt-2">
          Este cliente não tem pagamento do app com saldo para estornar.
        </p>
      )}
      {escolhido && (
        <p className="text-xs text-red-800 mt-2">
          {formatCurrency(doCobrador)} sai do crédito de{" "}
          <strong>{escolhido.collectorName || "cobrador"}</strong>
          {resto >= 0.01 &&
            `; ${formatCurrency(resto)} passa do disponível e fica como ajuste administrativo`}
          .
        </p>
      )}
      {escolha === SEM_PAGAMENTO_APP && (
        <p className="text-xs text-red-800 mt-2">
          Registrado como ajuste administrativo, em nome de quem está editando.
        </p>
      )}
    </div>
  );
};

export default GeneralPaymentEditModal;
