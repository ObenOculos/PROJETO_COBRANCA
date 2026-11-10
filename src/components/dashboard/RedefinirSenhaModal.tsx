import React, { useState } from "react";
import { CheckCircle, KeyRound } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { User } from "../../types";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text";

interface RedefinirSenhaModalProps {
  user: User;
  onClose: () => void;
}

// Gestor define uma senha nova para o login de um usuario (RPC
// redefinir_senha_usuario). A senha antiga deixa de valer na hora.
const RedefinirSenhaModal: React.FC<RedefinirSenhaModalProps> = ({
  user,
  onClose,
}) => {
  const { redefinirSenhaUsuario } = useCollection();
  const [senha, setSenha] = useState("");
  const [senhaConfirma, setSenhaConfirma] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== senhaConfirma) {
      setErro("A confirmação não confere com a senha.");
      return;
    }
    setIsSaving(true);
    try {
      await redefinirSenhaUsuario(user.id, senha);
      setFeito(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao redefinir senha");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Redefinir senha
          </h3>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1 truncate">
            {user.name} · Login: {user.login}
          </p>
        </div>

        {feito ? (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 text-green-800 text-sm dark:bg-green-900/20 dark:text-green-300">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <span>
                Senha redefinida. Passe a senha nova para a pessoa; a antiga
                já não funciona.
              </span>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {erro && (
              <div className="p-3 bg-red-100 text-red-700 text-sm rounded-md">
                {erro}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                Senha nova
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
                minLength={6}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                Confirmar senha nova
              </label>
              <input
                type="password"
                value={senhaConfirma}
                onChange={(e) => setSenhaConfirma(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
                minLength={6}
                required
              />
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">
                Mínimo de 6 caracteres.
              </p>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? "Salvando..." : "Redefinir"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default RedefinirSenhaModal;
