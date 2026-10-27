import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthContextType, User, UserType } from "../types";
import { supabase } from "../lib/supabase";
import { useLoading } from "./LoadingContext";
import {
  dataCache,
  statsCache,
  userCache,
  collectionsCache,
  quickCache,
} from "../utils/cache";

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

/** Linha de public.users relevante para montar o User da sessão. */
interface UserProfileRow {
  id: string;
  name: string;
  login: string;
  type: string;
  active: boolean | null;
  created_at: string | null;
  auth_email: string | null;
}

const buildUser = (row: UserProfileRow): User => ({
  id: row.id,
  name: row.name,
  login: row.login,
  type: row.type as UserType,
  createdAt: row.created_at || new Date().toISOString(),
  active: row.active ?? true,
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [showInactiveAccountModal, setShowInactiveAccountModal] =
    useState(false);
  const { withLoading } = useLoading();

  const clearError = () => {
    setError(null);
  };

  // Configurações de inatividade
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutos
  let inactivityTimer: ReturnType<typeof setTimeout>;

  const clearLocalSession = () => {
    sessionStorage.removeItem("sistema_user");
    dataCache.clear();
    statsCache.clear();
    userCache.clear();
    collectionsCache.clear();
    quickCache.clear();
  };

  const resetInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    if (user) {
      inactivityTimer = setTimeout(() => {
        clearLocalSession();
        void supabase.auth.signOut();
        setUser(null);
        setShowInactivityModal(true);
      }, INACTIVITY_TIMEOUT);
    }
  };

  useEffect(() => {
    // Restaura a sessão ao abrir o app. supabase.auth.getSession() lê a
    // sessão persistida localmente — não depende de rede, então funciona
    // offline enquanto o token de acesso ainda for válido.
    const checkSession = async () => {
      try {
        setIsLoading(true);

        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          clearLocalSession();
          setUser(null);
          return;
        }

        // Espelho local (gravado no login) evita depender de rede para
        // restaurar o perfil — é só exibição, a sessão de verdade é a do
        // Supabase Auth.
        const savedUser = sessionStorage.getItem("sistema_user");
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
            return;
          } catch {
            sessionStorage.removeItem("sistema_user");
          }
        }

        // Sem espelho local (ex.: outra aba) — busca o perfil pelo vínculo
        // com a sessão autenticada. Exige rede.
        const { data: row, error: profileError } = await supabase
          .from("users")
          .select("id, name, login, type, active, created_at, auth_email")
          .eq("auth_user_id", data.session.user.id)
          .single();

        if (profileError || !row) {
          await supabase.auth.signOut();
          clearLocalSession();
          setUser(null);
          return;
        }

        const userObj = buildUser(row);
        sessionStorage.setItem("sistema_user", JSON.stringify(userObj));
        setUser(userObj);
      } catch {
        clearLocalSession();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Desloga em qualquer aba se a sessão expirar/for revogada em outra.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") {
          clearLocalSession();
          setUser(null);
        }
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Configurar listeners de atividade quando o usuário estiver logado
  useEffect(() => {
    if (user) {
      const events = ["mousedown", "keypress", "scroll", "touchstart", "click"];

      const handleActivity = () => {
        resetInactivityTimer();
      };

      events.forEach((event) => {
        document.addEventListener(event, handleActivity);
      });

      resetInactivityTimer();

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
      clearError();

      if (!navigator.onLine) {
        setError(
          "Sem conexão com a internet. É preciso estar online para entrar pela primeira vez na sessão.",
        );
        return false;
      }

      const performLogin = async (): Promise<boolean> => {
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

        // Resolve o login (não é e-mail) para o e-mail sintético usado no
        // Supabase Auth. Roda como anon (ainda sem sessão) — por isso é uma
        // RPC dedicada, não uma leitura direta de "users" (Etapa 2a: anon
        // não tem mais acesso à tabela).
        const { data: authEmail, error: lookupError } = await supabase.rpc(
          "resolve_auth_email",
          { p_login: login },
        );

        if (lookupError) {
          setError(
            "Erro de conexão com o banco de dados. Verifique sua conexão com a internet.",
          );
          throw lookupError;
        }

        if (!authEmail) {
          setError("Login ou senha incorretos. Verifique suas credenciais.");
          return false;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword(
          { email: authEmail, password },
        );

        if (signInError) {
          setError("Login ou senha incorretos. Verifique suas credenciais.");
          return false;
        }

        // A partir daqui a sessão já é "authenticated" — a leitura do
        // perfil completo só é permitida depois do sign-in (Etapa 2a).
        const { data: row, error: profileError } = await supabase
          .from("users")
          .select("id, name, login, type, active, created_at, auth_email")
          .eq("login", login)
          .single();

        if (profileError || !row) {
          await supabase.auth.signOut();
          setError("Erro ao carregar o perfil do usuário.");
          return false;
        }

        // Usuário desativado: login bloqueado (preserva histórico). Checa
        // DEPOIS de validar a senha, pra não revelar o status a quem não
        // tem a senha.
        if (row.active === false) {
          await supabase.auth.signOut();
          setShowInactiveAccountModal(true);
          return false;
        }

        const userObj = buildUser(row);
        sessionStorage.setItem("sistema_user", JSON.stringify(userObj));
        setUser(userObj);
        return true;
      };

      return await withLoading(performLogin(), "Fazendo login...");
    } catch (err) {
      console.error("Erro no login:", err);
      return false;
    }
  };

  const logout = async () => {
    try {
      await withLoading(
        (async () => {
          await supabase.auth.signOut();
          clearLocalSession();
          setUser(null);

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

      {/* Modal: conta desativada (tentativa de login bloqueada) */}
      {showInactiveAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                <svg
                  className="w-6 h-6 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text mb-2">
                Usuário inativo
              </h3>
              <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-6">
                Este usuário está desativado e não pode acessar o sistema.
                Procure o gerente para reativar o acesso.
              </p>
              <button
                onClick={() => setShowInactiveAccountModal(false)}
                className="w-full px-4 py-2.5 bg-gray-900 dark:bg-blue-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

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
