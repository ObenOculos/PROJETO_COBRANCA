import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Hourglass,
  Info,
  Minus,
  RotateCcw,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useCollection } from "../../contexts/CollectionContext";
import { buscarComCacheTela, lerCacheTela } from "../../utils/cacheTela";
import { formatCurrency } from "../../utils/formatters";
import FiltroMultiplo from "../common/FiltroMultiplo";
import {
  INADIMPLENCIA_A_PARTIR_DIAS,
  nivelInadimplencia,
} from "../../filters/inadimplencia";
import {
  FAIXAS_ATRASO,
  PontoInadimplencia,
  atrasoTotal,
  formatarPct,
  formatarPp,
  media,
  pctInadimplencia,
  pctRecuperacao,
  pontoDaRpc,
  rotuloMes,
  Tendencia,
  tendenciaInadimplencia,
  tendenciaRecuperacao,
  variacaoPp,
} from "../../filters/inadimplenciaHistorico";

// Aba "Inadimplencia" do Resumo Geral (item 93, 25/11): a cobranca esta
// fazendo bom trabalho? Pedido do gestor, que via isso no Power BI.
//   - 3 cards: Inadimplencia (hoje x mes anterior), Recuperacao do mes,
//     Atraso acumulado (por idade).
//   - 2 graficos lado a lado (escalas diferentes: nunca dois eixos no mesmo
//     grafico): inadimplencia % e recuperacao % mes a mes.
//   - Faixas de atraso mes a mes (barras empilhadas, um tom so).
//   - Tabela por loja ou por cobrador, pior primeiro.
// Os numeros vem da RPC inadimplencia_historico; as contas de exibicao de
// filters/inadimplenciaHistorico. O periodo do topo da pagina nao se aplica
// aqui (a janela e sempre de 12 meses de vencimento).

const fmtValor = (v: number): string => formatCurrency(v, false);

/** R$ 1,24 mi / R$ 67 mil -- para eixos e quadrinhos. */
const fmtCurto = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e6)
    return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3)
    return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return fmtValor(v);
};

type Agrupar = "loja" | "cobrador";

const buscarHistorico = async (
  meses: number,
  lojas: string[] | null,
  agrupar: Agrupar | null,
): Promise<PontoInadimplencia[]> => {
  const { data, error } = await supabase.rpc("inadimplencia_historico", {
    p_meses: meses,
    ...(lojas ? { p_lojas: lojas } : {}),
    ...(agrupar ? { p_agrupar: agrupar } : {}),
  });
  if (error) throw error;
  return (data ?? []).map(pontoDaRpc);
};

