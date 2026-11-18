import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Gauge,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatCurrency } from "../../utils/formatters";
import { addDaysLocalStr, todayLocalStr } from "../../config/visitStatus";
import SummaryCard from "../common/SummaryCard";
import { valorRecebidoTotal } from "../../filters/sales";
import { inadimplenciaDe, formatarInadimplencia } from "../../filters/inadimplencia";
import { useAtendimentosPeriodo } from "../../hooks/useAtendimentosPeriodo";
import { Collection } from "../../types";

/**
 * "Meu desempenho" do cobrador de carteira: mesmo formato de card do Resumo
 * por Cobrador do gestor (pergunta, numero em destaque, detalhe em linhas).
 * Compacto e recolhivel -- fica acima da lista de trabalho.
 *
 * Pedido do usuario (2026-11-17): o mais simples possivel -- 4 grupos fixos
 * (Carteira, Vencido, Numero de clientes, Desempenho), sem recorte de
 * periodo na carteira. Carteira e Vencido foram unidos e depois separados
 * de novo (o gestor quis mais destaque pro valor vencido) -- pra nao
 * repetir "A vencer" nos dois cards, ele so aparece dentro de Carteira; o
 * card Vencido guarda só o valor vencido e o alerta de sem agendamento. O
 * Desempenho ganhou um alternador Dia/Semana/Mes: a meta so faz sentido no
 * mes, entao so aparece nessa opcao.
 */

const fmtNum = (n: number): string => n.toLocaleString("pt-BR");

/** Atalhos dos cards para a Carteira completa ja filtrada. */
export type FiltroDesempenho = "todos" | "semAtendimento";

type JanelaDesempenho = "dia" | "ontem" | "semana" | "mes";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/** "YYYY-MM" -> primeiro/ultimo dia do mes, como string local. */
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

