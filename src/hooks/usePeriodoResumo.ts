import { useEffect, useState } from "react";
import {
  PERIODO_PRESETS,
  PeriodoPreset,
  periodoDoPreset,
} from "../filters/periodo";

// Periodo do Resumo Geral, um so para todas as abas (Geral, Por cobrador,
// Por loja e Inadimplencia -- usuario, 26/11: "mesmo filtro do Geral"). Mora
// no ManagerDashboard porque a aba Inadimplencia e montada fora do
// CollectorsSummary (abre sem a carga da base inteira).
//
// Guardado na sessao do navegador (26/11): durante a carga da base a tela de
// carregamento geral desmonta o painel, e o periodo voltava para "Mes atual"
// ao trocar de aba. Atalho guarda so a chave (as datas sao recalculadas: "Mes
// atual" continua sendo o mes de hoje); datas a mao guardam as datas.

export interface PeriodoResumo {
  dateFrom: string;
  dateTo: string;
  /** Atalho aceso; "" = datas escolhidas a mao. */
  preset: PeriodoPreset | "";
  aplicarPreset: (key: PeriodoPreset) => void;
  mudarDe: (valor: string) => void;
  mudarAte: (valor: string) => void;
}

const CHAVE = "resumoGeralPeriodo";

interface Salvo {
  preset: PeriodoPreset | "";
  de: string;
  ate: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

const ler = (today: string): Salvo => {
  const padrao = (): Salvo => ({
    preset: "month-atual",
    ...periodoDoPreset("month-atual", today),
  });
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return padrao();
    const s = JSON.parse(bruto) as Partial<Salvo>;
    if (s.preset && PERIODO_PRESETS.some((p) => p.key === s.preset)) {
      const key = s.preset as PeriodoPreset;
      return { preset: key, ...periodoDoPreset(key, today) };
    }
    if (s.de && s.ate && DATA.test(s.de) && DATA.test(s.ate) && s.de <= s.ate) {
      return { preset: "", de: s.de, ate: s.ate };
    }
  } catch {
    // sem storage ou valor estragado: volta ao padrao
  }
  return padrao();
};

const salvar = (s: Salvo) => {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    // sem storage: so nao lembra o periodo
  }
};

export function usePeriodoResumo(today: string): PeriodoResumo {
  const [estado, setEstado] = useState<Salvo>(() => ler(today));
  useEffect(() => {
    salvar(estado);
  }, [estado]);
  // Sempre a partir do estado MAIS RECENTE (26/11): com o Resumo ainda
  // recalculando a mudanca do "De", o "Ate" aplicado em seguida usava a
  // copia antiga e devolvia o "De" anterior.
  return {
    dateFrom: estado.de,
    dateTo: estado.ate,
    preset: estado.preset,
    aplicarPreset: (key) =>
      setEstado({ preset: key, ...periodoDoPreset(key, today) }),
    // "De" depois do "Ate" (ou o contrario) dava um periodo vazio: o outro
    // campo acompanha.
    mudarDe: (valor) =>
      setEstado((atual) => ({
        preset: "",
        de: valor,
        ate: atual.ate < valor ? valor : atual.ate,
      })),
    mudarAte: (valor) =>
      setEstado((atual) => ({
        preset: "",
        de: atual.de > valor ? valor : atual.de,
        ate: valor,
      })),
  };
}
