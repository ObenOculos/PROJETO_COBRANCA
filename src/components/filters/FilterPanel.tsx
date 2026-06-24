import React from "react";
import {
  AlertCircle,
  MapPin,
  Building,
  Award,
  CalendarPlus,
  Users,
  DollarSign,
  Calendar,
} from "lucide-react";
import {
  FilterContext,
  FilterValues,
  FILTER_FIELDS,
  SITUACAO_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  SelectOption,
} from "../../filters/filterConfig";

interface FilterPanelOptions {
  cities?: string[];
  neighborhoods?: string[];
  stores?: string[];
  /** Cobradores selecionaveis (contexto de cobranca do gerente). */
  collectors?: SelectOption[];
}

interface FilterPanelProps {
  /** Contexto da pagina; define quais campos e regras valem (filterConfig). */
  context: FilterContext;
  values: FilterValues;
  /** Recebe apenas o campo alterado; a pagina mescla no seu estado. */
  onChange: (patch: Partial<FilterValues>) => void;
  onClear: () => void;
  /** Fecha o painel (botao "Fechar" no mobile). */
  onClose?: () => void;
  options?: FilterPanelOptions;
}

const labelClass =
  "text-[11px] font-semibold text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider flex items-center";
const selectClass =
  "w-full px-4 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all";
const dateClass =
  "w-full px-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-xl text-sm font-medium dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all";

const Field: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}> = ({ icon, label, children }) => (
  <div className="space-y-2">
    <label className={labelClass}>
      {icon}
      {label}
    </label>
    {children}
  </div>
);

/**
 * Painel de filtros avancados compartilhado. Renderiza o grid de campos de
 * acordo com o contexto da pagina (FILTER_FIELDS). A UI e unica; as diferencas
 * entre telas ficam na config, nao em codigo duplicado.
 */
const FilterPanel: React.FC<FilterPanelProps> = ({
  context,
  values,
  onChange,
  onClear,
  onClose,
  options = {},
}) => {
  const fields = FILTER_FIELDS[context];
  const {
    cities = [],
    neighborhoods = [],
    stores = [],
    collectors = [],
  } = options;

  const renderSelect = (
    field: keyof FilterValues,
    placeholder: string,
    items: SelectOption[],
    extra?: { disabled?: boolean },
  ) => (
    <select
      value={(values[field] as string) || ""}
      onChange={(e) => onChange({ [field]: e.target.value } as Partial<FilterValues>)}
      disabled={extra?.disabled}
      className={selectClass}
    >
      <option value="">{placeholder}</option>
      {items.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  const toOptions = (list: string[]): SelectOption[] =>
    list.map((v) => ({ value: v, label: v.toUpperCase() }));

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-5 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {fields.paymentStatus && (
          <Field icon={<AlertCircle className="h-3 w-3 mr-1.5" />} label="Status">
            {renderSelect("paymentStatus", "TODOS", PAYMENT_STATUS_OPTIONS)}
          </Field>
        )}

        {fields.assignment && (
          <Field
            icon={<AlertCircle className="h-3 w-3 mr-1.5" />}
            label="Status de Atribuição"
          >
            {renderSelect("assignment", "TODOS", [
              { value: "with_collector", label: "COM COBRADOR" },
              { value: "without_collector", label: "SEM COBRADOR" },
            ])}
          </Field>
        )}

        {fields.city && (
          <Field icon={<MapPin className="h-3 w-3 mr-1.5" />} label="Cidade">
            {renderSelect("city", "TODAS AS CIDADES", toOptions(cities))}
          </Field>
        )}

        {fields.neighborhood && (
          <Field icon={<MapPin className="h-3 w-3 mr-1.5" />} label="Bairro">
            {renderSelect(
              "neighborhood",
              "TODOS OS BAIRROS",
              toOptions(neighborhoods),
              { disabled: !values.city },
            )}
          </Field>
        )}

        {fields.store && (
          <Field icon={<Building className="h-3 w-3 mr-1.5" />} label="Loja">
            {renderSelect("store", "TODAS AS LOJAS", toOptions(stores))}
          </Field>
        )}

        {fields.situacao && (
          <Field icon={<Award className="h-3 w-3 mr-1.5" />} label="Situação">
            {renderSelect("situacao", "TODAS AS SITUAÇÕES", SITUACAO_OPTIONS)}
          </Field>
        )}

        {fields.collector && (
          <Field icon={<Users className="h-3 w-3 mr-1.5" />} label="Cobrador">
            {renderSelect("collector", "TODOS OS COBRADORES", collectors)}
          </Field>
        )}

        {fields.dueRange && (
          <Field
            icon={<CalendarPlus className="h-3 w-3 mr-1.5" />}
            label="Vencimento"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="Vencimento de"
                value={values.dueFrom || ""}
                onChange={(e) => onChange({ dueFrom: e.target.value })}
                className={dateClass}
              />
              <input
                type="date"
                aria-label="Vencimento até"
                value={values.dueTo || ""}
                onChange={(e) => onChange({ dueTo: e.target.value })}
                className={dateClass}
              />
            </div>
          </Field>
        )}

        {fields.launchRange && (
          <Field
            icon={<Calendar className="h-3 w-3 mr-1.5" />}
            label="Lançamento"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="Lançamento de"
                value={values.launchFrom || ""}
                onChange={(e) => onChange({ launchFrom: e.target.value })}
                className={dateClass}
              />
              <input
                type="date"
                aria-label="Lançamento até"
                value={values.launchTo || ""}
                onChange={(e) => onChange({ launchTo: e.target.value })}
                className={dateClass}
              />
            </div>
          </Field>
        )}

        {fields.amount && (
          <Field
            icon={<DollarSign className="h-3 w-3 mr-1.5" />}
            label="Valor"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                aria-label="Valor mínimo"
                placeholder="Mínimo"
                value={values.minAmount ?? ""}
                onChange={(e) =>
                  onChange({
                    minAmount: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
                className={dateClass}
              />
              <input
                type="number"
                aria-label="Valor máximo"
                placeholder="Máximo"
                value={values.maxAmount ?? ""}
                onChange={(e) =>
                  onChange({
                    maxAmount: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
                className={dateClass}
              />
            </div>
          </Field>
        )}

        {fields.visits && (
          <Field
            icon={<Calendar className="h-3 w-3 mr-1.5" />}
            label="Visitas"
          >
            <button
              type="button"
              onClick={() => onChange({ visitsOnly: !values.visitsOnly })}
              className={`w-full px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                values.visitsOnly
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-text border-gray-100 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
              }`}
            >
              {values.visitsOnly ? "✓ Apenas com visitas" : "Apenas com visitas"}
            </button>
          </Field>
        )}

        {fields.createdRange && (
          <Field
            icon={<CalendarPlus className="h-3 w-3 mr-1.5" />}
            label="Criado em"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="Criado de"
                value={values.createdFrom || ""}
                onChange={(e) => onChange({ createdFrom: e.target.value })}
                className={dateClass}
              />
              <input
                type="date"
                aria-label="Criado até"
                value={values.createdTo || ""}
                onChange={(e) => onChange({ createdTo: e.target.value })}
                className={dateClass}
              />
            </div>
          </Field>
        )}

        <div className="col-span-full pt-4 border-t border-gray-100 dark:border-dark-border flex justify-end gap-3">
          <button
            onClick={onClear}
            className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-dark-text transition-colors uppercase tracking-wider"
          >
            Limpar Filtros
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-900 dark:bg-blue-600 text-white text-xs font-semibold uppercase tracking-wider rounded-xl hover:opacity-90 shadow-md transition-all sm:hidden"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
