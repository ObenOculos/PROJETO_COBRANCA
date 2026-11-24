import React, { useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { CobradorOptions } from "../common/CobradorOptions";
import { UserType } from "../../types";

// Distribuicao, etapa 2 (2026-11-24): editar QUEM COBRA UMA LOJA, faixa por
// faixa. Grava tudo de uma vez (definir_cobertura_loja): a loja sai das
// regras compartilhadas com outras lojas e fica com as faixas daqui.
// "Sem limite" e opcao explicita (antes o gestor digitava 948, 1460, 99999 e
// os clientes acima do numero ficavam sem cobrador).

export interface FaixaLoja {
  collectorId: string;
  minDias: number;
  maxDias: number | null;
}

interface Linha {
  chave: number;
  collectorId: string;
  min: string;
  /** "" = sem limite */
  max: string;
}

// Atalhos de faixa (o gestor ainda pode digitar qualquer numero).
const ATALHOS: { rotulo: string; min: number; max: number | null }[] = [
  { rotulo: "Todos os atrasos", min: 1, max: null },
  { rotulo: "3+ dias", min: 3, max: null },
  { rotulo: "1–60", min: 1, max: 60 },
  { rotulo: "61–90", min: 61, max: 90 },
  { rotulo: "91–365", min: 91, max: 365 },
  { rotulo: "366+", min: 366, max: null },
];

let proximaChave = 1;

const EditorCoberturaLoja: React.FC<{
  loja: string;
  faixasAtuais: FaixaLoja[];
  inativas: number;
  cobradores: { id: string; name: string; type?: UserType | null }[];
  onSalvar: (faixas: FaixaLoja[]) => Promise<void>;
  onFechar: () => void;
}> = ({ loja, faixasAtuais, inativas, cobradores, onSalvar, onFechar }) => {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    faixasAtuais.length > 0
      ? faixasAtuais
          .slice()
          .sort((a, b) => a.minDias - b.minDias)
          .map((f) => ({
            chave: proximaChave++,
            collectorId: f.collectorId,
            min: String(f.minDias),
            max: f.maxDias == null ? "" : String(f.maxDias),
          }))
      : [{ chave: proximaChave++, collectorId: "", min: "1", max: "" }],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudar = (chave: number, campos: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));

  const validar = (): FaixaLoja[] | string => {
    const faixas: FaixaLoja[] = [];
    for (const l of linhas) {
      if (!l.collectorId) return "Escolha o cobrador de cada faixa.";
      const min = Number(l.min);
      if (l.min.trim() === "" || !Number.isInteger(min) || min < 0)
        return "Informe o início de cada faixa (0 ou mais).";
      const max = l.max.trim() === "" ? null : Number(l.max);
      if (max != null && (!Number.isInteger(max) || max <= min))
        return "O fim da faixa deve ser maior que o início, ou deixe sem limite.";
      faixas.push({ collectorId: l.collectorId, minDias: min, maxDias: max });
    }
    const ordenadas = [...faixas].sort((a, b) => a.minDias - b.minDias);
    for (let i = 1; i < ordenadas.length; i++) {
      const ant = ordenadas[i - 1];
      if ((ant.maxDias ?? Infinity) >= ordenadas[i].minDias)
        return "Duas faixas se sobrepõem. Ajuste os dias para cada atraso ter um cobrador só.";
    }
    return faixas;
  };

  const salvar = async () => {
    const r = validar();
    if (typeof r === "string") {
      setErro(r);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await onSalvar(r);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  // Aviso de buraco entre faixas / teto (nao impede salvar).
  const aviso = (() => {
    const r = validar();
    if (typeof r === "string" || r.length === 0) return null;
    const ord = [...r].sort((a, b) => a.minDias - b.minDias);
    for (let i = 1; i < ord.length; i++) {
      const fimAnt = ord[i - 1].maxDias;
      if (fimAnt != null && ord[i].minDias > fimAnt + 1)
        return `Entre ${fimAnt + 1} e ${ord[i].minDias - 1} dias ninguém cobra.`;
    }
    const ultima = ord[ord.length - 1];
    if (ultima.maxDias != null)
      return `Acima de ${ultima.maxDias} dias ninguém cobra. Para cobrar todos, deixe a última faixa sem limite.`;
    return null;
  })();

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10 p-3 sm:p-4 space-y-3 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">
            Quem cobra {loja}
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
            Uma linha por faixa de atraso. Vale só para esta loja e entra na
            distribuição automática de amanhã (ou ao aplicar agora).
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {linhas.map((l) => (
          <div
            key={l.chave}
            className="rounded-lg bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border p-2.5 space-y-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
              <select
                value={l.collectorId}
                onChange={(e) => mudar(l.chave, { collectorId: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm"
                aria-label="Cobrador da faixa"
              >
                <option value="">Escolha o cobrador…</option>
                <CobradorOptions cobradores={cobradores} />
              </select>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-gray-500 text-xs">de</span>
                <input
                  type="number"
                  min={0}
                  value={l.min}
                  onChange={(e) => mudar(l.chave, { min: e.target.value })}
                  className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm tabular-nums"
                  aria-label="Início da faixa (dias)"
                />
                <span className="text-gray-500 text-xs">até</span>
                <input
                  type="number"
                  min={0}
                  value={l.max}
                  placeholder="sem limite"
                  onChange={(e) => mudar(l.chave, { max: e.target.value })}
                  className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm tabular-nums"
                  aria-label="Fim da faixa (dias); vazio = sem limite"
                />
                <span className="text-gray-500 text-xs">dias</span>
                <button
                  type="button"
                  onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                  className="ml-1 p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                  aria-label="Remover esta faixa"
                  title="Remover esta faixa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-dark-text mr-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={l.max.trim() === ""}
                  onChange={(e) =>
                    mudar(l.chave, {
                      max: e.target.checked ? "" : String(Math.max(Number(l.min) || 0, 0) + 30),
                    })
                  }
                  className="rounded border-gray-300"
                />
                sem limite
              </label>
              {ATALHOS.map((a) => (
                <button
                  key={a.rotulo}
                  type="button"
                  onClick={() =>
                    mudar(l.chave, {
                      min: String(a.min),
                      max: a.max == null ? "" : String(a.max),
                    })
                  }
                  className="px-2 py-0.5 rounded-full border border-gray-200 dark:border-dark-border text-[11px] text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50"
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
          </div>
        ))}
        {linhas.length === 0 && (
          <p className="text-xs text-amber-800">
            Sem faixas: a loja fica sem cobrador por regra.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            const fimUltima = linhas.length
              ? Math.max(...linhas.map((l) => Number(l.max) || 0))
              : 0;
            setLinhas((ls) => [
              ...ls,
              {
                chave: proximaChave++,
                collectorId: "",
                min: String(fimUltima > 0 ? fimUltima + 1 : 1),
                max: "",
              },
            ]);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Dividir por atraso (outra faixa)
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar loja"}
          </button>
        </div>
      </div>

      {aviso && <p className="text-xs text-amber-800 dark:text-amber-300">{aviso}</p>}
      {inativas > 0 && (
        <p className="text-xs text-gray-500">
          {inativas} faixa{inativas !== 1 ? "s" : ""} inativa{inativas !== 1 ? "s" : ""} desta
          loja sai{inativas !== 1 ? "em" : ""} ao salvar (fica{inativas !== 1 ? "m" : ""} no histórico).
        </p>
      )}
      {erro && <p className="text-sm text-red-700">{erro}</p>}
    </div>
  );
};

export default EditorCoberturaLoja;
