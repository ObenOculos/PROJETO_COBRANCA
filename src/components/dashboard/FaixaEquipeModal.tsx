import React, { useMemo, useState } from "react";
import { X, Users } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { User as UserType } from "../../types";

interface FaixaEquipeModalProps {
  collector: UserType;
  onClose: () => void;
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text";

// Gestor responsavel (bonificacao/consolidacao de equipe) de UM cobrador.
// A faixa de atraso morava aqui ate 2026-11-06; agora ela e regra de
// distribuicao (faixa x lojas) e fica centralizada em CarteiraDistribuicao.
const FaixaEquipeModal: React.FC<FaixaEquipeModalProps> = ({
  collector,
  onClose,
}) => {
  const {
    users,
    managerCollectorLinks,
    vincularCobradorAGerente,
    desvincularCobrador,
  } = useCollection();

  const vinculoAtual = managerCollectorLinks.find(
    (l) => l.collectorId === collector.id,
  );
  const managers = useMemo(
    () => users.filter((u) => u.type === "manager" && u.active !== false),
    [users],
  );

  const [managerId, setManagerId] = useState(vinculoAtual?.managerId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (managerId === (vinculoAtual?.managerId ?? "")) {
      onClose();
      return;
    }
    setLoading(true);
    try {
      if (managerId === "") {
        await desvincularCobrador(collector.id);
      } else {
        await vincularCobradorAGerente(managerId, collector.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar o gestor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-dark-text">
            <Users className="h-5 w-5 text-gray-500" />
            Gestor de {collector.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 text-sm rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
              Gestor responsável
            </label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className={inputClass}
            >
              <option value="">Nenhum</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
              Usado para consolidar o desempenho da equipe no painel do
              gestor. A faixa de atraso e as lojas do cobrador ficam em
              Distribuição da carteira.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text-secondary"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FaixaEquipeModal;
