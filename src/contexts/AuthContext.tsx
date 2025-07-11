import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthContextType, User } from '../types';
import { supabase } from '../lib/supabase';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  // Configurações de inatividade
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 30 minutos
  let inactivityTimer: NodeJS.Timeout;

  // Função para resetar o timer de inatividade
  const resetInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    
    if (user) {
      inactivityTimer = setTimeout(() => {
        setShowInactivityModal(true);
      }, INACTIVITY_TIMEOUT);
    }
  };

  useEffect(() => {
    // Check for existing session in localStorage
    const checkSession = () => {
      try {
        const savedUser = localStorage.getItem('sistema_user');
        if (savedUser) {
          const userData = JSON.parse(savedUser);
          setUser(userData);
        }
      } catch (err) {
        console.error('Error checking session:', err);
        localStorage.removeItem('sistema_user');
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  // Configurar listeners de atividade quando o usuário estiver logado
  useEffect(() => {
    if (user) {
      const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
      
      const handleActivity = () => {
        resetInactivityTimer();
      };

      // Adicionar listeners
      events.forEach(event => {
        document.addEventListener(event, handleActivity);
      });

      // Iniciar o timer
      resetInactivityTimer();

      // Cleanup
      return () => {
        events.forEach(event => {
          document.removeEventListener(event, handleActivity);
        });
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
        }
      };
    }
  }, [user]);

  const login = async (login: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      console.log('Tentando fazer login com:', { login });
      
      // Buscar usuário na tabela users
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('login', login)
        .eq('password', password)
        .limit(1);

      console.log('Resultado da consulta:', { users, userError });

      if (userError) {
        console.error('Erro ao consultar usuários:', userError);
        setIsLoading(false);
        return false;
      }

      if (!users || users.length === 0) {
        console.log('Usuário não encontrado com essas credenciais');
        setIsLoading(false);
        return false;
      }

      const foundUser = users[0];
      console.log('Usuário encontrado:', foundUser);

      // Criar objeto do usuário
      const userObj: User = {
        id: foundUser.id,
        name: foundUser.name,
        login: foundUser.login,
        password: foundUser.password,
        type: foundUser.type as 'manager' | 'collector',
        createdAt: foundUser.created_at || new Date().toISOString(),
      };

      // Salvar na sessão local
      localStorage.setItem('sistema_user', JSON.stringify(userObj));
      
      console.log('Login realizado com sucesso:', userObj);
      setUser(userObj);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Erro no login:', err);
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('sistema_user');
      setUser(null);
    } catch (err) {
      console.error('Erro no logout:', err);
      setUser(null);
    }
  };

  const handleInactivityLogout = () => {
    setShowInactivityModal(false);
    logout();
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isLoading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      
      {/* Modal de Inatividade */}
      {showInactivityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="text-center">
              <div className="mb-4">
                <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Sessão Expirada</h3>
              <p className="text-sm text-gray-500 mb-6">
                Sua sessão expirou devido à inatividade. Você será redirecionado para a tela de login.
              </p>
              <button
                onClick={handleInactivityLogout}
                className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};