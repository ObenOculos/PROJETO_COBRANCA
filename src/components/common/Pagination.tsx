import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Paginacao padrao do projeto (24/11). Some quando cabe em uma pagina.
// - Celular: [‹]  Pagina X de Y  [›] e, embaixo, os totais numa linha.
// - Computador: totais + "Pagina X de Y" a esquerda; ‹ 1 … 4 5 6 … 20 › a
//   direita.
// Tocar em "Pagina X de Y" abre um campo para ir direto a uma pagina.
// Com `perPageOptions` + `onPerPageChange`, mostra tambem "Por pagina"
// (e so some quando cabe na menor opcao). `totais` troca o texto padrao
// ("1–10 de 634") por um proprio (ex.: "634 clientes · 1.914 vendas").

const fmt = (n: number) => n.toLocaleString("pt-BR");

const botaoSeta =
  "flex items-center justify-center rounded-xl border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

const Pagination: React.FC<{
  page: number;
  total: number;
  perPage: number;
  onChange: (p: number) => void;
  perPageOptions?: number[];
  onPerPageChange?: (n: number) => void;
  totais?: React.ReactNode;
  className?: string;
}> = ({
  page,
  total,
  perPage,
  onChange,
  perPageOptions,
  onPerPageChange,
  totais,
  className = "mt-4 pt-3 border-t border-gray-100 dark:border-dark-border",
}) => {
  const [irPara, setIrPara] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const withPerPage = !!(perPageOptions?.length && onPerPageChange);
  const minOption = withPerPage ? Math.min(...perPageOptions!) : perPage;
  if (withPerPage ? total <= minOption : totalPages <= 1) return null;

  const ir = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)));
  const confirmar = () => {
    const n = Number(irPara);
    if (Number.isFinite(n) && n >= 1) ir(Math.floor(n));
    setIrPara(null);
  };

  const paginas: (number | "…")[] = [];
  Array.from(
    new Set(
      [1, totalPages, page - 1, page, page + 1].filter(
        (n) => n >= 1 && n <= totalPages,
      ),
    ),
  )
    .sort((a, b) => a - b)
    .forEach((n, i, arr) => {
      if (i > 0 && n - arr[i - 1] > 1) paginas.push("…");
      paginas.push(n);
    });

  const textoTotais = totais ?? (
    <>
      {fmt((page - 1) * perPage + 1)}–{fmt(Math.min(page * perPage, total))}{" "}
      de {fmt(total)}
    </>
  );

  const porPagina = withPerPage && (
    <label className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-dark-text-secondary">
      Por página
      <select
        value={perPage}
        onChange={(e) => onPerPageChange!(Number(e.target.value))}
        className="px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text"
      >
        {perPageOptions!.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );

  const rotuloPagina =
    totalPages <= 1 ? null : irPara !== null ? (
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={totalPages}
        autoFocus
        value={irPara}
        onChange={(e) => setIrPara(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirmar();
          if (e.key === "Escape") setIrPara(null);
        }}
        className="w-20 px-2 py-1 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-sm text-center tabular-nums"
        aria-label={`Ir para a página (1 a ${totalPages})`}
      />
    ) : (
      <button
        type="button"
        onClick={() => setIrPara(String(page))}
        className="text-sm text-gray-700 dark:text-dark-text tabular-nums hover:text-blue-600"
        title="Ir para uma página"
      >
        Página <strong>{fmt(page)}</strong> de {fmt(totalPages)}
      </button>
    );

  return (
    <div className={className}>
      {/* Celular */}
      <div className="sm:hidden">
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => ir(page - 1)}
              disabled={page === 1}
              className={`${botaoSeta} w-11 h-11`}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {rotuloPagina}
            <button
              type="button"
              onClick={() => ir(page + 1)}
              disabled={page >= totalPages}
              className={`${botaoSeta} w-11 h-11`}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-400 dark:text-dark-text-secondary">
          <span>{textoTotais}</span>
          {porPagina}
        </div>
      </div>

      {/* Computador */}
      <div className="hidden sm:flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-gray-500 dark:text-dark-text-secondary">
          <span>{textoTotais}</span>
          {rotuloPagina && (
            <>
              <span className="text-gray-300">·</span>
              {rotuloPagina}
            </>
          )}
          {porPagina && <span className="ml-2">{porPagina}</span>}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => ir(page - 1)}
              disabled={page === 1}
              className={`${botaoSeta} w-9 h-9`}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {paginas.map((p, i) =>
              p === "…" ? (
                <span
                  key={`r${i}`}
                  className="w-6 text-center text-sm text-gray-400"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => ir(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={`min-w-[2.25rem] h-9 px-2 rounded-xl text-sm font-medium tabular-nums transition-colors ${
                    p === page
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                  }`}
                >
                  {fmt(p)}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => ir(page + 1)}
              disabled={page >= totalPages}
              className={`${botaoSeta} w-9 h-9`}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;
