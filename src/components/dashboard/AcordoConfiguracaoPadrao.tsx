import React, { useEffect, useMemo, useState } from "react";
import { Save, Percent, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import MarcasLojasConfig from "./MarcasLojasConfig";
import type { AcordoConfiguracaoPadrao as Config } from "../../types";

// Tela do gestor (Etapa 3a da iniciativa "Termo de Acordo automatico", ver
// docs/PROGRESSO.md pendencia 12): define o padrao de multa/juros/desconto
// e os dados da empresa usados como ponto de partida ao negociar um acordo
// novo (AcordoModal) e impressos no Termo de Acordo. O cobrador continua
// podendo ajustar os valores na negociacao -- isto so define o valor
// inicial que ele ve. Credor por marca/loja (item 91) em MarcasLojasConfig.

interface Form {
  multaPercentual: string;
  jurosPercentualAm: string;
  descontoPadraoPercentual: string;
  descontoMaximoPercentual: string;
  diasEntreParcelas: string;
  empresaNome: string;
  empresaCnpj: string;
  empresaEndereco: string;
  empresaChavePix: string;
}

const formDe = (c: Config | null): Form => ({
  multaPercentual: String(c?.multaPercentual ?? 0),
  jurosPercentualAm: String(c?.jurosPercentualAm ?? 0),
  descontoPadraoPercentual: String(c?.descontoPadraoPercentual ?? 0),
  descontoMaximoPercentual: String(c?.descontoMaximoPercentual ?? 0),
  diasEntreParcelas: String(c?.diasEntreParcelas ?? 30),
  empresaNome: c?.empresaNome ?? "",
  empresaCnpj: c?.empresaCnpj ?? "",
  empresaEndereco: c?.empresaEndereco ?? "",
  empresaChavePix: c?.empresaChavePix ?? "",
});

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text";

const cardCls =
  "bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5";

/** Campo numerico com unidade a direita ("%", "% a.m.", "dias"). */
const CampoNumero: React.FC<{
  label: string;
  unidade: string;
  dica: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: number;
}> = ({ label, unidade, dica, value, onChange, step = "0.01", min = 0 }) => (
  <div>
    <label className="block text-xs font-bold text-gray-500 dark:text-dark-text-secondary mb-1">
      {label}
    </label>
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} pr-14`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
        {unidade}
      </span>
    </div>
    <p className="mt-1 text-[11px] leading-snug text-gray-400">{dica}</p>
  </div>
);

const CampoTexto: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}> = ({ label, value, onChange, className = "", placeholder }) => (
  <div className={className}>
    <label className="block text-xs font-bold text-gray-500 dark:text-dark-text-secondary mb-1">
      {label}
    </label>
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  </div>
);

const AcordoConfiguracaoPadrao: React.FC = () => {
  const { acordoConfiguracaoPadrao, definirConfiguracaoPadraoAcordo } =
    useCollection();

  const [form, setForm] = useState<Form>(() => formDe(acordoConfiguracaoPadrao));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Preenche com a configuracao vigente quando ela carrega ou quando outra
  // sessao salva uma nova (troca de id).
  useEffect(() => {
    if (!acordoConfiguracaoPadrao) return;
    setForm(formDe(acordoConfiguracaoPadrao));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acordoConfiguracaoPadrao?.id]);

  const original = useMemo(
    () => formDe(acordoConfiguracaoPadrao),
    [acordoConfiguracaoPadrao],
  );
  const alterado = (Object.keys(form) as (keyof Form)[]).some(
    (k) => form[k].trim() !== original[k].trim(),
  );

  const set = (campo: keyof Form) => (v: string) => {
    setSavedAt(null);
    setForm((f) => ({ ...f, [campo]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const multa = Number(form.multaPercentual);
    const juros = Number(form.jurosPercentualAm);
    const descontoPadrao = Number(form.descontoPadraoPercentual);
    const descontoMaximo = Number(form.descontoMaximoPercentual);
    const dias = Number(form.diasEntreParcelas);

    if ([multa, juros, descontoPadrao, descontoMaximo].some((v) => Number.isNaN(v) || v < 0)) {
      setError("Multa, juros e desconto precisam ser números 0 ou maiores.");
      return;
    }
    if (descontoMaximo < descontoPadrao) {
      setError("O desconto máximo não pode ser menor que o desconto padrão.");
      return;
    }
    if (!Number.isInteger(dias) || dias <= 0) {
      setError("Dias entre parcelas precisa ser um número inteiro maior que 0.");
      return;
    }

    setLoading(true);
    try {
      await definirConfiguracaoPadraoAcordo({
        multaPercentual: multa,
        jurosPercentualAm: juros,
        descontoPadraoPercentual: descontoPadrao,
        descontoMaximoPercentual: descontoMaximo,
        diasEntreParcelas: dias,
        empresaNome: form.empresaNome.trim(),
        empresaCnpj: form.empresaCnpj.trim(),
        empresaEndereco: form.empresaEndereco.trim(),
        empresaChavePix: form.empresaChavePix.trim(),
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar configuração padrão de acordo",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              Configuração de acordos
            </h2>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1 max-w-2xl">
              Ponto de partida do acordo novo — o cobrador ainda pode ajustar
              multa, juros e desconto na negociação.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {alterado && !loading && (
              <span className="text-xs font-medium text-amber-600">
                Alterações não salvas
              </span>
            )}
            {!alterado && savedAt && !loading && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Salvo
              </span>
            )}
            <button
              type="submit"
              disabled={loading || !alterado}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className={`${cardCls} space-y-4`}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
              <Percent className="w-4 h-4 text-indigo-500" />
              Regras do acordo
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <CampoNumero
                label="Multa"
                unidade="%"
                dica="Uma vez sobre o saldo de cada título."
                value={form.multaPercentual}
                onChange={set("multaPercentual")}
              />
              <CampoNumero
                label="Juros"
                unidade="% a.m."
                dica="Simples, pelos dias de atraso."
                value={form.jurosPercentualAm}
                onChange={set("jurosPercentualAm")}
              />
              <CampoNumero
                label="Desconto padrão"
                unidade="%"
                dica="Já vem preenchido no acordo."
                value={form.descontoPadraoPercentual}
                onChange={set("descontoPadraoPercentual")}
              />
              <CampoNumero
                label="Desconto máximo"
                unidade="%"
                dica="Acima disso o cobrador pede liberação."
                value={form.descontoMaximoPercentual}
                onChange={set("descontoMaximoPercentual")}
              />
              <CampoNumero
                label="Dias entre parcelas"
                unidade="dias"
                dica="Sugere as datas; sem limite de parcelas."
                step="1"
                min={1}
                value={form.diasEntreParcelas}
                onChange={set("diasEntreParcelas")}
              />
            </div>
          </section>

          <section className={`${cardCls} space-y-4`}>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
                <Building2 className="w-4 h-4 text-indigo-500" />
                Empresa padrão
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
                Credor, Pix e logo das lojas sem marca ou de marca sem dados.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <CampoTexto
                label="Nome da empresa"
                className="col-span-2"
                value={form.empresaNome}
                onChange={set("empresaNome")}
              />
              <CampoTexto
                label="CNPJ"
                value={form.empresaCnpj}
                onChange={set("empresaCnpj")}
              />
              <CampoTexto
                label="Chave Pix"
                value={form.empresaChavePix}
                onChange={set("empresaChavePix")}
              />
              <CampoTexto
                label="Endereço"
                className="col-span-2"
                value={form.empresaEndereco}
                onChange={set("empresaEndereco")}
              />
            </div>
          </section>
        </div>
      </form>

      <MarcasLojasConfig />
    </div>
  );
};

export default AcordoConfiguracaoPadrao;
