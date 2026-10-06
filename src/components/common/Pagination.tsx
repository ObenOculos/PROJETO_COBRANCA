import React from "react";

// Paginacao compacta (← 1 … 4 5 6 … 20 →). Some quando cabe em uma pagina.
const Pagination: React.FC<{
  page: number;
  total: number;
  perPage: number;
  onChange: (p: number) => void;
}> = ({ page, total, perPage, onChange }) => {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-dark-border">
      <span className="text-[10px] font-bold text-gray-400 tracking-wide">
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
      </span>
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
          disabled={page === totalPages}
          className="px-3 py-1.5 text-[10px] font-bold tracking-wide rounded-lg border border-gray-100 dark:border-dark-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-bg transition-all"
        >
          →
        </button>
      </div>
    </div>
  );
};

export default Pagination;
