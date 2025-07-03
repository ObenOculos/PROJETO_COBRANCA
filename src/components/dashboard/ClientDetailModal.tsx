import React, { useState } from "react";
import {
  X,
  ChevronDown,
  ChevronRight,
  User,
  Edit,
  CreditCard,
  Info,
  Receipt,
} from "lucide-react";
import { ClientGroup, SaleGroup } from "../../types";
import { formatCurrency } from "../../utils/mockData";
import { useCollection } from "../../contexts/CollectionContext";
import SalePaymentModal from "./SalePaymentModal";
import GeneralPaymentModal from "./GeneralPaymentModal";
import GeneralPaymentEditModal from "./GeneralPaymentEditModal";

interface ClientDetailModalProps {
  clientGroup: ClientGroup;
  userType: "manager" | "collector";
  onClose: () => void;
}

const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  clientGroup,
  userType,
  onClose,
}) => {
  const { getSalesByClient, calculateSaleBalance } = useCollection();
  const [selectedSaleForPayment, setSelectedSaleForPayment] =
    useState<SaleGroup | null>(null);
  const [isSalePaymentModalOpen, setIsSalePaymentModalOpen] = useState(false);
  const [isGeneralPaymentModalOpen, setIsGeneralPaymentModalOpen] =
    useState(false);
  const [isGeneralEditModalOpen, setIsGeneralEditModalOpen] = useState(false);
  const [showClientData, setShowClientData] = useState(false);
  const [expandedSales, setExpandedSales] = useState<Set<number>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  // Obter vendas do cliente usando a nova estrutura
  const clientSales = React.useMemo(() => {
    const sales = getSalesByClient(clientGroup.document);
    console.log(
      "Vendas do Cliente recalculadas:",
      sales.map((sale) => ({
        saleNumber: sale.saleNumber,
        totalValue: sale.totalValue,
        totalReceived: sale.totalReceived,
        pendingValue: sale.pendingValue,
      })),
    );
    return sales;
  }, [getSalesByClient, clientGroup.document, refreshKey]);

  const handleOpenSalePayment = (sale: SaleGroup) => {
    setSelectedSaleForPayment(sale);
    setIsSalePaymentModalOpen(true);
  };

  const handleCloseSalePayment = () => {
    setSelectedSaleForPayment(null);
    setIsSalePaymentModalOpen(false);
  };

  const handlePaymentSuccess = () => {
    // Forçar uma nova renderização
    setRefreshKey((prev) => prev + 1);
    handleCloseSalePayment();
  };

  const handleGeneralPaymentSuccess = () => {
    // Forçar uma nova renderização
    setRefreshKey((prev) => prev + 1);
    setIsGeneralPaymentModalOpen(false);
  };

  const handleGeneralEditSuccess = () => {
    // Forçar uma nova renderização
    setRefreshKey((prev) => prev + 1);
    setIsGeneralEditModalOpen(false);
  };

  const toggleSaleExpansion = (saleNumber: number) => {
    const newExpanded = new Set(expandedSales);
    if (newExpanded.has(saleNumber)) {
      newExpanded.delete(saleNumber);
    } else {
      newExpanded.add(saleNumber);
    }
    setExpandedSales(newExpanded);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-4 lg:px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center flex-1 min-w-0">
              <User className="h-6 w-6 text-blue-600 mr-3 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-900 truncate">
                  {clientGroup.client}
                </h2>
                <p className="text-sm text-gray-600 truncate">
                  {clientGroup.document}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Action Buttons */}
          {userType === "collector" && (
            <div className="mt-4 px-4 lg:px-6 py-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => setShowClientData(true)}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
                title="Ver todos os dados de cadastro do cliente"
              >
                <Info className="h-5 w-5 sm:mr-2" />
                <span className="hidden sm:inline">Ver Dados</span>
              </button>
              <button
                onClick={() => setShowClientData(false)}
                className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                title="Ver vendas do cliente"
              >
                <Receipt className="h-5 w-5 sm:mr-2" />
                <span className="hidden sm:inline">Ver Vendas</span>
              </button>
              {clientSales.reduce((sum, sale) => sum + sale.pendingValue, 0) >
                0 && (
                <button
                  onClick={() => setIsGeneralPaymentModalOpen(true)}
                  className="flex items-center px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm"
                  title="Distribuir pagamento entre parcelas"
                >
                  <CreditCard className="h-5 w-5 sm:mr-2" />
                  <span className="hidden sm:inline">Distribuir Pagamento</span>
                </button>
              )}

              {clientSales.reduce((sum, sale) => sum + sale.totalReceived, 0) >
                0 && (
                <button
                  onClick={() => setIsGeneralEditModalOpen(true)}
                  className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium shadow-sm"
                  title="Editar valores recebidos"
                >
                  <Edit className="h-5 w-5 sm:mr-2" />
                  <span className="hidden sm:inline">Editar Pagamentos</span>
                </button>
              )}
            </div>
          )}

          {/* Sales and Collections or Client Data */}
          {showClientData ? (
            <div className="overflow-y-auto max-h-[60vh] p-4 lg:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Dados de Cadastro do Cliente
              </h3>
              <div className="space-y-3 text-sm text-gray-700">
                {Object.entries(clientGroup)
                  .filter(([key]) =>
                    [
                      "client",
                      "document",
                      "address",
                      "number",
                      "neighborhood",
                      "city",
                      "phone",
                      "mobile",
                    ].includes(key),
                  )
                  .map(([key, value]) => {
                    const labelMap: { [key: string]: string } = {
                      client: "Nome do Cliente",
                      document: "Documento",
                      address: "Endereço",
                      number: "Número",
                      neighborhood: "Bairro",
                      city: "Cidade",
                      phone: "Telefone",
                      mobile: "Celular",
                    };
                    return (
                      <div
                        key={key}
                        className="flex justify-between items-center border-b pb-2 last:border-b-0 last:pb-0"
                      >
                        <span className="font-medium capitalize">
                          {labelMap[key] ||
                            key.replace(/([A-Z])/g, " $1").trim()}
                          :
                        </span>
                        <span className="text-right">
                          {value
                            ? typeof value === "object" && value !== null
                              ? JSON.stringify(value)
                              : String(value)
                            : "-"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              <div className="px-4 lg:px-6 py-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Vendas ({clientSales.length} venda
                  {clientSales.length !== 1 ? "s" : ""})
                </h3>

                <div className="space-y-3">
                  {clientSales.map((sale) => {
                    const saleBalance = calculateSaleBalance(
                      sale.saleNumber,
                      clientGroup.document,
                    );

                    return (
                      <div
                        key={sale.saleNumber}
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        {/* Sale Header */}
                        <div className="px-4 py-3 bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div
                              className="flex items-center flex-1 cursor-pointer hover:bg-gray-100 p-2 rounded-lg -m-2"
                              onClick={() =>
                                toggleSaleExpansion(sale.saleNumber)
                              }
                            >
                              <div className="mr-3">
                                {expandedSales.has(sale.saleNumber) ? (
                                  <ChevronDown className="h-5 w-5 text-gray-400" />
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-gray-400" />
                                )}
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900">
                                  Venda {sale.saleNumber}
                                </h4>
                                <p className="text-sm text-gray-600">
                                  {sale.installments.length} parcela
                                  {sale.installments.length !== 1 ? "s" : ""}
                                </p>
                                <div className="flex items-center mt-1">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      saleBalance.status === "fully_paid"
                                        ? "bg-green-100 text-green-800"
                                        : saleBalance.status ===
                                            "partially_paid"
                                          ? "bg-yellow-100 text-yellow-800"
                                          : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    {saleBalance.status === "fully_paid"
                                      ? "Pago Integralmente"
                                      : saleBalance.status === "partially_paid"
                                        ? "Parcialmente Pago"
                                        : "Pendente"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-sm font-medium text-gray-900">
                                  {formatCurrency(sale.totalValue)}
                                </div>
                                <div className="text-xs text-green-600 font-medium">
                                  Pago: {formatCurrency(saleBalance.totalPaid)}
                                </div>
                                <div className="text-xs text-red-600 font-medium">
                                  Restante:{" "}
                                  {formatCurrency(saleBalance.remainingBalance)}
                                </div>
                              </div>

                              {/* Botão de Pagamento por Venda */}
                              {userType === "collector" &&
                                saleBalance.remainingBalance > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenSalePayment(sale);
                                    }}
                                    className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
                                    title="Receber pagamento da venda"
                                  >
                                    <CreditCard className="h-4 w-4 mr-1" />
                                    <span className="hidden sm:inline">
                                      Receber
                                    </span>
                                  </button>
                                )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Sale Details */}
                        {expandedSales.has(sale.saleNumber) && (
                          <div className="px-4 py-3 bg-gray-50">
                            <div className="space-y-3">
                              {/* Sale Summary */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="text-center p-3 bg-blue-50 rounded-lg">
                                  <div className="text-base sm:text-lg font-bold text-blue-600">
                                    {formatCurrency(
                                      saleBalance.totalValue,
                                      false,
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Valor Total
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-green-50 rounded-lg">
                                  <div className="text-lg font-bold text-green-600">
                                    {formatCurrency(saleBalance.totalPaid)}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Já Pago
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-red-50 rounded-lg">
                                  <div className="text-lg font-bold text-red-600">
                                    {formatCurrency(
                                      saleBalance.remainingBalance,
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Saldo Devedor
                                  </div>
                                </div>
                              </div>

                              {/* Additional Info */}
                              <div className="text-sm text-gray-600 pt-2 border-t border-gray-200">
                                <div className="flex justify-between items-center">
                                  <span>Número de parcelas:</span>
                                  <span className="font-medium">
                                    {sale.installments.length}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <span>Status da venda:</span>
                                  <span
                                    className={`font-medium ${
                                      saleBalance.status === "fully_paid"
                                        ? "text-green-600"
                                        : saleBalance.status ===
                                            "partially_paid"
                                          ? "text-yellow-600"
                                          : "text-red-600"
                                    }`}
                                  >
                                    {saleBalance.status === "fully_paid"
                                      ? "Quitada"
                                      : saleBalance.status === "partially_paid"
                                        ? "Parcial"
                                        : "Pendente"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sale Payment Modal */}
      {isSalePaymentModalOpen && selectedSaleForPayment && (
        <SalePaymentModal
          saleGroup={selectedSaleForPayment}
          onClose={handleCloseSalePayment}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* General Payment Modal */}
      {isGeneralPaymentModalOpen && (
        <GeneralPaymentModal
          clientGroup={clientGroup}
          clientSales={clientSales}
          onClose={() => setIsGeneralPaymentModalOpen(false)}
          onSuccess={handleGeneralPaymentSuccess}
        />
      )}

      {/* General Payment Edit Modal */}
      {isGeneralEditModalOpen && (
        <GeneralPaymentEditModal
          clientGroup={clientGroup}
          clientSales={clientSales}
          onClose={() => setIsGeneralEditModalOpen(false)}
          onSuccess={handleGeneralEditSuccess}
        />
      )}
    </>
  );
};

export default ClientDetailModal;
