import React from "react";
import CampoData from "../common/CampoData";
import { PERIODO_PRESETS, dicaDoPreset } from "../../filters/periodo";
import { PeriodoResumo } from "../../hooks/usePeriodoResumo";

const CLASSE_DATA =
  "px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text";

const CampoRotulado: React.FC<{
  rotulo: string;
  valor: string;
  min?: string;
  onAplicar: (v: string) => void;
}> = ({ rotulo, valor, min, onAplicar }) => (
  <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-text-secondary">
    {rotulo}
    <CampoData
      valor={valor}
      min={min}
      onAplicar={onAplicar}
      className={CLASSE_DATA}
    />
  </label>
);

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
    <CampoRotulado
      rotulo="De"
      valor={periodo.dateFrom}
      onAplicar={periodo.mudarDe}
    />
    <CampoRotulado
      rotulo="Até"
      valor={periodo.dateTo}
      min={periodo.dateFrom}
      onAplicar={periodo.mudarAte}
    />
  </div>
);

export default FiltroPeriodoResumo;
