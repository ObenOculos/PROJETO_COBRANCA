import React, { useState, useEffect } from "react";

interface GlobalLoadingProps {
  message?: string;
}

const GlobalLoading: React.FC<GlobalLoadingProps> = ({
  message = "Carregando...",
}) => {
  const [displayMessage, setDisplayMessage] = useState(message);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Pequeno delay para aparecer suavemente
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 50);

    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    // Atualiza a mensagem com um pequeno delay para transição suave
    const messageTimer = setTimeout(() => {
      setDisplayMessage(message);
    }, 100);

    return () => clearTimeout(messageTimer);
  }, [message]);

  return (
    <div
      className={`fixed inset-0 bg-white flex items-center justify-center z-50 transition-opacity duration-200 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="text-center">
        {/* Pontinhos animados */}
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div
            className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>

        {/* Mensagem de loading com transição suave */}
        <p className="text-gray-600 text-sm font-medium transition-all duration-300 ease-in-out">
          {displayMessage}
        </p>
      </div>
    </div>
  );
};

export default GlobalLoading;
