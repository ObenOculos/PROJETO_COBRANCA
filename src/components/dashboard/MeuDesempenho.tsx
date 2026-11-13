import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Gauge,
  PhoneCall,
  Wallet,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatCurrency } from "../../utils/formatters";
import { todayLocalStr, addDaysLocalStr } from "../../config/visitStatus";
import { useAtendimentosPeriodo } from "../../hooks/useAtendimentosPeriodo";
import SummaryCard from "../common/SummaryCard";

/**
 * "Meu desempenho" do cobrador de carteira: mesmo formato de card do Resumo
 * por Cobrador do gestor (pergunta, numero em destaque, detalhe em linhas),
 * com o que o cobrador precisa para se situar. Compacto e recolhivel -- fica
 * acima da lista de trabalho.
 */

type Periodo = "hoje" | "semana" | "mes";
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "7 dias" },
  { key: "mes", label: "Mês" },
];

const fmtNum = (n: number): string => n.toLocaleString("pt-BR");

/** Dias uteis (seg-sex) de `de` ate `ate`, inclusive. So getters UTC sobre a
 * string YYYY-MM-DD (ver CLAUDE.md sobre datas). */
const diasUteis = (de: string, ate: string): number => {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  const dt = new Date(Date.UTC(y1, m1 - 1, d1));
  const fim = Date.UTC(y2, m2 - 1, d2);
  let n = 0;
  while (dt.getTime() <= fim) {
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return n;
};

const ultimoDiaDoMes = (hoje: string): string => {
  const [y, m] = hoje.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${hoje.slice(0, 7)}-${String(d).padStart(2, "0")}`;
};

/** Atalhos dos cards para a Carteira completa ja filtrada. */
export type FiltroDesempenho =
  | "todos"
  | "paraHoje"
  | "atendidosHoje"
  | "semAtendimento"
  | "criticos";

interface Props {
  userId: string;
  /** Titulos do cobrador (id_parcela -> documento, para contar clientes). */
  myCollections: { id_parcela?: number | string | null; documento?: string | null }[];
  salePayments: {
    collectorId?: string | null;
    paymentDate: string;
    paymentAmount: number;
  }[];
  /** Meta de recebimento do mes (0 = sem meta). */
  metaMes: number;
  /** Muda a cada registro feito na tela: rele atendimentos e acordos. */
  versaoRegistros: number;
  compromissos: {
    agendados: number;
    promessas: number;
    acordosQuebrados: number;
  };
  carteira: {
    vencido: number;
    aVencer: number;
    clientes: number;
    criticos: number;
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
  compromissos,
  carteira,
  onFiltrar,
}) => {
  const hoje = todayLocalStr();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const seteDias = addDaysLocalStr(hoje, -6);

  const [periodo, setPeriodo] = useState<Periodo>("hoje");
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

  const dateFrom =
    periodo === "hoje" ? hoje : periodo === "semana" ? seteDias : inicioMes;
  const dateTo = hoje;

  // Clientes atendidos: mesma conta do Resumo por Cobrador (gestor).
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
    dateFrom,
    dateTo,
    docByParcelaRef,
    userId,
    versaoRegistros,
  );
  const atend = atendimentos?.get(userId);

  // Parcelas de acordo pagas (acordo_pagamentos nao passa por
  // sale_payments -- ver "Recuperacao do Mes" no CollectorDashboard).
  // Busca desde o inicio do mes ou 7 dias atras, o que vier antes.
  const [acordoPagos, setAcordoPagos] = useState<
    { valor: number; data: string }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    const desde = seteDias < inicioMes ? seteDias : inicioMes;
    (async () => {
      const { data, error } = await supabase
        .from("acordo_pagamentos")
        .select("valor_pago, data_pagamento")
        .eq("collector_id", userId)
        .gte("data_pagamento", desde);
      if (error) {
        console.error("Erro ao buscar pagamentos de acordo:", error);
        return;
      }
      if (!cancelled) {
        setAcordoPagos(
          (data || []).map((p) => ({
            valor: Number(p.valor_pago),
            // data_pagamento e sempre YYYY-MM-DD (todayLocalStr).
            data: String(p.data_pagamento).slice(0, 10),
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, versaoRegistros, seteDias, inicioMes]);

  const recebidoEntre = (de: string, ate: string): number =>
    salePayments
      .filter((p) => {
        const d = (p.paymentDate || "").slice(0, 10);
        return p.collectorId === userId && d >= de && d <= ate;
      })
      .reduce((s, p) => s + p.paymentAmount, 0) +
    acordoPagos
      .filter((p) => p.data >= de && p.data <= ate)
      .reduce((s, p) => s + p.valor, 0);

  const recebido = useMemo(
    () => recebidoEntre(dateFrom, dateTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salePayments, acordoPagos, dateFrom, dateTo, userId],
  );
  const recebidoMes = useMemo(
    () => recebidoEntre(inicioMes, hoje),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salePayments, acordoPagos, inicioMes, hoje, userId],
  );

  const temMeta = metaMes > 0;
  const progresso = temMeta ? Math.min((recebidoMes / metaMes) * 100, 100) : 0;
  const falta = Math.max(0, metaMes - recebidoMes);
  const diasRestantes = diasUteis(hoje, ultimoDiaDoMes(hoje));
  const porDia = diasRestantes > 0 ? falta / diasRestantes : falta;
  const diasNoPeriodo = Math.max(1, diasUteis(dateFrom, dateTo));

  const compromissosHoje = compromissos.agendados + compromissos.promessas;

  const atendValor = (n: number | undefined) =>
    atendimentosErro ? "—" : atendimentos === null ? "…" : fmtNum(n ?? 0);

  const legendaPeriodo =
    periodo === "hoje"
      ? "hoje"
      : periodo === "semana"
        ? "nos últimos 7 dias"
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
            {formatCurrency(recebido, false)} recebido ·{" "}
            {atendValor(atend?.clientes)} atendidos · {compromissosHoje} para
            hoje
          </span>
        )}
        <div className="ml-auto inline-flex rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden text-xs">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriodo(p.key)}
              className={`px-2.5 py-1 transition-colors ${
                periodo === p.key
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {aberto && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <SummaryCard
            compact
            icon={Wallet}
            title="Quanto recebi"
            value={formatCurrency(recebido, false)}
            valueTone="green"
            caption={legendaPeriodo}
            rows={
              temMeta
                ? [
                    {
                      label: `Meta do mês ${formatCurrency(metaMes, false)}`,
                      value: `${progresso.toFixed(0)}%`,
                    },
                    falta > 0
                      ? {
                          label: `Falta (${diasRestantes} dias úteis)`,
                          value: `${formatCurrency(porDia, false)}/dia`,
                          tone: "amber",
                        }
                      : { label: "Meta", value: "atingida", tone: "green" },
                  ]
                : [{ label: "Meta do mês", value: "não definida" }]
            }
          >
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
            icon={PhoneCall}
            title="Quantos atendi"
            {...(periodo === "hoje"
              ? {
                  onClick: () => onFiltrar("atendidosHoje"),
                  hint: "Ver os clientes atendidos hoje",
                }
              : {})}
            value={atendValor(atend?.clientes)}
            valueTone="blue"
            caption={`clientes ${legendaPeriodo} (cada um conta 1 vez)`}
            rows={[
              {
                label: "Consegui conversar",
                value: atendValor(atend?.conversaram),
              },
              {
                label: "Promessas de pagamento",
                value: atendValor(atend?.promessas),
              },
              ...(periodo !== "hoje" && atend
                ? [
                    {
                      label: "Média por dia útil",
                      value: fmtNum(Math.round(atend.clientes / diasNoPeriodo)),
                    },
                  ]
                : []),
            ]}
          />

          <SummaryCard
            compact
            icon={CalendarClock}
            title="Meus compromissos"
            onClick={() => onFiltrar("paraHoje")}
            hint="Ver os clientes para hoje"
            value={fmtNum(compromissosHoje)}
            valueTone={compromissosHoje > 0 ? "red" : "neutral"}
            caption="para hoje"
            rows={[
              { label: "Contatos agendados", value: fmtNum(compromissos.agendados) },
              { label: "Promessas a cobrar", value: fmtNum(compromissos.promessas) },
              ...(compromissos.acordosQuebrados > 0
                ? [
                    {
                      label: "Acordos quebrados",
                      value: fmtNum(compromissos.acordosQuebrados),
                      tone: "red" as const,
                    },
                  ]
                : []),
            ]}
          />

          <SummaryCard
            compact
            icon={Users}
            title="Minha carteira"
            onClick={() => onFiltrar("todos")}
            hint="Ver a carteira completa"
            value={formatCurrency(carteira.vencido, false)}
            valueTone="red"
            caption={`vencido · ${fmtNum(carteira.clientes)} clientes`}
            rows={[
              {
                label: "Críticos (+90 dias)",
                value: fmtNum(carteira.criticos),
                onClick: () => onFiltrar("criticos"),
                hint: "Ver só os críticos",
              },
              {
                label: "Sem atendimento há 7 dias",
                value: fmtNum(carteira.semAtendimento),
                tone: carteira.semAtendimento > 0 ? "amber" : undefined,
                onClick: () => onFiltrar("semAtendimento"),
                hint: "Ver quem está sem atendimento há 7 dias",
              },
              ...(carteira.aVencer > 0.01
                ? [
                    {
                      label: "A vencer (no prazo)",
                      value: formatCurrency(carteira.aVencer, false),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}
    </div>
  );
};

export default MeuDesempenho;
