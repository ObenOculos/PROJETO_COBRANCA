import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { useCollection } from "../../contexts/CollectionContext";
import {
  Agrupar,
  useHistorico,
} from "../../hooks/useInadimplenciaHistorico";
import { formatCurrency } from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
import { Pilula } from "./ResumoEmpresa";
import { METRICA } from "../common/pilulaEstilo";
import FiltroMultiplo from "../common/FiltroMultiplo";
import {
  INADIMPLENCIA_A_PARTIR_DIAS,
  nivelInadimplencia,
} from "../../filters/inadimplencia";
import {
  FAIXAS_ATRASO,
  INADIMPLENCIA_MES_INICIAL,
  PresetIntervalo,
  intervaloDoPreset,
  somarMeses,
  PontoInadimplencia,
  atrasoTotal,
  formatarPct,
  formatarPp,
  media,
  pctInadimplencia,
  pctRecuperacao,
  rotuloMes,
  Tendencia,
  tendenciaInadimplencia,
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

/** De quantos em quantos meses vai um rotulo no eixo X (~12 no maximo). */
const passoRotulo = (n: number): number => Math.max(1, Math.ceil(n / 12));

/** R$ 1,24 mi / R$ 67 mil -- para eixos e quadrinhos. */
const fmtCurto = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e6)
    return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3)
    return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return fmtValor(v);
};

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
            // Rotulo do eixo X: no maximo ~12, sempre com o ultimo.
            (ultimo - i) % passoRotulo(pontos.length) === 0 ? (
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
                {(serie.length - 1 - i) % passoRotulo(serie.length) === 0 && (
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

// 25/11: a recuperacao divide pelo atraso de qualquer idade; com a divida
// antiga crescendo, o % cai ao longo dos anos mesmo com o mesmo trabalho.
// Decisao do usuario: manter a conta e deixar isso claro na tela.
const NOTA_RECUPERACAO =
  "Conta todo o atraso, inclusive a dívida antiga (+1 ano), que quase não volta. Em 2022 havia pouca dívida antiga, por isso os % daquela época são maiores.";

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
    barra: "bg-red-500",
  },
  green: {
    faixa: "border-t-green-400 dark:border-t-green-500/70",
    numero: "text-green-600 dark:text-green-400",
    icone: "text-green-600 dark:text-green-400",
    barra: "bg-green-500",
  },
} as const;

/** Card (formato A, escolhido pelo usuario 25/11): um numero so, uma
 * barra sobre fundo cinza com um tracinho de referencia (mes passado ou
 * media) e o valor em R$ pequeno embaixo. Sem verde no card vermelho, sem
 * repetir a tendencia (o veredito ja diz). */
const CardVisual: React.FC<{
  icon: React.ElementType;
  titulo: string;
  tema: keyof typeof TEMA_CARD;
  carregando: boolean;
  /** Valor em % (numero grande e tamanho da barra). */
  pct: number;
  /** Onde fica o tracinho, em %; null = sem tracinho. */
  referencia: number | null;
  rotuloReferencia: string;
  /** Fim da escala da barra, em %. */
  escala: number;
  /** 2-3 quadrinhos com os numeros principais (mesmo estilo do Resumo). */
  pilulas: Pilula[];
  /** Linhas do "ver detalhes" (barra opcional, 0-100). */
  detalhes: { rotulo: string; valor: string; barra?: number; hint?: string }[];
  /** Cor da barrinha dos detalhes. */
  corDetalhe: string;
  /** Mes que o numero grande mostra (o "ate" do intervalo). */
  mes: string;
  /** Setas do mes (undefined = seta apagada). */
  onMesAnterior?: () => void;
  onMesSeguinte?: () => void;
  /** Observacao curta no fim do "ver detalhes". */
  nota?: string;
  hint: string;
}> = ({
  icon: Icon,
  titulo,
  tema,
  carregando,
  pct,
  referencia,
  rotuloReferencia,
  escala,
  pilulas,
  detalhes,
  corDetalhe,
  mes,
  onMesAnterior,
  onMesSeguinte,
  nota,
  hint,
}) => {
  const [aberto, setAberto] = useState(false);
  const t = TEMA_CARD[tema];
  const pos = (v: number) =>
    `${Math.max(0, Math.min(100, (v / escala) * 100))}%`;
  return (
    <div
      className={`min-w-0 rounded-xl border border-gray-200 dark:border-dark-border border-t-4 ${t.faixa} bg-gray-100 dark:bg-dark-bg px-4 pt-3 pb-2.5`}
      title={hint}
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-dark-text-secondary">
        <Icon className={`h-4 w-4 ${t.icone}`} />
        {titulo}
        {/* 25/11: deixar claro de que mes e o numero (o "ate"); o "de" so
            muda a media e o grafico. */}
        {/* 25/11: setas para ver o mes passado (ou outro) sem mexer no
            "ate" -- o gestor perguntava por que o % nao mudava. */}
        {!carregando && mes && (
          <span className="ml-auto inline-flex items-center rounded-full bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border text-[11px] font-semibold text-gray-600 dark:text-dark-text-secondary">
            <button
              type="button"
              onClick={onMesAnterior}
              disabled={!onMesAnterior}
              aria-label="Mês anterior"
              title="Mês anterior"
              className="rounded-l-full px-1 py-0.5 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-inherit touch-manipulation"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span
              className="inline-flex items-center gap-1 py-0.5"
              title="Mês mostrado no número grande (o fim do intervalo)"
            >
              <CalendarRange className="h-3 w-3" />
              {mes}
            </span>
            <button
              type="button"
              onClick={onMesSeguinte}
              disabled={!onMesSeguinte}
              aria-label="Mês seguinte"
              title="Mês seguinte"
              className="rounded-r-full px-1 py-0.5 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-inherit touch-manipulation"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      <div
        className={`mt-1 text-4xl font-extrabold leading-tight tracking-tight text-gray-900 dark:text-dark-text ${carregando ? "animate-pulse" : ""}`}
      >
        {carregando ? "…" : formatarPct(pct)}
      </div>
      <div className="relative mt-2 mb-4">
        <div className="h-3 rounded-full bg-gray-300/70 dark:bg-dark-border overflow-hidden">
          {!carregando && (
            <div
              className={`h-full rounded-full ${t.barra}`}
              style={{ width: pos(pct) }}
            />
          )}
        </div>
        {!carregando && referencia != null && (
          <div
            className="absolute top-[-3px] flex flex-col items-center -translate-x-1/2"
            style={{ left: pos(referencia) }}
            title={`${rotuloReferencia}: ${formatarPct(referencia)}`}
          >
            <span className="h-[18px] w-0.5 rounded bg-gray-700 dark:bg-gray-200" />
            <span className="mt-0.5 whitespace-nowrap text-[10px] text-gray-500 dark:text-dark-text-secondary">
              {rotuloReferencia}{" "}
              <strong className="text-gray-700 dark:text-dark-text">
                {formatarPct(referencia)}
              </strong>
            </span>
          </div>
        )}
      </div>
      {/* Metricas secundarias em texto, sem caixa (26/11: hierarquia --
          mesmo estilo dos cards do Resumo). */}
      {!carregando && pilulas.length > 0 && (
        <div
          className={`grid gap-x-3 gap-y-2 border-t border-gray-200 dark:border-dark-border/60 pt-2.5 ${pilulas.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {pilulas.map((p) => (
            <div key={p.rotulo} title={p.hint} className="min-w-0">
              <div
                className={`text-base font-bold leading-tight truncate tabular-nums ${METRICA[p.tom]}`}
              >
                {p.valor}
              </div>
              <div className="text-[11px] leading-tight truncate text-gray-500 dark:text-dark-text-secondary">
                {p.rotulo}
              </div>
            </div>
          ))}
        </div>
      )}
      {!carregando && detalhes.length > 0 && (
        <div className="pt-2">
          {aberto && (
            <div className="mb-1.5 space-y-1.5 border-t border-gray-300 dark:border-dark-border/60 pt-2">
              {detalhes.map((d) => (
                <div key={d.rotulo} title={d.hint} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-gray-600 dark:text-dark-text-secondary truncate">
                      {d.rotulo}
                    </span>
                    <span className="font-bold whitespace-nowrap text-gray-900 dark:text-dark-text">
                      {d.valor}
                    </span>
                  </div>
                  {d.barra != null && (
                    <div className="mt-0.5 h-1.5 rounded-full bg-gray-300/60 dark:bg-dark-border overflow-hidden">
                      <div
                        className={`h-full rounded-full ${corDetalhe}`}
                        style={{
                          width: `${Math.max(0, Math.min(100, d.barra))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
              {nota && (
                <div className="flex gap-1.5 pt-1 text-[11px] leading-snug text-gray-500 dark:text-dark-text-secondary">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>{nota}</span>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-dark-text-secondary dark:hover:text-dark-text"
          >
            {aberto ? "menos detalhes" : "ver detalhes"}
            {aberto ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

const AcompanhamentoInadimplencia: React.FC = () => {
  const { users } = useCollection();
  const mesAtual = todayLocalStr().slice(0, 7);
  // Intervalo do grafico (25/11): 12 / 24 meses, Tudo ou de/ate. Os cards
  // mostram o ULTIMO mes do intervalo. O atalho escolhido fica salvo; o
  // personalizado volta para 12 meses ao reabrir.
  const [preset, setPreset] = useState<PresetIntervalo>(() => {
    const salvo = localStorage.getItem("inadimplenciaIntervalo");
    return salvo === "24" || salvo === "tudo" ? salvo : "12";
  });
  const [intervalo, setIntervalo] = useState(() =>
    intervaloDoPreset(preset === "personalizado" ? "12" : preset, mesAtual),
  );
  const escolherPreset = (p: Exclude<PresetIntervalo, "personalizado">) => {
    setPreset(p);
    setIntervalo(intervaloDoPreset(p, mesAtual));
    localStorage.setItem("inadimplenciaIntervalo", p);
  };
  const mudarMes = (campo: "inicio" | "fim", valor: string) => {
    if (!/^\d{4}-\d{2}$/.test(valor)) return;
    setPreset("personalizado");
    setIntervalo((atual) => {
      const novo = { ...atual, [campo]: valor };
      // Mantem inicio <= fim <= mes atual.
      if (novo.fim > mesAtual) novo.fim = mesAtual;
      if (novo.inicio > novo.fim) {
        if (campo === "inicio") novo.fim = novo.inicio;
        else novo.inicio = novo.fim;
      }
      return novo;
    });
  };
  // Setas do card: anda o intervalo inteiro um mes (mesmo tamanho), sem
  // passar do mes atual nem do inicio da base.
  const andarMes = (n: number) => {
    setPreset("personalizado");
    setIntervalo((atual) => {
      const fim = somarMeses(atual.fim, n);
      const inicio = somarMeses(atual.inicio, n);
      return {
        fim,
        inicio: inicio < INADIMPLENCIA_MES_INICIAL ? INADIMPLENCIA_MES_INICIAL : inicio,
      };
    });
  };
  const podeVoltar = intervalo.fim > INADIMPLENCIA_MES_INICIAL;
  const podeAvancar = intervalo.fim < mesAtual;
  const [agrupar, setAgrupar] = useState<Agrupar>(() =>
    localStorage.getItem("inadimplenciaAgrupar") === "cobrador"
      ? "cobrador"
      : "loja",
  );
  const [lojasExcluidas, setLojasExcluidas] = useState<Set<string>>(new Set());
  const [verTodos, setVerTodos] = useState(false);
  const [mais, setMais] = useState(false);

  useEffect(() => {
    localStorage.setItem("inadimplenciaAgrupar", agrupar);
  }, [agrupar]);

  // Tabela: ultimo mes do intervalo x mes anterior. Por loja sem filtro: da
  // tambem as opcoes do filtro de loja.
  const mesAnteriorFim = somarMeses(intervalo.fim, -1);
  const porLoja = useHistorico(mesAnteriorFim, intervalo.fim, null, "loja");
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

  const empresa = useHistorico(
    intervalo.inicio,
    intervalo.fim,
    lojasFiltro,
    null,
  );
  const porCobrador = useHistorico(
    mesAnteriorFim,
    intervalo.fim,
    lojasFiltro,
    "cobrador",
    agrupar === "cobrador",
  );

  const serie = empresa.dados ?? [];
  const atual = serie[serie.length - 1];
  const anterior = serie.length > 1 ? serie[serie.length - 2] : null;
  const hoje = todayLocalStr();
  const rotulos = serie.map((p) =>
    p.dia === hoje ? "hoje" : rotuloMes(p.dia),
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
  const mediaValorRec = media(serie.slice(0, -1).map((p) => p.recuperadoMes));
  // Recuperacao e pequena (~2%): barra de 0 a 10% (ou a dezena acima).
  const escalaRec = Math.max(
    10,
    Math.ceil(Math.max(recHoje, mediaRec) / 10) * 10,
  );
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

  // "ver detalhes" dos cards (25/11: os cards tinham ficado resumidos
  // demais). Inadimplencia: o sem pagar por tempo de atraso + lojas
  // extremas + pico do periodo. Recuperacao: mes passado, melhor/pior mes e
  // total recuperado no periodo.
  const lojasOrdenadas =
    agrupar === "loja" && linhas
      ? linhas
      : porLoja.dados
        ? (() => {
            const dias = [...new Set(porLoja.dados.map((p) => p.dia))].sort();
            const ult = dias[dias.length - 1];
            return porLoja.dados
              .filter((p) => p.dia === ult && p.chave && p.venceu > 0)
              .filter(
                (p) =>
                  lojasExcluidas.size === 0 ||
                  !lojasExcluidas.has(p.chave as string),
              )
              .map((p) => ({ chave: p.chave, hoje: p }))
              .sort(
                (x, y) => pctInadimplencia(y.hoje) - pctInadimplencia(x.hoje),
              );
          })()
        : [];
  const piorLoja = lojasOrdenadas[0];
  const melhorLoja = lojasOrdenadas[lojasOrdenadas.length - 1];
  const fechados = serie.slice(0, -1);
  const picoInad = serie.reduce<PontoInadimplencia | null>(
    (m, p) => (!m || pctInadimplencia(p) > pctInadimplencia(m) ? p : m),
    null,
  );
  const menorInad = serie.reduce<PontoInadimplencia | null>(
    (m, p) => (!m || pctInadimplencia(p) < pctInadimplencia(m) ? p : m),
    null,
  );
  const melhorRec = fechados.reduce<PontoInadimplencia | null>(
    (m, p) => (!m || pctRecuperacao(p) > pctRecuperacao(m) ? p : m),
    null,
  );
  const piorRec = fechados.reduce<PontoInadimplencia | null>(
    (m, p) => (!m || pctRecuperacao(p) < pctRecuperacao(m) ? p : m),
    null,
  );
  const totalRecuperado = serie.reduce((s2, p) => s2 + p.recuperadoMes, 0);
  const rotuloPonto = (p: PontoInadimplencia) =>
    p.dia === hoje ? "hoje" : rotuloMes(p.dia);
  const mesDoCard = atual
    ? atual.dia === hoje
      ? `${rotuloMes(atual.dia)} até hoje`
      : rotuloMes(atual.dia)
    : "";

  const detalhesInad = atual
    ? [
        ...FAIXAS_ATRASO.filter((f) => f.chave !== "d365_mais").map((f) => ({
          rotulo: `Atrasado ${f.rotulo === "3 a 30 dias" ? "3 a 30 dias" : `${f.rotulo} dias`}`,
          valor: fmtCurto(atual.faixas[f.chave]),
          barra:
            atual.naoPago > 0
              ? (atual.faixas[f.chave] / atual.naoPago) * 100
              : 0,
          hint: fmtValor(atual.faixas[f.chave]),
        })),
        ...(piorLoja && piorLoja.chave
          ? [
              {
                rotulo: `Pior loja: ${piorLoja.chave}`,
                valor: formatarPct(pctInadimplencia(piorLoja.hoje)),
              },
            ]
          : []),
        ...(melhorLoja && melhorLoja.chave && melhorLoja !== piorLoja
          ? [
              {
                rotulo: `Melhor loja: ${melhorLoja.chave}`,
                valor: formatarPct(pctInadimplencia(melhorLoja.hoje)),
              },
            ]
          : []),
        ...(picoInad && menorInad && serie.length > 2
          ? [
              {
                rotulo: `Maior do período (${rotuloPonto(picoInad)})`,
                valor: formatarPct(pctInadimplencia(picoInad)),
              },
              {
                rotulo: `Menor do período (${rotuloPonto(menorInad)})`,
                valor: formatarPct(pctInadimplencia(menorInad)),
              },
            ]
          : []),
      ]
    : [];

  const detalhesRec = atual
    ? [
        ...(anterior
          ? [
              {
                rotulo: `Mês passado (${rotuloMes(anterior.dia)})`,
                valor: `${formatarPct(pctRecuperacao(anterior))} · ${fmtCurto(anterior.recuperadoMes)}`,
              },
            ]
          : []),
        ...(melhorRec && fechados.length > 1
          ? [
              {
                rotulo: `Melhor mês (${rotuloMes(melhorRec.dia)})`,
                valor: `${formatarPct(pctRecuperacao(melhorRec))} · ${fmtCurto(melhorRec.recuperadoMes)}`,
              },
            ]
          : []),
        ...(piorRec && fechados.length > 1
          ? [
              {
                rotulo: `Pior mês (${rotuloMes(piorRec.dia)})`,
                valor: `${formatarPct(pctRecuperacao(piorRec))} · ${fmtCurto(piorRec.recuperadoMes)}`,
              },
            ]
          : []),
        {
          rotulo: `Recuperado no período (${serie.length} ${serie.length === 1 ? "mês" : "meses"})`,
          valor: fmtCurto(totalRecuperado),
          hint: fmtValor(totalRecuperado),
        },
      ]
    : [];

  // Explicacao so na dica do (i): a tela fala pelo visual (pedido 25/11).
  const notaRodape = [
    "Todos os títulos a prazo; cancelados, agrupados e renegociados ficam fora.",
    `Inadimplência: do que venceu nos últimos 12 meses, quanto está há ${INADIMPLENCIA_A_PARTIR_DIAS} dias ou mais sem pagar.`,
    "Recuperação: do atraso que vinha do mês anterior (de qualquer idade, inclusive a dívida antiga), quanto foi pago no mês. Com pouca dívida antiga (2022), o % era maior.",
    'Os cards mostram o mês do "até"; o "de" muda o gráfico e as médias.',
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
          aria-label="Intervalo do gráfico"
        >
          {(
            [
              ["12", "12 meses"],
              ["24", "24 meses"],
              ["tudo", "Tudo"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => escolherPreset(id)}
              aria-pressed={preset === id}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all touch-manipulation ${
                preset === id
                  ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div
          className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs ${
            preset === "personalizado"
              ? "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
              : ""
          }`}
        >
          <CalendarRange className="h-4 w-4 text-gray-400" />
          <input
            type="month"
            aria-label="De"
            title="Muda o gráfico e as médias"
            value={intervalo.inicio}
            min={INADIMPLENCIA_MES_INICIAL}
            max={intervalo.fim}
            onChange={(e) => mudarMes("inicio", e.target.value)}
            className="px-1.5 py-1 rounded-md border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text"
          />
          <span className="text-gray-400">–</span>
          <input
            type="month"
            aria-label="Até"
            title="Os cards mostram este mês"
            value={intervalo.fim}
            min={intervalo.inicio}
            max={mesAtual}
            onChange={(e) => mudarMes("fim", e.target.value)}
            className="px-1.5 py-1 rounded-md border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-700 dark:text-dark-text"
          />
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
              carregando={carregando}
              pct={pctHoje}
              referencia={anterior ? pctInadimplencia(anterior) : null}
              rotuloReferencia="mês passado"
              escala={100}
              pilulas={
                atual
                  ? [
                      {
                        valor: fmtCurto(atual.naoPago),
                        rotulo: "sem pagar",
                        tom: "red",
                        hint: fmtValor(atual.naoPago),
                      },
                      {
                        valor: fmtCurto(atual.venceu),
                        rotulo: "venceu em 12 meses",
                        tom: "gray",
                        hint: fmtValor(atual.venceu),
                      },
                      {
                        valor:
                          varInad == null
                            ? "—"
                            : tendInad === "estavel"
                              ? "igual"
                              : formatarPp(varInad),
                        rotulo: "vs. mês passado",
                        tom:
                          tendInad === "piorou"
                            ? "red"
                            : tendInad === "melhorou"
                              ? "green"
                              : "gray",
                        hint:
                          varInad != null && anterior
                            ? `Mês passado: ${formatarPct(pctInadimplencia(anterior))}`
                            : undefined,
                      },
                    ]
                  : []
              }
              corDetalhe="bg-red-400"
              mes={mesDoCard}
              onMesAnterior={podeVoltar ? () => andarMes(-1) : undefined}
              onMesSeguinte={podeAvancar ? () => andarMes(1) : undefined}
              detalhes={detalhesInad}
              hint={`De cada R$ 100 que venceram nos últimos 12 meses, R$ ${Math.round(pctHoje)} estão sem pagar.`}
            />
            <CardVisual
              icon={RotateCcw}
              titulo="Recuperação"
              tema="green"
              carregando={carregando}
              pct={recHoje}
              referencia={mediaRec > 0 ? mediaRec : null}
              rotuloReferencia="média"
              escala={escalaRec}
              pilulas={
                atual
                  ? [
                      {
                        valor: fmtCurto(atual.recuperadoMes),
                        rotulo: "recuperados no mês",
                        tom: "green",
                        hint: fmtValor(atual.recuperadoMes),
                      },
                      {
                        valor: fmtCurto(atual.atrasoInicioMes),
                        rotulo: "em atraso no início",
                        tom: "gray",
                        hint: fmtValor(atual.atrasoInicioMes),
                      },
                      {
                        valor: fmtCurto(mediaValorRec),
                        rotulo: `média/mês · ${formatarPct(mediaRec)}`,
                        tom: "gray",
                        hint: `Média dos meses fechados do período: ${fmtValor(mediaValorRec)} por mês (${formatarPct(mediaRec)} do atraso).`,
                      },
                    ]
                  : []
              }
              corDetalhe="bg-green-500"
              mes={mesDoCard}
              onMesAnterior={podeVoltar ? () => andarMes(-1) : undefined}
              onMesSeguinte={podeAvancar ? () => andarMes(1) : undefined}
              nota={NOTA_RECUPERACAO}
              detalhes={detalhesRec}
              hint={`Do atraso que vinha de antes (${atual ? fmtValor(atual.atrasoInicioMes) : "—"}), foram pagos ${atual ? fmtValor(atual.recuperadoMes) : "—"} no mês. Média dos meses anteriores: ${formatarPct(mediaRec)}.`}
            />
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
                    subtitulo={NOTA_RECUPERACAO}
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
