import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Info,
  Scale,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { formatCurrency } from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
import {
  classificarConferencia,
  ConferenciaSituacao,
  CONFERENCIA_SITUACAO_DICA,
  CONFERENCIA_SITUACAO_LABEL,
} from "../../filters/conferenciaRecebimentos";

// Item 50: conferencia mensal do gestor -- base (Ciclone) x registrado pelos
// cobradores no app. Dados da RPC conferencia_recebimentos (migration
// 20261111000002), uma linha por cliente.

interface LinhaRpc {
  cobrador_id: string | null;
  carteira_id: string | null;
  documento: string | null;
  cliente: string | null;
  base_valor: number | string;
  base_parcelas: number;
  app_valor: number | string;
  app_lancamentos: number;
  app_cedrus: number | string;
}

interface LinhaCliente {
  chave: string;
  cobradorId: string | null;
  carteiraId: string | null;
  documento: string;
  cliente: string;
  baseValor: number;
  baseParcelas: number;
  appValor: number;
  appLancamentos: number;
  appCedrus: number;
  situacao: ConferenciaSituacao;
}

interface GrupoCobrador {
  id: string; // "" = sem cobrador
  nome: string;
  baseValor: number;
  appValor: number;
  appCedrus: number;
  contagem: Record<ConferenciaSituacao, number>;
  clientes: LinhaCliente[];
}

const SITUACOES: ConferenciaSituacao[] = [
  "sem_registro_app",
  "base_maior",
  "sem_baixa_base",
  "app_maior",
  "confere",
];

