import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Filtro de varios itens com caixas de marcar e "Selecionar todos" -- o
 * mesmo para Loja e Cobrador no Resumo (25/11: "deixar a logica do dropdown
 * igual; a do cobrador e melhor").
 *
 * Guarda os EXCLUIDOS, nao os selecionados: vazio = todos; cheio = nenhum.
 * Assim os 3 estados (todos/parcial/nenhum) nao ficam ambiguos.
 */
const FiltroMultiplo: React.FC<{
  opcoes: { id: string; nome: string }[];
  excluidos: Set<string>;
  onChange: (excluidos: Set<string>) => void;
  /** Ex.: { todos: "Todas as lojas", nenhum: "Nenhuma loja", plural: "lojas" } */
  textos: { todos: string; nenhum: string; plural: string };
}> = ({ opcoes, excluidos, onChange, textos }) => {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  const marcados = opcoes.filter((o) => !excluidos.has(o.id)).length;
  const rotulo =
    excluidos.size === 0
      ? textos.todos
      : marcados === 0
        ? textos.nenhum
        : `${marcados} de ${opcoes.length} ${textos.plural}`;

  const alternar = (id: string) => {
    const novo = new Set(excluidos);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    onChange(novo);
  };

  // De qualquer estado parcial cai num dos extremos: todos ou nenhum.
  const alternarTodos = () =>
    onChange(
      excluidos.size === 0 ? new Set(opcoes.map((o) => o.id)) : new Set(),
    );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-56 flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-sm text-gray-900 dark:text-dark-text touch-manipulation"
      >
        <span className="truncate">{rotulo}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
      </button>

      {aberto && (
        <div className="absolute right-0 z-20 mt-1 w-64 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary shadow-lg p-2">
          <button
            type="button"
            onClick={alternarTodos}
            className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            {excluidos.size === 0 ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-dark-border/40" />
          {opcoes.map((o) => {
            const marcado = !excluidos.has(o.id);
            return (
              <label
                key={o.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg cursor-pointer"
              >
                <span
                  className={`flex items-center justify-center h-4 w-4 rounded border ${
                    marcado
                      ? "bg-blue-600 border-blue-600"
                      : "border-gray-300 dark:border-dark-border"
                  }`}
                >
                  {marcado && <Check className="h-3 w-3 text-white" />}
                </span>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={marcado}
                  onChange={() => alternar(o.id)}
                />
                {o.nome}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FiltroMultiplo;
