import React, { useState, FormEvent, useEffect, useMemo } from "react";
import { Save, Plus, Trash2, ChevronDown, Lock } from "lucide-react";
import { User } from "../../types";
import { supabase } from "../../lib/supabase";
import { useCollection } from "../../contexts/CollectionContext";
import { Modal } from "../Modal";
import { isWalletCollectorType } from "../../config/profiles";
import { valorRecebidoTotal } from "../../filters/sales";
import {
  FaixaComissao,
  FormaComissao,
  calcularComissao,
  ordenarFaixas,
  validarFaixas,
} from "../../filters/comissao";
import { formatCurrency } from "../../utils/formatters";
import { metaDoMes } from "../../filters/metas";
import { todayLocalStr } from "../../config/visitStatus";

interface MonthlyGoalEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Cobrador ou gestor (gestor: meta sobre o recebido da equipe dele). */
  collector: User | null;
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Faixa na tela: textos como o gestor digita ("90000", "0,889" ou "100").
interface FaixaForm {
  meta: string;
  valor: string;
}

const parseNumero = (s: string): number => {
  const limpo = s.trim().replace(/\s/g, "");
  if (!limpo) return NaN;
  // "90.000,50" -> 90000.5 ; "0,889" -> 0.889 ; "0.889" -> 0.889
  const normal = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  return Number(normal);
};

const formatNum = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** "YYYY-MM-01" deslocado n meses a partir de "YYYY-MM". */
const mesDeslocado = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
};

const rotuloMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
};

const inputClass =
  "w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-dark-bg/50";

