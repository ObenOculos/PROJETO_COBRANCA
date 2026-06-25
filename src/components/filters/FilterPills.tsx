import React from "react";
import {
  PAYMENT_STATUS_PILLS,
  AGING_PILLS,
} from "../../filters/filterConfig";

/** Patch emitido pelas pills. Campos podem ser unicos ou lista (multi). */
export interface PillPatch {
  paymentStatus?: string | string[];
  aging?: string | string[];
}

interface FilterPillsProps {
  /** Status de pagamento selecionado(s): string (single) ou string[] (multi). */
  paymentStatus?: string | string[];
  /** Faixa(s) de atraso selecionada(s): string (single) ou string[] (multi). */
  aging?: string | string[];
  /** Recebe apenas o campo alterado; a pagina mescla no seu estado. */
  onChange: (patch: PillPatch) => void;
  /** Mostra os atalhos de status de pagamento (Pendente/Pago/Parcial/Cancelado). */
  showPaymentStatus?: boolean;
  /** Valores de status a ocultar (ex.: "cancelado" na Atribuicao). */
  excludePaymentStatus?: string[];
  /** Mostra os atalhos de faixa de atraso (+30/+60/+90/+120 dias). */
  showAging?: boolean;
  /** Permite selecionar varios status de pagamento simultaneamente. */
  multiPaymentStatus?: boolean;
  /** Permite selecionar varias faixas de atraso (viram um intervalo contiguo). */
  multiAging?: boolean;
}

const inactiveClass =
  "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary";

/**
 * Atalhos rapidos de filtro (pills), compartilhados entre Cobranca e
 * Atribuicao. O grupo de faixa de atraso e sempre single-select. O grupo de
 * status de pagamento e single por padrao; com `multiPaymentStatus` permite
 * marcar varios ao mesmo tempo (casa com qualquer um dos selecionados).
 */
const FilterPills: React.FC<FilterPillsProps> = ({
  paymentStatus,
  aging,
  onChange,
  showPaymentStatus = true,
  excludePaymentStatus = [],
  showAging = false,
  multiPaymentStatus = false,
  multiAging = false,
}) => {
  const selectedPayments = Array.isArray(paymentStatus)
    ? paymentStatus
    : paymentStatus
    ? [paymentStatus]
    : [];

  const selectedAgings = Array.isArray(aging) ? aging : aging ? [aging] : [];

  const togglePayment = (value: string) => {
    if (multiPaymentStatus) {
      const next = selectedPayments.includes(value)
        ? selectedPayments.filter((s) => s !== value)
        : [...selectedPayments, value];
      onChange({ paymentStatus: next });
    } else {
      onChange({
        paymentStatus: selectedPayments.includes(value) ? undefined : value,
      });
    }
  };

  const toggleAging = (value: string) => {
    if (multiAging) {
      const next = selectedAgings.includes(value)
        ? selectedAgings.filter((s) => s !== value)
        : [...selectedAgings, value];
      onChange({ aging: next });
    } else {
      onChange({ aging: selectedAgings.includes(value) ? undefined : value });
    }
  };

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
            onClick={() => togglePayment(pill.value)}
            className={pillClass(
              selectedPayments.includes(pill.value),
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
            onClick={() => toggleAging(pill.value)}
            className={pillClass(selectedAgings.includes(pill.value), pill.active)}
          >
            {pill.label}
          </button>
        ))}
    </div>
  );
};

export default FilterPills;
