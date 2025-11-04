import React, { useState, useEffect, useMemo } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
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
import OfflineIndicator from "./components/common/OfflineIndicator";
import { navigationItems } from "./config/navigation";

import VersionChecker from "./components/common/VersionChecker"; // Import VersionChecker

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

  const tabs = useMemo(() => {
    if (!user) return [];
    return navigationItems
      .filter((item) => item.roles.includes(user.type))
      .map((item) => {
        const name =
          user.type === "manager"
            ? item.managerName
            : item.collectorName || item.managerName;
        const icon =
          user.type === "manager"
            ? item.managerIcon
            : item.collectorIcon || item.managerIcon;
        return { id: item.id, name, icon };
      });
  }, [user]);

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

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        tabs={tabs}
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
      <OfflineIndicator />
      <SpeedInsights />
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
            <VersionChecker /> {/* Render VersionChecker here */}
          </NotificationProvider>
        </CollectionProvider>
      </AuthProvider>
    </LoadingProvider>
  );
}

export default App;
