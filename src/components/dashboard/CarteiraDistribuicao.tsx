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
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useCollection } from "../../contexts/CollectionContext";
import { CollectorOverdueRange, User, UserType, isCollectorType } from "../../types";
import {
  USER_TYPE_LABELS,
  distribuicaoPerfisPayload,
} from "../../config/profiles";
import {
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
const cardClass =
  "bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 sm:p-6";

const faixaTexto = (min: number, max: number | null) =>
  max == null ? `${min}+ dias` : `${min} a ${max} dias`;

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

interface PesoRascunho {
  manha: string;
  tarde: string;
}

/**
 * Fila de Cobranca do cobrador (item 39): quantos clientes de cada faixa a
 * cada rodada da lista "Ligar", com manha/tarde opcional. Regras em
 * filters/filaCobranca.ts; so faz sentido com 2+ faixas ativas.
 */
const FilaDoCobrador: React.FC<{
  regras: CollectorOverdueRange[];
  onSalvar: (
    pesos: { regraId: string; peso: number; pesoTarde: number | null }[],
  ) => Promise<void>;
}> = ({ regras, onSalvar }) => {
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
      v[r.id] = { manha: String(manha), tarde: String(tarde) };
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

  const salvar = async (desligar = false) => {
    setErro("");
    // Desligar = lista vazia.
    const pesos: { regraId: string; peso: number; pesoTarde: number | null }[] = [];
    if (!desligar) {
      for (const r of ativas) {
        const m = numero(valores[r.id]?.manha);
        const t = turnos ? numero(valores[r.id]?.tarde) : null;
        if (Number.isNaN(m) || m < 0 || m > 99 || (t != null && (Number.isNaN(t) || t < 0 || t > 99))) {
          setErro("Use números inteiros de 0 a 99.");
          return;
        }
        pesos.push({ regraId: r.id, peso: m, pesoTarde: t });
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

  if (ativas.length < 2) return null;

  if (!editando) {
    return (
      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-dark-border flex items-start justify-between gap-3 bg-blue-50/40 dark:bg-blue-900/10 rounded-b-xl">
        <div className="min-w-0 text-xs text-gray-600 dark:text-dark-text-secondary">
          <span className="inline-flex items-center gap-1 font-semibold text-gray-800 dark:text-dark-text">
            <ListOrdered className="h-3.5 w-3.5" />
            Fila da lista "Ligar":
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
  }

  const inputPeso =
    "w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text";

  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-dark-border bg-blue-50/40 dark:bg-blue-900/10 rounded-b-xl space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-dark-text flex items-center gap-1.5">
          <ListOrdered className="h-4 w-4 text-blue-600" />
          Fila da lista "Ligar"
        </p>
        <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-0.5">
          Quantos clientes de cada faixa a cada rodada. O cobrador vê as faixas
          misturadas nessa proporção; dentro da faixa, maior atraso primeiro.
          Retornos e promessas continuam em "Para hoje". Faixa com 0 vai para o
          fim da lista.
        </p>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text cursor-pointer">
        <input
          type="checkbox"
          checked={turnos}
          onChange={(e) => setTurnos(e.target.checked)}
        />
        Separar manhã e tarde (muda às {FILA_VIRADA_HORA}h)
      </label>

      <table className="text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-dark-text-secondary">
            <th className="text-left font-medium pr-4 pb-1">Faixa (dias)</th>
            <th className="font-medium px-1 pb-1">{turnos ? "Manhã" : "Clientes"}</th>
            {turnos && <th className="font-medium px-1 pb-1">Tarde</th>}
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
                  className={inputPeso}
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
                    className={inputPeso}
                    aria-label={`Tarde da faixa ${rotulo(r)}`}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

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

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [previaDesatualizada, setPreviaDesatualizada] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmAplicar, setConfirmAplicar] = useState(false);
  const [erroDistribuicao, setErroDistribuicao] = useState("");
  const [resultado, setResultado] = useState<string>("");
  const [filtroAcao, setFiltroAcao] = useState<AcaoDistribuicao | "travados" | "">("");
  // Cobradores sem regra dos quais o GESTOR decidiu retirar os clientes que
  // as regras cobrem (p_retirar_de). Comeca vazio: a distribuicao nunca tira
  // de outra carteira sem essa escolha explicita.
  const [retirarDe, setRetirarDe] = useState<Set<string>>(new Set());

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
      limparLinha(chave);
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
      const buracos: string[] = [];
      let cursor = 1;
      for (const { r } of ativas) {
        if (cursor === Infinity) break;
        if (r.minDias > cursor) buracos.push(faixaTexto(cursor, r.minDias - 1));
        cursor = Math.max(cursor, r.maxDias == null ? Infinity : r.maxDias + 1);
      }
      if (cursor !== Infinity) buracos.push(`${cursor}+ dias`);
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
      return { loja: l, regras, ativas, buracos, conflitos };
    });
  }, [lojas, cobradores, collectorOverdueRanges]);

  // Escala do grafico: ate o maior teto definido + folga (min. 180 dias).
  const escalaMax = useMemo(() => {
    const tetos = collectorOverdueRanges
      .map((r) => r.maxDias ?? r.minDias)
      .filter((n) => Number.isFinite(n));
    return Math.max(180, ...tetos.map((t) => t + 30));
  }, [collectorOverdueRanges]);

  const simular = async () => {
    setSimulando(true);
    setErroDistribuicao("");
    setResultado("");
    setConfirmAplicar(false);
    try {
      const { data, error } = await supabase.rpc("distribuicao_carteira_previa", {
        p_perfis: distribuicaoPerfisPayload(),
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
        p_perfis: distribuicaoPerfisPayload(),
        p_retirar_de: Array.from(retirarDe),
      });
      if (error) throw error;
      const r = data as unknown as {
        clientes_atribuidos: number;
        clientes_retirados: number;
      };
      setResultado(
        `Distribuição aplicada: ${r.clientes_atribuidos} cliente(s) atribuído(s) e ${r.clientes_retirados} sem cobrador agora. As outras telas mostram a mudança na próxima consulta.`,
      );
      setConfirmAplicar(false);
      await simular();
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
          Defina a faixa de atraso e as lojas de cada cobrador. A distribuição
          entrega os clientes sem cobrador a quem a regra cobre e move quem saiu
          da regra do próprio cobrador. Cliente na carteira de quem não tem
          regra só sai de lá se você marcar esse cobrador na simulação. Cliente
          com acordo ou agendamento ativo não é movido. Nada muda sem você
          simular e confirmar.
        </p>
        {lojasErro && (
          <p className="mt-3 text-sm text-red-600">{lojasErro}</p>
        )}
      </div>

      {/* 1. Regras */}
      <div className={cardClass}>
        <h3 className="font-bold text-gray-900 dark:text-dark-text flex items-center gap-2 mb-1">
          <Gauge className="h-4 w-4 text-gray-500" />
          1. Regras de cada cobrador
        </h3>
        <p className="text-xs text-gray-500 dark:text-dark-text-secondary mb-4">
          Cada regra é uma faixa de atraso (pela parcela vencida mais antiga)
          em algumas lojas. Um cobrador pode ter várias. Faixa inclusiva: "3 a
          60" cobre o dia 60; a seguinte começa no 61. Fim vazio = sem limite.
          Dois cobradores não podem ter a mesma faixa ativa na mesma loja.
          Regra inativa fica cadastrada, mas a distribuição ignora.
        </p>
        <div className="space-y-3">
          {cobradores.map((c) => {
            const regras = regrasPorCobrador.get(c.id) ?? [];
            const adicionando = novos.has(c.id);
            const linhas: { chave: string; regra?: CollectorOverdueRange }[] = [
              ...regras.map((regra) => ({ chave: regra.id, regra })),
              ...(adicionando ? [{ chave: chaveNova(c.id) }] : []),
            ];
            return (
              <div
                key={c.id}
                className="border border-gray-200 dark:border-dark-border rounded-xl"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:bg-dark-bg rounded-t-xl">
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${corPorCobrador.get(c.id)}`}
                    />
                    <span className="font-semibold text-gray-900 dark:text-dark-text truncate">
                      {c.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-dark-text-secondary shrink-0">
                      {USER_TYPE_LABELS[c.type]}
                      {regras.length === 0 && " · sem regra (carteira manual)"}
                    </span>
                  </div>
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
                {linhas.length > 0 && (
                  <div className="divide-y divide-gray-100 dark:divide-dark-border">
                    {linhas.map(({ chave, regra }) => {
                      const r = rascunhoDaLinha(chave, regra);
                      const nova = !regra;
                      const dirty = nova || alterada(regra!);
                      return (
                        <div key={chave} className="px-4 py-2.5">
                          <div className="grid grid-cols-2 md:grid-cols-[90px_90px_minmax(0,1fr)_auto] gap-2 items-center">
                            <input
                              type="number"
                              min={0}
                              value={r.min}
                              placeholder="De (dias)"
                              onChange={(e) =>
                                setRascunho(chave, { min: e.target.value }, r)
                              }
                              className={inputClass}
                              aria-label={`Início da faixa de ${c.name}`}
                            />
                            <input
                              type="number"
                              min={0}
                              value={r.max}
                              placeholder="Até (vazio = sem limite)"
                              onChange={(e) =>
                                setRascunho(chave, { max: e.target.value }, r)
                              }
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
                              {dirty && (
                                <button
                                  type="button"
                                  onClick={() => void salvarRegra(chave, c.id, regra)}
                                  disabled={salvando === chave}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  Salvar
                                </button>
                              )}
                              {nova && (
                                <button
                                  type="button"
                                  onClick={() => cancelarNova(c)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
                                >
                                  Cancelar
                                </button>
                              )}
                              {regra && dirty && (
                                <button
                                  type="button"
                                  onClick={() => limparLinha(chave)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
                                >
                                  Desfazer
                                </button>
                              )}
                              {regra && !dirty && (
                                <button
                                  type="button"
                                  onClick={() => void alternarAtiva(regra)}
                                  disabled={salvando === chave}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 ${
                                    regra.ativa
                                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                                      : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 dark:bg-dark-bg dark:text-dark-text-secondary dark:border-dark-border"
                                  }`}
                                  title={
                                    regra.ativa
                                      ? "Ativa: a distribuição usa esta faixa. Clique para desativar."
                                      : "Inativa: fica cadastrada, mas a distribuição ignora. Clique para ativar."
                                  }
                                >
                                  {regra.ativa ? "Ativa" : "Inativa"}
                                </button>
                              )}
                              {regra && !dirty && (
                                <button
                                  type="button"
                                  onClick={() => void removerRegra(regra)}
                                  disabled={salvando === chave}
                                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                                    confirmRemover === regra.id
                                      ? "bg-red-600 text-white hover:bg-red-700"
                                      : "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  }`}
                                  title="Remover esta faixa"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {confirmRemover === regra.id
                                    ? "Confirmar remoção"
                                    : "Remover"}
                                </button>
                              )}
                            </div>
                          </div>
                          {erroRegra[chave] && (
                            <p className="mt-1.5 text-xs text-red-600">
                              {erroRegra[chave]}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <FilaDoCobrador
                  regras={regras}
                  onSalvar={(pesos) => definirFilaCobranca(c.id, pesos)}
                />
              </div>
            );
          })}
          {cobradores.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              Nenhum cobrador ativo cadastrado.
            </p>
          )}
        </div>
      </div>

      {/* 2. Cobertura por loja */}
      <div className={cardClass}>
        <h3 className="font-bold text-gray-900 dark:text-dark-text flex items-center gap-2 mb-1">
          <Store className="h-4 w-4 text-gray-500" />
          2. Cobertura por loja
        </h3>
        <p className="text-xs text-gray-500 dark:text-dark-text-secondary mb-4">
          Cada barra é uma faixa de um cobrador naquela loja (escala de 0 a{" "}
          {escalaMax} dias). Cliente num trecho sem cobertura fica sem
          cobrador.
        </p>
        <div className="space-y-4">
          {cobertura.map(({ loja, regras, ativas, buracos, conflitos }) => (
            <div key={loja.loja}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                <span className="font-semibold text-sm text-gray-900 dark:text-dark-text">
                  {loja.loja}
                </span>
                <span className="text-xs text-gray-500">
                  {loja.clientes_em_aberto} clientes em aberto
                </span>
              </div>
              <div className="space-y-1">
                {regras.length === 0 && (
                  <div className="h-5 rounded bg-amber-50 dark:bg-amber-900/20 border border-dashed border-amber-300 text-[11px] text-amber-700 dark:text-amber-300 flex items-center px-2">
                    Nenhum cobrador nesta loja
                  </div>
                )}
                {regras.map(({ c, r }) => {
                  const ini = Math.min(r.minDias, escalaMax);
                  const fim = Math.min(r.maxDias ?? escalaMax, escalaMax);
                  const left = (ini / escalaMax) * 100;
                  const width = Math.max(((fim - ini) / escalaMax) * 100, 1.5);
                  return (
                    <div
                      key={r.id}
                      className="relative h-5 rounded bg-gray-100 dark:bg-dark-bg"
                      title={`${c.name}: ${faixaTexto(r.minDias, r.maxDias)}${r.ativa ? "" : " (inativa)"}`}
                    >
                      <div
                        className={`absolute top-0 h-5 rounded ${r.ativa ? corPorCobrador.get(c.id) : "bg-gray-300 dark:bg-gray-600 opacity-60"} ${r.maxDias == null ? "rounded-r-none" : ""}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                      <span className="absolute inset-y-0 left-1.5 flex items-center text-[11px] font-semibold text-gray-800 dark:text-dark-text">
                        <span className="px-1 rounded bg-white/80 dark:bg-dark-bg-secondary/80">
                          {c.name} · {faixaTexto(r.minDias, r.maxDias)}
                          {!r.ativa && " · inativa"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {ativas.length === 0 && regras.length > 0 && (
                <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  Só regras inativas nesta loja: ninguém recebe clientes aqui.
                </p>
              )}
              {(buracos.length > 0 || conflitos.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {conflitos.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Conflito {d}
                    </span>
                  ))}
                  {ativas.length > 0 &&
                    buracos.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                      >
                        Sem cobertura: {b}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
          {lojas.length === 0 && !lojasErro && (
            <p className="text-sm text-gray-500">Carregando lojas…</p>
          )}
        </div>
      </div>

      {/* 3. Simular e aplicar */}
      <div className={cardClass}>
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
            disabled={simulando || aplicando}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 dark:bg-dark-bg dark:border dark:border-dark-border"
          >
            <Play className="h-4 w-4" />
            {simulando ? "Simulando…" : previa ? "Simular de novo" : "Simular distribuição"}
          </button>
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
          <p className="mb-3 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2 dark:bg-green-900/20 dark:text-green-300">
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
    </div>
  );
};

export default CarteiraDistribuicao;
