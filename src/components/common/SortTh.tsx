import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/** Titulo de coluna clicavel pra ordenar a tabela, com seta indicando a
 * coluna/direcao ativa. Usado nas tabelas do Resumo Geral (cobradores e
 * lojas). */
const SortTh: React.FC<{
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ active, dir, onClick, className = "", title, children }) => (
  <th
    onClick={onClick}
    title={title}
    className={`cursor-pointer select-none hover:text-gray-600 dark:hover:text-dark-text ${className}`}
  >
    <span className="inline-flex items-center gap-0.5">
      {children}
      {active &&
        (dir === "desc" ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        ))}
    </span>
  </th>
);

export default SortTh;
