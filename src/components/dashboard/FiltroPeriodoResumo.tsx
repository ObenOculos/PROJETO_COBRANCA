import React, { useEffect, useRef, useState } from "react";
import { PERIODO_PRESETS, dicaDoPreset } from "../../filters/periodo";
import { PeriodoResumo } from "../../hooks/usePeriodoResumo";

const CLASSE_DATA =
  "px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text";

/** Data completa e plausivel. Ao digitar o ano, o campo passa por "0002",
 * "0020", "0202" antes de "2026": nenhum desses vira periodo. */
const dataValida = (v: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "2000-01-01" && v <= "2100-12-31";

/** Espera depois da ultima tecla antes de aplicar a data. */
const ESPERA_MS = 500;

/**
 * Campo de data que so aplica o periodo com a data pronta (26/11: digitar
 * travava -- cada tecla virava um periodo novo e o Resumo refazia todas as
 * contas da base e as consultas ao banco). Aplica meio segundo depois da
 * ultima tecla, ou na hora ao sair do campo ou apertar Enter. Data
 * incompleta ou invalida volta ao valor atual ao sair.
 */
const CampoData: React.FC<{
  rotulo: string;
  valor: string;
  min?: string;
  onAplicar: (v: string) => void;
}> = ({ rotulo, valor, min, onAplicar }) => {
  const [rascunho, setRascunho] = useState(valor);
  const editando = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O periodo mudou por fora (atalho, outra aba): mostra o valor novo, a
  // nao ser que a pessoa esteja digitando neste campo.
  useEffect(() => {
    if (!editando.current) setRascunho(valor);
  }, [valor]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const aplicar = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (dataValida(v) && v !== valor) onAplicar(v);
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-text-secondary">
      {rotulo}
      <input
        type="date"
        value={rascunho}
        min={min}
        onFocus={() => {
          editando.current = true;
        }}
        onChange={(e) => {
          const v = e.target.value;
          setRascunho(v);
          if (timer.current) clearTimeout(timer.current);
          if (dataValida(v)) {
            timer.current = setTimeout(() => aplicar(v), ESPERA_MS);
          }
        }}
        onBlur={() => {
          editando.current = false;
          if (dataValida(rascunho)) aplicar(rascunho);
          else setRascunho(valor);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") aplicar(rascunho);
        }}
        className={CLASSE_DATA}
      />
    </label>
  );
};

/** Atalhos + De/Ate do Resumo Geral, iguais em todas as abas (26/11). */
const FiltroPeriodoResumo: React.FC<{
  periodo: PeriodoResumo;
  today: string;
}> = ({ periodo, today }) => (
  <div className="flex flex-wrap items-center gap-2">
    {PERIODO_PRESETS.map((preset) => (
      <button
        key={preset.key}
        onClick={() => periodo.aplicarPreset(preset.key)}
        title={dicaDoPreset(preset.key, today)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors touch-manipulation ${
          periodo.preset === preset.key
            ? "bg-blue-600 text-white"
            : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
        }`}
      >
        {preset.label}
      </button>
    ))}

    {/* Datas na mesma linha dos atalhos (25/11: o rotulo "Periodo
        personalizado" e o texto "(de ... ate ...)" repetiam as datas). */}
    <span className="hidden sm:block h-5 w-px bg-gray-200 dark:bg-dark-border mx-1" />
    <CampoData
      rotulo="De"
      valor={periodo.dateFrom}
      onAplicar={periodo.mudarDe}
    />
    <CampoData
      rotulo="Até"
      valor={periodo.dateTo}
      min={periodo.dateFrom}
      onAplicar={periodo.mudarAte}
    />
  </div>
);

export default FiltroPeriodoResumo;
