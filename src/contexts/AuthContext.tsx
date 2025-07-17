import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthContextType, User } from "../types";
import { supabase } from "../lib/supabase";
import { useLoading } from "./LoadingContext";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const { withLoading } = useLoading();

  // Função para limpar o erro de autenticação
  const clearError = () => {
    setError(null);
  };

  // Configurações de inatividade
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutos
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
    // Check for existing session
    const checkSession = async () => {
      try {
        setIsLoading(true);

        // Adiciona um pequeno delay para mostrar o loading no refresh
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Verificar sessionStorage para usuário logado
        const savedUser = sessionStorage.getItem("sistema_user");
        if (savedUser) {
          try {
            const userData = JSON.parse(savedUser);
            setUser(userData);
            console.log("Usuário recuperado da sessão:", userData);
          } catch (parseError) {
            console.error("Erro ao parsear dados do usuário:", parseError);
            sessionStorage.removeItem("sistema_user");
          }
        }
      } catch (err) {
        console.error("Error checking session:", err);
        sessionStorage.removeItem("sistema_user");
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Sistema usa autenticação personalizada via sessionStorage
    // Não precisamos do listener do Supabase Auth
    console.log("Sistema de autenticação personalizada inicializado");
  }, []);

  // Configurar listeners de atividade quando o usuário estiver logado
  useEffect(() => {
    if (user) {
      const events = ["mousedown", "keypress", "scroll", "touchstart", "click"];

      const handleActivity = () => {
        resetInactivityTimer();
      };

      // Adicionar listeners
      events.forEach((event) => {
        document.addEventListener(event, handleActivity);
      });

      // Iniciar o timer
      resetInactivityTimer();

      // Cleanup
      return () => {
        events.forEach((event) => {
          document.removeEventListener(event, handleActivity);
        });
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
        }
      };
    }
  }, [user]);

  // Função para realizar login offline usando dados em cache
  const performOfflineLogin = async (login: string, password: string): Promise<boolean> => {
    try {
      // Verificar se há dados de usuários em cache (localStorage)
      const cachedUsers = localStorage.getItem('cached_users');
      
      if (!cachedUsers) {
        setError("Sem conexão e nenhum dado de login em cache. Conecte-se à internet para fazer o primeiro login.");
        return false;
      }

      const users = JSON.parse(cachedUsers);
      const foundUser = users.find((user: any) => 
        user.login === login && user.password === password
      );

      if (!foundUser) {
        setError("Credenciais inválidas ou usuário não encontrado no cache offline.");
        return false;
      }

      // Criar objeto do usuário
      const userObj: User = {
        id: foundUser.id,
        name: foundUser.name,
        login: foundUser.login,
        password: foundUser.password,
        type: foundUser.type as "manager" | "collector",
        createdAt: foundUser.created_at || new Date().toISOString(),
      };

      // Salvar na sessão local
      sessionStorage.setItem("sistema_user", JSON.stringify(userObj));
      
      console.log("Login offline realizado com sucesso:", userObj);
      setUser(userObj);
      return true;
      
    } catch (error) {
      console.error("Erro no login offline:", error);
      setError("Erro ao processar login offline. Tente novamente.");
      return false;
    }
  };

  const login = async (login: string, password: string): Promise<boolean> => {
    try {
      // Limpa qualquer erro anterior ao tentar fazer login
      clearError();

      console.log("Tentando fazer login com:", { login });

      // Verificar se está offline
      if (!navigator.onLine) {
        console.log("Modo offline detectado - tentando login com dados em cache");
        return await performOfflineLogin(login, password);
      }

      // Função interna para realizar o login
      const performLogin = async (): Promise<boolean> => {
        // Validações básicas
        if (!login || !password) {
          setError("Por favor, preencha todos os campos.");
          return false;
        }

        if (login.length < 3) {
          setError("Login deve ter pelo menos 3 caracteres.");
          return false;
        }

        if (password.length < 4) {
          setError("Senha deve ter pelo menos 4 caracteres.");
          return false;
        }

        // Primeiro, buscar usuário na tabela users para validar credenciais
        const { data: users, error: userError } = await supabase
          .from("users")
          .select("*")
          .eq("login", login)
          .eq("password", password)
          .limit(1);

        console.log("Resultado da consulta:", { users, userError });

        if (userError) {
          console.error("Erro ao consultar usuários:", userError);
          setError("Erro de conexão com o banco de dados. Verifique sua conexão com a internet.");
          throw new Error("Erro ao consultar banco de dados");
        }

        if (!users || users.length === 0) {
          console.log("Usuário não encontrado com essas credenciais");
          setError("Login ou senha incorretos. Verifique suas credenciais.");
          return false; // Retorna false explicitamente para credenciais inválidas
        }

        // Cache dos usuários para login offline (buscar todos os usuários)
        try {
          const { data: allUsers, error: cacheError } = await supabase
            .from("users")
            .select("*");
          
          if (!cacheError && allUsers) {
            // Não armazenar senhas em cache por segurança
            const usersWithoutPasswords = allUsers.map(user => ({
              ...user,
              password: '' // Limpar senha antes do cache
            }));
            localStorage.setItem('cached_users', JSON.stringify(usersWithoutPasswords));
            console.log("Usuários armazenados em cache para login offline (sem senhas)");
          }
        } catch (cacheErr) {
          console.log("Erro ao cachear usuários (não crítico):", cacheErr);
        }

        const foundUser = users[0];
        console.log("Usuário encontrado:", foundUser);

        // Sistema usa autenticação personalizada via tabela users
        // Não precisamos do Supabase Auth para este sistema
        console.log("Usando autenticação personalizada do sistema");

        // Criar objeto do usuário
        const userObj: User = {
          id: foundUser.id,
          name: foundUser.name,
          login: foundUser.login,
          password: foundUser.password,
          type: foundUser.type as "manager" | "collector",
          createdAt: foundUser.created_at || new Date().toISOString(),
        };

        // Salvar na sessão local
        sessionStorage.setItem("sistema_user", JSON.stringify(userObj));

        console.log("Login realizado com sucesso:", userObj);
        setUser(userObj);
        return true; // Retorna true para login bem-sucedido
      };

      // Usa withLoading para mostrar loading durante o login
      const success = await withLoading(
        performLogin(),
        "Fazendo login...", // Mensagem personalizada
      );

      console.log("Resultado final do login:", success);
      return success;
    } catch (err) {
      console.error("Erro no login:", err);
      // Importante: retornar false em caso de erro, não undefined
      return false;
    }
  };

  const logout = async () => {
    try {
      // Usa withLoading para logout se necessário
      await withLoading(
        (async () => {
          // Limpar sessão do sistema personalizado
          sessionStorage.removeItem("sistema_user");
          setUser(null);
          console.log("Logout realizado com sucesso");

          // Limpa o timer de inatividade
          if (inactivityTimer) {
            clearTimeout(inactivityTimer);
          }
        })(),
        "Saindo...",
      );
    } catch (err) {
      console.error("Erro no logout:", err);
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
    error,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}

      {/* Modal de Inatividade */}
      {showInactivityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="text-center">
              <div className="mb-4">
                <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    ></path>
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Sessão Expirada
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Sua sessão expirou devido à inatividade. Você será redirecionado
                para a tela de login.
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
