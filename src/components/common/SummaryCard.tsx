import React from "react";

export interface SummaryCardRow {
  label: string;
  value: string;
  tone?: "red" | "amber" | "green";
  /** Linha clicavel (ex.: aplica um filtro na lista). */
  onClick?: () => void;
  /** Dica ao passar o mouse na linha clicavel. */
  hint?: string;
}

/** Card de resumo: uma pergunta (titulo), a resposta em destaque e o detalhe
 * em linhas "rotulo ..... valor". Mesmo visual no "Resumo por Cobrador" do
 * gestor e no "Meu desempenho" do cobrador. `children` entra entre a legenda
 * e as linhas (ex.: barra de progresso da meta). */
const SummaryCard: React.FC<{
  icon: React.ElementType;
  title: string;
  value: string;
  valueTone?: "neutral" | "red" | "green" | "blue";
  caption?: string;
  rows: SummaryCardRow[];
  children?: React.ReactNode;
  /** Versao mais baixa (painel do cobrador, acima da lista de trabalho). */
  compact?: boolean;
  /** Card clicavel (ex.: aplica um filtro na lista). */
  onClick?: () => void;
  /** Dica ao passar o mouse no card clicavel. */
  hint?: string;
}> = ({
  icon: Icon,
  title,
  value,
  valueTone = "neutral",
  caption,
  rows,
  children,
  compact = false,
  onClick,
  hint,
}) => {
  const valueClasses: Record<string, string> = {
    neutral: "text-gray-900 dark:text-dark-text",
    red: "text-red-600 dark:text-red-400",
    green: "text-green-600 dark:text-green-400",
    blue: "text-blue-600 dark:text-blue-400",
  };
  const rowClasses: Record<string, string> = {
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    green: "text-green-600 dark:text-green-400",
  };
  return (
    <div
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={hint}
      className={`min-w-0 rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 ${compact ? "px-3 py-2" : "px-4 py-3"} ${onClick ? "cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:hover:border-blue-800 dark:hover:bg-blue-900/10" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{title}</span>
      </div>
      <div
        className={`${compact ? "mt-0.5 text-xl" : "mt-1 text-2xl"} font-bold truncate ${valueClasses[valueTone]}`}
      >
        {value}
      </div>
      {caption && (
        <div className="text-[11px] text-gray-400 dark:text-dark-text-secondary truncate">
          {caption}
        </div>
      )}
      {children}
      {rows.length > 0 && (
        <div
          className={`border-t border-gray-100 dark:border-dark-border/40 ${compact ? "mt-1.5 pt-1.5 space-y-0.5" : "mt-2 pt-2 space-y-1"}`}
        >
          {rows.map((r) => (
            <div
              key={r.label}
              onClick={
                r.onClick
                  ? (e) => {
                      // Nao dispara tambem o clique do card.
                      e.stopPropagation();
                      r.onClick?.();
                    }
                  : undefined
              }
              title={r.hint}
              className={`flex items-baseline justify-between gap-2 text-xs ${r.onClick ? "cursor-pointer rounded -mx-1 px-1 hover:bg-blue-100/60 dark:hover:bg-blue-900/20" : ""}`}
            >
              <span
                className={`text-gray-500 dark:text-dark-text-secondary truncate ${r.onClick ? "underline decoration-dotted underline-offset-2" : ""}`}
              >
                {r.label}
              </span>
              <span
                className={`font-semibold whitespace-nowrap ${r.tone ? rowClasses[r.tone] : "text-gray-700 dark:text-dark-text"}`}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SummaryCard;
