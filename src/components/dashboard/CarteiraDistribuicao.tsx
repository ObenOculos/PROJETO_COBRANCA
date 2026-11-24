import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Shuffle,
  Gauge,
  Store,
  Play,
  CheckCircle,
  AlertTriangle,
  Lock,
  ChevronDown,
  Trash2,
  Save,
  Plus,
  ListOrdered,
  Pencil,
  X,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { useCollection } from "../../contexts/CollectionContext";
import { CobradorOptions } from "../common/CobradorOptions";
import EditorCoberturaLoja from "./EditorCoberturaLoja";
import { nomeCurtoLoja } from "../../config/lojas";
import {
  CollectorOverdueRange,
  FilaConfigRegra,
  FilaOrdem,
  User,
  UserType,
  isCollectorType,
} from "../../types";
import {
  USER_TYPE_LABELS,
  distribuicaoPerfisPayload,
} from "../../config/profiles";
import {
  FILA_ORDEM_LABEL,
  FILA_VIRADA_HORA,
  filaComTurnos,
  filaLigada,
  pesoNaFila,
  rodadaDaFila,
} from "../../filters/filaCobranca";

// Formato do jsonb de distribuicao_carteira_previa (migration 20261106000007).
// "retido" (migration 20261109000005): cliente que uma regra cobre, mas que
// esta na carteira de um cobrador ativo SEM regra -- so sai de la se o gestor
// marcar aquele cobrador; nunca e aplicado sem isso.
type AcaoDistribuicao = "entra" | "troca" | "sai" | "retido";
interface ItemPrevia {
  documento: string;
  cliente: string | null;
  loja: string | null;
  atraso: number;
  situacao: string | null;
  cobrador_atual: string | null;
  cobrador_destino: string | null;
  acao: AcaoDistribuicao;
  bloqueado_por: "acordo_ativo" | "agendamento_ativo" | null;
}
interface Previa {
  itens: ItemPrevia[];
  sem_regra_por_loja: { loja: string | null; clientes: number }[];
}
interface LojaCarteira {
  loja: string;
  clientes_em_aberto: number;
}

interface Rascunho {
  min: string;
  max: string;
  /** null = todas as lojas */
  lojas: string[] | null;
}

const TYPE_ORDER: UserType[] = [
  "collector",
  "internal_collector",
  "third_party_collector",
  "legal_collector",
];

const ACAO_LABEL: Record<AcaoDistribuicao, string> = {
  entra: "Entra (estava sem cobrador)",
  troca: "Troca de cobrador",
  sai: "Fica sem cobrador",
  retido: "Com outro cobrador (só sai se você marcar)",
};
// Acima disto (dias sem nenhuma baixa externa nova), a loja aparece como
// desatualizada no passo "Simular e aplicar".
const DIAS_DADOS_ANTIGOS = 2;

// Marcas da regua da cobertura por loja (dias de atraso).

const BLOQUEIO_LABEL = {
  acordo_ativo: "acordo ativo",
  agendamento_ativo: "agendamento ativo",
} as const;

// Cores das faixas no grafico de cobertura (uma por cobrador).
const SEGMENT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-lime-600",
  "bg-amber-500",
];

const inputClass =
  "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text";
// Colunas fixas da tabela de cobertura (dias de atraso). A tela mostra
// COLUNAS_VISIVEIS de cada vez e anda com < > (pedido 2026-11-24: ver as
// faixas acima de 2 anos, onde os tetos das regras cortam -- atraso maximo
// em producao ~2.100 dias). A ultima visivel junta o resto ("N+").
const COLUNAS_COBERTURA: { ini: number; fim: number }[] = [
  { ini: 1, fim: 30 },
  { ini: 31, fim: 60 },
  { ini: 61, fim: 90 },
  { ini: 91, fim: 180 },
  { ini: 181, fim: 365 },
  { ini: 366, fim: 730 },
  { ini: 731, fim: 1095 },
  { ini: 1096, fim: 1460 },
  { ini: 1461, fim: 1825 },
  { ini: 1826, fim: Infinity },
];
const COLUNAS_VISIVEIS = 7;

// Rodada automatica diaria (pg_cron 10:00 UTC = 7h, migration
// 20261116000001): usa as regras salvas. "Aplicar" so adianta.
const HORA_DISTRIBUICAO_AUTOMATICA = "7h";

const cardClass =
  "bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 sm:p-6";

const faixaTexto = (min: number, max: number | null) =>
  max == null ? `${min}+ dias` : `${min} a ${max} dias`;

/** "Todas as lojas", "Crateus, Poranga" (até 3) ou "5 lojas". */
const lojasTexto = (lojas: string[] | null) =>
  lojas == null
    ? "Todas as lojas"
    : lojas.length <= 3
      ? lojas.join(", ")
      : `${lojas.length} lojas`;

const rascunhoDe = (r?: CollectorOverdueRange): Rascunho => ({
  min: r ? String(r.minDias) : "",
  max: r?.maxDias != null ? String(r.maxDias) : "",
  lojas: r?.lojas ?? null,
});

const mesmasLojas = (a: string[] | null, b: string[] | null) => {
  if (a == null || b == null) return a == null && b == null;
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
};

