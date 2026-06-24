import React from "react";
import {
  FilterValues,
  PAYMENT_STATUS_PILLS,
  AGING_PILLS,
} from "../../filters/filterConfig";

interface FilterPillsProps {
  values: Pick<FilterValues, "paymentStatus" | "aging">;
  /** Recebe apenas o campo alterado; a pagina mescla no seu estado. */
  onChange: (patch: Partial<FilterValues>) => void;
  /** Mostra os atalhos de status de pagamento (Pendente/Pago/Parcial/Cancelado). */
  showPaymentStatus?: boolean;
  /** Valores de status a ocultar (ex.: "cancelado" na Atribuicao). */
  excludePaymentStatus?: string[];
  /** Mostra os atalhos de faixa de atraso (+30/+60/+90/+120 dias). */
  showAging?: boolean;
}

const inactiveClass =
  "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary";

/**
 * Atalhos rapidos de filtro (pills), compartilhados entre Cobranca e
 * Atribuicao. Cada grupo (status de pagamento, faixa de atraso) e single-select:
 * clicar de novo no ativo limpa o filtro.
 */
const FilterPills: React.FC<FilterPillsProps> = ({
  values,
  onChange,
  showPaymentStatus = true,
  excludePaymentStatus = [],
  showAging = false,
}) => {
  const toggle = (field: "paymentStatus" | "aging", value: string) =>
    onChange({ [field]: values[field] === value ? undefined : value });

  const paymentPills = PAYMENT_STATUS_PILLS.filter(
    (pill) => !excludePaymentStatus.includes(pill.value),
  );

  const pillClass = (isActive: boolean, active: string) =>
    `px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
      isActive ? active : inactiveClass
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showPaymentStatus &&
        paymentPills.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => toggle("paymentStatus", pill.value)}
            className={pillClass(
              values.paymentStatus === pill.value,
              pill.active,
            )}
          >
            {pill.label}
          </button>
        ))}

      {showPaymentStatus && showAging && (
        <span className="w-px h-5 bg-gray-200 dark:bg-dark-border mx-1 hidden sm:block" />
      )}

      {showAging &&
        AGING_PILLS.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => toggle("aging", pill.value)}
            className={pillClass(values.aging === pill.value, pill.active)}
          >
            {pill.label}
          </button>
        ))}
    </div>
  );
};

export default FilterPills;
