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

        // Primeiro, verificar se há uma sessão do Supabase válida
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Erro ao verificar sessão do Supabase:", sessionError);
          sessionStorage.removeItem("sistema_user");
          return;
        }

        // Se há sessão no Supabase, recuperar dados do usuário
        if (session) {
          console.log("Sessão do Supabase encontrada, recuperando dados do usuário...");
          
          // Buscar dados do usuário usando o email da sessão
          const { data: users, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("login", session.user.email)
            .limit(1);

          if (!userError && users && users.length > 0) {
            const foundUser = users[0];
            const userObj: User = {
              id: foundUser.id,
              name: foundUser.name,
              login: foundUser.login,
              password: foundUser.password,
              type: foundUser.type as "manager" | "collector",
              createdAt: foundUser.created_at || new Date().toISOString(),
            };

            // Salvar na sessão local e no estado
            sessionStorage.setItem("sistema_user", JSON.stringify(userObj));
            setUser(userObj);
            console.log("Usuário recuperado da sessão:", userObj);
          }
        } else {
          // Se não há sessão no Supabase, verificar sessionStorage como fallback
          const savedUser = sessionStorage.getItem("sistema_user");
          if (savedUser) {
            const userData = JSON.parse(savedUser);
            setUser(userData);
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

    // Configurar listener para mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session);
      
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          sessionStorage.removeItem("sistema_user");
          setUser(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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

  const login = async (login: string, password: string): Promise<boolean> => {
    try {
      // Limpa qualquer erro anterior ao tentar fazer login
      clearError();

      console.log("Tentando fazer login com:", { login });

      // Função interna para realizar o login
      const performLogin = async (): Promise<boolean> => {
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
          throw new Error("Erro ao consultar banco de dados");
        }

        if (!users || users.length === 0) {
          console.log("Usuário não encontrado com essas credenciais");
          setError("Login ou senha incorretos. Verifique suas credenciais.");
          return false; // Retorna false explicitamente para credenciais inválidas
        }

        const foundUser = users[0];
        console.log("Usuário encontrado:", foundUser);

        // Tentar criar uma sessão no Supabase usando o email como login
        // Nota: Isso assume que o campo 'login' contém um email válido
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: foundUser.login,
            password: password,
          });

          if (authError) {
            console.log("Erro ao criar sessão no Supabase:", authError);
            // Continuar mesmo se falhar, pois o sistema funciona com sessionStorage
          } else {
            console.log("Sessão criada no Supabase com sucesso");
          }
        } catch (authErr) {
          console.log("Falha ao criar sessão no Supabase, continuando com sessionStorage:", authErr);
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

        console.log("Login realizado com sucesso:", userObj);
        setUser(userObj);
        return true; // Retorna true para login bem-sucedido
      };

      // Usa withLoading para mostrar loading durante o login
      const success = await withLoading(
        performLogin(),
        "Fazendo login..." // Mensagem personalizada
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
          // Fazer logout do Supabase
          try {
            const { error } = await supabase.auth.signOut();
            if (error) {
              console.error("Erro ao fazer logout do Supabase:", error);
            }
          } catch (authErr) {
            console.error("Falha ao fazer logout do Supabase:", authErr);
          }

          sessionStorage.removeItem("sistema_user");
          setUser(null);

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
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
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