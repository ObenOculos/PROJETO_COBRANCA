import React from "react";

// Paginacao compacta (← 1 … 4 5 6 … 20 →). Some quando cabe em uma pagina.
// Com `perPageOptions` + `onPerPageChange`, mostra tambem "Por pagina"
// (e so some quando cabe na menor opcao).
const Pagination: React.FC<{
  page: number;
  total: number;
  perPage: number;
  onChange: (p: number) => void;
  perPageOptions?: number[];
  onPerPageChange?: (n: number) => void;
  className?: string;
}> = ({
  page,
  total,
  perPage,
  onChange,
  perPageOptions,
  onPerPageChange,
  className = "mt-4 pt-3 border-t border-gray-100 dark:border-dark-border",
}) => {
  const totalPages = Math.ceil(total / perPage);
  const withPerPage = !!(perPageOptions?.length && onPerPageChange);
  const minOption = withPerPage ? Math.min(...perPageOptions!) : perPage;
  if (withPerPage ? total <= minOption : totalPages <= 1) return null;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-gray-400 tracking-wide">
          {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de{" "}
          {total}
        </span>
        {withPerPage && (
          <label className="flex items-center gap-1 text-[10px] font-bold text-gray-400 tracking-wide">
            Por página
            <select
              value={perPage}
              onChange={(e) => onPerPageChange!(Number(e.target.value))}
              className="px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-[11px] text-gray-600 dark:text-dark-text"
            >
              {perPageOptions!.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-[10px] font-bold tracking-wide rounded-lg border border-gray-100 dark:border-dark-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-bg transition-all"
        >
          ←
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | "…")[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "…" ? (
              <span
                key={`ellipsis-${i}`}
                className="px-2 text-[10px] text-gray-300"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p as number)}
                className={`w-7 h-7 text-[10px] font-bold rounded-lg transition-all ${
                  page === p
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-bg"
                }`}
              >
                {p}
              </button>
            ),
          )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-[10px] font-bold tracking-wide rounded-lg border border-gray-100 dark:border-dark-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-bg transition-all"
        >
          →
        </button>
      </div>
    </div>
  );
};

export default Pagination;
