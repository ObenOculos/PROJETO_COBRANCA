import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface SummaryCardRow {
  label: string;
  value: string;
  tone?: "red" | "amber" | "green";
  /** Linha clicavel (ex.: aplica um filtro na lista). */
  onClick?: () => void;
  /** Dica ao passar o mouse na linha clicavel. */
  hint?: string;
  /** Busca em andamento -- pulsa o valor (ex.: "…") pra nao parecer parado
   * nem misturar com um valor final zerado. */
  loading?: boolean;
}

/** Card de resumo: uma pergunta (titulo), a resposta em destaque e o detalhe
 * em linhas "rotulo ..... valor". Mesmo visual no "Resumo por Cobrador" do
 * gestor e no "Meu desempenho" do cobrador. `children` entra entre a legenda
 * e as linhas (ex.: barra de progresso da meta). */
const SummaryCard: React.FC<{
  icon: React.ElementType;
  title: string;
  value: string;
  /** Busca do valor principal em andamento -- pulsa (mesmo papel do
   * `loading` das linhas). */
  valueLoading?: boolean;
  valueTone?: "neutral" | "red" | "green" | "blue";
  caption?: string;
  rows: SummaryCardRow[];
  children?: React.ReactNode;
  /** Conteudo ao lado do titulo/valor/legenda, em 2 colunas (sm+) -- cai
   * para embaixo em telas estreitas. Uso: informacao extra que merece ficar
   * ao lado em vez de empilhada (ex.: mini cards de faixa). `rows` continua
   * embaixo, ocupando a largura toda dos dois. */
  aside?: React.ReactNode;
  /** Versao mais baixa (painel do cobrador, acima da lista de trabalho). */
  compact?: boolean;
  /** Card clicavel (ex.: aplica um filtro na lista). */
  onClick?: () => void;
  /** Dica ao passar o mouse no card clicavel. */
  hint?: string;
  /** Card que esta filtrando a lista agora (borda de destaque). */
  selecionado?: boolean;
  /** Conteudo no canto superior direito, ao lado do titulo (ex.: navegador
   * de mes). Clique nele nao dispara o onClick do card. */
  headerRight?: React.ReactNode;
  /** Linhas escondidas atras de "ver detalhes" (abre dentro do card). Para
   * o gestor leigo: o card mostra so o numero e os alertas; o resto aparece
   * quando ele pede (reuniao 25/11, item 92). */
  detalhes?: SummaryCardRow[];
}> = ({
  icon: Icon,
  title,
  value,
  valueLoading = false,
  valueTone = "neutral",
  caption,
  rows,
  children,
  aside,
  compact = false,
  onClick,
  hint,
  selecionado = false,
  headerRight,
  detalhes = [],
}) => {
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  // Hierarquia visual (26/11, skill design-painel): o numero grande e o
  // ponto focal, em tinta neutra; "blue" era so identidade e virou neutro.
  // Vermelho/verde ficam porque dizem estado (ruim/bom).
  const valueClasses: Record<string, string> = {
    neutral: "text-gray-900 dark:text-dark-text",
    red: "text-red-600 dark:text-red-400",
    green: "text-green-700 dark:text-green-400",
    blue: "text-gray-900 dark:text-dark-text",
  };
  // Linha com alerta: so a cor do texto em negrito (26/11 -- o chip de
  // fundo em toda linha competia com o numero principal).
  const rowClasses: Record<string, string> = {
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    green: "text-green-700 dark:text-green-400",
  };
  const renderRow = (r: SummaryCardRow) => (
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
        className={`font-bold whitespace-nowrap ${r.loading ? "animate-pulse" : ""} ${r.tone ? rowClasses[r.tone] : "text-gray-900 dark:text-dark-text"}`}
      >
        {r.value}
      </span>
    </div>
  );
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
      className={`min-w-0 rounded-xl border ${selecionado ? "border-blue-400 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/10" : "border-gray-200 dark:border-dark-border bg-gray-100 dark:bg-dark-bg"} ${compact ? "px-3 py-2" : "px-4 py-3"} ${onClick ? "cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:hover:border-blue-800 dark:hover:bg-blue-900/10" : ""}`}
    >
      <div className={aside ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : undefined}>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-dark-text-secondary min-w-0">
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{title}</span>
            </div>
            {headerRight && (
              <div
                className="flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {headerRight}
              </div>
            )}
          </div>
          <div
            className={`${compact ? "mt-0.5 text-xl" : "mt-1 text-3xl"} font-extrabold tracking-tight truncate ${valueLoading ? "animate-pulse" : ""} ${valueClasses[valueTone]}`}
          >
            {value}
          </div>
          {caption && (
            <div className="text-xs text-gray-500 dark:text-dark-text-secondary truncate">
              {caption}
            </div>
          )}
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>
      {children}
      {rows.length > 0 && (
        <div
          className={`border-t border-gray-200 dark:border-dark-border/60 ${compact ? "mt-1.5 pt-1.5 space-y-0.5" : "mt-2 pt-2 space-y-1"}`}
        >
          {rows.map(renderRow)}
        </div>
      )}
      {detalhes.length > 0 && (
        <div className={compact ? "mt-1" : "mt-1.5"}>
          {detalhesAbertos && (
            <div className="mb-1 space-y-1 border-t border-dashed border-gray-300 dark:border-dark-border/60 pt-1.5">
              {detalhes.map(renderRow)}
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetalhesAbertos((v) => !v);
            }}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:text-dark-text-secondary dark:hover:text-dark-text"
          >
            {detalhesAbertos ? "menos detalhes" : "ver detalhes"}
            {detalhesAbertos ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default SummaryCard;
