import { useState } from "react";
import {
  PeriodoPreset,
  fimDoMes,
  inicioDoMes,
  periodoDoPreset,
} from "../filters/periodo";

// Periodo do Resumo Geral, um so para todas as abas (Geral, Por cobrador,
// Por loja e Inadimplencia -- usuario, 26/11: "mesmo filtro do Geral"). Mora
// no ManagerDashboard porque a aba Inadimplencia e montada fora do
// CollectorsSummary (abre sem a carga da base inteira).

export interface PeriodoResumo {
  dateFrom: string;
  dateTo: string;
  /** Atalho aceso; "" = datas escolhidas a mao. */
  preset: PeriodoPreset | "";
  aplicarPreset: (key: PeriodoPreset) => void;
  mudarDe: (valor: string) => void;
  mudarAte: (valor: string) => void;
}

export function usePeriodoResumo(today: string): PeriodoResumo {
  const [dateFrom, setDateFrom] = useState(inicioDoMes(today));
  const [dateTo, setDateTo] = useState(fimDoMes(today));
  const [preset, setPreset] = useState<PeriodoPreset | "">("month-atual");
  return {
    dateFrom,
    dateTo,
    preset,
    aplicarPreset: (key) => {
      const { de, ate } = periodoDoPreset(key, today);
      setPreset(key);
      setDateFrom(de);
      setDateTo(ate);
    },
    mudarDe: (valor) => {
      setDateFrom(valor);
      setPreset("");
    },
    mudarAte: (valor) => {
      setDateTo(valor);
      setPreset("");
    },
  };
}
