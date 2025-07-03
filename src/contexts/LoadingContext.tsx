import React, { createContext, useContext, useState, ReactNode } from "react";

interface LoadingContextType {
  isLoading: boolean;
  loadingMessage: string;
  setLoading: (loading: boolean, message?: string) => void;
  withLoading: <T>(promise: Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({
  children,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Carregando...");

  const setLoading = (loading: boolean, message: string = "Carregando...") => {
    setIsLoading(loading);
    setLoadingMessage(message);
  };

  // Função utilitária para envolver promises com loading
  const withLoading = async <T,>(
    promise: Promise<T>,
    message: string = "Carregando...",
  ): Promise<T> => {
    setLoading(true, message);
    try {
      const result = await promise;
      setLoading(false);
      return result;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const value: LoadingContextType = {
    isLoading,
    loadingMessage,
    setLoading,
    withLoading,
  };

  return (
    <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
  );
};

export default LoadingContext;
