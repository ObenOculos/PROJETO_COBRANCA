import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const LoginForm: React.FC = () => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login: authenticate, isLoading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!login || !password) {
      setError('Por favor, preencha todos os campos');
      return;
    }

    console.log('Submitting login form with:', { login, password });
    
    try {
      const success = await authenticate(login, password);
      console.log('Authentication result:', success);
      
      if (!success) {
        setError('Login ou senha incorretos. Verifique suas credenciais e tente novamente.');
      }
    } catch (err) {
      console.error('Login form error:', err);
      setError('Erro ao fazer login. Tente novamente.');
    }
  };

  const handleTestLogin = async (testLogin: string, testPassword: string) => {
    setLogin(testLogin);
    setPassword(testPassword);
    setError('');
    
    console.log('Testing login with:', { testLogin, testPassword });
    
    try {
      const success = await authenticate(testLogin, testPassword);
      console.log('Test authentication result:', success);
      
      if (!success) {
        setError(`Falha no login de teste para ${testLogin}`);
      }
    } catch (err) {
      console.error('Test login error:', err);
      setError('Erro no login de teste');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="mx-auto h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <LogIn className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Acesso ao Sistema</h2>
            <p className="mt-2 text-gray-600">Entre com suas credenciais</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-2">
                Login
              </label>
              <input
                id="login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Digite seu login"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Digite sua senha"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-3">Credenciais de teste:</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleTestLogin('gerente', '123456')}
                  disabled={isLoading}
                  className="w-full text-left p-2 rounded bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <strong>Gerente:</strong> gerente / 123456
                </button>
                <button
                  onClick={() => handleTestLogin('cobrador1', '123456')}
                  disabled={isLoading}
                  className="w-full text-left p-2 rounded bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <strong>Cobrador 1:</strong> cobrador1 / 123456
                </button>
                <button
                  onClick={() => handleTestLogin('cobrador2', '123456')}
                  disabled={isLoading}
                  className="w-full text-left p-2 rounded bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <strong>Cobrador 2:</strong> cobrador2 / 123456
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;