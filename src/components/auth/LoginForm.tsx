import React, { useState } from "react";
import { Eye, EyeOff, LogIn, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

const LoginForm: React.FC = () => {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { login: authenticate, isLoading, error, clearError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authenticate(login, password);
    } catch (err) {
      console.error("Erro na autenticação:", err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Elementos decorativos de fundo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-200/30 to-indigo-300/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-purple-200/30 to-pink-300/30 rounded-full blur-3xl"></div>
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-cyan-200/20 to-blue-300/20 rounded-full blur-2xl"></div>
        <div className="absolute bottom-20 right-20 w-40 h-40 bg-gradient-to-bl from-indigo-200/20 to-purple-300/20 rounded-full blur-2xl"></div>
      </div>

      {/* Cartão de login */}
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>

          {/* Cabeçalho */}
          <div className="text-center mb-8">
            <div className="mx-auto h-16 w-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mb-6 shadow-lg transform hover:scale-105 transition-transform duration-300">
              <LogIn className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Acesso ao Sistema
            </h2>
            <p className="text-gray-600">Entre com suas credenciais</p>
            <div className="w-16 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mt-4 rounded-full"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Campo login */}
            <div className="group">
              <label
                htmlFor="login"
                className="block text-sm font-medium text-gray-700 mb-2 group-focus-within:text-blue-600 transition-colors"
              >
                Login
              </label>
              <div className="relative">
                <input
                  id="login"
                  type="text"
                  value={login}
                  onChange={(e) => {
                    setLogin(e.target.value);
                    clearError();
                  }}
                  className="w-full px-4 py-4 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-300 placeholder-gray-400 backdrop-blur-sm hover:bg-white/70"
                  placeholder="Digite seu login"
                  disabled={isLoading}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 rounded-xl opacity-0 group-focus-within:opacity-10 transition-opacity duration-300 pointer-events-none"></div>
              </div>
            </div>

            {/* Campo senha */}
            <div className="group">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2 group-focus-within:text-blue-600 transition-colors"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  className="w-full px-4 py-4 pr-12 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-300 placeholder-gray-400 backdrop-blur-sm hover:bg-white/70"
                  placeholder="Digite sua senha"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center hover:bg-gray-100/50 rounded-r-xl transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                  )}
                </button>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 rounded-xl opacity-0 group-focus-within:opacity-10 transition-opacity duration-300 pointer-events-none"></div>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div className="bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-xl p-4 flex items-start space-x-3 animate-in slide-in-from-top-2 duration-300">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-4 px-6 rounded-xl hover:from-blue-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 transition-all duration-300 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
