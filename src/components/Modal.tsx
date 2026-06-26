import { X } from "lucide-react";
import { ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  tallHeight?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  tallHeight = false,
}: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
  };

  return (
    <div
      className={`fixed inset-0 z-50 ${tallHeight ? "overflow-hidden" : "overflow-y-auto"}`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 transition-opacity z-modal-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`flex ${tallHeight ? "h-full" : "min-h-full"} items-center justify-center p-4`}
      >
        <div
          className={`relative bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl dark:shadow-2xl w-full ${sizeClasses[size]} transform transition-all border border-gray-200 dark:border-dark-border z-modal ${tallHeight ? "flex flex-col max-h-[90vh] h-[90vh]" : ""}`}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-dark-text-secondary hover:text-gray-500 dark:hover:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-primary rounded-2xl p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Content */}
          <div
            className={`text-gray-900 dark:text-dark-text ${tallHeight ? "flex flex-col flex-1 min-h-0" : "p-6"}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
