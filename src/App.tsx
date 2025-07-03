import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  CollectionProvider,
  useCollection,
} from "./contexts/CollectionContext";
import { LoadingProvider, useLoading } from "./contexts/LoadingContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import LoginForm from "./components/auth/LoginForm";
import Header from "./components/common/Header";
import ManagerDashboard from "./components/dashboard/ManagerDashboard";
import CollectorDashboard from "./components/dashboard/CollectorDashboard";
import GlobalLoading from "./components/common/GlobalLoading";

const AppContent: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { loading: collectionLoading } = useCollection();
  const { isLoading: globalLoading, loadingMessage } = useLoading();

  // Estado para controlar transições suaves entre loadings
  const [loadingState, setLoadingState] = useState({
    show: true,
    message: "Verificando sessão...",
  });

  useEffect(() => {
    // Prioridade de loading: auth > collection > global
    if (authLoading) {
      setLoadingState({
        show: true,
        message: "Verificando sessão...",
      });
    } else if (user && collectionLoading) {
      setLoadingState({
        show: true,
        message: "Carregando dados...",
      });
    } else if (globalLoading) {
      setLoadingState({
        show: true,
        message: loadingMessage || "Carregando...",
      });
    } else {
      // Pequeno delay antes de esconder o loading para evitar flash
      const timer = setTimeout(() => {
        setLoadingState({
          show: false,
          message: "",
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [authLoading, user, collectionLoading, globalLoading, loadingMessage]);

  // Mostra loading baseado no estado controlado
  if (loadingState.show) {
    return <GlobalLoading message={loadingState.message} />;
  }

  // Se não há usuário, mostra tela de login
  if (!user) {
    return <LoginForm />;
  }

  // Usuário logado e todos os dados carregados - mostra a aplicação
  return (
    <div className="min-h-screen bg-slate-100">
      <Header />
      {user.type === "manager" ? <ManagerDashboard /> : <CollectorDashboard />}
    </div>
  );
};

function App() {
  return (
    <LoadingProvider>
      <AuthProvider>
        <CollectionProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </CollectionProvider>
      </AuthProvider>
    </LoadingProvider>
  );
}

export default App;