const MonthlyGoalEditModal: React.FC<MonthlyGoalEditModalProps> = ({
  isOpen,
  onClose,
  collector,
}) => {
  const { salePayments, managerCollectorLinks, monthlyGoals, salvarMetasDoMes } =
    useCollection();

  const mesAtualYM = todayLocalStr().slice(0, 7);
  const mesAtual = `${mesAtualYM}-01`;
  // 3 meses para trás (consulta) e 3 para frente (planejar).
  const opcoesMes = useMemo(
    () => Array.from({ length: 7 }, (_, i) => mesDeslocado(mesAtualYM, i - 3)),
    [mesAtualYM],
  );

  const [mes, setMes] = useState(mesAtual);
  const [faixas, setFaixas] = useState<FaixaForm[]>([]);
  const [forma, setForma] = useState<FormaComissao>("percentual");
  const [visitsGoal, setVisitsGoal] = useState("");
  const [mostrarAtendimentos, setMostrarAtendimentos] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Mes em que a meta que vale em `mes` foi gravada (vigencia: vale dali em
  // diante ate a proxima alteracao). null = sem meta.
  const [mesOrigem, setMesOrigem] = useState<string | null>(null);

  const isManager = collector?.type === "manager";
  const isWallet = isWalletCollectorType(collector?.type);
  const somenteLeitura = mes < mesAtual;
  const baseLabel = isManager ? "recebido da equipe" : "recebido no mês";

  useEffect(() => {
    if (isOpen) setMes(mesAtual);
  }, [isOpen, mesAtual]);

  // So a linha que vale no mes (nao a lista inteira) dispara recarga: um
  // refresh de monthlyGoals no meio da edicao nao apaga o que foi digitado.
  const vigente = useMemo(
    () =>
      collector ? metaDoMes(monthlyGoals, collector.id, mes.slice(0, 7)) : undefined,
    [monthlyGoals, collector, mes],
  );
  const vigenteKey = vigente
    ? `${vigente.id}|${vigente.month}|${vigente.updated_at}`
    : "";

  useEffect(() => {
    if (!collector || !isOpen) return;
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    const origem = vigente ? `${vigente.month.slice(0, 7)}-01` : null;
    setMesOrigem(origem);
    (async () => {
      const faixasRes = origem
        ? await supabase
            .from("comissao_faixas")
            .select("meta_valor, forma, valor")
            .eq("user_id", collector.id)
            .eq("month", origem)
            .is("substituida_em", null)
            .order("meta_valor")
        : { data: [], error: null };
      const goalRes = { data: vigente ?? null };
      if (cancelado) return;
      if (faixasRes.error) {
        setErro("Não foi possível carregar as metas deste mês.");
        setFaixas([]);
        setVisitsGoal("");
      } else {
        const lidas = (faixasRes.data ?? []).map((f) => ({
          meta: String(Number(f.meta_valor)),
          valor: formatNum(Number(f.valor)),
        }));
        setForma(
          faixasRes.data?.[0]?.forma === "fixo" ? "fixo" : "percentual",
        );
        // Mês antigo sem faixas mas com meta de valor (antes do item 72).
        const pg = Number(goalRes.data?.payments_goal ?? 0);
        setFaixas(
          lidas.length > 0
            ? lidas
            : pg > 0
              ? [{ meta: String(pg), valor: "0" }]
              : [],
        );
        const vg = Number(goalRes.data?.visits_goal ?? 0);
        setVisitsGoal(vg > 0 ? String(vg) : "");
        setMostrarAtendimentos(vg > 0);
      }
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vigenteKey cobre `vigente`
  }, [collector, isOpen, mes, vigenteKey]);

  // Média recebida nos 3 meses anteriores ao mês escolhido (referência).
  const media3Meses = useMemo(() => {
    if (!collector || !isOpen) return 0;
    const ids = isManager
      ? new Set(
          managerCollectorLinks
            .filter((l) => l.managerId === collector.id)
            .map((l) => l.collectorId),
        )
      : new Set([collector.id]);
    const ym = mes.slice(0, 7);
    const janela = new Set(
      [1, 2, 3].map((n) => mesDeslocado(ym, -n).slice(0, 7)),
    );
    const total = salePayments
      .filter(
        (p) => ids.has(p.collectorId) && janela.has(p.paymentDate.slice(0, 7)),
      )
      .reduce((s, p) => s + valorRecebidoTotal(p), 0);
    return Math.round(total / 3);
  }, [collector, isOpen, isManager, managerCollectorLinks, salePayments, mes]);

  const faixasNum: FaixaComissao[] = faixas.map((f) => ({
    metaValor: parseNumero(f.meta),
    valor: parseNumero(f.valor),
  }));
  const faixasValidas = faixasNum.every(
    (f) => Number.isFinite(f.metaValor) && Number.isFinite(f.valor),
  );
  const problema = !faixasValidas
    ? "Preencha meta e comissão de todas as faixas."
    : validarFaixas(faixasNum, forma);

  const atualizarFaixa = (i: number, campo: keyof FaixaForm, valor: string) =>
    setFaixas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  const adicionarFaixa = () =>
    setFaixas((fs) => {
      const ultima = fs.length ? parseNumero(fs[fs.length - 1].meta) : NaN;
      const sugestao = Number.isFinite(ultima)
        ? String(Math.round(ultima * 1.2))
        : media3Meses > 0
          ? String(media3Meses)
          : "";
      return [...fs, { meta: sugestao, valor: "" }];
    });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!collector || somenteLeitura || problema) return;
    const vg = visitsGoal.trim() ? Math.round(parseNumero(visitsGoal)) : 0;
    if (!Number.isFinite(vg) || vg < 0) {
      setErro("Meta de atendimentos inválida.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await salvarMetasDoMes(
        collector.id,
        mes,
        vg,
        forma,
        ordenarFaixas(faixasNum),
      );
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar metas.");
    } finally {
      setSalvando(false);
    }
  };

  if (!collector) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Metas de ${collector.name}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-dark-text-secondary mb-1">
              Mês
            </label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className={`${inputClass} w-44`}
            >
              {opcoesMes.map((m) => (
                <option key={m} value={m}>
                  {rotuloMes(m)}
                </option>
              ))}
            </select>
          </div>
          {media3Meses > 0 && (
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              Média dos 3 meses anteriores:{" "}
              <span className="font-semibold text-gray-700 dark:text-dark-text">
                {formatCurrency(media3Meses, false)}
              </span>{" "}
              {isManager ? "(equipe)" : ""}
            </p>
          )}
        </div>

        {!carregando && !somenteLeitura && (
          <p className="-mt-2 text-xs text-gray-500 dark:text-dark-text-secondary">
            {mesOrigem && mesOrigem !== mes
              ? `Meta vinda de ${rotuloMes(mesOrigem)}. Salvando, a alteração vale de ${rotuloMes(mes)} em diante.`
              : `Vale de ${rotuloMes(mes)} em diante, até a próxima alteração.`}
          </p>
        )}

        {somenteLeitura && (
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-dark-bg px-3 py-2 text-xs text-gray-600 dark:text-dark-text-secondary">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Mês encerrado: as metas ficam só para consulta.
          </div>
        )}

        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                Faixas de comissão
              </h4>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                {forma === "percentual"
                  ? `Vale o % da maior faixa atingida sobre todo o ${baseLabel}.`
                  : "Vale o valor da maior faixa atingida."}{" "}
                Abaixo da 1ª faixa não há comissão.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border p-0.5 text-xs font-semibold">
              {(
                [
                  ["percentual", "% do recebido"],
                  ["fixo", "Valor fixo"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  disabled={somenteLeitura}
                  onClick={() => setForma(v)}
                  className={`px-2.5 py-1 rounded-md transition-colors disabled:cursor-default ${
                    forma === v
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {carregando ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Carregando…
            </p>
          ) : (
            <div className="space-y-2">
              {faixas.length > 0 && (
                <div className="grid grid-cols-[1fr_7rem_2rem] gap-2 px-1 text-[11px] font-semibold text-gray-400">
                  <span>Meta ({baseLabel})</span>
                  <span>
                    {forma === "percentual" ? "Comissão (%)" : "Comissão (R$)"}
                  </span>
                  <span />
                </div>
              )}
              {faixas.map((f, i) => {
                const meta = parseNumero(f.meta);
                const valor = parseNumero(f.valor);
                // Só no %: quanto dá exatamente na meta (no fixo é o próprio valor).
                const ganho =
                  forma === "percentual" &&
                  Number.isFinite(meta) &&
                  Number.isFinite(valor)
                    ? calcularComissao(meta, [{ metaValor: meta, valor }], forma)
                    : null;
                return (
                  <div key={i}>
                    <div className="grid grid-cols-[1fr_7rem_2rem] gap-2 items-center">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                          R$
                        </span>
                        <input
                          inputMode="decimal"
                          value={f.meta}
                          onChange={(e) =>
                            atualizarFaixa(i, "meta", e.target.value)
                          }
                          disabled={somenteLeitura}
                          className={`${inputClass} pl-9 font-semibold`}
                          placeholder="90000"
                        />
                      </div>
                      <div className="relative">
                        {forma === "fixo" && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                            R$
                          </span>
                        )}
                        <input
                          inputMode="decimal"
                          value={f.valor}
                          onChange={(e) =>
                            atualizarFaixa(i, "valor", e.target.value)
                          }
                          disabled={somenteLeitura}
                          className={`${inputClass} text-right font-semibold ${forma === "fixo" ? "pl-9" : "pr-7"}`}
                          placeholder={forma === "fixo" ? "100" : "0,889"}
                        />
                        {forma === "percentual" && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                            %
                          </span>
                        )}
                      </div>
                      {!somenteLeitura ? (
                        <button
                          type="button"
                          onClick={() =>
                            setFaixas((fs) => fs.filter((_, j) => j !== i))
                          }
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Remover faixa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                    {ganho !== null && meta > 0 && (
                      <p className="mt-0.5 px-1 text-[11px] text-gray-400">
                        Batendo {formatCurrency(meta, false)}: comissão de{" "}
                        {formatCurrency(ganho)}
                      </p>
                    )}
                  </div>
                );
              })}

              {faixas.length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-200 dark:border-dark-border py-4 text-center text-xs text-gray-400">
                  Sem meta neste mês.
                </p>
              )}

              {!somenteLeitura && (
                <button
                  type="button"
                  onClick={adicionarFaixa}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar faixa
                </button>
              )}
            </div>
          )}
        </div>

        {!isManager && (
          <div className="border-t border-gray-100 dark:border-dark-border pt-3">
            <button
              type="button"
              onClick={() => setMostrarAtendimentos((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-dark-text-secondary"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${mostrarAtendimentos ? "" : "-rotate-90"}`}
              />
              Meta de {isWallet ? "atendimentos" : "visitas"} (opcional)
            </button>
            {mostrarAtendimentos && (
              <input
                inputMode="numeric"
                value={visitsGoal}
                onChange={(e) => setVisitsGoal(e.target.value)}
                disabled={somenteLeitura}
                className={`${inputClass} mt-2 w-40`}
                placeholder="0"
              />
            )}
          </div>
        )}

        {!somenteLeitura && !carregando && problema && faixas.length > 0 && (
          <p className="text-xs text-amber-600">{problema}</p>
        )}
        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-dark-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg rounded-xl transition-all"
          >
            {somenteLeitura ? "Fechar" : "Cancelar"}
          </button>
          {!somenteLeitura && (
            <button
              type="submit"
              disabled={salvando || carregando || !!problema}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold transition-all"
            >
              <Save className="w-4 h-4" />
              {salvando ? "Salvando…" : "Salvar metas"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default MonthlyGoalEditModal;
