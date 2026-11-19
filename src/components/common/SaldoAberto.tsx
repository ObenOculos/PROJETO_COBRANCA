import { AlertCircle, Clock } from "lucide-react";
import { ClientBalanceSplit } from "../../filters/clientStatus";
import { formatCurrency } from "../../utils/formatters";

/**
 * Saldo em aberto SEMPRE separado em Vencido x A vencer (padrao do projeto,
 * item 34 / 2026-11-19): um "Em aberto"/"Falta"/"Pendente" unico em vermelho
 * faz parecer atrasado o que ainda vai vencer. A conta vem de
 * clientBalanceSplit / collectionsBalanceSplit (filters/clientStatus), que ja
 * trata acordo ativo e parcela quitada/cancelada.
 *
 * - "chips": selos lado a lado (Carteira, listas de cliente).
 * - "linhas": uma linha por valor, alinhado a direita (mapa, cabecalhos).
 * Sem nada em aberto, nao renderiza.
 */
export function SaldoAberto({
  saldo,
  variante = "chips",
}: {
  saldo: ClientBalanceSplit;
  variante?: "chips" | "linhas";
}) {
  const vencido = saldo.vencido > 0.01;
  const aVencer = saldo.aVencer > 0.01;
  if (!vencido && !aVencer) return null;

  if (variante === "linhas") {
    return (
      <>
        {vencido && (
          <div className="text-sm font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
            {formatCurrency(saldo.vencido)}{" "}
            <span className="text-xs font-normal">vencido</span>
          </div>
        )}
        {aVencer && (
          <div className="text-xs text-gray-500 dark:text-dark-text-secondary whitespace-nowrap">
            {formatCurrency(saldo.aVencer)} a vencer
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {vencido && (
        <span
          title="Vencido: parcelas com vencimento passado"
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 border border-red-200/20"
        >
          <AlertCircle className="h-3 w-3 mr-1.5" />
          Vencido {formatCurrency(saldo.vencido)}
        </span>
      )}
      {aVencer && (
        <span
          title="A vencer: parcelas dentro do prazo"
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text-secondary border border-gray-200/60 dark:border-dark-border"
        >
          <Clock className="h-3 w-3 mr-1.5" />
          A vencer {formatCurrency(saldo.aVencer)}
        </span>
      )}
    </>
  );
}
