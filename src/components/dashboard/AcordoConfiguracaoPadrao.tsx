import React, { useEffect, useState } from "react";
import { Save, Percent, Building2, CheckCircle2 } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";

// Tela do gestor (Etapa 3a da iniciativa "Termo de Acordo automatico", ver
// docs/PROGRESSO.md pendencia 12): define o padrao de multa/juros/desconto
// e os dados da empresa usados como ponto de partida ao negociar um acordo
// novo (AcordoModal) e impressos no Termo de Acordo. O cobrador continua
// podendo ajustar os valores na negociacao -- isto so define o valor
// inicial que ele ve.
const AcordoConfiguracaoPadrao: React.FC = () => {
  const { acordoConfiguracaoPadrao, definirConfiguracaoPadraoAcordo } =
    useCollection();

  const [multaPercentual, setMultaPercentual] = useState("0");
  const [jurosPercentualAm, setJurosPercentualAm] = useState("0");
  const [descontoPadraoPercentual, setDescontoPadraoPercentual] = useState("0");
  const [descontoMaximoPercentual, setDescontoMaximoPercentual] = useState("0");
  const [diasEntreParcelas, setDiasEntreParcelas] = useState("30");
  const [empresaNome, setEmpresaNome] = useState("");
  const [empresaCnpj, setEmpresaCnpj] = useState("");
  const [empresaEndereco, setEmpresaEndereco] = useState("");
  const [empresaChavePix, setEmpresaChavePix] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Preenche o formulario com a configuracao vigente assim que ela carrega
  // (ou quando outra aba/sessao salva uma nova enquanto esta tela esta
  // aberta) -- nunca sobrescreve o que o gestor esta digitando.
  useEffect(() => {
    if (!acordoConfiguracaoPadrao) return;
    setMultaPercentual(String(acordoConfiguracaoPadrao.multaPercentual));
    setJurosPercentualAm(String(acordoConfiguracaoPadrao.jurosPercentualAm));
    setDescontoPadraoPercentual(
      String(acordoConfiguracaoPadrao.descontoPadraoPercentual),
    );
    setDescontoMaximoPercentual(
      String(acordoConfiguracaoPadrao.descontoMaximoPercentual),
    );
    setDiasEntreParcelas(String(acordoConfiguracaoPadrao.diasEntreParcelas));
    setEmpresaNome(acordoConfiguracaoPadrao.empresaNome ?? "");
    setEmpresaCnpj(acordoConfiguracaoPadrao.empresaCnpj ?? "");
    setEmpresaEndereco(acordoConfiguracaoPadrao.empresaEndereco ?? "");
    setEmpresaChavePix(acordoConfiguracaoPadrao.empresaChavePix ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acordoConfiguracaoPadrao?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const multa = Number(multaPercentual);
    const juros = Number(jurosPercentualAm);
    const descontoPadrao = Number(descontoPadraoPercentual);
    const descontoMaximo = Number(descontoMaximoPercentual);
    const dias = Number(diasEntreParcelas);

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
        empresaNome: empresaNome.trim(),
        empresaCnpj: empresaCnpj.trim(),
        empresaEndereco: empresaEndereco.trim(),
        empresaChavePix: empresaChavePix.trim(),
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
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
          Configuração padrão de acordo
        </h2>
        <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
          Valores usados como ponto de partida quando um cobrador monta um
          acordo novo — ele ainda pode ajustar multa, juros e desconto na
          hora da negociação. Também é o que aparece no Termo de Acordo
          gerado.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
            {error}
          </div>
        )}

        <section className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
            <Percent className="w-4 h-4 text-indigo-500" />
            Multa, juros e desconto
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">
                Multa (%)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={multaPercentual}
                onChange={(e) => setMultaPercentual(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Aplicada uma vez sobre o saldo de cada título.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">
                Juros (% ao mês)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={jurosPercentualAm}
                onChange={(e) => setJurosPercentualAm(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Simples, proporcional aos dias de atraso de cada título.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">
                Desconto padrão (%)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={descontoPadraoPercentual}
                onChange={(e) => setDescontoPadraoPercentual(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Valor inicial do campo de desconto no acordo (0% = sem
                desconto por padrão).
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">
                Desconto máximo (%)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={descontoMaximoPercentual}
                onChange={(e) => setDescontoMaximoPercentual(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Limite que o cobrador pode conceder sem precisar de você.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-dark-text">
            Parcelamento
          </h3>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">
              Dias entre parcelas
            </label>
            <input
              type="number"
              min={1}
              step="1"
              value={diasEntreParcelas}
              onChange={(e) => setDiasEntreParcelas(e.target.value)}
              className="w-full max-w-[12rem] px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Usado para sugerir as datas de vencimento das parcelas. Não há
              limite para o número de parcelas.
            </p>
          </div>
        </section>

        <section className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
            <Building2 className="w-4 h-4 text-indigo-500" />
            Dados da empresa (Termo de Acordo)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-400 mb-1">
                Nome da empresa
              </label>
              <input
                type="text"
                value={empresaNome}
                onChange={(e) => setEmpresaNome(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">
                CNPJ
              </label>
              <input
                type="text"
                value={empresaCnpj}
                onChange={(e) => setEmpresaCnpj(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">
                Chave Pix (entrada do acordo)
              </label>
              <input
                type="text"
                value={empresaChavePix}
                onChange={(e) => setEmpresaChavePix(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-400 mb-1">
                Endereço
              </label>
              <input
                type="text"
                value={empresaEndereco}
                onChange={(e) => setEmpresaEndereco(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
              />
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvar configuração
          </button>
          {savedAt && !loading && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Salvo
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

export default AcordoConfiguracaoPadrao;
