import React, { useMemo, useState } from "react";
import { X, Gauge } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { User as UserType } from "../../types";

interface FaixaEquipeModalProps {
  collector: UserType;
  onClose: () => void;
}

// Faixa de atraso (carteira automatica) e gestor responsavel (bonificacao
// de equipe) de UM cobrador -- as duas coisas que a etapa 3/4 da iniciativa
// de metas/vinculo/carteira automatica cadastram (ver docs/PROGRESSO.md).
// Um modal so porque as duas sao, na pratica, "configuracao do cobrador",
// e cada uma ja tem sua propria RPC atomica no banco.
const FaixaEquipeModal: React.FC<FaixaEquipeModalProps> = ({
  collector,
  onClose,
}) => {
  const {
    users,
    collectorOverdueRanges,
    managerCollectorLinks,
    definirFaixaAtrasoCobrador,
    vincularCobradorAGerente,
    desvincularCobrador,
  } = useCollection();

  const faixaAtual = collectorOverdueRanges.find(
    (r) => r.collectorId === collector.id,
  );
  const vinculoAtual = managerCollectorLinks.find(
    (l) => l.collectorId === collector.id,
  );
  const managers = useMemo(
    () => users.filter((u) => u.type === "manager"),
    [users],
  );

  const [minDias, setMinDias] = useState(
    faixaAtual ? String(faixaAtual.minDias) : "",
  );
  const [maxDias, setMaxDias] = useState(
    faixaAtual?.maxDias != null ? String(faixaAtual.maxDias) : "",
  );
  const [managerId, setManagerId] = useState(vinculoAtual?.managerId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const min = minDias.trim() === "" ? null : Number(minDias);
    const max = maxDias.trim() === "" ? null : Number(maxDias);
    if (min === null || Number.isNaN(min) || min < 0) {
      setError("Informe o início da faixa (dias) -- 0 ou mais.");
      return;
    }
    if (max !== null && (Number.isNaN(max) || max <= min)) {
      setError("O fim da faixa deve ser maior que o início, ou vazio (sem limite).");
      return;
    }

    setLoading(true);
    try {
      const faixaMudou =
        !faixaAtual || faixaAtual.minDias !== min || faixaAtual.maxDias !== max;
      if (faixaMudou) {
        await definirFaixaAtrasoCobrador(collector.id, min, max);
      }

      if (managerId !== (vinculoAtual?.managerId ?? "")) {
        if (managerId === "") {
          await desvincularCobrador(collector.id);
        } else {
          await vincularCobradorAGerente(managerId, collector.id);
        }
      }

      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar faixa/equipe",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Gauge className="h-5 w-5 text-gray-500" />
            Faixa &amp; Equipe — {collector.name}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Faixa de atraso que este cobrador atende (dias)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={minDias}
                onChange={(e) => setMinDias(e.target.value)}
                placeholder="De"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <span className="text-gray-400">até</span>
              <input
                type="number"
                min={0}
                value={maxDias}
                onChange={(e) => setMaxDias(e.target.value)}
                placeholder="Sem limite"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Deixe o segundo campo vazio para "sem limite superior". Só
              cadastro por enquanto — a saída automática de carteira por
              faixa ainda não está ligada.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gestor responsável
            </label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Nenhum</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Usado para consolidar o desempenho da equipe no painel do
              gestor.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
