import React from "react";

// Padrao visual das telas de Configuracoes Gerais (Usuarios, Acordos, Upload
// de Dados): cabecalho da tela, cartao de secao, campos e botoes. Mude aqui
// para mudar nas tres -- nao repita as classes em cada tela.

export const cfgCard =
  "bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5";

export const cfgInput =
  "w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text";

export const cfgLabel =
  "block text-xs font-bold text-gray-500 dark:text-dark-text-secondary mb-1";

export const cfgBtnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export const cfgBtnSecondary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text dark:hover:bg-dark-bg-tertiary";

/** Cabecalho da tela: titulo, descricao e acoes a direita. */
export const ConfigHeader: React.FC<{
  titulo: string;
  descricao?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ titulo, descricao, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
        {titulo}
      </h2>
      {descricao && (
        <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1 max-w-2xl">
          {descricao}
        </p>
      )}
    </div>
    {children && (
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {children}
      </div>
    )}
  </div>
);

/** Cartao de secao com titulo (icone + nome), descricao e acoes. */
export const ConfigSecao: React.FC<{
  icone: React.ElementType;
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}> = ({ icone: Icone, titulo, descricao, acoes, className = "", children }) => (
  <section className={`${cfgCard} space-y-4 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
          <Icone className="w-4 h-4 text-blue-500" />
          {titulo}
        </h3>
        {descricao && (
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary max-w-2xl">
            {descricao}
          </p>
        )}
      </div>
      {acoes}
    </div>
    {children}
  </section>
);
