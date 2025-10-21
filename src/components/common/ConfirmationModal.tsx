import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string; // Make message optional if clientName/Document are used
  clientName?: string;
  clientDocument?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  clientName,
  clientDocument,
  confirmButtonText = 'Confirmar',
  cancelButtonText = 'Cancelar',
}) => {
  if (!isOpen) return null;

  const displayMessage = message || (
    <>
      Você tem certeza que deseja deletar o cliente {' '}
      {clientName && <strong className="font-semibold">{clientName}</strong>}{' '}
      {clientDocument && <span className="font-mono font-semibold">({clientDocument})</span>}{' '}
      e todos os seus dados relacionados (cobranças, pagamentos, visitas, histórico de autorização)? Esta ação é irreversível.
    </>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-start mb-6">
          <AlertTriangle className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" />
          <p className="text-sm text-gray-700">{displayMessage}</p>
        </div>

        <div className="flex justify-between gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
          >
            {cancelButtonText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-colors"
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
