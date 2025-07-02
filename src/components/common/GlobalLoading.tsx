import React from 'react';

interface GlobalLoadingProps {
  message?: string;
}

const GlobalLoading: React.FC<GlobalLoadingProps> = ({ 
  message = "Carregando..." 
}) => {
  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="text-center">
        {/* Pontinhos animados */}
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
          <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
          <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
        </div>
        
        {/* Mensagem de loading */}
        <p className="text-gray-600 text-sm font-medium">
          {message}
        </p>
      </div>
    </div>
  );
};

export default GlobalLoading;