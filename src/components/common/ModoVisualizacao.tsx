import React from "react";
import { LayoutGrid, Table2 } from "lucide-react";

export type Modo = "table" | "cards";

/** Chave Tabela | Cards das listas do Resumo Geral (por cobrador e por loja).
 * O gestor escolhe como quer ver; a escolha vale para as duas abas. */
const ModoVisualizacao: React.FC<{
  modo: Modo;
  onChange: (m: Modo) => void;
}> = ({ modo, onChange }) => (
  <div
    className="flex bg-gray-100 dark:bg-dark-bg rounded-lg p-0.5"
    role="group"
    aria-label="Modo de visualização"
  >
    {(
      [
        ["table", "Tabela", Table2],
        ["cards", "Cards", LayoutGrid],
      ] as const
    ).map(([id, rotulo, Icone]) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={modo === id}
        className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all touch-manipulation ${
          modo === id
            ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
            : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
        }`}
      >
        <Icone className="h-4 w-4 mr-1.5" />
        {rotulo}
      </button>
    ))}
  </div>
);

export default ModoVisualizacao;