/** Seletor de lojas compacto: "Todas" ou as marcadas, num popover. */
const LojasSelect: React.FC<{
  lojas: LojaCarteira[];
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}> = ({ lojas, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const label =
    value == null
      ? "Todas as lojas"
      : value.length === 1
        ? value[0]
        : `${value.length} lojas`;
  const toggle = (loja: string) => {
    const atual = value ?? [];
    const novo = atual.includes(loja)
      ? atual.filter((l) => l !== loja)
      : [...atual, loja];
    onChange(novo.length === 0 ? null : novo);
  };
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
        title={value?.join(", ") ?? "Todas as lojas"}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 max-h-72 overflow-y-auto bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg p-2 space-y-0.5">
          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-dark-bg text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={value == null}
              onChange={() => onChange(null)}
            />
            Todas as lojas
          </label>
          {lojas.map((l) => (
            <label
              key={l.loja}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-dark-bg text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value?.includes(l.loja) ?? false}
                onChange={() => toggle(l.loja)}
              />
              <span className="flex-1 truncate">{l.loja}</span>
              <span className="text-xs text-gray-400">{l.clientes_em_aberto}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const faixaCurta = (r: CollectorOverdueRange) =>
  r.maxDias == null ? `${r.minDias}+` : `${r.minDias}–${r.maxDias}`;

/** Resumo da fila para a linha fechada da sanfona. */
const filaResumoCurto = (regras: CollectorOverdueRange[]) => {
  const ativas = regras.filter((r) => r.ativa);
  if (ativas.length < 2) return "fila: 1 faixa só";
  if (!filaLigada(regras)) return "fila: ordem padrão";
  const pesos = (t: "manha" | "tarde") =>
    ativas.map((r) => pesoNaFila(r, regras, t) ?? 0).join("·");
  return filaComTurnos(regras)
    ? `fila: manhã ${pesos("manha")} / tarde ${pesos("tarde")}`
    : `fila: ${pesos("manha")}`;
};

interface PesoRascunho {
  manha: string;
  tarde: string;
  ordem: FilaOrdem;
  saldoMin: string;
  saldoMax: string;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "R$ 50 a R$ 1.000", "a partir de R$ 50", "até R$ 1.000" ou "". */
const faixaValorTexto = (min: number | null, max: number | null) =>
  min != null && max != null
    ? `${brl(min)} a ${brl(max)}`
    : min != null
      ? `a partir de ${brl(min)}`
      : max != null
        ? `até ${brl(max)}`
        : "";

/** "1.234,56" / "1234.56" / "" -> número (NaN se inválido) ou null. */
const lerValor = (s: string): number | null => {
  const t = s.trim().replace(/\s|R\$/g, "");
  if (t === "") return null;
  // Com virgula: ponto e milhar. Sem virgula, "1.000"/"12.500" tambem e
  // milhar (grupos de 3); "50.5" fica decimal.
  const normal = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t;
  return Number(normal);
};

/**
 * Fila de Cobranca do cobrador (itens 39/40): quantos clientes de cada faixa
 * em cada lote da fila, com manha/tarde opcional. Regras em
 * filters/filaCobranca.ts; so faz sentido com 2+ faixas ativas.
 */
const FilaDoCobrador: React.FC<{
  nome: string;
  regras: CollectorOverdueRange[];
  onSalvar: (config: FilaConfigRegra[]) => Promise<void>;
}> = ({ nome, regras, onSalvar }) => {
  const ativas = regras.filter((r) => r.ativa);
  const ligada = filaLigada(regras);
  const comTurnos = filaComTurnos(regras);
  const [editando, setEditando] = useState(false);
  const [turnos, setTurnos] = useState(false);
  const [valores, setValores] = useState<Record<string, PesoRascunho>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Mesmo rotulo para duas faixas iguais em lojas diferentes: diferencia
  // pela loja.
  const rotulo = (r: CollectorOverdueRange) => {
    const repetida = ativas.some((o) => o.id !== r.id && faixaCurta(o) === faixaCurta(r));
    if (!repetida) return faixaCurta(r);
    const lojas = r.lojas == null ? "todas" : r.lojas.length === 1 ? r.lojas[0] : `${r.lojas.length} lojas`;
    return `${faixaCurta(r)} (${lojas})`;
  };

  const abrir = () => {
    const v: Record<string, PesoRascunho> = {};
    ativas.forEach((r) => {
      const manha = ligada
        ? (pesoNaFila(r, regras, "manha") ?? 1)
        : 1;
      const tarde = ligada ? (pesoNaFila(r, regras, "tarde") ?? manha) : manha;
      v[r.id] = {
        manha: String(manha),
        tarde: String(tarde),
        ordem: ligada ? r.filaOrdem : "atraso",
        saldoMin: ligada && r.filaSaldoMin != null ? String(r.filaSaldoMin).replace(".", ",") : "",
        saldoMax: ligada && r.filaSaldoMax != null ? String(r.filaSaldoMax).replace(".", ",") : "",
      };
    });
    setValores(v);
    setTurnos(comTurnos);
    setErro("");
    setEditando(true);
  };

  const numero = (s: string | undefined) => {
    if (s == null || s.trim() === "") return NaN;
    const n = Number(s);
    return Number.isInteger(n) ? n : NaN;
  };

  const previa = (turno: "manha" | "tarde") =>
    rodadaDaFila(
      ativas.map((r) => {
        const n = numero(turno === "manha" ? valores[r.id]?.manha : valores[r.id]?.tarde);
        return { rotulo: rotulo(r), peso: Number.isNaN(n) ? 0 : Math.max(0, n) };
      }),
    );

  const resumo = (turno: "manha" | "tarde") => {
    const itens = ativas
      .map((r) => ({ r, p: pesoNaFila(r, regras, turno) ?? 0 }))
      .filter(({ p }) => p > 0);
    const soma = itens.reduce((s, { p }) => s + p, 0);
    return `a cada ${soma} clientes: ${itens.map(({ r, p }) => `${p} de ${rotulo(r)} dias`).join(" · ")}`;
  };

  // Ordem e valor que fogem do padrao, para o resumo fechado.
  const extras = ativas
    .map((r) => {
      const partes = [
        r.filaOrdem === "valor" ? "maior dívida primeiro" : "",
        faixaValorTexto(r.filaSaldoMin, r.filaSaldoMax),
      ].filter(Boolean);
      return partes.length > 0 ? `${rotulo(r)}: ${partes.join(", ")}` : "";
    })
    .filter(Boolean);

  const salvar = async (desligar = false) => {
    setErro("");
    // Desligar = lista vazia.
    const pesos: FilaConfigRegra[] = [];
    if (!desligar) {
      for (const r of ativas) {
        const v = valores[r.id];
        const m = numero(v?.manha);
        const t = turnos ? numero(v?.tarde) : null;
        if (Number.isNaN(m) || m < 0 || m > 99 || (t != null && (Number.isNaN(t) || t < 0 || t > 99))) {
          setErro("Use números inteiros de 0 a 99.");
          return;
        }
        const saldoMin = lerValor(v?.saldoMin ?? "");
        const saldoMax = lerValor(v?.saldoMax ?? "");
        if (
          (saldoMin != null && (Number.isNaN(saldoMin) || saldoMin < 0)) ||
          (saldoMax != null && (Number.isNaN(saldoMax) || saldoMax < 0))
        ) {
          setErro(`Valor da dívida inválido na faixa ${rotulo(r)}. Use só números, ex.: 50 ou 1.000,00.`);
          return;
        }
        if (saldoMin != null && saldoMax != null && saldoMax < saldoMin) {
          setErro(`Na faixa ${rotulo(r)}, o "até" da dívida deve ser maior que o "de".`);
          return;
        }
        pesos.push({
          regraId: r.id,
          peso: m,
          pesoTarde: t,
          ordem: v?.ordem ?? "atraso",
          saldoMin,
          saldoMax,
        });
      }
      const soma = (k: "peso" | "pesoTarde") => pesos.reduce((s, p) => s + (p[k] ?? 0), 0);
      if (soma("peso") === 0 || (turnos && soma("pesoTarde") === 0)) {
        setErro(
          turnos
            ? "Coloque ao menos uma faixa com número maior que zero na manhã e na tarde."
            : "Coloque ao menos uma faixa com número maior que zero.",
        );
        return;
      }
    }
    setSalvando(true);
    try {
      await onSalvar(pesos);
      setEditando(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a fila.");
    } finally {
      setSalvando(false);
    }
  };

  // Esc fecha o modal (sem salvar).
  useEffect(() => {
    if (!editando) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !salvando) setEditando(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editando, salvando]);

  if (ativas.length < 2) return null;

  const linhaResumo = (
      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-dark-border flex items-start justify-between gap-3 bg-blue-50/40 dark:bg-blue-900/10 rounded-b-xl">
        <div className="min-w-0 text-xs text-gray-600 dark:text-dark-text-secondary">
          <span className="inline-flex items-center gap-1 font-semibold text-gray-800 dark:text-dark-text">
            <ListOrdered className="h-3.5 w-3.5" />
            Fila de Cobrança:
          </span>{" "}
          {!ligada ? (
            "ordem padrão (maior atraso primeiro, sem intercalar as faixas)."
          ) : comTurnos ? (
            <>
              <span className="block sm:inline">Manhã {resumo("manha")}.</span>{" "}
              <span className="block sm:inline">Tarde {resumo("tarde")}.</span>
            </>
          ) : (
            `${resumo("manha")}.`
          )}
          {ligada && extras.length > 0 && (
            <span className="block">{extras.join(" · ")}.</span>
          )}
        </div>
        <button
          type="button"
          onClick={abrir}
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/30"
        >
          {ligada ? "Alterar" : "Configurar fila"}
        </button>
      </div>
  );

  if (!editando) return linhaResumo;

  const inputPeso =
    "px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text";

  return (
    <>
    {linhaResumo}
    {createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={() => !salvando && setEditando(false)}
    >
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Fila de cobrança de ${nome}`}
      className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl border border-gray-200 dark:border-dark-border p-5 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-base font-bold text-gray-900 dark:text-dark-text flex items-center gap-1.5">
          <ListOrdered className="h-4 w-4 text-blue-600" />
          Fila de Cobrança · {nome}
        </p>
        <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-0.5">
          Quantos clientes de cada faixa em cada lote. O cobrador recebe um
          lote com a soma dessas quantidades, faixas misturadas nessa
          proporção e cada uma na ordem escolhida; o próximo lote só vem
          quando ele registrar todos. Acordo quebrado e "vai sair da
          carteira" entram primeiro na faixa deles; contato agendado e
          promessa ficam fora do lote, no topo. Faixa com 0, ou cliente com
          dívida vencida fora do valor, não entra na fila (continua na
          carteira).
        </p>
      </div>
      <button
        type="button"
        onClick={() => setEditando(false)}
        disabled={salvando}
        className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-dark-bg shrink-0"
        aria-label="Fechar"
      >
        <X className="h-4 w-4 text-gray-500" />
      </button>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text cursor-pointer">
        <input
          type="checkbox"
          checked={turnos}
          onChange={(e) => setTurnos(e.target.checked)}
        />
        Separar manhã e tarde (muda às {FILA_VIRADA_HORA}h)
      </label>

      <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-dark-text-secondary">
            <th className="text-left font-medium pr-4 pb-1">Faixa (dias)</th>
            <th className="font-medium px-1 pb-1">{turnos ? "Manhã" : "Clientes"}</th>
            {turnos && <th className="font-medium px-1 pb-1">Tarde</th>}
            <th className="text-left font-medium pl-3 pr-1 pb-1">Ordenar por</th>
            <th className="text-left font-medium pl-3 pb-1" colSpan={2}>
              Dívida vencida (R$, vazio = sem limite)
            </th>
          </tr>
        </thead>
        <tbody>
          {ativas.map((r) => (
            <tr key={r.id}>
              <td className="pr-4 py-0.5 text-gray-800 dark:text-dark-text">{rotulo(r)}</td>
              <td className="px-1 py-0.5">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={valores[r.id]?.manha ?? ""}
                  onChange={(e) =>
                    setValores((p) => ({ ...p, [r.id]: { ...p[r.id], manha: e.target.value } }))
                  }
                  className={`${inputPeso} w-16`}
                  aria-label={`${turnos ? "Manhã" : "Clientes"} da faixa ${rotulo(r)}`}
                />
              </td>
              {turnos && (
                <td className="px-1 py-0.5">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={valores[r.id]?.tarde ?? ""}
                    onChange={(e) =>
                      setValores((p) => ({ ...p, [r.id]: { ...p[r.id], tarde: e.target.value } }))
                    }
                    className={`${inputPeso} w-16`}
                    aria-label={`Tarde da faixa ${rotulo(r)}`}
                  />
                </td>
              )}
              <td className="pl-3 pr-1 py-0.5">
                <select
                  value={valores[r.id]?.ordem ?? "atraso"}
                  onChange={(e) =>
                    setValores((p) => ({
                      ...p,
                      [r.id]: { ...p[r.id], ordem: e.target.value as FilaOrdem },
                    }))
                  }
                  className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text"
                  aria-label={`Ordenar a faixa ${rotulo(r)} por`}
                >
                  {(Object.keys(FILA_ORDEM_LABEL) as FilaOrdem[]).map((o) => (
                    <option key={o} value={o}>
                      {FILA_ORDEM_LABEL[o]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="pl-3 py-0.5">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="de"
                  value={valores[r.id]?.saldoMin ?? ""}
                  onChange={(e) =>
                    setValores((p) => ({ ...p, [r.id]: { ...p[r.id], saldoMin: e.target.value } }))
                  }
                  className={`${inputPeso} w-24`}
                  aria-label={`Dívida vencida mínima da faixa ${rotulo(r)}`}
                />
              </td>
              <td className="pl-1 py-0.5">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="até"
                  value={valores[r.id]?.saldoMax ?? ""}
                  onChange={(e) =>
                    setValores((p) => ({ ...p, [r.id]: { ...p[r.id], saldoMax: e.target.value } }))
                  }
                  className={`${inputPeso} w-24`}
                  aria-label={`Dívida vencida máxima da faixa ${rotulo(r)}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="text-xs text-gray-600 dark:text-dark-text-secondary space-y-0.5">
        {(turnos ? (["manha", "tarde"] as const) : (["manha"] as const)).map((t) => {
          const ordem = previa(t);
          return (
            <p key={t}>
              <span className="font-semibold">
                {turnos ? (t === "manha" ? "Manhã" : "Tarde") : "Ordem"}:
              </span>{" "}
              {ordem.length > 0 ? ordem.join(" | ") : "—"}
              {ordem.length > 0 && " | e repete"}
            </p>
          );
        })}
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Salvar fila
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          disabled={salvando}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
        >
          Cancelar
        </button>
        {ligada && (
          <button
            type="button"
            onClick={() => void salvar(true)}
            disabled={salvando}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
            title="Volta a lista para a ordem padrão (maior atraso primeiro)"
          >
            Desligar fila
          </button>
        )}
      </div>
    </div>
    </div>,
    document.body,
    )}
    </>
  );
};

/**
 * Distribuicao da carteira por regra: o gestor define, por cobrador, a
 * faixa de atraso e as lojas que ele atende; a tela mostra a cobertura por
 * loja (buracos e conflitos) e distribui os clientes em 2 passos (simular ->
 * aplicar). Regras de quem entra/sai: migrations 20261106000007 e 0008
 * (varias regras por cobrador, sem sobreposicao).
 */
const CarteiraDistribuicao: React.FC = () => {
  const {
    users,
    collectorOverdueRanges,
    salvarRegraCarteira,
    definirRegraCarteiraAtiva,
    encerrarRegraCarteira,
    definirFilaCobranca,
    definirCoberturaLoja,
  } = useCollection();

  const [lojas, setLojas] = useState<LojaCarteira[]>([]);
  const [lojasErro, setLojasErro] = useState("");
  // Rascunho por linha: chave = id da regra, ou "novo:<cobrador>" para a
  // regra que esta sendo adicionada.
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [novos, setNovos] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erroRegra, setErroRegra] = useState<Record<string, string>>({});
  const [confirmRemover, setConfirmRemover] = useState<string | null>(null);
  // Faixas abertas para edicao (as demais aparecem como texto).
  const [editando, setEditando] = useState<Set<string>>(new Set());

  // Clientes em aberto de cada cobrador hoje (cabecalho do cobrador). Leva
  // alguns segundos: a tela abre sem e preenche depois.
  // null = carregando; "erro" = sem a contagem (so nao mostra).
  const [carteiraPorCobrador, setCarteiraPorCobrador] = useState<
    Map<string, number> | null | "erro"
  >(null);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("carteira_por_cobrador");
      if (error) {
        console.warn("Tamanho das carteiras indisponível:", error.message);
        setCarteiraPorCobrador("erro");
        return;
      }
      setCarteiraPorCobrador(
        new Map(
          ((data ?? []) as { collector_id: string; clientes_em_aberto: number }[]).map(
            (r) => [r.collector_id, r.clientes_em_aberto],
          ),
        ),
      );
    })();
  }, []);
  const carteiraTexto = (collectorId: string) => {
    if (carteiraPorCobrador === "erro") return "";
    if (!carteiraPorCobrador) return " · …";
    const n = carteiraPorCobrador.get(collectorId) ?? 0;
    return n === 0 ? " · nenhum cliente" : n === 1 ? " · 1 cliente" : ` · ${n} clientes`;
  };

  // Ultima rodada da distribuicao automatica (resumo do topo).
  const [ultimaRodada, setUltimaRodada] = useState<{
    em: string;
    atribuidos: number;
    retirados: number;
    erro: string | null;
  } | null>(null);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("distribuicao_execucoes")
        .select("executado_em, resultado, erro")
        .order("executado_em", { ascending: false })
        .limit(1);
      if (error || !data?.[0]) return;
      const r = (data[0].resultado ?? {}) as {
        clientes_atribuidos?: number;
        clientes_retirados?: number;
      };
      setUltimaRodada({
        em: data[0].executado_em,
        atribuidos: r.clientes_atribuidos ?? 0,
        retirados: r.clientes_retirados ?? 0,
        erro: data[0].erro,
      });
    })();
  }, []);
  const secaoSimularRef = useRef<HTMLDivElement>(null);

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [previaDesatualizada, setPreviaDesatualizada] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmAplicar, setConfirmAplicar] = useState(false);
  const [erroDistribuicao, setErroDistribuicao] = useState("");
  const [resultado, setResultado] = useState<string>("");
  const resultadoRef = React.useRef<HTMLParagraphElement>(null);
  // Mostra o resultado de aplicar (o botao fica bem abaixo da mensagem).
  useEffect(() => {
    if (resultado)
      resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resultado]);
  const [filtroAcao, setFiltroAcao] = useState<AcaoDistribuicao | "travados" | "">("");
  // Cobradores sem regra dos quais o GESTOR decidiu retirar os clientes que
  // as regras cobrem (p_retirar_de). Comeca vazio: a distribuicao nunca tira
  // de outra carteira sem essa escolha explicita.
  const [retirarDe, setRetirarDe] = useState<Set<string>>(new Set());
  // Cobradores escolhidos para esta distribuicao (pedido 2026-11-19: antes
  // "sincronizar" mexia em todo mundo de uma vez). null = todos. Vai para o
  // banco em p_perfis.cobradores (migration 20261119000002): entra todo
  // cliente que entra, sai ou troca envolvendo um escolhido. Nao muda a
  // rotina automatica diaria, que continua com todos.
  const [selecionados, setSelecionados] = useState<Set<string> | null>(null);
  const perfisDaDistribuicao = () => ({
    ...distribuicaoPerfisPayload(),
    ...(selecionados ? { cobradores: Array.from(selecionados) } : {}),
  });

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("lojas_carteira");
      if (error) {
        console.error("Erro ao carregar lojas:", error);
        setLojasErro(
          "Não foi possível carregar as lojas. A migration da distribuição já foi aplicada?",
        );
        return;
      }
      setLojas((data ?? []) as LojaCarteira[]);
    })();
  }, []);

  // Item 34: quando os pagamentos de cada loja chegaram ao sistema (ultima
  // baixa vinda de fora do app). Distribuir com pagamento atrasado no sistema
  // entrega cliente que ja pagou. Sem a migration 20261109000006, so nao
  // mostra o aviso.
  const [ultimaBaixaPorLoja, setUltimaBaixaPorLoja] = useState<
    Map<string, string | null>
  >(new Map());
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("lojas_ultima_baixa_externa");
      if (error) {
        console.warn("Atualização das lojas indisponível:", error.message);
        return;
      }
      setUltimaBaixaPorLoja(
        new Map(
          ((data ?? []) as { loja: string; ultima_baixa: string | null }[]).map(
            (l) => [l.loja, l.ultima_baixa],
          ),
        ),
      );
    })();
  }, []);

  // Lojas com clientes em aberto cujos pagamentos nao chegam ha mais de
  // DIAS_DADOS_ANTIGOS dias (ou nunca chegaram).
  const lojasDesatualizadas = useMemo(() => {
    if (ultimaBaixaPorLoja.size === 0) return [];
    const agora = Date.now();
    return lojas
      .filter((l) => l.clientes_em_aberto > 0)
      .map((l) => {
        const ultima = ultimaBaixaPorLoja.get(l.loja) ?? null;
        const dias =
          ultima == null
            ? null
            : Math.floor((agora - new Date(ultima).getTime()) / 86400000);
        return { loja: l.loja, ultima, dias };
      })
      .filter((l) => l.dias == null || l.dias > DIAS_DADOS_ANTIGOS)
      .sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));
  }, [lojas, ultimaBaixaPorLoja]);

  const cobradores = useMemo(
    () =>
      users
        .filter((u) => isCollectorType(u.type) && u.active !== false)
        .sort(
          (a, b) =>
            TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
            a.name.localeCompare(b.name),
        ),
    [users],
  );
  const nomePorId = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );
  const regrasPorCobrador = useMemo(() => {
    const m = new Map<string, CollectorOverdueRange[]>();
    collectorOverdueRanges.forEach((r) => {
      if (!m.has(r.collectorId)) m.set(r.collectorId, []);
      m.get(r.collectorId)!.push(r);
    });
    m.forEach((lista) => lista.sort((a, b) => a.minDias - b.minDias));
    return m;
  }, [collectorOverdueRanges]);
  const corPorCobrador = useMemo(() => {
    const m = new Map<string, string>();
    cobradores.forEach((c, i) =>
      m.set(c.id, SEGMENT_COLORS[i % SEGMENT_COLORS.length]),
    );
    return m;
  }, [cobradores]);

  // Quem tem faixa (ou esta criando a primeira) ganha cartao proprio; os
  // demais ficam juntos numa linha no fim ("carteira manual").
  const cobradoresComRegra = cobradores.filter(
    (c) => (regrasPorCobrador.get(c.id)?.length ?? 0) > 0 || novos.has(c.id),
  );
  const cobradoresSemRegra = cobradores.filter(
    (c) => !cobradoresComRegra.includes(c),
  );

  // Sanfona da secao 1: cobradores abertos (comeca tudo fechado).
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternarAberto = (id: string) =>
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const todosAbertos =
    cobradoresComRegra.length > 0 && cobradoresComRegra.every((c) => abertos.has(c.id));

  const abrirEdicao = (regraId: string) => {
    setEditando((prev) => new Set(prev).add(regraId));
    setConfirmRemover(null);
  };
  const fecharEdicao = (chave: string) => {
    setEditando((prev) => {
      const next = new Set(prev);
      next.delete(chave);
      return next;
    });
    limparLinha(chave);
  };

  const chaveNova = (collectorId: string) => `novo:${collectorId}`;

  const rascunhoDaLinha = (
    chave: string,
    regra?: CollectorOverdueRange,
  ): Rascunho => rascunhos[chave] ?? rascunhoDe(regra);

  const alterada = (regra: CollectorOverdueRange) => {
    const r = rascunhos[regra.id];
    if (!r) return false;
    const atual = rascunhoDe(regra);
    return (
      r.min !== atual.min || r.max !== atual.max || !mesmasLojas(r.lojas, atual.lojas)
    );
  };

  const setRascunho = (chave: string, patch: Partial<Rascunho>, base: Rascunho) => {
    setRascunhos((prev) => ({ ...prev, [chave]: { ...base, ...prev[chave], ...patch } }));
    setErroRegra((prev) => ({ ...prev, [chave]: "" }));
  };

  const limparLinha = (chave: string) => {
    setRascunhos((prev) => {
      const next = { ...prev };
      delete next[chave];
      return next;
    });
    setErroRegra((prev) => ({ ...prev, [chave]: "" }));
  };

  const invalidarPrevia = () => {
    if (previa) setPreviaDesatualizada(true);
    setConfirmAplicar(false);
  };

  const adicionarRegra = (c: User) => {
    setNovos((prev) => new Set(prev).add(c.id));
    setRascunhos((prev) => ({
      ...prev,
      [chaveNova(c.id)]: { min: "", max: "", lojas: null },
    }));
  };

  const cancelarNova = (c: User) => {
    setNovos((prev) => {
      const next = new Set(prev);
      next.delete(c.id);
      return next;
    });
    limparLinha(chaveNova(c.id));
  };

  const salvarRegra = async (
    chave: string,
    collectorId: string,
    regra?: CollectorOverdueRange,
  ) => {
    const r = rascunhoDaLinha(chave, regra);
    const min = r.min.trim() === "" ? null : Number(r.min);
    const max = r.max.trim() === "" ? null : Number(r.max);
    if (min === null || Number.isNaN(min) || min < 0) {
      setErroRegra((p) => ({ ...p, [chave]: "Informe o início da faixa (0 ou mais)." }));
      return;
    }
    if (max !== null && (Number.isNaN(max) || max <= min)) {
      setErroRegra((p) => ({
        ...p,
        [chave]: "O fim deve ser maior que o início, ou vazio (sem limite).",
      }));
      return;
    }
    setSalvando(chave);
    try {
      await salvarRegraCarteira(
        regra?.id ?? null,
        collectorId,
        min,
        max,
        r.lojas,
        regra?.ativa ?? true,
      );
      fecharEdicao(chave);
      if (!regra) {
        setNovos((prev) => {
          const next = new Set(prev);
          next.delete(collectorId);
          return next;
        });
      }
      invalidarPrevia();
    } catch (err) {
      setErroRegra((p) => ({
        ...p,
        [chave]: err instanceof Error ? err.message : "Erro ao salvar a regra.",
      }));
    } finally {
      setSalvando(null);
    }
  };

  const alternarAtiva = async (regra: CollectorOverdueRange) => {
    setSalvando(regra.id);
    try {
      await definirRegraCarteiraAtiva(regra.id, !regra.ativa);
      limparLinha(regra.id);
      invalidarPrevia();
    } catch (err) {
      setErroRegra((p) => ({
        ...p,
        [regra.id]: err instanceof Error ? err.message : "Erro ao alterar a regra.",
      }));
    } finally {
      setSalvando(null);
    }
  };

  const removerRegra = async (regra: CollectorOverdueRange) => {
    if (confirmRemover !== regra.id) {
      setConfirmRemover(regra.id);
      return;
    }
    setSalvando(regra.id);
    try {
      await encerrarRegraCarteira(regra.id);
      limparLinha(regra.id);
      setConfirmRemover(null);
      invalidarPrevia();
    } catch (err) {
      setErroRegra((p) => ({
        ...p,
        [regra.id]: err instanceof Error ? err.message : "Erro ao remover a regra.",
      }));
    } finally {
      setSalvando(null);
    }
  };

  // Cobertura por loja: quais regras valem em cada loja, buracos (dias que
  // ninguem atende, a partir de 1) e conflitos (cobradores DIFERENTES na
  // mesma faixa -- o banco recusa regra nova assim, mas pode sobrar regra
  // antiga em conflito).
  const cobertura = useMemo(() => {
    const porId = new Map(cobradores.map((c) => [c.id, c]));
    return lojas.map((l) => {
      const regras = collectorOverdueRanges
        .filter((r) => porId.has(r.collectorId))
        .filter((r) => r.lojas == null || r.lojas.includes(l.loja))
        .map((r) => ({ c: porId.get(r.collectorId)!, r }))
        .sort((a, b) => a.r.minDias - b.r.minDias);
      const ativas = regras.filter(({ r }) => r.ativa);
      // Buraco = trecho sem cobrador ENTRE faixas desta loja. Antes da
      // primeira (carencia, ex. 1 a 2 dias) e acima do ultimo teto e de
      // proposito: so informacao (foraInicio/foraFim), nao problema.
      const buracos: { ini: number; fim: number }[] = [];
      const primeira = ativas.length ? ativas[0].r.minDias : null;
      const foraInicio = primeira != null && primeira > 1 ? primeira - 1 : null;
      let cursor = primeira ?? 1;
      for (const { r } of ativas) {
        if (cursor === Infinity) break;
        if (r.minDias > cursor) buracos.push({ ini: cursor, fim: r.minDias - 1 });
        cursor = Math.max(cursor, r.maxDias == null ? Infinity : r.maxDias + 1);
      }
      const foraFim = ativas.length > 0 && cursor !== Infinity ? cursor - 1 : null;
      const conflitos: string[] = [];
      for (let i = 0; i < ativas.length; i++) {
        for (let j = i + 1; j < ativas.length; j++) {
          if (ativas[i].c.id === ativas[j].c.id) continue;
          const a = ativas[i].r;
          const b = ativas[j].r;
          const ini = Math.max(a.minDias, b.minDias);
          const fim = Math.min(a.maxDias ?? Infinity, b.maxDias ?? Infinity);
          if (ini <= fim) {
            conflitos.push(
              `${fim === Infinity ? `${ini}+` : `${ini} a ${fim}`} dias: ${ativas[i].c.name} e ${ativas[j].c.name}`,
            );
          }
        }
      }
      const problema =
        conflitos.length > 0 ||
        buracos.length > 0 ||
        (l.clientes_em_aberto > 0 && ativas.length === 0);
      return { loja: l, regras, ativas, buracos, conflitos, foraInicio, foraFim, problema };
    });
  }, [lojas, cobradores, collectorOverdueRanges]);

  // Clientes por loja, com atraso e cobrador de cada um -- para mostrar
  // quantos ha em cada faixa e em cada lacuna (pedido 2026-11-19). Mesma base
  // do plano da distribuicao (plano_distribuicao_carteira): titulo com saldo,
  // nao cancelado; fora as situacoes de encerramento; loja = a da parcela
  // aberta mais antiga (clientReferenceStore), atraso = clientMaxOverdueDays
  // (espelhos de cliente_loja_referencia / cliente_max_atraso_dias) e
  // cobrador = algum titulo aberto com cobrador (o plano pega o primeiro).
  // 24/11: vem do banco (carteira_mapa, migration 20261124000002). Antes
  // era calculado sobre as parcelas do navegador, que o gestor nao carrega
  // inteiras (item 8) -- todas as casas da cobertura apareciam com 0.
  const [mapaCarteira, setMapaCarteira] = useState<
    {
      loja: string;
      atraso: number;
      cobrador_id: string | null;
      /** Situacao "Aguardando ..." (ex.: Aguardando Juridico): fora da
       * distribuicao de proposito (migration 20261124000004). */
      aguardando?: string | null;
      clientes: number;
    }[] | null
  >(null);
  const [mapaErro, setMapaErro] = useState(false);
  const carregarMapa = React.useCallback(async () => {
    const { data, error } = await supabase.rpc("carteira_mapa");
    if (error) {
      console.warn("Mapa da carteira indisponível:", error.message);
      setMapaErro(true);
      return;
    }
    setMapaErro(false);
    // jsonb (migration 20261124000003): linhas cortariam em 1.000.
    setMapaCarteira(
      (data ?? []) as {
        loja: string;
        atraso: number;
        cobrador_id: string | null;
        aguardando?: string | null;
        clientes: number;
      }[],
    );
  }, []);
  useEffect(() => {
    void carregarMapa();
  }, [carregarMapa]);
  const clientesPorLoja = useMemo(() => {
    const m = new Map<
      string,
      { atraso: number; dono: string | null; aguardando: string | null; n: number }[]
    >();
    (mapaCarteira ?? []).forEach((x) => {
      const item = {
        atraso: x.atraso,
        dono: x.cobrador_id,
        aguardando: x.aguardando ?? null,
        n: x.clientes,
      };
      const l = m.get(x.loja);
      if (l) l.push(item);
      else m.set(x.loja, [item]);
    })
    return m;
  }, [mapaCarteira]);

  // Colunas da tabela de cobertura: fixas (pedido 2026-11-24 -- antes
  // seguiam os cortes das faixas, e cada loja ficava com colunas diferentes
  // de leitura). Uma faixa pode cobrir so parte de uma coluna: a casa conta
  // cliente a cliente (contaColuna).
  const [inicioColunas, setInicioColunas] = useState(0);
  // Etapa 2 (24/11): loja aberta no editor de cobertura (uma por vez).
  const [lojaEditando, setLojaEditando] = useState<string | null>(null);
  const maxInicioColunas = COLUNAS_COBERTURA.length - COLUNAS_VISIVEIS;
  const colunasCobertura = useMemo(() => {
    const janela = COLUNAS_COBERTURA.slice(
      inicioColunas,
      inicioColunas + COLUNAS_VISIVEIS,
    );
    // A ultima visivel junta tudo acima dela (nada some da conta).
    const ultima = janela[janela.length - 1];
    return [...janela.slice(0, -1), { ini: ultima.ini, fim: Infinity }];
  }, [inicioColunas]);

  /** Clientes da loja numa coluna, cliente a cliente pela faixa que cobre o
   * atraso dele: na carteira do dono, com outro, sem cobrador, aguardando
   * (juridico etc.), fora da faixa (buraco/acima do teto) e carencia (abaixo
   * da primeira faixa -- so informacao). */
  const contaColuna = (
    loja: string,
    col: { ini: number; fim: number },
    ativas: { c: User; r: CollectorOverdueRange }[],
  ) => {
    const primeira = ativas.length
      ? Math.min(...ativas.map(({ r }) => r.minDias))
      : null;
    const r = {
      total: 0,
      naCarteira: 0,
      comOutro: 0,
      sem: 0,
      foraSem: 0,
      foraCom: 0,
      carencia: 0,
      conflito: 0,
      aguardando: new Map<string, number>(),
    };
    (clientesPorLoja.get(loja) ?? []).forEach((x) => {
      if (x.atraso < col.ini || x.atraso > col.fim) return;
      r.total += x.n;
      const donos = new Set(
        ativas
          .filter(({ r: f }) => f.minDias <= x.atraso && x.atraso <= (f.maxDias ?? Infinity))
          .map(({ c }) => c.id),
      );
      if (donos.size > 1) {
        r.conflito += x.n;
        return;
      }
      if (donos.size === 0) {
        if (primeira != null && x.atraso < primeira) r.carencia += x.n;
        else if (x.dono) r.foraCom += x.n;
        else if (x.aguardando)
          r.aguardando.set(x.aguardando, (r.aguardando.get(x.aguardando) ?? 0) + x.n);
        else r.foraSem += x.n;
        return;
      }
      const dono = Array.from(donos)[0];
      if (x.dono === dono) r.naCarteira += x.n;
      else if (x.dono) r.comOutro += x.n;
      else if (x.aguardando)
        r.aguardando.set(x.aguardando, (r.aguardando.get(x.aguardando) ?? 0) + x.n);
      else r.sem += x.n;
    });
    return r;
  };

  // Falha da loja: o que a cobertura ja via (buraco entre faixas, conflito,
  // loja sem faixa) + cliente sem cobrador acima do teto da ultima faixa
  // (24/11: o teto 948 deixava centenas de fora e a tela dizia "todas
  // cobertas"). Carencia (abaixo da 1a faixa) e aguardando nao sao falha.
  const falhaPorLoja = useMemo(() => {
    const m = new Map<string, boolean>();
    cobertura.forEach(({ loja, ativas, problema }) => {
      if (problema) {
        m.set(loja.loja, true);
        return;
      }
      if (ativas.length === 0) return;
      const primeira = Math.min(...ativas.map(({ r }) => r.minDias));
      const foraSem = (clientesPorLoja.get(loja.loja) ?? []).some(
        (x) =>
          !x.dono &&
          !x.aguardando &&
          x.atraso >= primeira &&
          !ativas.some(
            ({ r }) => r.minDias <= x.atraso && x.atraso <= (r.maxDias ?? Infinity),
          ),
      );
      if (foraSem) m.set(loja.loja, true);
    });
    return m;
  }, [cobertura, clientesPorLoja]);
  const temFalha = (loja: string) => falhaPorLoja.get(loja) === true;
  const lojasComProblema = falhaPorLoja.size;
  // Resumo do topo: mesma base da tabela de cobertura (clientesPorLoja).
  // "Sem cobrador" so conta quem alguma faixa ativa cobre (a proxima rodada
  // entrega); quem esta fora das faixas (a vencer, carencia de 1-2 dias)
  // fica a parte -- nao e falha.
  const totaisCarteira = useMemo(() => {
    const ativasPorLoja = new Map(cobertura.map((c) => [c.loja.loja, c.ativas]));
    let emAberto = 0;
    let semCobrador = 0;
    let foraDasFaixas = 0;
    let aVencerOuCarencia = 0;
    let aguardando = 0;
    clientesPorLoja.forEach((lista, loja) => {
      const ativas = ativasPorLoja.get(loja) ?? [];
      const primeira = ativas.length
        ? Math.min(...ativas.map(({ r }) => r.minDias))
        : null;
      lista.forEach((x) => {
        emAberto += x.n;
        if (x.dono) return;
        if (x.aguardando) {
          aguardando += x.n;
          return;
        }
        // A vencer ou antes da 1a faixa da loja: ninguem deveria cobrar.
        if (x.atraso <= 0 || (primeira != null && x.atraso < primeira)) {
          aVencerOuCarencia += x.n;
          return;
        }
        const coberto = ativas.some(
          ({ r }) => r.minDias <= x.atraso && x.atraso <= (r.maxDias ?? Infinity),
        );
        if (coberto) semCobrador += x.n;
        else foraDasFaixas += x.n;
      });
    });
    return {
      emAberto,
      semCobrador,
      foraDasFaixas,
      // Problema de verdade: deveria ter cobrador e nao tem.
      problema: semCobrador + foraDasFaixas,
      aVencerOuCarencia,
      aguardando,
      carregado: mapaCarteira !== null,
    };
  }, [clientesPorLoja, mapaCarteira, cobertura]);
  // Regra salva depois da ultima rodada: ainda nao chegou nos clientes.
  const regraDepoisDaRodada = useMemo(() => {
    if (!ultimaRodada) return false;
    const corte = new Date(ultimaRodada.em).getTime();
    return collectorOverdueRanges.some(
      (r) => new Date(r.vigenteDesde).getTime() > corte,
    );
  }, [collectorOverdueRanges, ultimaRodada]);
  const verOQueMuda = () => {
    secaoSimularRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!simulando && !aplicando) void simular();
  };
  // Com problema, a tela ja abre filtrada neles; o gestor desmarca para ver tudo.
  const [soProblemas, setSoProblemas] = useState(true);
  // Filtro por cobrador na cobertura (pedido 2026-11-19): so as lojas onde
  // ele tem faixa (ativa ou inativa); as casas dos outros ficam apagadas.
  const [cobradorCobertura, setCobradorCobertura] = useState("");
  const coberturaVisivel = useMemo(() => {
    const ordenada = [...cobertura].sort(
      (a, b) =>
        Number(falhaPorLoja.get(b.loja.loja) === true) -
        Number(falhaPorLoja.get(a.loja.loja) === true),
    );
    const doCobrador = cobradorCobertura
      ? ordenada.filter((c) =>
          c.regras.some(({ c: cob }) => cob.id === cobradorCobertura),
        )
      : ordenada;
    const falha = (c: (typeof cobertura)[number]) =>
      falhaPorLoja.get(c.loja.loja) === true;
    return soProblemas && doCobrador.some(falha)
      ? doCobrador.filter(falha)
      : doCobrador;
  }, [cobertura, soProblemas, cobradorCobertura, falhaPorLoja]);

  const simular = async () => {
    setSimulando(true);
    setErroDistribuicao("");
    setResultado("");
    setConfirmAplicar(false);
    try {
      const { data, error } = await supabase.rpc("distribuicao_carteira_previa", {
        p_perfis: perfisDaDistribuicao(),
        p_retirar_de: Array.from(retirarDe),
      });
      if (error) throw error;
      setPrevia(data as unknown as Previa);
      setPreviaDesatualizada(false);
    } catch (err) {
      setErroDistribuicao(
        "Falha ao simular: " +
          (err instanceof Error ? err.message : ((err as { message?: string })?.message ?? String(err))),
      );
    } finally {
      setSimulando(false);
    }
  };

  // Cobradores sem regra que seguram clientes cobertos pelas regras: os
  // "retidos" desta simulacao + os ja marcados (depois de marcar e simular,
  // os clientes deles viram "troca" e deixam de aparecer como retidos).
  const outrasCarteiras = useMemo(() => {
    if (!previa) return [];
    const porCobrador = new Map<string, { clientes: number; travados: number }>();
    previa.itens.forEach((i) => {
      if (!i.cobrador_atual) return;
      const marcado = retirarDe.has(i.cobrador_atual);
      if (i.acao !== "retido" && !(marcado && i.acao === "troca")) return;
      const v = porCobrador.get(i.cobrador_atual) ?? { clientes: 0, travados: 0 };
      v.clientes++;
      if (i.bloqueado_por) v.travados++;
      porCobrador.set(i.cobrador_atual, v);
    });
    retirarDe.forEach((id) => {
      if (!porCobrador.has(id)) porCobrador.set(id, { clientes: 0, travados: 0 });
    });
    return Array.from(porCobrador.entries()).sort((a, b) => b[1].clientes - a[1].clientes);
  }, [previa, retirarDe]);

  const alternarRetirarDe = (id: string) => {
    setRetirarDe((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // A simulacao atual nao reflete a nova escolha: obriga simular de novo.
    setPreviaDesatualizada(true);
    setConfirmAplicar(false);
  };

  const resumo = useMemo(() => {
    if (!previa) return null;
    const itensPlano = previa.itens.filter((i) => i.acao !== "retido");
    const livres = itensPlano.filter((i) => !i.bloqueado_por);
    const porCobrador = new Map<string, { recebe: number; perde: number; travados: number }>();
    const get = (id: string) => {
      if (!porCobrador.has(id)) porCobrador.set(id, { recebe: 0, perde: 0, travados: 0 });
      return porCobrador.get(id)!;
    };
    itensPlano.forEach((i) => {
      if (i.bloqueado_por) {
        if (i.cobrador_atual) get(i.cobrador_atual).travados++;
        else if (i.cobrador_destino) get(i.cobrador_destino).travados++;
        return;
      }
      if (i.cobrador_destino) get(i.cobrador_destino).recebe++;
      if (i.cobrador_atual) get(i.cobrador_atual).perde++;
    });
    return {
      entra: livres.filter((i) => i.acao === "entra").length,
      troca: livres.filter((i) => i.acao === "troca").length,
      sai: livres.filter((i) => i.acao === "sai").length,
      travados: itensPlano.length - livres.length,
      semRegra: previa.sem_regra_por_loja.reduce((a, s) => a + s.clientes, 0),
      porCobrador: Array.from(porCobrador.entries()).sort(
        (a, b) => b[1].recebe + b[1].perde - (a[1].recebe + a[1].perde),
      ),
      totalMudancas: livres.length,
    };
  }, [previa]);

  const itensFiltrados = useMemo(() => {
    if (!previa) return [];
    return previa.itens.filter((i) =>
      filtroAcao === ""
        ? i.acao !== "retido"
        : filtroAcao === "travados"
          ? !!i.bloqueado_por
          : i.acao === filtroAcao && !i.bloqueado_por,
    );
  }, [previa, filtroAcao]);

  const aplicar = async () => {
    if (!confirmAplicar) {
      setConfirmAplicar(true);
      return;
    }
    setAplicando(true);
    setErroDistribuicao("");
    try {
      const { data, error } = await supabase.rpc("aplicar_distribuicao_carteira", {
        p_perfis: perfisDaDistribuicao(),
        p_retirar_de: Array.from(retirarDe),
      });
      if (error) throw error;
      const r = data as unknown as {
        clientes_atribuidos: number;
        clientes_retirados: number;
      };
      setConfirmAplicar(false);
      // A nova simulacao limpa o resultado: a mensagem vem depois dela
      // (antes sumia e o gestor ficava sem retorno).
      await Promise.all([simular(), carregarMapa()]);
      setResultado(
        `Distribuição aplicada: ${r.clientes_atribuidos} cliente(s) atribuído(s) e ${r.clientes_retirados} sem cobrador agora. As outras telas mostram a mudança na próxima consulta.`,
      );
    } catch (err) {
      setErroDistribuicao(
        "Falha ao aplicar: " +
          (err instanceof Error ? err.message : ((err as { message?: string })?.message ?? String(err))),
      );
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className={cardClass}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
          <Shuffle className="h-5 w-5 text-blue-600" />
          Distribuição da carteira
        </h2>
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
          Quem cobra cada loja e em que faixa de atraso. As regras salvas valem
          na distribuição automática de todo dia às {HORA_DISTRIBUICAO_AUTOMATICA};
          "Aplicar" só adianta.
        </p>
        {/* Resumo (24/11): a pergunta principal -- esta todo mundo coberto? */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl bg-gray-50 dark:bg-dark-bg px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Em aberto
            </div>
            <div className="text-lg sm:text-xl font-semibold tabular-nums text-gray-900 dark:text-dark-text">
              {totaisCarteira.carregado
                ? totaisCarteira.emAberto.toLocaleString("pt-BR")
                : mapaErro
                  ? "—"
                  : "…"}
            </div>
          </div>
          {/* Sem cobrador (24/11): o numero grande e so o que e problema
              (deveria ter cobrador e nao tem); a vencer/carencia e
              aguardando juridico ficam em cinza, so informacao. */}
          <div
            className={`rounded-xl px-3 py-2 ${
              totaisCarteira.problema > 0
                ? "bg-amber-50 dark:bg-amber-900/20"
                : "bg-gray-50 dark:bg-dark-bg"
            }`}
            title="Clientes em atraso que deveriam ter cobrador e não têm"
          >
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Sem cobrador
            </div>
            <div
              className={`text-lg sm:text-xl font-semibold tabular-nums ${
                totaisCarteira.problema > 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-gray-900 dark:text-dark-text"
              }`}
            >
              {totaisCarteira.carregado
                ? totaisCarteira.problema.toLocaleString("pt-BR")
                : mapaErro
                  ? "—"
                  : "…"}
            </div>
            {totaisCarteira.carregado && (
              <div className="mt-0.5 space-y-0.5 text-[11px]">
                {totaisCarteira.foraDasFaixas > 0 && (
                  <div
                    className="text-amber-800 dark:text-amber-300"
                    title="Atraso acima do teto da última faixa da loja (ou entre faixas): nenhuma regra cobre"
                  >
                    {totaisCarteira.foraDasFaixas.toLocaleString("pt-BR")} fora da faixa (acima do teto)
                  </div>
                )}
                {totaisCarteira.semCobrador > 0 && (
                  <div
                    className="text-amber-800 dark:text-amber-300"
                    title="Uma faixa cobre: a distribuição de amanhã às 7h entrega"
                  >
                    {totaisCarteira.semCobrador.toLocaleString("pt-BR")} entram na próxima rodada
                  </div>
                )}
                {totaisCarteira.aVencerOuCarencia > 0 && (
                  <div
                    className="text-gray-400"
                    title="Ainda não venceu ou está antes da primeira faixa da loja: ninguém deveria cobrar"
                  >
                    {totaisCarteira.aVencerOuCarencia.toLocaleString("pt-BR")} a vencer ou na carência
                  </div>
                )}
                {totaisCarteira.aguardando > 0 && (
                  <div
                    className="text-gray-400"
                    title="Saíram da carteira para o jurídico (Aguardando …): a distribuição não devolve a cobrador comum"
                  >
                    {totaisCarteira.aguardando.toLocaleString("pt-BR")} aguardando jurídico
                  </div>
                )}
              </div>
            )}
          </div>
          <div
            className={`rounded-xl px-3 py-2 ${
              lojasComProblema > 0
                ? "bg-red-50 dark:bg-red-900/20"
                : "bg-gray-50 dark:bg-dark-bg"
            }`}
            title="Lojas com trecho de atraso sem cobrador, conflito ou sem faixa"
          >
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Lojas com falha
            </div>
            <div
              className={`text-lg sm:text-xl font-semibold tabular-nums ${
                lojasComProblema > 0
                  ? "text-red-600 dark:text-red-300"
                  : "text-gray-900 dark:text-dark-text"
              }`}
            >
              {lojasComProblema}
            </div>
          </div>
        </div>
        {ultimaRodada && (
          <p className="mt-2 text-xs text-gray-500 dark:text-dark-text-secondary">
            Distribuição automática:{" "}
            {new Date(ultimaRodada.em).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {ultimaRodada.erro ? (
              <span className="text-red-600"> · falhou: {ultimaRodada.erro}</span>
            ) : (
              <>
                {" "}
                · {ultimaRodada.atribuidos} cliente
                {ultimaRodada.atribuidos !== 1 ? "s" : ""} atribuído
                {ultimaRodada.atribuidos !== 1 ? "s" : ""}
                {ultimaRodada.retirados > 0 &&
                  `, ${ultimaRodada.retirados} sem cobrador`}
              </>
            )}{" "}
            · próxima às {HORA_DISTRIBUICAO_AUTOMATICA}
          </p>
        )}
        <details className="mt-2 group">
          <summary className="cursor-pointer text-xs font-semibold text-blue-700 dark:text-blue-300 select-none">
            Como funciona
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-dark-text-secondary list-disc pl-5">
            <li>
              Atraso = parcela vencida mais antiga do cliente; a loja é a dessa
              parcela.
            </li>
            <li>
              Faixa inclusiva: "3 a 60" cobre o dia 60 e a seguinte começa no
              61. Fim vazio = sem limite.
            </li>
            <li>
              Um cobrador pode ter várias faixas. Dois cobradores não podem ter
              a mesma faixa ativa na mesma loja.
            </li>
            <li>
              A distribuição entrega os clientes sem cobrador a quem a faixa
              cobre e move quem saiu da faixa do próprio cobrador.
            </li>
            <li>
              Cliente na carteira de quem não tem regra só sai de lá se você
              marcar esse cobrador na simulação.
            </li>
            <li>Cliente com acordo ou agendamento ativo não é movido.</li>
            <li>Faixa inativa fica cadastrada, mas a distribuição ignora.</li>
          </ul>
        </details>
        {lojasErro && (
          <p className="mt-3 text-sm text-red-600">{lojasErro}</p>
        )}
      </div>

      {/* 1. Regras */}
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text flex items-center gap-2 mb-1">
              <Gauge className="h-4 w-4 text-gray-500" />
              1. Regras de cada cobrador
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              Faixa de atraso × lojas que cada cobrador atende. Clique no nome
              para ver e editar.
            </p>
          </div>
          {cobradoresComRegra.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setAbertos(
                  todosAbertos ? new Set() : new Set(cobradoresComRegra.map((c) => c.id)),
                )
              }
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
            >
              {todosAbertos ? "Fechar todos" : "Abrir todos"}
            </button>
          )}
        </div>
        <div className="space-y-3">
          {cobradoresComRegra.map((c) => {
            const regras = regrasPorCobrador.get(c.id) ?? [];
            const adicionando = novos.has(c.id);
            const linhas: { chave: string; regra?: CollectorOverdueRange }[] = [
              ...regras.map((regra) => ({ chave: regra.id, regra })),
              ...(adicionando ? [{ chave: chaveNova(c.id) }] : []),
            ];
            // Sanfona: fica aberto se o gestor abriu ou se ha algo em
            // andamento (faixa nova, edicao, erro) -- nunca esconde trabalho.
            const emAndamento =
              adicionando ||
              regras.some(
                (r) => editando.has(r.id) || alterada(r) || !!erroRegra[r.id],
              );
            const aberto = abertos.has(c.id) || emAndamento;
            return (
              <div
                key={c.id}
                className="border border-gray-200 dark:border-dark-border rounded-xl"
              >
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:bg-dark-bg ${aberto ? "rounded-t-xl" : "rounded-xl"}`}
                >
                  <button
                    type="button"
                    onClick={() => alternarAberto(c.id)}
                    disabled={emAndamento}
                    aria-expanded={aberto}
                    className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-left disabled:cursor-default"
                  >
                    <ChevronRight
                      className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
                    />
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${corPorCobrador.get(c.id)}`}
                    />
                    <span className="font-semibold text-gray-900 dark:text-dark-text truncate">
                      {c.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                      {USER_TYPE_LABELS[c.type]}
                      {carteiraTexto(c.id)}
                    </span>
                    {!aberto && regras.length > 0 && (
                      <span className="w-full sm:w-auto sm:ml-2 flex flex-wrap items-center gap-1 text-xs">
                        {regras.map((r) => (
                          <span
                            key={r.id}
                            className={`px-1.5 py-0.5 rounded-md border ${
                              r.ativa
                                ? "bg-white border-gray-200 text-gray-700 dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                                : "border-dashed border-gray-300 text-gray-400 line-through dark:border-dark-border"
                            }`}
                            title={`${faixaTexto(r.minDias, r.maxDias)} · ${r.lojas?.join(", ") ?? "Todas as lojas"}${r.ativa ? "" : " (inativa)"}`}
                          >
                            {faixaCurta(r)}
                          </span>
                        ))}
                        <span className="text-gray-500 dark:text-dark-text-secondary ml-1">
                          · {filaResumoCurto(regras)}
                        </span>
                      </span>
                    )}
                  </button>
                  {!adicionando && (
                    <button
                      type="button"
                      onClick={() => adicionarRegra(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/20 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar faixa
                    </button>
                  )}
                </div>
                {aberto && (
                <>
                <div className="divide-y divide-gray-100 dark:divide-dark-border">
                  {linhas.map(({ chave, regra }) => {
                    const nova = !regra;
                    const emEdicao = nova || editando.has(chave) || alterada(regra!);
                    if (regra && !emEdicao) {
                      return (
                        <div key={chave} className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span
                              className={`text-sm font-semibold whitespace-nowrap ${
                                regra.ativa
                                  ? "text-gray-900 dark:text-dark-text"
                                  : "text-gray-400 dark:text-dark-text-secondary"
                              }`}
                            >
                              {faixaTexto(regra.minDias, regra.maxDias)}
                            </span>
                            <span
                              className={`text-sm min-w-0 truncate ${
                                regra.ativa
                                  ? "text-gray-600 dark:text-dark-text-secondary"
                                  : "text-gray-400 dark:text-dark-text-secondary"
                              }`}
                              title={regra.lojas?.join(", ") ?? "Todas as lojas"}
                            >
                              {lojasTexto(regra.lojas)}
                            </span>
                            {!regra.ativa && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 dark:bg-dark-bg dark:text-dark-text-secondary dark:border-dark-border"
                                title="Fica cadastrada, mas a distribuição ignora"
                              >
                                Inativa
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => abrirEdicao(regra.id)}
                                disabled={salvando === chave}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-bg disabled:opacity-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void alternarAtiva(regra)}
                                disabled={salvando === chave}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                                  regra.ativa
                                    ? "text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
                                    : "text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/20"
                                }`}
                                title={
                                  regra.ativa
                                    ? "A distribuição deixa de usar esta faixa (fica cadastrada)"
                                    : "A distribuição volta a usar esta faixa"
                                }
                              >
                                {regra.ativa ? "Desativar" : "Ativar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void removerRegra(regra)}
                                onBlur={() =>
                                  setConfirmRemover((atual) => (atual === regra.id ? null : atual))
                                }
                                disabled={salvando === chave}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                                  confirmRemover === regra.id
                                    ? "bg-red-600 text-white hover:bg-red-700"
                                    : "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                }`}
                                title="Remover esta faixa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {confirmRemover === regra.id ? "Confirmar remoção" : "Remover"}
                              </button>
                            </div>
                          </div>
                          {erroRegra[chave] && (
                            <p className="mt-1.5 text-xs text-red-600">{erroRegra[chave]}</p>
                          )}
                        </div>
                      );
                    }
                    const r = rascunhoDaLinha(chave, regra);
                    return (
                      <div key={chave} className="px-4 py-3 bg-blue-50/40 dark:bg-blue-900/10">
                        <div className="grid grid-cols-2 md:grid-cols-[90px_90px_minmax(0,1fr)_auto] gap-2 items-center">
                          <input
                            type="number"
                            min={0}
                            value={r.min}
                            placeholder="De (dias)"
                            onChange={(e) => setRascunho(chave, { min: e.target.value }, r)}
                            className={inputClass}
                            aria-label={`Início da faixa de ${c.name}`}
                            autoFocus={nova}
                          />
                          <input
                            type="number"
                            min={0}
                            value={r.max}
                            placeholder="Até (vazio = sem limite)"
                            onChange={(e) => setRascunho(chave, { max: e.target.value }, r)}
                            className={inputClass}
                            aria-label={`Fim da faixa de ${c.name}`}
                          />
                          <div className="col-span-2 md:col-span-1">
                            <LojasSelect
                              lojas={lojas}
                              value={r.lojas}
                              onChange={(v) => setRascunho(chave, { lojas: v }, r)}
                            />
                          </div>
                          <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void salvarRegra(chave, c.id, regra)}
                              disabled={salvando === chave || (!nova && !alterada(regra!))}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => (nova ? cancelarNova(c) : fecharEdicao(chave))}
                              disabled={salvando === chave}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                        {/* Atalho: a faixa cobre todo atraso (de 1 dia em diante,
                            sem teto) nas lojas escolhidas. Conflito com outro
                            cobrador na mesma loja continua barrado ao salvar. */}
                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-700 dark:text-dark-text cursor-pointer">
                          <input
                            type="checkbox"
                            checked={r.min.trim() === "1" && r.max.trim() === ""}
                            onChange={(e) =>
                              setRascunho(
                                chave,
                                e.target.checked
                                  ? { min: "1", max: "" }
                                  : { min: "", max: "" },
                                r,
                              )
                            }
                            className="rounded border-gray-300"
                          />
                          Loja inteira (todos os atrasos, de 1 dia em diante)
                        </label>
                        {erroRegra[chave] && (
                          <p className="mt-1.5 text-xs text-red-600">{erroRegra[chave]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <FilaDoCobrador
                  nome={c.name}
                  regras={regras}
                  onSalvar={(pesos) => definirFilaCobranca(c.id, pesos)}
                />
                </>
                )}
              </div>
            );
          })}
          {cobradores.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              Nenhum cobrador ativo cadastrado.
            </p>
          )}
        </div>

        {cobradoresSemRegra.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-dark-border px-4 py-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-dark-text-secondary">
              Sem regra (carteira manual)
            </p>
            <p className="text-[11px] text-gray-500 dark:text-dark-text-secondary mb-2">
              A distribuição não entrega clientes a eles. Só perdem cliente se
              você marcar o nome na simulação.
            </p>
            <div className="flex flex-wrap gap-2">
              {cobradoresSemRegra.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs dark:bg-dark-bg dark:border-dark-border"
                >
                  <span className="font-medium text-gray-900 dark:text-dark-text">{c.name}</span>
                  <span className="text-gray-500 dark:text-dark-text-secondary">
                    {USER_TYPE_LABELS[c.type]}
                    {carteiraTexto(c.id)}
                  </span>
                  <button
                    type="button"
                    onClick={() => adicionarRegra(c)}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/20"
                    title={`Adicionar uma faixa para ${c.name}`}
                  >
                    <Plus className="h-3 w-3" />
                    Faixa
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Cobertura por loja */}
      <div className={cardClass}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
              <Store className="h-4 w-4 text-gray-500" />
              2. Cobertura por loja
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">
              Uma linha por loja e uma coluna por faixa de dias de atraso: em
              cada casa, quem cobra e quantos clientes em aberto a loja tem ali.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={cobradorCobertura}
            onChange={(e) => setCobradorCobertura(e.target.value)}
            aria-label="Filtrar cobertura por cobrador"
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs font-semibold text-gray-700 dark:text-dark-text"
          >
            <option value="">Cobrador: Todos</option>
            <CobradorOptions
              cobradores={cobradoresComRegra}
              rotulo={(c) => `Cobrador: ${c.name}`}
            />
          </select>
          {lojasComProblema > 0 && (
            <div
              role="group"
              aria-label="Quais lojas mostrar"
              className="inline-flex shrink-0 rounded-lg border border-gray-200 dark:border-dark-border p-0.5 text-xs font-semibold"
            >
              {[
                { valor: true, texto: `Com falha na cobertura (${lojasComProblema})` },
                { valor: false, texto: `Todas as lojas (${cobertura.length})` },
              ].map((op) => (
                <button
                  key={op.texto}
                  type="button"
                  aria-pressed={soProblemas === op.valor}
                  onClick={() => setSoProblemas(op.valor)}
                  className={`px-2.5 py-1 rounded-md ${
                    soProblemas === op.valor
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
                  }`}
                >
                  {op.texto}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
        {lojasComProblema > 0 && (
          <p className="-mt-1 mb-3 text-[11px] text-gray-500 dark:text-dark-text-secondary">
            Falha = cliente sem cobrador fora de toda faixa (entre faixas ou
            acima do teto da última), dois cobradores na mesma faixa, ou loja
            com clientes e nenhuma faixa ativa. Carência (antes da primeira
            faixa) e aguardando jurídico são só informação.
          </p>
        )}

        {lojasComProblema === 0 && lojas.length > 0 && (
          <p className="mb-3 p-2.5 rounded-lg bg-green-50 text-green-800 text-xs dark:bg-green-900/20 dark:text-green-300 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            Todas as lojas cobertas, sem conflito.
          </p>
        )}

        {/* Tabela loja x faixa (pedido 2026-11-19: primeiro barra + chips,
            depois um trecho por linha; o usuario preferiu as faixas como
            colunas). Casa: dono da faixa naquela loja e clientes em aberto
            com aquele atraso (mesma base do plano, ver clientesPorLoja).
            Amarelo = lacuna entre faixas ou loja sem cobrador (falha);
            cinza = antes da 1a / depois da ultima faixa (so informacao);
            vermelho = dois cobradores na mesma faixa. */}
        {coberturaVisivel.length > 0 && colunasCobertura.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[860px] table-fixed text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-[11px] text-gray-500 dark:text-dark-text-secondary">
                  <th className="sticky left-0 z-10 w-[200px] bg-white dark:bg-dark-bg-secondary py-2 px-2 text-left font-semibold border-b border-gray-200 dark:border-dark-border">
                    Loja
                  </th>
                  {colunasCobertura.map((col, idx) => {
                    const rotulo =
                      col.fim === Infinity ? `${col.ini}+` : `${col.ini} a ${col.fim}`;
                    const primeiraCol = idx === 0;
                    const ultimaCol = idx === colunasCobertura.length - 1;
                    return (
                      <th
                        key={col.ini}
                        className="py-2 px-2 text-center font-semibold whitespace-nowrap border-b border-gray-200 dark:border-dark-border"
                      >
                        <div className="inline-flex items-center gap-1">
                          {primeiraCol && inicioColunas > 0 && (
                            <button
                              type="button"
                              onClick={() => setInicioColunas((v) => Math.max(0, v - 1))}
                              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-dark-bg text-blue-700 dark:text-blue-300"
                              aria-label="Faixas de atraso menores"
                              title="Ver faixas de atraso menores"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {rotulo}
                          {ultimaCol && inicioColunas < maxInicioColunas && (
                            <button
                              type="button"
                              onClick={() =>
                                setInicioColunas((v) => Math.min(maxInicioColunas, v + 1))
                              }
                              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-dark-bg text-blue-700 dark:text-blue-300"
                              aria-label="Faixas de atraso maiores"
                              title="Ver faixas de atraso maiores (abre o que está somado aqui)"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="font-normal text-[10px] text-gray-400">dias</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {coberturaVisivel.map(({ loja, regras, ativas }) => {
                  const inativas = regras.filter(({ r }) => !r.ativa);
                  // Cobradores com faixa ativa na loja: aparecem uma vez aqui;
                  // a casa so repete nome quando difere (24/11, linhas baixas).
                  const cobradoresDaLoja = Array.from(
                    new Map(ativas.map(({ c }) => [c.id, c])).values(),
                  );
                  const unicoDaLoja =
                    cobradoresDaLoja.length === 1 ? cobradoresDaLoja[0] : null;
                  return (
                    <React.Fragment key={loja.loja}>
                    <tr className="group align-middle">
                      <td className="sticky left-0 z-10 bg-white group-even:bg-gray-50 dark:bg-dark-bg-secondary dark:group-even:bg-dark-bg h-[60px] py-1.5 px-2 border-b border-gray-100 dark:border-dark-border">
                        {/* Celula da loja em 3 linhas (24/11): nome + ✎,
                            cobrador, em atraso x a vencer. Faixas inativas
                            no title do nome. */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          {temFalha(loja.loja) && (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          )}
                          <span
                            className="min-w-0 truncate text-sm font-semibold leading-tight text-gray-900 dark:text-dark-text"
                            title={
                              loja.loja +
                              (inativas.length > 0
                                ? `
${inativas.length} faixa(s) inativa(s): ${inativas
                                    .map(({ c, r }) => `${c.name} (${faixaTexto(r.minDias, r.maxDias)})`)
                                    .join(", ")}`
                                : "")
                            }
                          >
                            {nomeCurtoLoja(loja.loja)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setLojaEditando((v) => (v === loja.loja ? null : loja.loja))
                            }
                            className={`ml-auto shrink-0 p-1 rounded-md ${
                              lojaEditando === loja.loja
                                ? "bg-blue-600 text-white"
                                : "text-gray-400 hover:text-blue-700 hover:bg-blue-50"
                            }`}
                            title="Editar quem cobra esta loja"
                            aria-label={`Editar quem cobra ${loja.loja}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-[11px] leading-tight text-gray-700 dark:text-dark-text truncate">
                          {cobradoresDaLoja.length === 0 ? (
                            <span className="text-gray-400">sem cobrador por regra</span>
                          ) : (
                            cobradoresDaLoja.map((c, k) => (
                              <span key={c.id} className="inline-flex items-center gap-1">
                                {k > 0 && <span className="text-gray-300 mx-0.5">·</span>}
                                <span className={`h-2 w-2 rounded-sm shrink-0 ${corPorCobrador.get(c.id)}`} />
                                {c.name.split(" ")[0]}
                              </span>
                            ))
                          )}
                        </div>
                        {/* Em atraso x a vencer (padrao: nunca um "em aberto"
                            unico); mesma base da tabela (carteira_mapa). */}
                        {(() => {
                          let atraso = 0;
                          let aVencer = 0;
                          (clientesPorLoja.get(loja.loja) ?? []).forEach((x) => {
                            if (x.atraso > 0) atraso += x.n;
                            else aVencer += x.n;
                          });
                          return (
                            <div className="text-[11px] leading-tight text-gray-500 tabular-nums truncate">
                              <span className="text-red-600 dark:text-red-400">
                                {atraso.toLocaleString("pt-BR")} em atraso
                              </span>
                              {aVencer > 0 && (
                                <span> · {aVencer.toLocaleString("pt-BR")} a vencer</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {colunasCobertura.map((col) => {
                        // Cobradores com faixa ativa que toca esta coluna.
                        const donos = Array.from(
                          new Map(
                            ativas
                              .filter(
                                ({ r }) =>
                                  r.minDias <= col.fim &&
                                  (r.maxDias ?? Infinity) >= col.ini,
                              )
                              .map(({ c }) => [c.id, c]),
                          ).values(),
                        );
                        const q = contaColuna(loja.loja, col, ativas);
                        const conflito = q.conflito > 0;
                        // Falha: cliente sem cobrador fora de toda faixa (buraco
                        // ou acima do teto), ou loja com clientes e sem faixa.
                        const falha = q.foraSem > 0 || q.sem > 0;
                        const apagada =
                          !!cobradorCobertura &&
                          !donos.some((d) => d.id === cobradorCobertura);
                        // Linha par (zebra): o mesmo fundo um tom acima.
                        const fundo = conflito
                          ? "bg-red-50 group-even:bg-red-100/70 dark:bg-red-900/15"
                          : falha
                            ? "bg-amber-50 group-even:bg-amber-100/70 dark:bg-amber-900/15"
                            : donos.length === 0
                              ? "bg-gray-50 group-even:bg-gray-100 dark:bg-dark-bg/40"
                              : "";
                        const detalhe = [
                          q.naCarteira > 0 && `${q.naCarteira} na carteira do dono da faixa`,
                          q.comOutro > 0 && `${q.comOutro} com outro cobrador`,
                          q.sem > 0 && `${q.sem} sem cobrador (entram na próxima rodada)`,
                          q.foraSem > 0 && `${q.foraSem} fora de toda faixa e sem cobrador`,
                          q.foraCom > 0 && `${q.foraCom} fora de toda faixa, com cobrador (carteira manual)`,
                          q.carencia > 0 && `${q.carencia} na carência (antes da primeira faixa)`,
                          ...Array.from(q.aguardando.entries()).map(
                            ([sit, n]) => `${n} em ${sit} (a distribuição não devolve a cobrador)`,
                          ),
                          conflito && `${q.conflito} em conflito: ${donos.map((d) => d.name).join(" e ")}`,
                        ]
                          .filter(Boolean)
                          .join("\n");
                        return (
                          <td
                            key={col.ini}
                            className={`h-[60px] py-1.5 px-1.5 text-center border-b border-l border-gray-100 dark:border-dark-border ${fundo || "group-even:bg-gray-50 dark:group-even:bg-dark-bg/40"} ${apagada ? "opacity-40" : ""}`}
                            title={detalhe || "Nenhum cliente nesta faixa de atraso"}
                          >
                            {/* Nome so quando difere do cobrador da loja. */}
                            {(donos.length === 0 ||
                              conflito ||
                              !unicoDaLoja ||
                              donos.some((d) => d.id !== unicoDaLoja.id)) && (
                              <div className="text-[10px] leading-tight whitespace-nowrap truncate">
                                {donos.length > 0 ? (
                                  <span
                                    className={conflito ? "font-semibold text-red-700 dark:text-red-300" : "text-gray-600 dark:text-dark-text-secondary"}
                                  >
                                    {donos.map((d) => d.name.split(" ")[0]).join(" e ")}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">ninguém cobra</span>
                                )}
                              </div>
                            )}
                            <div
                              className={`text-base font-bold leading-tight tabular-nums ${
                                q.total === 0 ? "text-gray-300 dark:text-dark-text-secondary" : "text-gray-900 dark:text-dark-text"
                              }`}
                            >
                              {q.total.toLocaleString("pt-BR")}
                            </div>
                            {/* Detalhe numa linha: falha em ambar, o resto cinza;
                                o texto completo fica no title da casa. */}
                            {(() => {
                              const nAguardando = Array.from(q.aguardando.values()).reduce(
                                (a, b) => a + b,
                                0,
                              );
                              const partes: { t: string; falha?: boolean }[] = [
                                ...(q.foraSem > 0 ? [{ t: `${q.foraSem} fora`, falha: true }] : []),
                                ...(q.sem > 0 ? [{ t: `${q.sem} sem cobr.`, falha: true }] : []),
                                ...(q.comOutro + q.foraCom > 0
                                  ? [{ t: `${q.comOutro + q.foraCom} c/ outro` }]
                                  : []),
                                ...(nAguardando > 0 ? [{ t: `${nAguardando} jurídico` }] : []),
                                ...(q.carencia > 0 ? [{ t: `${q.carencia} carência` }] : []),
                              ];
                              if (partes.length === 0) return null;
                              return (
                                <div className="text-[10px] leading-tight whitespace-nowrap truncate">
                                  {partes.map((p, k) => (
                                    <span key={p.t}>
                                      {k > 0 && <span className="text-gray-300"> · </span>}
                                      <span
                                        className={
                                          p.falha
                                            ? "font-semibold text-amber-700 dark:text-amber-300"
                                            : "text-gray-500"
                                        }
                                      >
                                        {p.t}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                        );
                      })}
                    </tr>
                    {lojaEditando === loja.loja && (
                      <tr>
                        <td
                          colSpan={colunasCobertura.length + 1}
                          className="p-2 border-b border-gray-100 dark:border-dark-border"
                        >
                          <EditorCoberturaLoja
                            loja={loja.loja}
                            faixasAtuais={ativas.map(({ c, r }) => ({
                              collectorId: c.id,
                              minDias: r.minDias,
                              maxDias: r.maxDias ?? null,
                            }))}
                            inativas={inativas.length}
                            cobradores={cobradores}
                            onSalvar={(faixas) => definirCoberturaLoja(loja.loja, faixas)}
                            onFechar={() => setLojaEditando(null)}
                          />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {lojas.length === 0 && !lojasErro && (
          <p className="text-sm text-gray-500">Carregando lojas…</p>
        )}
      </div>

      {/* 3. Simular e aplicar */}
      <div ref={secaoSimularRef} className={`${cardClass} scroll-mt-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
              <Play className="h-4 w-4 text-gray-500" />
              3. Simular e aplicar
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">
              A simulação não grava nada. Clientes com acordo ou agendamento
              ativo ficam travados com o cobrador atual.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void simular()}
            disabled={simulando || aplicando || selecionados?.size === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 dark:bg-dark-bg dark:border dark:border-dark-border"
          >
            <Play className="h-4 w-4" />
            {simulando ? "Simulando…" : previa ? "Simular de novo" : "Simular distribuição"}
          </button>
        </div>

        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-600 dark:text-dark-text-secondary mb-1.5">
            Distribuir para:
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelecionados(null);
                if (previa) setPreviaDesatualizada(true);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                selecionados === null
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text-secondary"
              }`}
            >
              Todos
            </button>
            {cobradores.map((c) => {
              const marcado = selecionados?.has(c.id) ?? false;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelecionados((prev) => {
                      const next = new Set(prev ?? []);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next.size === 0 ? null : next;
                    });
                    if (previa) setPreviaDesatualizada(true);
                  }}
                  title={USER_TYPE_LABELS[c.type]}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    marcado
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text-secondary"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          {selecionados && (
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-dark-text-secondary">
              Só entram os clientes que vão para, saem de ou trocam com os
              escolhidos. A distribuição automática da manhã continua valendo
              para todos.
            </p>
          )}
        </div>

        {lojasDesatualizadas.length > 0 && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm dark:bg-amber-900/20 dark:text-amber-200">
            <p className="font-semibold">
              Pagamentos possivelmente desatualizados
            </p>
            <p className="text-xs mt-0.5">
              Estas lojas não recebem baixa nova (importação ou sync) há mais
              de {DIAS_DADOS_ANTIGOS} dias. Se houver pagamento ainda não
              importado, a distribuição pode entregar cliente que já pagou.
              Importe antes de aplicar.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {lojasDesatualizadas.map((l) => (
                <span
                  key={l.loja}
                  className="px-2 py-0.5 rounded-full text-xs bg-white/70 border border-amber-200 dark:bg-dark-bg dark:border-amber-800"
                >
                  {l.loja}:{" "}
                  {l.dias == null
                    ? "nenhuma baixa importada"
                    : `última baixa há ${l.dias} dias`}
                </span>
              ))}
            </div>
          </div>
        )}
        {erroDistribuicao && (
          <p className="mb-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{erroDistribuicao}</p>
        )}
        {resultado && (
          <p
            ref={resultadoRef}
            role="status"
            className="mb-3 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2 dark:bg-green-900/20 dark:text-green-300"
          >
            <CheckCircle className="h-4 w-4 shrink-0" />
            {resultado}
          </p>
        )}
        {previaDesatualizada && (
          <p className="mb-3 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm dark:bg-amber-900/20 dark:text-amber-300">
            As regras mudaram depois desta simulação. Simule de novo antes de aplicar.
          </p>
        )}

        {previa && resumo && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {(
                [
                  ["entra", "Entram na carteira", resumo.entra, "text-blue-700"],
                  ["troca", "Trocam de cobrador", resumo.troca, "text-violet-700"],
                  ["sai", "Ficam sem cobrador", resumo.sai, "text-amber-700"],
                  ["travados", "Travados", resumo.travados, "text-gray-700"],
                ] as const
              ).map(([key, label, n, cor]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFiltroAcao(filtroAcao === key ? "" : key)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    filtroAcao === key
                      ? "border-blue-500 ring-1 ring-blue-500"
                      : "border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg"
                  }`}
                >
                  <div className={`text-2xl font-bold ${cor} dark:text-dark-text`}>{n}</div>
                  <div className="text-xs text-gray-500 dark:text-dark-text-secondary">{label}</div>
                </button>
              ))}
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-dark-border p-3">
                <div className="text-2xl font-bold text-gray-400">{resumo.semRegra}</div>
                <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  Sem cobrador e sem regra que cubra
                </div>
              </div>
            </div>

            {outrasCarteiras.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-900/20 dark:border-amber-800">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Existem clientes atrelados a outro cobrador nesta distribuição.
                  Deseja retirar de algum deles?
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                  São clientes que as regras cobrem, mas que estão na carteira de
                  um cobrador sem regra. Só os cobradores marcados perdem esses
                  clientes para o dono da regra; os demais ficam como estão.
                  Clientes que nenhuma regra cobre não saem de ninguém.
                </p>
                <div className="mt-3 space-y-1.5">
                  {outrasCarteiras.map(([id, v]) => (
                    <label
                      key={id}
                      className="flex items-center gap-2 text-sm text-gray-900 dark:text-dark-text cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={retirarDe.has(id)}
                        onChange={() => alternarRetirarDe(id)}
                        disabled={simulando || aplicando}
                        className="h-4 w-4 accent-amber-600"
                      />
                      <span className="font-medium">{nomePorId.get(id) ?? id}</span>
                      <span className="text-xs text-gray-600 dark:text-dark-text-secondary">
                        {v.clientes} cliente{v.clientes !== 1 ? "s" : ""}
                        {v.travados > 0 &&
                          ` (${v.travados} travado${v.travados !== 1 ? "s" : ""} por acordo/agendamento)`}
                        {retirarDe.has(id) && " · será retirado"}
                      </span>
                    </label>
                  ))}
                </div>
                {previaDesatualizada && (
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mt-2">
                    Simule de novo para ver o efeito da sua escolha.
                  </p>
                )}
              </div>
            )}

            {resumo.porCobrador.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 dark:text-dark-text-secondary uppercase">
                    <tr className="border-b border-gray-200 dark:border-dark-border">
                      <th className="text-left py-2 pr-3">Cobrador</th>
                      <th className="text-right py-2 px-3">Recebe</th>
                      <th className="text-right py-2 px-3">Perde</th>
                      <th className="text-right py-2 pl-3">Travados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.porCobrador.map(([id, v]) => (
                      <tr key={id} className="border-b border-gray-100 dark:border-dark-border">
                        <td className="py-2 pr-3 text-gray-900 dark:text-dark-text">
                          {nomePorId.get(id) ?? id}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-blue-700 dark:text-blue-300">
                          {v.recebe > 0 ? `+${v.recebe}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-amber-700 dark:text-amber-300">
                          {v.perde > 0 ? `−${v.perde}` : "—"}
                        </td>
                        <td className="py-2 pl-3 text-right text-gray-500">
                          {v.travados || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {previa.sem_regra_por_loja.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1.5">
                  Sem regra que cubra, por loja
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {previa.sem_regra_por_loja.map((s) => (
                    <span
                      key={s.loja ?? "sem-loja"}
                      className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 dark:bg-dark-bg dark:text-dark-text-secondary"
                    >
                      {s.loja ?? "Sem loja"}: {s.clientes}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {itensFiltrados.length > 0 && (
              <details className="rounded-xl border border-gray-200 dark:border-dark-border">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-dark-text">
                  Ver clientes ({itensFiltrados.length}
                  {filtroAcao ? ", filtrado" : ""})
                </summary>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-dark-bg text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Loja</th>
                        <th className="text-right px-3 py-2">Atraso</th>
                        <th className="text-left px-3 py-2">De</th>
                        <th className="text-left px-3 py-2">Para</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                      {itensFiltrados.slice(0, 300).map((i) => (
                        <tr key={i.documento}>
                          <td className="px-3 py-1.5 text-gray-900 dark:text-dark-text">
                            {i.cliente ?? i.documento}
                            {i.bloqueado_por && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-gray-500">
                                <Lock className="h-3 w-3" />
                                {BLOQUEIO_LABEL[i.bloqueado_por]}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-gray-600 dark:text-dark-text-secondary">
                            {i.loja ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right">{i.atraso}d</td>
                          <td className="px-3 py-1.5 text-gray-600 dark:text-dark-text-secondary">
                            {i.cobrador_atual ? nomePorId.get(i.cobrador_atual) : "Sem cobrador"}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-dark-text">
                            {i.cobrador_destino
                              ? nomePorId.get(i.cobrador_destino)
                              : "Sem cobrador"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {itensFiltrados.length > 300 && (
                    <p className="px-3 py-2 text-xs text-gray-500">
                      Mostrando 300 de {itensFiltrados.length}.
                    </p>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-gray-100 dark:border-dark-border">
              {confirmAplicar && (
                <span className="text-sm text-gray-700 dark:text-dark-text-secondary">
                  Isto muda o cobrador de {resumo.totalMudancas} cliente(s)
                  {selecionados &&
                    ` (só envolvendo: ${Array.from(selecionados)
                      .map((id) => nomePorId.get(id) ?? id)
                      .join(", ")})`}
                  {retirarDe.size > 0 &&
                    `, retirando clientes de: ${Array.from(retirarDe)
                      .map((id) => nomePorId.get(id) ?? id)
                      .join(", ")}`}
                  . Confirma?
                </span>
              )}
              {confirmAplicar && (
                <button
                  type="button"
                  onClick={() => setConfirmAplicar(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-dark-text-secondary"
                >
                  Voltar
                </button>
              )}
              <button
                type="button"
                onClick={() => void aplicar()}
                disabled={
                  aplicando || simulando || previaDesatualizada || resumo.totalMudancas === 0
                }
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
                  confirmAplicar ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {aplicando
                  ? "Aplicando…"
                  : confirmAplicar
                    ? `Confirmar: aplicar em ${resumo.totalMudancas} cliente(s)`
                    : "Aplicar distribuição"}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 text-right">
              {ACAO_LABEL.entra} · {ACAO_LABEL.troca} · {ACAO_LABEL.sai}. Cada
              mudança fica no histórico de atribuições com o motivo
              "distribuição por regra".
            </p>
          </div>
        )}
      </div>

      {/* Barra fixa (24/11): o efeito das regras salvas sempre a vista --
          valem na rodada automatica; "Ver o que muda" simula e leva a
          aplicacao. Some enquanto a simulacao esta aberta na tela. */}
      {!previa && (
        <div className="sticky bottom-0 z-20 -mx-1 sm:mx-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-gray-200 dark:border-dark-border bg-white/95 dark:bg-dark-bg-secondary/95 backdrop-blur px-4 py-3 shadow-lg">
            <p className="text-sm text-gray-700 dark:text-dark-text">
              {regraDepoisDaRodada ? (
                <>
                  <span className="font-semibold">Há regra alterada</span>{" "}
                  depois da última rodada: entra amanhã às{" "}
                  {HORA_DISTRIBUICAO_AUTOMATICA}.
                </>
              ) : (
                <>
                  As regras salvas entram na distribuição de amanhã às{" "}
                  {HORA_DISTRIBUICAO_AUTOMATICA}.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={verOQueMuda}
              disabled={simulando || aplicando || selecionados?.size === 0}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {simulando ? "Simulando…" : "Ver o que muda / aplicar agora"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarteiraDistribuicao;