const nomeMes = (mes: string): string => {
  const nome = MESES[Number(mes.slice(5, 7)) - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`;
};

/** "YYYY-MM-DD" -> "DD/MM" (sem Date -- evita fuso, CLAUDE.md). */
const fmtDiaBr = (dia: string): string =>
  `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

interface Props {
  userId: string;
  /** Titulos do cobrador (para contar clientes e calcular inadimplencia). */
  myCollections: Collection[];
  salePayments: {
    collectorId?: string | null;
    paymentDate: string;
    paymentAmount: number;
    jurosAmount?: number;
  }[];
  /** Meta de recebimento do mes (0 = sem meta). */
  metaMes: number;
  /** Muda a cada registro feito na tela: rele os pagamentos de acordo. */
  versaoRegistros: number;
  carteira: {
    vencido: number;
    aVencer: number;
    clientes: number;
    /** Clientes com pelo menos um título vencido (pior status). */
    comAtraso: number;
    semAtendimento: number;
  };
  onFiltrar: (filtro: FiltroDesempenho) => void;
}

const MeuDesempenho: React.FC<Props> = ({
  userId,
  myCollections,
  salePayments,
  metaMes,
  versaoRegistros,
  carteira,
  onFiltrar,
}) => {
  const hoje = todayLocalStr();
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  const [aberto, setAberto] = useState(() => {
    try {
      return localStorage.getItem("meu_desempenho_aberto") !== "0";
    } catch {
      return true;
    }
  });
  const alternar = () =>
    setAberto((v) => {
      try {
        localStorage.setItem("meu_desempenho_aberto", v ? "0" : "1");
      } catch {
        // armazenamento indisponivel -- so nao lembra
      }
      return !v;
    });

  const [janela, setJanela] = useState<JanelaDesempenho | null>("mes");
  const ontem = useMemo(() => addDaysLocalStr(hoje, -1), [hoje]);

  // Navegador de mes/calendario no canto do card Desempenho (pedido do
  // usuario 2026-11-18): forma separada de ver um mes especifico (passado
  // ou futuro) ou um dia so, fora dos atalhos relativos de "janela" acima.
  // Os dois nao se misturam -- usar um desmarca o outro.
  const [mesCalendario, setMesCalendario] = useState(() => hoje.slice(0, 7));
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [calendarData, setCalendarData] = useState<{
    inicio: string;
    fim: string;
    rotulo: string;
  } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!calendarioAberto) return;
    const fechar = (e: MouseEvent) => {
      if (!calendarRef.current?.contains(e.target as Node)) {
        setCalendarioAberto(false);
      }
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [calendarioAberto]);

  const selecionarJanela = (j: JanelaDesempenho) => {
    setJanela(j);
    setCalendarData(null);
    setMesCalendario(hoje.slice(0, 7));
  };
  const irParaMes = (delta: number) => {
    const novoMes = somarMes(mesCalendario, delta);
    setMesCalendario(novoMes);
    const { inicio, fim } = limitesDoMes(novoMes);
    setCalendarData({
      inicio,
      fim: fim > hoje ? hoje : fim,
      rotulo: `em ${nomeMes(novoMes).toLowerCase()}`,
    });
    setJanela(null);
  };
  const selecionarDia = (dia: string) => {
    setCalendarData({ inicio: dia, fim: dia, rotulo: `em ${fmtDiaBr(dia)}` });
    setJanela(null);
    setCalendarioAberto(false);
  };

  const inicioFiltro = useMemo(() => {
    if (calendarData) return calendarData.inicio;
    if (janela === "dia") return hoje;
    if (janela === "ontem") return ontem;
    if (janela === "semana") return addDaysLocalStr(hoje, -6);
    return inicioMes;
  }, [janela, calendarData, hoje, ontem, inicioMes]);
  // Limite superior: so "ontem" precisa, pra nao incluir o dia de hoje junto
  // (os outros vao sempre at'e hoje, que e o maior valor possivel nos dados).
  const fimFiltro = calendarData
    ? calendarData.fim
    : janela === "ontem"
      ? ontem
      : hoje;

  // Parcelas de acordo pagas (acordo_pagamentos nao passa por
  // sale_payments -- ver "Recuperacao do Mes" no CollectorDashboard).
  const [acordoPagos, setAcordoPagos] = useState<
    { valor: number; data: string }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("acordo_pagamentos")
        .select("valor_pago, data_pagamento")
        .eq("collector_id", userId)
        .gte("data_pagamento", inicioFiltro)
        .lte("data_pagamento", fimFiltro);
      if (error) {
        console.error("Erro ao buscar pagamentos de acordo:", error);
        return;
      }
      if (!cancelled) {
        setAcordoPagos(
          (data || []).map((p) => ({
            valor: Number(p.valor_pago),
            data: String(p.data_pagamento).slice(0, 10),
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, versaoRegistros, inicioFiltro, fimFiltro]);

  // Item 66, etapa 3: pagamento que o cliente fez na loja/banco, atribuido ao
  // cobrador (pedido dele ou excecao do gestor) -- nao passa por
  // sale_payments (ver migration 20261116000003). Le a view
  // atribuicoes_pagamento_vigentes (valor_vigente = LEAST(valor_aprovado,
  // valor_recebido atual); some se o ERP desfizer a baixa -- migration
  // 20261117000007).
  const [atribuicoesPagas, setAtribuicoesPagas] = useState<
    { valor: number; data: string }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("atribuicoes_pagamento_vigentes")
        .select("valor_vigente, data_pagamento")
        .eq("solicitado_por_id", userId)
        .gte("data_pagamento", inicioFiltro)
        .lte("data_pagamento", fimFiltro);
      if (error) {
        console.error("Erro ao buscar pagamentos atribuídos (pago na loja):", error);
        return;
      }
      if (!cancelled) {
        setAtribuicoesPagas(
          (data || []).map((p) => ({
            valor: Number(p.valor_vigente) || 0,
            data: String(p.data_pagamento).slice(0, 10),
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, versaoRegistros, inicioFiltro, fimFiltro]);

  const recebidoPeriodo = useMemo(() => {
    const doApp = salePayments
      .filter((p) => {
        if (p.collectorId !== userId) return false;
        const data = (p.paymentDate || "").slice(0, 10);
        return data >= inicioFiltro && data <= fimFiltro;
      })
      .reduce((s, p) => s + valorRecebidoTotal(p), 0);
    const doAcordo = acordoPagos.reduce((s, p) => s + p.valor, 0);
    const doAtribuido = atribuicoesPagas.reduce((s, p) => s + p.valor, 0);
    return doApp + doAcordo + doAtribuido;
  }, [salePayments, acordoPagos, atribuicoesPagas, userId, inicioFiltro, fimFiltro]);

  // Clientes acionados no periodo (mesma fonte do Resumo por Cobrador do
  // gestor -- collection_attempts / isEffectiveAttemptResult). Pedido do
  // usuario (2026-11-18): o cobrador reclamava de nao ter como ver "quantos
  // acionei hoje" sem abrir outra tela.
  const docByParcelaRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const m = docByParcelaRef.current;
    myCollections.forEach((c) => {
      if (c.id_parcela != null && c.documento) {
        m.set(String(c.id_parcela), c.documento);
      }
    });
  }, [myCollections]);
  const { atendimentos, erro: atendimentosErro } = useAtendimentosPeriodo(
    inicioFiltro,
    fimFiltro,
    docByParcelaRef,
    userId,
    versaoRegistros,
  );
  const meusAtendimentos = atendimentos?.get(userId);
  // `n` indefinido so enquanto carrega/falha (mostra "…"/"erro" em vez de 0,
  // que pareceria "nao fiz nada").
  const atendimentosValor = (n: number | undefined): string =>
    atendimentosErro ? "erro" : atendimentos === null ? "…" : String(n ?? 0);
  const atendimentosHint = (): string => {
    if (atendimentosErro) return "falha ao carregar";
    if (atendimentos === null) return "carregando";
    const conversaram = meusAtendimentos?.conversaram ?? 0;
    return `${conversaram} ${conversaram === 1 ? "conversou" : "conversaram"}`;
  };

  const temMeta = janela === "mes" && metaMes > 0;
  const progresso = temMeta
    ? Math.min((recebidoPeriodo / metaMes) * 100, 100)
    : 0;
  const falta = Math.max(0, metaMes - recebidoPeriodo);

  const inad = useMemo(() => inadimplenciaDe(myCollections), [myCollections]);
  const valorTotal = carteira.vencido + carteira.aVencer;

  // Grade de dias do mes navegado no calendario (null = espaco vazio antes
  // do dia 1, pra alinhar com o dia da semana certo).
  const diasCalendario = useMemo(() => {
    const [y, m] = mesCalendario.split("-").map(Number);
    const primeiroDiaSemana = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const totalDias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dias: (string | null)[] = new Array(primeiroDiaSemana).fill(null);
    for (let d = 1; d <= totalDias; d++) {
      dias.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return dias;
  }, [mesCalendario]);

  const legendaJanela = calendarData
    ? calendarData.rotulo
    : janela === "dia"
      ? "hoje"
      : janela === "ontem"
        ? "ontem"
        : janela === "semana"
          ? "últimos 7 dias"
          : "no mês";

  return (
    <div className="bg-white dark:bg-dark-bg rounded-2xl border border-gray-200 dark:border-dark-border shadow-sm px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alternar}
          className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-dark-text"
        >
          <Gauge className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Meu desempenho
          {aberto ? (
            <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          )}
        </button>
        {!aberto && (
          // Recolhido: uma linha com o essencial.
          <span className="text-xs text-gray-500 dark:text-dark-text-secondary truncate">
            {formatCurrency(recebidoPeriodo, false)} recebido {legendaJanela} ·{" "}
            {fmtNum(carteira.clientes)} clientes na carteira
          </span>
        )}
      </div>

      {aberto && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <SummaryCard
            compact
            icon={Gauge}
            title="Desempenho"
            value={formatCurrency(recebidoPeriodo, false)}
            valueTone="green"
            caption={`recebido ${legendaJanela}`}
            headerRight={
              <div className="relative" ref={calendarRef}>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => irParaMes(-1)}
                    aria-label="Mês anterior"
                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-dark-bg dark:hover:text-dark-text"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarioAberto((v) => !v)}
                    title="Ver calendário do mês"
                    className="text-[10px] font-semibold text-gray-500 dark:text-dark-text-secondary hover:text-blue-600 dark:hover:text-blue-400 px-0.5 whitespace-nowrap"
                  >
                    {MESES[Number(mesCalendario.slice(5, 7)) - 1]}
                  </button>
                  <button
                    type="button"
                    onClick={() => irParaMes(1)}
                    disabled={mesCalendario >= hoje.slice(0, 7)}
                    aria-label="Próximo mês"
                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-dark-bg dark:hover:text-dark-text disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {calendarioAberto && (
                  <div className="absolute right-0 mt-1 z-30 w-52 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary shadow-lg p-2">
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-gray-400 dark:text-dark-text-secondary mb-1">
                      {DIAS_SEMANA.map((d, i) => (
                        <span key={i}>{d}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {diasCalendario.map((dia, i) =>
                        dia ? (
                          <button
                            key={dia}
                            type="button"
                            disabled={dia > hoje}
                            onClick={() => selecionarDia(dia)}
                            className={`h-6 w-6 rounded-md text-[10px] ${
                              calendarData?.inicio === dia &&
                              calendarData.fim === dia
                                ? "bg-green-600 text-white font-bold"
                                : dia > hoje
                                  ? "text-gray-300 dark:text-dark-border cursor-not-allowed"
                                  : `text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg ${dia === hoje ? "border border-blue-400" : ""}`
                            }`}
                          >
                            {Number(dia.slice(8, 10))}
                          </button>
                        ) : (
                          <span key={`b${i}`} />
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            }
            rows={[
              ...(temMeta
                ? [
                    { label: "Meta do mês", value: formatCurrency(metaMes, false) },
                    falta > 0
                      ? {
                          label: "P/ alcançar a meta",
                          value: formatCurrency(falta, false),
                          tone: "amber" as const,
                        }
                      : { label: "Meta", value: "atingida", tone: "green" as const },
                  ]
                : janela === "mes" && metaMes === 0
                  ? [{ label: "Meta do mês", value: "não definida" }]
                  : []),
              {
                label: "Clientes acionados",
                value: atendimentosValor(meusAtendimentos?.clientes),
                hint: atendimentosHint(),
                loading: atendimentos === null && !atendimentosErro,
              },
              {
                label: "Acionamentos",
                value: atendimentosValor(meusAtendimentos?.tentativas),
                hint: "Total de registros no período, sem deduplicar por cliente",
                loading: atendimentos === null && !atendimentosErro,
              },
            ]}
          >
            <div className="flex items-center gap-1 mt-1 mb-0.5">
              {(
                [
                  { key: "dia", label: "Hoje" },
                  { key: "ontem", label: "Ontem" },
                  { key: "semana", label: "Semana" },
                  { key: "mes", label: "Mês" },
                ] as { key: JanelaDesempenho; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => selecionarJanela(opt.key)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors touch-manipulation ${
                    janela === opt.key
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {temMeta && (
              <div className="mt-1 h-1.5 bg-gray-200/70 dark:bg-dark-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            )}
          </SummaryCard>

          <SummaryCard
            compact
            icon={Wallet}
            title="Carteira"
            onClick={() => onFiltrar("todos")}
            hint="Ver a carteira completa"
            value={formatCurrency(valorTotal, false)}
            valueTone="neutral"
            caption="valor total em aberto"
            rows={[
              {
                label: "A vencer",
                value: formatCurrency(carteira.aVencer, false),
              },
              {
                label: "% inadimplente",
                value: formatarInadimplencia(inad.pct, inad.venceu),
              },
            ]}
          />

          <SummaryCard
            compact
            icon={Wallet}
            title="Vencido"
            value={formatCurrency(carteira.vencido, false)}
            valueTone="red"
            caption="valor vencido"
            rows={[
              {
                label: "Sem agendamento",
                value: fmtNum(carteira.semAtendimento),
                tone: carteira.semAtendimento > 0 ? "amber" : undefined,
                onClick: () => onFiltrar("semAtendimento"),
                hint: "Ver quem está sem atendimento há 7 dias",
              },
            ]}
          />

          <SummaryCard
            compact
            icon={Users}
            title="Número de clientes"
            onClick={() => onFiltrar("todos")}
            hint="Ver a carteira completa"
            value={fmtNum(carteira.clientes)}
            valueTone="blue"
            caption="clientes na carteira"
            rows={[
              {
                label: "Com atraso",
                value: fmtNum(carteira.comAtraso),
                tone: carteira.comAtraso > 0 ? "red" : undefined,
              },
              {
                label: "Em dia",
                value: fmtNum(carteira.clientes - carteira.comAtraso),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
};

export default MeuDesempenho;
