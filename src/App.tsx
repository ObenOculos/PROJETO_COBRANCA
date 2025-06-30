import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CollectionProvider } from './contexts/CollectionContext';
import { LoadingProvider, useLoading } from './contexts/LoadingContext';
import { NotificationProvider } from './contexts/NotificationContext';
import LoginForm from './components/auth/LoginForm';
import Header from './components/common/Header';
import ManagerDashboard from './components/dashboard/ManagerDashboard';
import CollectorDashboard from './components/dashboard/CollectorDashboard';
import GlobalLoading from './components/common/GlobalLoading';

const AppContent: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { isLoading: globalLoading, loadingMessage } = useLoading();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Marca quando o carregamento inicial foi concluído
  useEffect(() => {
    if (!authLoading && !globalLoading) {
      setInitialLoadComplete(true);
    }
  }, [authLoading, globalLoading]);

  // Durante o carregamento inicial (autenticação + dados), mostra apenas um loading
  if (!initialLoadComplete && (authLoading || globalLoading)) {
    return <GlobalLoading message={authLoading ? "Verificando sessão..." : loadingMessage} />;
  }

  // Após o carregamento inicial, mostra loading apenas para operações específicas
  if (initialLoadComplete && globalLoading) {
    return <GlobalLoading message={loadingMessage} />;
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Header />
      {user.type === 'manager' ? <ManagerDashboard /> : <CollectorDashboard />}
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