/** Busca com o cache de tela (voltar para a aba nao refaz a consulta). */
function useHistorico(
  meses: number,
  lojas: string[] | null,
  agrupar: Agrupar | null,
  ativo = true,
): { dados: PontoInadimplencia[] | null; erro: boolean } {
  const chave = `inadimplenciaHistorico|${meses}|${agrupar ?? ""}|${lojas ? [...lojas].sort().join(",") : "*"}`;
  const [estado, setEstado] = useState<{
    chave: string;
    dados: PontoInadimplencia[];
  } | null>(() => {
    const c = lerCacheTela<PontoInadimplencia[]>(chave);
    return c ? { chave, dados: c.valor } : null;
  });
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    setErro(false);
    const c = lerCacheTela<PontoInadimplencia[]>(chave);
    if (c) {
      setEstado({ chave, dados: c.valor });
      if (c.fresco) return;
    }
    buscarComCacheTela(chave, () => buscarHistorico(meses, lojas, agrupar))
      .then((dados) => {
        if (!cancelado) setEstado({ chave, dados });
      })
      .catch((e) => {
        console.error("Erro ao buscar o histórico da inadimplência:", e);
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
    };
    // `chave` ja carrega meses/lojas/agrupar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo]);

  return {
    dados: estado && estado.chave === chave ? estado.dados : null,
    erro,
  };
}

// ---------------------------------------------------------------------------
// Grafico de linha (uma serie so -- o titulo do quadro nomeia a serie).
// ---------------------------------------------------------------------------

const M = { top: 14, right: 16, bottom: 26, left: 44 };
// Os graficos ocupam a largura toda: proporcao larga, para o texto nao
// crescer junto com o grafico.
const WF = 1200;
const HF = 260;

const GraficoLinha: React.FC<{
  titulo: string;
  subtitulo?: string;
  pontos: { rotulo: string; valor: number; dica: string[] }[];
  /** Cor da linha (classe stroke-/fill-). */
  cor: { linha: string; ponto: string };
}> = ({ titulo, subtitulo, pontos, cor }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...pontos.map((p) => p.valor), 0);
  // Teto "redondo" para o eixo: 5, 10, 15, 20, 25, 30...
  const teto = Math.max(5, Math.ceil((max * 1.15) / 5) * 5);
  const passo = teto <= 5 ? 1 : teto <= 10 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= teto; t += passo) ticks.push(t);
  const iw = WF - M.left - M.right;
  const ih = HF - M.top - M.bottom;
  const x = (i: number) =>
    M.left + (pontos.length <= 1 ? iw / 2 : (i / (pontos.length - 1)) * iw);
  const y = (v: number) => M.top + ih - (v / teto) * ih;
  const caminho = pontos
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`,
    )
    .join(" ");
  const ultimo = pontos.length - 1;
  const h = hover ?? ultimo;

  return (
    <div className="min-w-0 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary p-3">
      <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
        {titulo}
      </div>
      {subtitulo && (
        <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
          {subtitulo}
        </div>
      )}
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${WF} ${HF}`}
          className="w-full h-auto"
          role="img"
          aria-label={`${titulo}: ${pontos.map((p) => `${p.rotulo} ${formatarPct(p.valor)}`).join(", ")}`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={WF - M.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-gray-200 dark:stroke-dark-border"
                strokeWidth={1}
              />
              <text
                x={M.left - 6}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-gray-500 dark:fill-gray-400 text-[11px]"
              >
                {t}%
              </text>
            </g>
          ))}
          {pontos.map((p, i) =>
            // Rotulo do eixo X: um sim, um nao quando ha muitos meses.
            pontos.length <= 12 || i % 2 === ultimo % 2 ? (
              <text
                key={p.rotulo}
                x={x(i)}
                y={HF - 8}
                textAnchor="middle"
                className="fill-gray-500 dark:fill-gray-400 text-[11px]"
              >
                {p.rotulo}
              </text>
            ) : null,
          )}
          {hover != null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={M.top}
              y2={M.top + ih}
              className="stroke-gray-300 dark:stroke-gray-600"
              strokeWidth={1}
            />
          )}
          <path d={caminho} fill="none" className={cor.linha} strokeWidth={2} />
          {pontos.map((p, i) => (
            <circle
              key={p.rotulo}
              cx={x(i)}
              cy={y(p.valor)}
              r={i === h ? 5 : 3.5}
              className={`${cor.ponto} stroke-white dark:stroke-dark-bg-secondary`}
              strokeWidth={2}
            />
          ))}
          {/* Rotulo direto so no ultimo ponto (o de hoje). */}
          <text
            x={x(ultimo)}
            y={y(pontos[ultimo]?.valor ?? 0) - 10}
            textAnchor="end"
            className="fill-gray-900 dark:fill-gray-100 text-[12px] font-bold"
          >
            {pontos[ultimo] ? formatarPct(pontos[ultimo].valor) : ""}
          </text>
          {/* Alvos de hover maiores que o ponto: uma faixa por mes. */}
          {pontos.map((p, i) => (
            <rect
              key={p.rotulo}
              x={x(i) - iw / Math.max(pontos.length - 1, 1) / 2}
              y={M.top}
              width={iw / Math.max(pontos.length - 1, 1)}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hover != null && pontos[hover] && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${(x(hover) / WF) * 100}%`,
              transform: `translateX(${hover > pontos.length / 2 ? "-105%" : "5%"})`,
            }}
          >
            <div className="font-semibold text-gray-900 dark:text-dark-text">
              {pontos[hover].rotulo} · {formatarPct(pontos[hover].valor)}
            </div>
            {pontos[hover].dica.map((d) => (
              <div
                key={d}
                className="text-gray-600 dark:text-dark-text-secondary whitespace-nowrap"
              >
                {d}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Faixas de atraso mes a mes: barras empilhadas, um tom so (laranja), do
// claro (atraso novo) ao escuro (mais de 1 ano).
// ---------------------------------------------------------------------------

const TONS_FAIXA = [
  { fill: "fill-orange-200", bg: "bg-orange-200" },
  { fill: "fill-orange-300", bg: "bg-orange-300" },
  { fill: "fill-orange-400", bg: "bg-orange-400" },
  { fill: "fill-orange-500", bg: "bg-orange-500" },
  { fill: "fill-orange-700", bg: "bg-orange-700" },
  { fill: "fill-orange-900", bg: "bg-orange-900" },
];

const GraficoFaixas: React.FC<{
  serie: PontoInadimplencia[];
  rotulos: string[];
}> = ({ serie, rotulos }) => {
  const [hover, setHover] = useState<number | null>(null);
  const totais = serie.map(atrasoTotal);
  const max = Math.max(...totais, 1);
  // Teto redondo em milhoes ou centenas de mil.
  // Passo "redondo" (1, 2, 2,5 ou 5 x 10^k) para ~4 linhas de grade.
  const bruto = (max * 1.05) / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo =
    [1, 2, 2.5, 5, 10].map((m) => m * pot).find((v) => v >= bruto) ?? pot * 10;
  const teto = Math.ceil((max * 1.05) / passo) * passo;
  const ticks: number[] = [];
  for (let t = 0; t <= teto + passo / 2; t += passo) ticks.push(t);
  const iw = WF - M.left - M.right;
  const ih = HF - M.top - M.bottom;
  const slot = iw / Math.max(serie.length, 1);
  const larg = Math.min(slot * 0.6, 48);
  const y = (v: number) => M.top + ih - (v / teto) * ih;

  return (
    <div className="min-w-0 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary p-3">
      <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
        Atraso acumulado, por tempo de atraso
      </div>
      <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
        Tudo o que estava vencido há {INADIMPLENCIA_A_PARTIR_DIAS} dias ou mais
        no fim de cada mês. Cor mais escura = atraso mais antigo.
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600 dark:text-dark-text-secondary">
        {FAIXAS_ATRASO.map((f, i) => (
          <span key={f.chave} className="inline-flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-sm ${TONS_FAIXA[i].bg}`} />
            {f.rotulo}
          </span>
        ))}
      </div>
      <div className="relative mt-1">
        <svg
          viewBox={`0 0 ${WF} ${HF}`}
          className="w-full h-auto"
          role="img"
          aria-label="Atraso acumulado por tempo de atraso, mês a mês"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={WF - M.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-gray-200 dark:stroke-dark-border"
                strokeWidth={1}
              />
              <text
                x={M.left - 6}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-gray-500 dark:fill-gray-400 text-[11px]"
              >
                {t === 0
                  ? "0"
                  : t >= 1e6
                    ? `${(t / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
                    : `${Math.round(t / 1e3)} mil`}
              </text>
            </g>
          ))}
          {serie.map((p, i) => {
            const cx = M.left + slot * i + slot / 2;
            let base = 0;
            return (
              <g
                key={p.dia}
                onMouseEnter={() => setHover(i)}
                opacity={hover == null || hover === i ? 1 : 0.55}
              >
                {FAIXAS_ATRASO.map((f, k) => {
                  const v = p.faixas[f.chave];
                  const y0 = y(base);
                  base += v;
                  const y1 = y(base);
                  return v > 0 ? (
                    <rect
                      key={f.chave}
                      x={cx - larg / 2}
                      y={y1}
                      width={larg}
                      height={Math.max(y0 - y1, 0)}
                      className={`${TONS_FAIXA[k].fill} stroke-white dark:stroke-dark-bg-secondary`}
                      strokeWidth={1}
                    />
                  ) : null;
                })}
                {(serie.length <= 12 || i % 2 === (serie.length - 1) % 2) && (
                  <text
                    x={cx}
                    y={HF - 8}
                    textAnchor="middle"
                    className="fill-gray-500 dark:fill-gray-400 text-[11px]"
                  >
                    {rotulos[i]}
                  </text>
                )}
                <rect
                  x={cx - slot / 2}
                  y={M.top}
                  width={slot}
                  height={ih}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>
        {hover != null && serie[hover] && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${((M.left + slot * hover + slot / 2) / WF) * 100}%`,
              transform: `translateX(${hover > serie.length / 2 ? "-105%" : "5%"})`,
            }}
          >
            <div className="font-semibold text-gray-900 dark:text-dark-text">
              {rotulos[hover]} · {fmtValor(totais[hover])}
            </div>
            {[...FAIXAS_ATRASO].reverse().map((f) => (
              <div
                key={f.chave}
                className="flex justify-between gap-3 text-gray-600 dark:text-dark-text-secondary whitespace-nowrap"
              >
                <span>{f.rotulo}</span>
                <span className="font-medium text-gray-900 dark:text-dark-text">
                  {fmtValor(serie[hover].faixas[f.chave])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Blocos visuais (25/11: o gestor e leigo -- entender pelo visual, cor,
// icone, barra e seta; texto so como rotulo curto, explicacao na dica).
// ---------------------------------------------------------------------------

const TOP_LINHAS = 5;

const COR_NIVEL = {
  baixa: "bg-green-500",
  media: "bg-amber-400",
  alta: "bg-red-500",
} as const;

const ESTILO_TENDENCIA: Record<
  Tendencia,
  { rotulo: string; fundo: string; texto: string; circulo: string }
> = {
  melhorou: {
    rotulo: "Melhorou",
    fundo:
      "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
    texto: "text-green-700 dark:text-green-400",
    circulo: "bg-green-500 text-white",
  },
  estavel: {
    rotulo: "Estável",
    fundo:
      "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
    texto: "text-amber-700 dark:text-amber-400",
    circulo: "bg-amber-400 text-white",
  },
  piorou: {
    rotulo: "Piorou",
    fundo: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
    texto: "text-red-700 dark:text-red-400",
    circulo: "bg-red-500 text-white",
  },
};

/** Seta no sentido do numero: na inadimplencia, melhorar e DESCER. */
const SetaTendencia: React.FC<{
  tendencia: Tendencia;
  /** "menor" = quanto menor melhor (inadimplencia); "maior" = recuperacao. */
  melhor?: "menor" | "maior";
  pequena?: boolean;
}> = ({ tendencia, melhor = "menor", pequena = false }) => {
  const e = ESTILO_TENDENCIA[tendencia];
  const Icone =
    tendencia === "estavel"
      ? Minus
      : (tendencia === "melhorou") === (melhor === "menor")
        ? ArrowDown
        : ArrowUp;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${e.circulo} ${pequena ? "h-5 w-5" : "h-6 w-6"}`}
      title={e.rotulo}
      aria-label={e.rotulo}
    >
      <Icone className={pequena ? "h-3 w-3" : "h-4 w-4"} strokeWidth={3} />
    </span>
  );
};

/** A resposta do mes, grande: Melhorou / Estavel / Piorou. */
const Veredito: React.FC<{
  tendencia: Tendencia;
  carregando: boolean;
  hint?: string;
}> = ({ tendencia, carregando, hint }) => {
  const e = ESTILO_TENDENCIA[tendencia];
  const Icone =
    tendencia === "melhorou"
      ? TrendingDown
      : tendencia === "piorou"
        ? TrendingUp
        : Minus;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${carregando ? "bg-gray-50 border-gray-200 dark:bg-dark-bg dark:border-dark-border animate-pulse" : e.fundo}`}
      title={hint}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${carregando ? "bg-gray-200 dark:bg-dark-border" : e.circulo}`}
      >
        {!carregando && <Icone className="h-6 w-6" strokeWidth={2.5} />}
      </span>
      <div>
        <div
          className={`text-2xl font-extrabold leading-tight ${carregando ? "text-gray-300" : e.texto}`}
        >
          {carregando ? "…" : e.rotulo}
        </div>
        <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
          desde o mês passado
        </div>
      </div>
    </div>
  );
};

const TEMA_CARD = {
  red: {
    faixa: "border-t-red-400 dark:border-t-red-500/70",
    numero: "text-red-600 dark:text-red-400",
    icone: "text-red-600 dark:text-red-400",
  },
  green: {
    faixa: "border-t-green-400 dark:border-t-green-500/70",
    numero: "text-green-600 dark:text-green-400",
    icone: "text-green-600 dark:text-green-400",
  },
} as const;

/** Card: titulo + seta, numero grande, e o desenho ao lado. */
const CardVisual: React.FC<{
  icon: React.ElementType;
  titulo: string;
  tema: keyof typeof TEMA_CARD;
  tendencia: Tendencia;
  carregando: boolean;
  numero: string;
  detalhe: string;
  hint: string;
  children: React.ReactNode;
}> = ({
  icon: Icon,
  titulo,
  tema,
  tendencia,
  carregando,
  numero,
  detalhe,
  hint,
  children,
}) => {
  const t = TEMA_CARD[tema];
  return (
    <div
      className={`min-w-0 rounded-xl border border-gray-200 border-t-4 ${t.faixa} dark:border-dark-border bg-gray-100 dark:bg-dark-bg px-4 py-3`}
      title={hint}
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-dark-text-secondary">
        <Icon className={`h-4 w-4 ${t.icone}`} />
        {titulo}
        {!carregando && (
          <span className="ml-auto">
            <SetaTendencia
              tendencia={tendencia}
              melhor={tema === "green" ? "maior" : "menor"}
            />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-4">
        <div className="min-w-0">
          <div
            className={`text-4xl font-extrabold leading-tight ${t.numero} ${carregando ? "animate-pulse" : ""}`}
          >
            {carregando ? "…" : numero}
          </div>
          <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
            {carregando ? "" : detalhe}
          </div>
        </div>
        <div className="ml-auto shrink-0">{!carregando && children}</div>
      </div>
    </div>
  );
};

/** 100 quadradinhos = R$ 100: os vermelhos sao os que nao foram pagos. */
const CemReais: React.FC<{ parte: number }> = ({ parte }) => {
  const vermelhos = Math.max(0, Math.min(100, Math.round(parte)));
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="grid grid-cols-10 gap-[2px]"
        role="img"
        aria-label={`${vermelhos} de cada 100 reais sem pagar`}
      >
        {Array.from({ length: 100 }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-[2px] ${i < vermelhos ? "bg-red-500" : "bg-green-300 dark:bg-green-800"}`}
          />
        ))}
      </div>
      <div className="text-[10px] font-medium text-gray-500 dark:text-dark-text-secondary">
        R$ {vermelhos} a cada R$ 100
      </div>
    </div>
  );
};