const SITUACAO_TONE: Record<ConferenciaSituacao, string> = {
  confere:
    "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300",
  sem_registro_app:
    "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  base_maior:
    "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  sem_baixa_base:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  app_maior: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
};

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-11" -> { inicio: "2026-11-01", fim: "2026-11-30" }, sem Date local. */
const limitesDoMes = (mes: string): { inicio: string; fim: string } => {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { inicio: `${y}-${mm}-01`, fim: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` };
};

const somarMes = (mes: string, delta: number): string => {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

const rotuloMes = (mes: string): string => {
  const [y, m] = mes.split("-").map(Number);
  const nome = MESES[m - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${y}`;
};

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

const contagemVazia = (): Record<ConferenciaSituacao, number> => ({
  confere: 0,
  sem_registro_app: 0,
  sem_baixa_base: 0,
  app_maior: 0,
  base_maior: 0,
});

const Diferenca: React.FC<{ valor: number }> = ({ valor }) => {
  if (Math.abs(valor) < 0.005)
    return <span className="text-gray-400 dark:text-dark-text-secondary">—</span>;
  return (
    <span
      className={
        valor > 0
          ? "text-blue-600 dark:text-blue-400"
          : "text-red-600 dark:text-red-400"
      }
    >
      {valor > 0 ? "+" : ""}
      {formatCurrency(valor)}
    </span>
  );
};

const ConferenciaRecebimentos: React.FC = () => {
  const { users } = useCollection();
  const [mes, setMes] = useState(() => todayLocalStr().slice(0, 7));
  const [linhas, setLinhas] = useState<LinhaRpc[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<ConferenciaSituacao | "todas">("todas");
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setLinhas(null);
    setErro(null);
    const { inicio, fim } = limitesDoMes(mes);
    (async () => {
      try {
        const dados = await fetchAllRows<LinhaRpc>((from, to) =>
          supabase
            .rpc("conferencia_recebimentos", { p_inicio: inicio, p_fim: fim })
            // Ordem unica para a paginacao (CLAUDE.md): documento + cobrador.
            .order("documento")
            .order("cobrador_id")
            .range(from, to),
        );
        if (!cancelado) setLinhas(dados);
      } catch (e) {
        console.error("Erro ao carregar conferência de recebimentos:", e);
        if (!cancelado)
          setErro(e instanceof Error ? e.message : "Falha ao carregar");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [mes]);

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);

  const grupos = useMemo<GrupoCobrador[]>(() => {
    if (!linhas) return [];
    const porCobrador = new Map<string, GrupoCobrador>();
    linhas.forEach((l, i) => {
      const baseValor = num(l.base_valor);
      const appValor = num(l.app_valor);
      const id = l.cobrador_id ?? "";
      let g = porCobrador.get(id);
      if (!g) {
        g = {
          id,
          nome: id ? (nomePorId.get(id) ?? "Usuário removido") : "Sem cobrador",
          baseValor: 0,
          appValor: 0,
          appCedrus: 0,
          contagem: contagemVazia(),
          clientes: [],
        };
        porCobrador.set(id, g);
      }
      const situacao = classificarConferencia(baseValor, appValor);
      g.baseValor += baseValor;
      g.appValor += appValor;
      g.appCedrus += num(l.app_cedrus);
      g.contagem[situacao]++;
      g.clientes.push({
        chave: `${l.documento ?? ""}:${id}:${i}`,
        cobradorId: l.cobrador_id,
        carteiraId: l.carteira_id,
        documento: l.documento ?? "",
        cliente: l.cliente ?? "(sem nome)",
        baseValor,
        baseParcelas: l.base_parcelas,
        appValor,
        appLancamentos: l.app_lancamentos,
        appCedrus: num(l.app_cedrus),
        situacao,
      });
    });
    porCobrador.forEach((g) =>
      g.clientes.sort(
        (a, b) =>
          SITUACOES.indexOf(a.situacao) - SITUACOES.indexOf(b.situacao) ||
          Math.abs(b.appValor - b.baseValor) - Math.abs(a.appValor - a.baseValor),
      ),
    );
    // Sem cobrador por ultimo; os demais pelo maior valor (base ou app).
    return Array.from(porCobrador.values()).sort((a, b) => {
      if (!a.id !== !b.id) return a.id ? -1 : 1;
      return Math.max(b.baseValor, b.appValor) - Math.max(a.baseValor, a.appValor);
    });
  }, [linhas, nomePorId]);

  const totais = useMemo(() => {
    const t = { base: 0, app: 0, cedrus: 0, contagem: contagemVazia() };
    grupos.forEach((g) => {
      t.base += g.baseValor;
      t.app += g.appValor;
      t.cedrus += g.appCedrus;
      SITUACOES.forEach((s) => (t.contagem[s] += g.contagem[s]));
    });
    return t;
  }, [grupos]);

  // Cliente registrado por mais de um cobrador no mes: a base se repete.
  const duplicados = useMemo(() => {
    const vistos = new Map<string, number>();
    (linhas ?? []).forEach((l) => {
      if (!l.documento || num(l.app_valor) === 0) return;
      vistos.set(l.documento, (vistos.get(l.documento) ?? 0) + 1);
    });
    return Array.from(vistos.values()).filter((n) => n > 1).length;
  }, [linhas]);

  const pendencias = (c: Record<ConferenciaSituacao, number>) =>
    c.sem_registro_app + c.base_maior + c.sem_baixa_base;

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <Scale className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          Conferência de recebimentos
          <span className="relative ml-1.5">
            <button
              onClick={() => setInfoOpen((v) => !v)}
              className="text-gray-300 hover:text-blue-600 dark:text-dark-text-secondary dark:hover:text-blue-400"
              aria-label="Como a conferência é feita"
            >
              <Info className="h-4 w-4" />
            </button>
            {infoOpen && (
              <div className="absolute z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-xs font-normal text-blue-700 dark:text-blue-300 shadow-lg space-y-1.5">
                <p>
                  <strong>Base</strong>: o que o Ciclone baixou como recebido no
                  mês (data da baixa). Guarda só o principal, sem juros.
                </p>
                <p>
                  <strong>App</strong>: o que o cobrador registrou no mês
                  (pagamentos, acordos e estornos; inclui o importado do
                  Cedrus).
                </p>
                <p>
                  Cada cliente fica com quem registrou; se ninguém registrou,
                  com o dono da carteira.
                </p>
              </div>
            )}
          </span>
        </h2>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setMes((m) => somarMes(m, -1))}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-semibold text-gray-700 dark:text-dark-text">
            {rotuloMes(mes)}
          </span>
          <button
            onClick={() => setMes((m) => somarMes(m, 1))}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Não foi possível carregar a conferência: {erro}
        </div>
      )}

      {!erro && linhas === null && (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Carregando…
        </div>
      )}

      {linhas !== null && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 px-4 py-3">
              <div className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
                Baixado na base
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-dark-text">
                {formatCurrency(totais.base)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 px-4 py-3">
              <div className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
                Registrado pelos cobradores
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-dark-text">
                {formatCurrency(totais.app)}
              </div>
              {totais.cedrus !== 0 && (
                <div className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                  {formatCurrency(totais.cedrus)} importados do Cedrus
                </div>
              )}
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 px-4 py-3">
              <div className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
                Clientes para conferir
              </div>
              <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
                {pendencias(totais.contagem)}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                {totais.contagem.confere} conferem ·{" "}
                {totais.contagem.app_maior} com app maior (juros?)
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["todas", ...SITUACOES] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFiltro(s)}
                title={s === "todas" ? undefined : CONFERENCIA_SITUACAO_DICA[s]}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filtro === s
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
                }`}
              >
                {s === "todas"
                  ? "Todas"
                  : `${CONFERENCIA_SITUACAO_LABEL[s]} (${totais.contagem[s]})`}
              </button>
            ))}
          </div>

          {duplicados > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {duplicados} cliente(s) com registro de mais de um cobrador no mês:
              o valor da base aparece em cada um deles.
            </div>
          )}

          {grupos.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
              Nenhum recebimento neste mês.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 lg:-mx-5">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary">
                    <th className="px-4 lg:px-5 py-2 font-semibold">Cobrador</th>
                    <th className="px-3 py-2 font-semibold text-right">Base</th>
                    <th className="px-3 py-2 font-semibold text-right">App</th>
                    <th className="px-3 py-2 font-semibold text-right">Diferença</th>
                    <th className="px-3 py-2 font-semibold text-right">A conferir</th>
                    <th className="px-3 py-2 font-semibold text-right">Conferem</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const clientes =
                      filtro === "todas"
                        ? g.clientes
                        : g.clientes.filter((c) => c.situacao === filtro);
                    if (filtro !== "todas" && clientes.length === 0) return null;
                    const expandido = aberto === g.id;
                    return (
                      <React.Fragment key={g.id || "sem"}>
                        <tr
                          onClick={() => setAberto(expandido ? null : g.id)}
                          className="cursor-pointer border-t border-gray-100 dark:border-dark-border/40 hover:bg-gray-50 dark:hover:bg-dark-bg/40"
                        >
                          <td className="px-4 lg:px-5 py-2.5 font-medium text-gray-900 dark:text-dark-text whitespace-nowrap">
                            {g.nome}
                            {g.appCedrus !== 0 && (
                              <span className="ml-1.5 text-[11px] font-normal text-gray-400 dark:text-dark-text-secondary">
                                ({formatCurrency(g.appCedrus)} do Cedrus)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-700 dark:text-dark-text">
                            {formatCurrency(g.baseValor)}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-700 dark:text-dark-text">
                            {formatCurrency(g.appValor)}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <Diferenca valor={g.appValor - g.baseValor} />
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">
                            {pendencias(g.contagem) || ""}
                          </td>
                          <td className="px-3 py-2.5 text-right text-green-600 dark:text-green-400">
                            {g.contagem.confere || ""}
                          </td>
                          <td className="px-2 py-2.5 text-gray-400">
                            {expandido ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </td>
                        </tr>
                        {expandido && (
                          <tr>
                            <td colSpan={7} className="px-4 lg:px-5 pb-3">
                              <div className="rounded-xl border border-gray-100 dark:border-dark-border/40 overflow-x-auto">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary bg-gray-50/60 dark:bg-dark-bg/30">
                                      <th className="px-3 py-1.5 font-semibold">Cliente</th>
                                      <th className="px-3 py-1.5 font-semibold">Situação</th>
                                      <th className="px-3 py-1.5 font-semibold text-right">Base</th>
                                      <th className="px-3 py-1.5 font-semibold text-right">App</th>
                                      <th className="px-3 py-1.5 font-semibold text-right">Diferença</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {clientes.map((c) => {
                                      const outraCarteira =
                                        c.cobradorId &&
                                        c.appLancamentos > 0 &&
                                        c.carteiraId !== c.cobradorId;
                                      return (
                                        <tr
                                          key={c.chave}
                                          className="border-t border-gray-100 dark:border-dark-border/40"
                                        >
                                          <td className="px-3 py-1.5">
                                            <div className="font-medium text-gray-800 dark:text-dark-text">
                                              {c.cliente}
                                            </div>
                                            <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                                              {c.documento}
                                              {outraCarteira &&
                                                ` · carteira: ${c.carteiraId ? (nomePorId.get(c.carteiraId) ?? "outro") : "sem cobrador"}`}
                                            </div>
                                          </td>
                                          <td className="px-3 py-1.5">
                                            <span
                                              title={CONFERENCIA_SITUACAO_DICA[c.situacao]}
                                              className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${SITUACAO_TONE[c.situacao]}`}
                                            >
                                              {CONFERENCIA_SITUACAO_LABEL[c.situacao]}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 text-right whitespace-nowrap text-gray-700 dark:text-dark-text">
                                            {c.baseParcelas > 0 ? (
                                              <>
                                                {formatCurrency(c.baseValor)}
                                                <div className="text-[10px] text-gray-400">
                                                  {c.baseParcelas} parcela(s)
                                                </div>
                                              </>
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                          <td className="px-3 py-1.5 text-right whitespace-nowrap text-gray-700 dark:text-dark-text">
                                            {c.appLancamentos > 0 ? (
                                              <>
                                                {formatCurrency(c.appValor)}
                                                <div className="text-[10px] text-gray-400">
                                                  {c.appLancamentos} lançamento(s)
                                                  {c.appCedrus !== 0 && " · Cedrus"}
                                                </div>
                                              </>
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                            <Diferenca valor={c.appValor - c.baseValor} />
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
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
        </>
      )}
    </div>
  );
};

export default ConferenciaRecebimentos;
