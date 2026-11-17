import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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

// Sem clique/tecla/rolagem/toque por este tempo em NENHUMA aba, desloga este
// navegador (usuário pediu 3 h em 17/11; antes 1 h).
const INACTIVITY_TIMEOUT = 3 * 60 * 60 * 1000; // 3 horas
/** Ultimo uso do app neste navegador (todas as abas). */
const CHAVE_ULTIMO_USO = "sistema_ultimo_uso";
/** Id de Supabase Auth da conta desta aba (sessionStorage). */
const CHAVE_AUTH_ID = "sistema_auth_id";

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
  // Outra conta entrou neste navegador (outra aba): esta aba foi desconectada.
  const [contaTrocada, setContaTrocada] = useState<string | null>(null);
  // Login com outra conta ja conectada neste navegador: pede confirmacao.
  const [confirmarTroca, setConfirmarTroca] = useState<{
    conectado: string;
    login: string;
    password: string;
  } | null>(null);
  const { withLoading } = useLoading();

  // Sessao do Supabase Auth e UMA por navegador (localStorage, todas as abas);
  // o perfil mostrado e por aba (sessionStorage). Se outra conta entra em
  // outra aba, esta aba passaria a consultar e gravar com a conta nova
  // mostrando a antiga (bug relatado em 17/11). Cada aba guarda o id de Auth
  // da propria conta e se desconecta quando a sessao do navegador muda.
  const authIdRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const clearError = () => {
    setError(null);
  };

  const clearLocalSession = () => {
    sessionStorage.removeItem("sistema_user");
    sessionStorage.removeItem(CHAVE_AUTH_ID);
    authIdRef.current = null;
    dataCache.clear();
    statsCache.clear();
    userCache.clear();
    collectionsCache.clear();
    quickCache.clear();
  };

  const guardarSessao = (userObj: User, authId: string) => {
    sessionStorage.setItem("sistema_user", JSON.stringify(userObj));
    sessionStorage.setItem(CHAVE_AUTH_ID, authId);
    authIdRef.current = authId;
    setUser(userObj);
  };

  /** Desconecta SO esta aba (a sessao do navegador e da outra conta). */
  const desconectarAba = (nomeOutraConta: string) => {
    clearLocalSession();
    setUser(null);
    setContaTrocada(nomeOutraConta);
  };

  /** Nome da conta de uma sessao de Auth (para os avisos). */
  const nomeDaConta = async (authUserId: string): Promise<string> => {
    const { data } = await supabase
      .from("users")
      .select("name")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    return data?.name || "outra conta";
  };

  /** Confere se a sessao do navegador ainda e a desta aba. */
  const conferirConta = useCallback(async () => {
    if (!userRef.current || !authIdRef.current) return;
    const { data } = await supabase.auth.getSession();
    const idSessao = data.session?.user.id ?? null;
    if (!idSessao) return; // saiu: o SIGNED_OUT ja trata
    if (idSessao !== authIdRef.current) {
      desconectarAba(await nomeDaConta(idSessao));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // Supabase Auth. So vale se for da MESMA conta da sessao (outra
        // conta pode ter entrado em outra aba).
        const savedUser = sessionStorage.getItem("sistema_user");
        const savedAuthId = sessionStorage.getItem(CHAVE_AUTH_ID);
        if (savedUser && savedAuthId === data.session.user.id) {
          try {
            authIdRef.current = savedAuthId;
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
          await supabase.auth.signOut({ scope: "local" });
          clearLocalSession();
          setUser(null);
          return;
        }

        guardarSessao(buildUser(row), data.session.user.id);
      } catch {
        clearLocalSession();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Sessao do navegador mudou em outra aba: saiu (SIGNED_OUT) ou outra
    // conta entrou (SIGNED_IN com outro id).
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          clearLocalSession();
          setUser(null);
          return;
        }
        const idSessao = session?.user.id;
        if (
          idSessao &&
          userRef.current &&
          authIdRef.current &&
          idSessao !== authIdRef.current
        ) {
          // Fora do callback do Auth (nao chamar o Supabase dentro dele).
          setTimeout(() => {
            void nomeDaConta(idSessao).then(desconectarAba);
          }, 0);
        }
      },
    );

    // Reforco: ao voltar para a aba, confere a conta (caso o aviso entre
    // abas nao tenha chegado).
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferirConta();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);

    return () => {
      subscription.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inatividade COMPARTILHADA entre as abas: o ultimo uso fica no
  // localStorage. Antes cada aba contava sozinha e uma aba esquecida
  // desconectava o navegador inteiro com o usuario ativo em outra.
  useEffect(() => {
    if (!user) return;
    let ultimaGravacao = 0;
    const registrarUso = () => {
      const agora = Date.now();
      // Grava no maximo a cada 30 s (evento de rolagem dispara muito).
      if (agora - ultimaGravacao < 30_000) return;
      ultimaGravacao = agora;
      try {
        localStorage.setItem(CHAVE_ULTIMO_USO, String(agora));
      } catch {
        // sem storage: conta so esta aba (ultimaGravacao)
      }
    };
    const ultimoUso = (): number => {
      try {
        return Math.max(
          ultimaGravacao,
          Number(localStorage.getItem(CHAVE_ULTIMO_USO)) || 0,
        );
      } catch {
        return ultimaGravacao;
      }
    };
    const events = ["mousedown", "keypress", "scroll", "touchstart", "click"];
    events.forEach((e) => document.addEventListener(e, registrarUso));
    // Entrar (ou abrir a aba) conta como uso.
    ultimaGravacao = 0;
    registrarUso();

    const timer = window.setInterval(() => {
      if (Date.now() - ultimoUso() < INACTIVITY_TIMEOUT) return;
      window.clearInterval(timer);
      clearLocalSession();
      // So este navegador: o celular do cobrador continua conectado.
      void supabase.auth.signOut({ scope: "local" });
      setUser(null);
      setShowInactivityModal(true);
    }, 60_000);

    return () => {
      events.forEach((e) => document.removeEventListener(e, registrarUso));
      window.clearInterval(timer);
    };
  }, [user]);

  const login = async (
    login: string,
    password: string,
    trocarConta = false,
  ): Promise<boolean> => {
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

        // Outra conta ja conectada neste navegador (outra aba): entrar troca
        // a conta de TODAS as abas. Pergunta antes (como o WhatsApp Web).
        if (!trocarConta) {
          const { data: atual } = await supabase.auth.getSession();
          const sessao = atual.session;
          if (
            sessao &&
            (sessao.user.email ?? "").toLowerCase() !==
              String(authEmail).toLowerCase()
          ) {
            setConfirmarTroca({
              conectado: await nomeDaConta(sessao.user.id),
              login,
              password,
            });
            return false;
          }
        }

        const { data: entrou, error: signInError } =
          await supabase.auth.signInWithPassword({ email: authEmail, password });

        if (signInError || !entrou.user) {
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
          await supabase.auth.signOut({ scope: "local" });
          setError("Erro ao carregar o perfil do usuário.");
          return false;
        }

        // Usuário desativado: login bloqueado (preserva histórico). Checa
        // DEPOIS de validar a senha, pra não revelar o status a quem não
        // tem a senha.
        if (row.active === false) {
          await supabase.auth.signOut({ scope: "local" });
          setShowInactiveAccountModal(true);
          return false;
        }

        setContaTrocada(null);
        guardarSessao(buildUser(row), entrou.user.id);
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
          // So este navegador (antes encerrava a sessão da pessoa em todos
          // os aparelhos -- padrão "global" do Supabase).
          await supabase.auth.signOut({ scope: "local" });
          clearLocalSession();
          setUser(null);
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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

      {/* Login com outra conta já conectada neste navegador */}
      {confirmarTroca && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text mb-2">
              Outra conta está conectada
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-6">
              <strong>{confirmarTroca.conectado}</strong> está conectado neste
              navegador (em outra aba). Entrar como{" "}
              <strong>{confirmarTroca.login}</strong> desconecta{" "}
              {confirmarTroca.conectado} em todas as abas deste navegador. Os
              outros aparelhos não são afetados.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmarTroca(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-dark-border text-sm font-semibold rounded-xl text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const t = confirmarTroca;
                  setConfirmarTroca(null);
                  void login(t.login, t.password, true);
                }}
                className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-blue-600 text-white text-sm font-semibold rounded-xl hover:opacity-90"
              >
                Entrar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Esta aba foi desconectada: outra conta entrou neste navegador */}
      {contaTrocada && !user && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-6 max-w-md w-full shadow-xl text-center">
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text mb-2">
              Esta aba foi desconectada
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-6">
              <strong>{contaTrocada}</strong> entrou neste navegador em outra
              aba. Só uma conta fica conectada por vez no mesmo navegador. Para
              usar duas contas ao mesmo tempo, use uma janela anônima ou outro
              navegador.
            </p>
            <button
              onClick={() => setContaTrocada(null)}
              className="w-full px-4 py-2.5 bg-gray-900 dark:bg-blue-600 text-white text-sm font-semibold rounded-xl hover:opacity-90"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* Modal de Inatividade */}
      {showInactivityModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
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
