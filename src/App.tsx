import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CollectionProvider, useCollection } from './contexts/CollectionContext';
import { LoadingProvider, useLoading } from './contexts/LoadingContext';
import { NotificationProvider } from './contexts/NotificationContext';
import LoginForm from './components/auth/LoginForm';
import Header from './components/common/Header';
import ManagerDashboard from './components/dashboard/ManagerDashboard';
import CollectorDashboard from './components/dashboard/CollectorDashboard';
import GlobalLoading from './components/common/GlobalLoading';

const AppContent: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { isLoading: collectionLoading } = useCollection();
  const { isLoading: globalLoading, loadingMessage } = useLoading();
  
  // Verifica se QUALQUER loading está ativo
  const isAnyLoading = authLoading || collectionLoading || globalLoading;
  
  // Determina a mensagem de loading com prioridade
  const getLoadingMessage = () => {
    if (authLoading) return "Verificando sessão...";
    if (collectionLoading) return "Carregando dados...";
    if (globalLoading) return loadingMessage;
    return "Carregando...";
  };

  // Mostra loading enquanto qualquer processo estiver carregando
  if (isAnyLoading) {
    return <GlobalLoading message={getLoadingMessage()} />;
  }

  // Se não há usuário logado, mostra tela de login
  if (!user) {
    return <LoginForm />;
  }

  // Usuário logado e todos os dados carregados - mostra a aplicação
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