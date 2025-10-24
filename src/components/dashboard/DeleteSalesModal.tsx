import React, { useState, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import { ClientGroup, SaleGroup } from "../../types";
import { formatCurrency } from "../../utils/formatters";

interface DeleteSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedSaleNumbers: number[]) => void;
  clientGroup: ClientGroup | null;
}

const DeleteSalesModal: React.FC<DeleteSalesModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clientGroup,
}) => {
  const [selectedSales, setSelectedSales] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen && clientGroup) {
      // If only one sale, pre-select it
      if (clientGroup.sales.length === 1) {
        setSelectedSales([clientGroup.sales[0].saleNumber]);
      } else {
        setSelectedSales([]); // Clear selection when modal opens
      }
    }
  }, [isOpen, clientGroup]);

  if (!isOpen || !clientGroup) return null;

  const handleCheckboxChange = (saleNumber: number) => {
    setSelectedSales((prevSelected) =>
      prevSelected.includes(saleNumber)
        ? prevSelected.filter((num) => num !== saleNumber)
        : [...prevSelected, saleNumber],
    );
  };

  const handleSelectAll = () => {
    if (selectedSales.length === clientGroup.sales.length) {
      setSelectedSales([]);
    } else {
      setSelectedSales(clientGroup.sales.map((sale) => sale.saleNumber));
    }
  };

  const handleConfirmClick = () => {
    onConfirm(selectedSales);
  };

  const hasMultipleSales = clientGroup.sales.length > 1;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
        {/* Red Header with Icon */}
        <div className="bg-red-600 p-4 flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-white mr-3" />
            <h3 className="text-lg font-semibold text-white">
              Excluir Vendas do Cliente {clientGroup.client}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white hover:bg-red-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-700 mb-4">
            Selecione as vendas que deseja excluir para o cliente{" "}
            <strong className="font-semibold">{clientGroup.client}</strong> (
            <span className="font-mono font-semibold">
              {clientGroup.document}
            </span>
            ). Esta ação é irreversível.
          </p>

          {hasMultipleSales && (
            <div className="mb-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 text-red-600 rounded"
                  checked={selectedSales.length === clientGroup.sales.length}
                  onChange={handleSelectAll}
                />
                <span className="ml-2 text-gray-800 font-medium">
                  Selecionar Todas
                </span>
              </label>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3 mb-4">
            {clientGroup.sales.map((sale: SaleGroup) => (
              <div key={sale.saleNumber} className="flex items-center mb-2">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-red-600 rounded"
                  checked={selectedSales.includes(sale.saleNumber)}
                  onChange={() => handleCheckboxChange(sale.saleNumber)}
                />
                <span className="ml-2 text-sm text-gray-800">
                  Venda N°{" "}
                  <strong className="font-medium">{sale.saleNumber}</strong> (
                  {sale.description}) -{" "}
                  <span className="font-mono">
                    {formatCurrency(sale.pendingValue)}
                  </span>{" "}
                  pendente
                </span>
              </div>
            ))}
          </div>

          {selectedSales.length === 0 && (
            <p className="text-red-500 text-sm mb-4">
              Selecione ao menos uma venda para excluir.
            </p>
          )}

          <div className="flex justify-between gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmClick}
              disabled={selectedSales.length === 0}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Excluir Venda(s) Selecionada(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteSalesModal;
