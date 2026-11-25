import React, { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Gauge,
  Info,
  Store,
  TrendingDown,
  Users,
} from "lucide-react";

// Cabecalho do Resumo Geral (titulo + abas), separado do CollectorsSummary
// em 25/11: a aba Inadimplencia nao usa nada do resto da tela (titulos,
// atendimentos, carteira...), entao abre so com este cabecalho -- sem a
// carga completa da base nem as consultas do Resumo (egress do Supabase).

export type AbaResumoGeral = "geral" | "cobrador" | "loja" | "inadimplencia";

const CHAVE = "resumoGeralAba";

export const lerAbaResumoGeral = (): AbaResumoGeral => {
  try {
    const salva = localStorage.getItem(CHAVE);
    return salva === "cobrador" || salva === "loja" || salva === "inadimplencia"
      ? salva
      : "geral";
  } catch {
    return "geral";
  }
};

export const salvarAbaResumoGeral = (aba: AbaResumoGeral): void => {
  try {
    localStorage.setItem(CHAVE, aba);
  } catch {
    // sem storage: so nao lembra a aba
  }
};

const ABAS = [
  ["geral", "Geral", Gauge],
  ["cobrador", "Por cobrador", Users],
  ["loja", "Por loja", Store],
  ["inadimplencia", "Inadimplência", TrendingDown],
] as const;

const CabecalhoResumoGeral: React.FC<{
  aba: AbaResumoGeral;
  onAba: (aba: AbaResumoGeral) => void;
  /** Linha extra dentro do mesmo quadro (ex.: periodo do Resumo). */
  children?: React.ReactNode;
}> = ({ aba, onAba, children }) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    };
    if (infoOpen) document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [infoOpen]);

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <ClipboardList className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          Resumo Geral
          <div className="relative ml-1.5" ref={infoRef}>
            <button
              onClick={() => setInfoOpen((v) => !v)}
              className="text-gray-300 hover:text-blue-600 dark:text-dark-text-secondary dark:hover:text-blue-400"
              aria-label="O que significa cada número"
            >
              <Info className="h-4 w-4" />
            </button>
            {infoOpen && (
              <div className="absolute z-20 mt-2 w-72 rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-xs font-normal normal-case text-blue-700 dark:text-blue-300 shadow-lg">
                <strong>Geral</strong>: a empresa inteira (todos os clientes,
                com ou sem cobrador) e, embaixo, os mesmos cards só com os
                cobradores marcados.
                <br />
                <strong>Por cobrador</strong> e <strong>Por loja</strong>: uma
                linha cada para comparar (Tabela) ou os cards de cada um
                (Cards).
                <br />
                <strong>Inadimplência</strong>: mês a mês, se a carteira está
                melhorando e quanto do atraso foi recuperado.
                <br />
                <strong>Clientes</strong> e <strong>Carteira</strong>: a
                situação de hoje. <strong>Previsão</strong>: o que vence de hoje
                até o fim do período escolhido.
              </div>
            )}
          </div>
        </h2>

        {/* Celular: grade 2x2 (4 abas nao cabem numa linha -- 25/11). */}
        <div className="grid grid-cols-2 gap-0.5 sm:flex bg-gray-100 dark:bg-dark-bg rounded-lg p-0.5">
          {ABAS.map(([id, rotulo, Icone]) => (
            <button
              key={id}
              type="button"
              onClick={() => onAba(id)}
              className={`flex items-center justify-center whitespace-nowrap px-3 py-2 sm:py-1.5 rounded-md text-sm font-semibold transition-all touch-manipulation ${
                aba === id
                  ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
              }`}
            >
              <Icone className="h-4 w-4 mr-1.5" />
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
};

export default CabecalhoResumoGeral;
