import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Gauge, Users, Wallet } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatCurrency } from "../../utils/formatters";
import { addDaysLocalStr, todayLocalStr } from "../../config/visitStatus";
import SummaryCard from "../common/SummaryCard";
import { valorRecebidoTotal } from "../../filters/sales";
import { inadimplenciaDe, formatarInadimplencia } from "../../filters/inadimplencia";
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

type JanelaDesempenho = "dia" | "semana" | "mes";

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

  const [janela, setJanela] = useState<JanelaDesempenho>("mes");
  const inicioFiltro = useMemo(() => {
    if (janela === "dia") return hoje;
    if (janela === "semana") return addDaysLocalStr(hoje, -6);
    return inicioMes;
  }, [janela, hoje, inicioMes]);

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
        .gte("data_pagamento", inicioFiltro);
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
  }, [userId, versaoRegistros, inicioFiltro]);

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
        .gte("data_pagamento", inicioFiltro);
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
  }, [userId, versaoRegistros, inicioFiltro]);

  const recebidoPeriodo = useMemo(() => {
    const doApp = salePayments
      .filter(
        (p) =>
          p.collectorId === userId &&
          (p.paymentDate || "").slice(0, 10) >= inicioFiltro,
      )
      .reduce((s, p) => s + valorRecebidoTotal(p), 0);
    const doAcordo = acordoPagos.reduce((s, p) => s + p.valor, 0);
    const doAtribuido = atribuicoesPagas.reduce((s, p) => s + p.valor, 0);
    return doApp + doAcordo + doAtribuido;
  }, [salePayments, acordoPagos, atribuicoesPagas, userId, inicioFiltro]);

  const temMeta = janela === "mes" && metaMes > 0;
  const progresso = temMeta
    ? Math.min((recebidoPeriodo / metaMes) * 100, 100)
    : 0;
  const falta = Math.max(0, metaMes - recebidoPeriodo);

  const inad = useMemo(() => inadimplenciaDe(myCollections), [myCollections]);
  const valorTotal = carteira.vencido + carteira.aVencer;

  const legendaJanela =
    janela === "dia" ? "hoje" : janela === "semana" ? "últimos 7 dias" : "no mês";

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

          <SummaryCard
            compact
            icon={Gauge}
            title="Desempenho"
            value={formatCurrency(recebidoPeriodo, false)}
            valueTone="green"
            caption={`recebido ${legendaJanela}`}
            rows={
              temMeta
                ? [
                    { label: "Meta do mês", value: formatCurrency(metaMes, false) },
                    falta > 0
                      ? {
                          label: "P/ alcançar a meta",
                          value: formatCurrency(falta, false),
                          tone: "amber",
                        }
                      : { label: "Meta", value: "atingida", tone: "green" },
                  ]
                : janela === "mes" && metaMes === 0
                  ? [{ label: "Meta do mês", value: "não definida" }]
                  : []
            }
          >
            <div className="flex items-center gap-1 mt-1 mb-0.5">
              {(
                [
                  { key: "dia", label: "Dia" },
                  { key: "semana", label: "Semana" },
                  { key: "mes", label: "Mês" },
                ] as { key: JanelaDesempenho; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setJanela(opt.key)}
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
        </div>
      )}
    </div>
  );
};

export default MeuDesempenho;