/** Barras horizontais curtas para comparar (ex.: este mes x media). */
const Comparacao: React.FC<{
  itens: { rotulo: string; valor: number; cor: string }[];
}> = ({ itens }) => {
  const max = Math.max(...itens.map((i) => i.valor), 0.0001);
  return (
    <div className="w-40 space-y-1.5">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="flex justify-between text-[10px] font-medium text-gray-500 dark:text-dark-text-secondary">
            <span>{i.rotulo}</span>
            <span>{formatarPct(i.valor)}</span>
          </div>
          <div className="h-3 rounded-full bg-white dark:bg-dark-bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full ${i.cor}`}
              style={{ width: `${(i.valor / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const AcompanhamentoInadimplencia: React.FC = () => {
  const { users } = useCollection();
  const [meses, setMeses] = useState<number>(() => {
    const salvo = Number(localStorage.getItem("inadimplenciaMeses"));
    return [6, 12, 24].includes(salvo) ? salvo : 12;
  });
  const [agrupar, setAgrupar] = useState<Agrupar>(() =>
    localStorage.getItem("inadimplenciaAgrupar") === "cobrador"
      ? "cobrador"
      : "loja",
  );
  const [lojasExcluidas, setLojasExcluidas] = useState<Set<string>>(new Set());
  const [verTodos, setVerTodos] = useState(false);
  const [mais, setMais] = useState(false);

  useEffect(() => {
    localStorage.setItem("inadimplenciaMeses", String(meses));
  }, [meses]);
  useEffect(() => {
    localStorage.setItem("inadimplenciaAgrupar", agrupar);
  }, [agrupar]);

  // Por loja sem filtro: da as opcoes do filtro e a tabela por loja.
  const porLoja = useHistorico(2, null, "loja");
  const lojas = useMemo(
    () =>
      [
        ...new Set(
          (porLoja.dados ?? [])
            .map((p) => p.chave)
            .filter((c): c is string => !!c),
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [porLoja.dados],
  );
  const lojasFiltro =
    lojasExcluidas.size === 0
      ? null
      : lojas.filter((l) => !lojasExcluidas.has(l));

  const empresa = useHistorico(meses, lojasFiltro, null);
  const porCobrador = useHistorico(
    2,
    lojasFiltro,
    "cobrador",
    agrupar === "cobrador",
  );

  const serie = empresa.dados ?? [];
  const atual = serie[serie.length - 1];
  const anterior = serie.length > 1 ? serie[serie.length - 2] : null;
  const rotulos = serie.map((p, i) =>
    i === serie.length - 1 ? `hoje` : rotuloMes(p.dia),
  );

  const nomeCobrador = (id: string | null) =>
    id
      ? (users.find((u) => u.id === id)?.name ?? "Cobrador removido")
      : "Sem cobrador";

  // Linhas da tabela: ultimo ponto (hoje) x penultimo (fim do mes anterior).
  const linhas = useMemo(() => {
    const fonte = agrupar === "loja" ? porLoja.dados : porCobrador.dados;
    if (!fonte) return null;
    const dias = [...new Set(fonte.map((p) => p.dia))].sort();
    const hoje = dias[dias.length - 1];
    const antes = dias.length > 1 ? dias[dias.length - 2] : null;
    const chaves = [...new Set(fonte.map((p) => p.chave))];
    return (
      chaves
        .filter(
          (k) =>
            agrupar !== "loja" ||
            lojasExcluidas.size === 0 ||
            (k != null && !lojasExcluidas.has(k)),
        )
        .map((k) => {
          const h = fonte.find((p) => p.chave === k && p.dia === hoje);
          const a = antes
            ? fonte.find((p) => p.chave === k && p.dia === antes)
            : undefined;
          return { chave: k, hoje: h, antes: a };
        })
        .filter(
          (
            l,
          ): l is {
            chave: string | null;
            hoje: PontoInadimplencia;
            antes: PontoInadimplencia | undefined;
          } => !!l.hoje && atrasoTotal(l.hoje) + l.hoje.venceu > 0,
        )
        // Loja: maior inadimplencia primeiro. Cobrador: menor recuperacao
        // primeiro -- a carteira dele e so de atrasados, entao a inadimplencia
        // e sempre alta e nao compara o trabalho (25/11).
        .sort((x, y) =>
          agrupar === "loja"
            ? pctInadimplencia(y.hoje) - pctInadimplencia(x.hoje)
            : pctRecuperacao(x.hoje) - pctRecuperacao(y.hoje),
        )
    );
  }, [agrupar, porLoja.dados, porCobrador.dados, lojasExcluidas]);

  const carregando = !empresa.dados && !empresa.erro;
  const erro = empresa.erro;

  const pctHoje = atual ? pctInadimplencia(atual) : 0;
  const varInad = atual
    ? variacaoPp(pctHoje, anterior ? pctInadimplencia(anterior) : null)
    : null;
  const tendInad = tendenciaInadimplencia(varInad);
  const recHoje = atual ? pctRecuperacao(atual) : 0;
  // Media da recuperacao so dos meses FECHADOS (o atual ainda esta correndo).
  const mediaRec = media(serie.slice(0, -1).map(pctRecuperacao));
  const tendRec = tendenciaRecuperacao(recHoje, mediaRec);
  const temRetrato = serie.some((p) => p.fonte === "retrato");
  const maxRecLinhas = Math.max(
    ...(linhas ?? []).map((l) => pctRecuperacao(l.hoje)),
    0.0001,
  );
  const linhasVisiveis = linhas
    ? verTodos
      ? linhas
      : linhas.slice(0, TOP_LINHAS)
    : null;

  // Explicacao so na dica do (i): a tela fala pelo visual (pedido 25/11).
  const notaRodape = [
    "Todos os títulos a prazo; cancelados, agrupados e renegociados ficam fora.",
    `Inadimplência: do que venceu nos últimos 12 meses, quanto está há ${INADIMPLENCIA_A_PARTIR_DIAS} dias ou mais sem pagar.`,
    "Recuperação: do atraso que vinha do mês anterior, quanto foi pago no mês.",
    temRetrato
      ? "Meses com retrato diário mostram o que se via no dia; os demais são reconstruídos pelas datas de pagamento."
      : "Meses passados reconstruídos pelas datas de pagamento; daqui para frente há um retrato por dia.",
    "Por cobrador: quem tem a carteira hoje.",
  ].join("\n");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-text-secondary">
          Loja
          <FiltroMultiplo
            opcoes={lojas.map((l) => ({ id: l, nome: l }))}
            excluidos={lojasExcluidas}
            onChange={setLojasExcluidas}
            textos={{
              todos: "Todas as lojas",
              nenhum: "Nenhuma loja",
              plural: "lojas",
            }}
          />
        </div>
        <div
          className="flex bg-gray-100 dark:bg-dark-bg rounded-lg p-0.5"
          role="group"
          aria-label="Meses no gráfico"
        >
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeses(m)}
              aria-pressed={meses === m}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all touch-manipulation ${
                meses === m
                  ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
              }`}
            >
              {m} meses
            </button>
          ))}
        </div>
        <span
          className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-dark-text cursor-help"
          title={notaRodape}
          aria-label={notaRodape}
        >
          <Info className="h-4 w-4" />
        </span>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          Não foi possível carregar a inadimplência. Recarregue a página.
        </div>
      )}

      {lojasFiltro && lojasFiltro.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
          Nenhuma loja selecionada.
        </div>
      ) : (
        <>
          {/* 1) A resposta primeiro: melhorou / estavel / piorou. */}
          <Veredito
            tendencia={tendInad}
            carregando={carregando}
            hint={
              varInad != null
                ? `Inadimplência ${formatarPct(pctHoje)} hoje × ${formatarPct(pctHoje - varInad)} no fim do mês passado (${formatarPp(varInad)}).`
                : undefined
            }
          />

          {/* 2) Dois cards visuais; 3) divida antiga a parte. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CardVisual
              icon={AlertTriangle}
              titulo="Inadimplência"
              tema="red"
              tendencia={tendInad}
              carregando={carregando}
              numero={formatarPct(pctHoje)}
              hint={`De cada R$ 100 que venceram nos últimos 12 meses, R$ ${Math.round(pctHoje)} estão sem pagar.`}
              detalhe={atual ? `${fmtCurto(atual.naoPago)} sem pagar` : ""}
            >
              <CemReais parte={pctHoje} />
            </CardVisual>
            <CardVisual
              icon={RotateCcw}
              titulo="Recuperação"
              tema="green"
              tendencia={tendRec}
              carregando={carregando}
              numero={atual ? fmtCurto(atual.recuperadoMes) : "—"}
              hint={`Do atraso que vinha de antes (${atual ? fmtValor(atual.atrasoInicioMes) : "—"}), foram pagos ${atual ? fmtValor(atual.recuperadoMes) : "—"} neste mês (${formatarPct(recHoje)}). Média dos meses anteriores: ${formatarPct(mediaRec)}.`}
              detalhe={`${formatarPct(recHoje)} do atraso`}
            >
              <Comparacao
                itens={[
                  {
                    rotulo: "este mês",
                    valor: recHoje,
                    cor: "bg-green-500",
                  },
                  {
                    rotulo: "média",
                    valor: mediaRec,
                    cor: "bg-gray-300 dark:bg-gray-600",
                  },
                ]}
              />
            </CardVisual>
          </div>

          {atual && atual.faixas.d365_mais > 0 && (
            <div
              className="flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-dark-bg px-3 py-2 text-sm text-gray-600 dark:text-dark-text-secondary"
              title="Atraso com mais de 1 ano: difícil de recuperar, acompanhado à parte do trabalho do mês."
            >
              <Hourglass className="h-4 w-4 text-gray-400" />
              <span>Dívida antiga</span>
              <span className="text-xs text-gray-400">+1 ano</span>
              <span className="ml-auto font-semibold text-gray-700 dark:text-dark-text">
                {fmtCurto(atual.faixas.d365_mais)}
              </span>
            </div>
          )}

          {serie.length > 0 && (
            <GraficoLinha
              titulo="Inadimplência, mês a mês"
              cor={{ linha: "stroke-red-500", ponto: "fill-red-500" }}
              pontos={serie.map((p, i) => ({
                rotulo: rotulos[i],
                valor: pctInadimplencia(p),
                dica: [
                  `Não pago: ${fmtValor(p.naoPago)}`,
                  `Venceu em 12 meses: ${fmtValor(p.venceu)}`,
                ],
              }))}
            />
          )}

          {/* 4) Lista curta: as piores primeiro, barra + seta. */}
          <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-dark-border">
              <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                Quem está pior
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-dark-text-secondary">
                {agrupar === "loja" ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    inadimplência
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 text-green-600" />
                    recuperação no mês
                  </>
                )}
              </span>
              <div
                className="ml-auto flex bg-gray-100 dark:bg-dark-bg rounded-lg p-0.5"
                role="group"
                aria-label="Agrupar por"
              >
                {(
                  [
                    ["loja", "Por loja", Store],
                    ["cobrador", "Por cobrador", Users],
                  ] as const
                ).map(([id, rotulo, Icone]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAgrupar(id)}
                    aria-pressed={agrupar === id}
                    className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all touch-manipulation ${
                      agrupar === id
                        ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                    }`}
                  >
                    <Icone className="h-4 w-4 mr-1.5" />
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-dark-border">
              {!linhasVisiveis ? (
                <div className="px-3 py-6 text-center text-sm text-gray-400 animate-pulse">
                  Carregando…
                </div>
              ) : linhasVisiveis.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-400">
                  Nada em atraso.
                </div>
              ) : (
                linhasVisiveis.map((l) => {
                  const pct = pctInadimplencia(l.hoje);
                  const v = variacaoPp(
                    pct,
                    l.antes ? pctInadimplencia(l.antes) : null,
                  );
                  const nome =
                    agrupar === "loja"
                      ? (l.chave ?? "Sem loja")
                      : nomeCobrador(l.chave);
                  const rec = pctRecuperacao(l.hoje);
                  const porLojaLinha = agrupar === "loja";
                  const largura = porLojaLinha
                    ? Math.min(pct, 100)
                    : (rec / maxRecLinhas) * 100;
                  return (
                    <div
                      key={l.chave ?? "-"}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"
                      title={`${nome}: inadimplência ${formatarPct(pct)}${v != null ? ` (${formatarPp(v)} no mês)` : ""} · recuperação ${formatarPct(pctRecuperacao(l.hoje))} · atraso ${fmtValor(atrasoTotal(l.hoje))} · +1 ano ${fmtValor(l.hoje.faixas.d365_mais)}`}
                    >
                      <span className="truncate text-sm text-gray-900 dark:text-dark-text">
                        {nome}
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-2.5 flex-1 rounded-full bg-gray-100 dark:bg-dark-bg overflow-hidden">
                          <div
                            className={`h-full rounded-full ${porLojaLinha ? COR_NIVEL[nivelInadimplencia(pct)] : "bg-green-500"}`}
                            style={{ width: `${largura}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-sm font-semibold text-gray-900 dark:text-dark-text">
                          {porLojaLinha
                            ? formatarPct(pct, 0)
                            : formatarPct(rec)}
                        </span>
                      </div>
                      {porLojaLinha ? (
                        <SetaTendencia
                          tendencia={tendenciaInadimplencia(v)}
                          pequena
                        />
                      ) : (
                        <RotateCcw className="h-4 w-4 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {linhas && linhas.length > TOP_LINHAS && (
              <button
                type="button"
                onClick={() => setVerTodos((x) => !x)}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg"
              >
                {verTodos ? "ver menos" : `ver todos (${linhas.length})`}
                {verTodos ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Resto em "mais graficos": recuperacao e idade do atraso. */}
          {serie.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setMais((x) => !x)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                {mais ? "menos gráficos" : "mais gráficos"}
                {mais ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {mais && (
                <div className="mt-3 space-y-3">
                  <GraficoLinha
                    titulo="Recuperação, mês a mês"
                    cor={{
                      linha: "stroke-green-600",
                      ponto: "fill-green-600",
                    }}
                    pontos={serie.map((p, i) => ({
                      rotulo: rotulos[i],
                      valor: pctRecuperacao(p),
                      dica: [
                        `Recuperado: ${fmtValor(p.recuperadoMes)}`,
                        `Atraso no início: ${fmtValor(p.atrasoInicioMes)}`,
                      ],
                    }))}
                  />
                  <GraficoFaixas serie={serie} rotulos={rotulos} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AcompanhamentoInadimplencia;
