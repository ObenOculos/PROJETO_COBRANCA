import React from "react";
import { X, AlertTriangle, HelpCircle } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string | React.ReactNode; // Make message optional if clientName/Document are used
  clientName?: string;
  clientDocument?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  clientName,
  clientDocument,
  confirmButtonText = "Confirmar",
  cancelButtonText = "Cancelar",
  isDestructive = false,
}) => {
  if (!isOpen) return null;

  const displayMessage = message || (
    <>
      Você tem certeza que deseja deletar o cliente{" "}
      {clientName && <strong className="font-semibold">{clientName}</strong>}{" "}
      {clientDocument && (
        <span className="font-mono font-semibold">({clientDocument})</span>
      )}{" "}
      e todos os seus dados relacionados (cobranças, pagamentos, visitas,
      histórico de autorização)? Esta ação é irreversível.
    </>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50 transition-colors"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl max-w-sm w-full shadow-2xl dark:shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border">
        {/* Red Header with Icon */}
        <div
          className={`p-4 flex items-center justify-between ${
            isDestructive
              ? "bg-red-600 dark:bg-red-700"
              : "bg-blue-600 dark:bg-blue-700"
          }`}
        >
          <div className="flex items-center">
            {isDestructive ? (
              <AlertTriangle className="h-6 w-6 text-white mr-3" />
            ) : (
              <HelpCircle className="h-6 w-6 text-white mr-3" />
            )}
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-full text-white ${
              isDestructive
                ? "hover:bg-red-700 dark:hover:bg-red-800"
                : "hover:bg-blue-700 dark:hover:bg-blue-800"
            } transition-colors`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="text-sm text-gray-700 dark:text-dark-text-secondary mb-6">
            {displayMessage}
          </div>

          <div className="flex justify-between gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text bg-white dark:bg-dark-bg rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              {cancelButtonText}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2 text-white rounded-2xl transition-colors ${
                isDestructive
                  ? "bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800"
                  : "bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800"
              }`}
            >
              {confirmButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
