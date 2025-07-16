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
import ManagerDashboard, {
  getManagerTabs,
} from "./components/dashboard/ManagerDashboard";
import CollectorDashboard, {
  getCollectorTabs,
} from "./components/dashboard/CollectorDashboard";
import GlobalLoading from "./components/common/GlobalLoading";

const AppContent: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { loading: collectionLoading, getPendingCancellationRequests } =
    useCollection();
  const { isLoading: globalLoading, loadingMessage } = useLoading();

  // Estado para gerenciar aba ativa do manager
  const [managerActiveTab, setManagerActiveTab] = useState(() => {
    const savedTab = localStorage.getItem("managerActiveTab");
    return savedTab || "overview";
  });

  // Estado para gerenciar aba ativa do collector
  const [collectorActiveTab, setCollectorActiveTab] = useState(() => {
    const savedTab = localStorage.getItem("collectorActiveTab");
    return savedTab || "overview";
  });

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
  const handleManagerTabChange = (tabId: string) => {
    setManagerActiveTab(tabId);
    localStorage.setItem("managerActiveTab", tabId);
  };

  const handleCollectorTabChange = (tabId: string) => {
    setCollectorActiveTab(tabId);
    localStorage.setItem("collectorActiveTab", tabId);
  };

  const pendingCancellations =
    user?.type === "manager" ? getPendingCancellationRequests() : [];
  const managerTabs =
    user?.type === "manager" ? getManagerTabs(pendingCancellations.length) : [];
  const collectorTabs = user?.type === "collector" ? getCollectorTabs() : [];

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        tabs={user?.type === "manager" ? managerTabs : collectorTabs}
        activeTab={
          user?.type === "manager" ? managerActiveTab : collectorActiveTab
        }
        onTabChange={
          user?.type === "manager"
            ? handleManagerTabChange
            : handleCollectorTabChange
        }
        pendingCancellations={pendingCancellations.length}
      />
      {user.type === "manager" ? (
        <ManagerDashboard
          activeTab={managerActiveTab}
          onTabChange={handleManagerTabChange}
        />
      ) : (
        <CollectorDashboard
          activeTab={collectorActiveTab}
          onTabChange={handleCollectorTabChange}
        />
      )}
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
