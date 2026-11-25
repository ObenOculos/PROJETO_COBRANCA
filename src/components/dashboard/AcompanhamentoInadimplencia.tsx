import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Hourglass,
  RotateCcw,
  Store,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useCollection } from "../../contexts/CollectionContext";
import { buscarComCacheTela, lerCacheTela } from "../../utils/cacheTela";
import { formatCurrency } from "../../utils/formatters";
import FiltroMultiplo from "../common/FiltroMultiplo";
import { CardSimples } from "./ResumoEmpresa";
import { INADIMPLENCIA_A_PARTIR_DIAS } from "../../filters/inadimplencia";
import {
  FAIXAS_ATRASO,
  PontoInadimplencia,
  atrasoPorIdade,
  atrasoTotal,
  formatarPct,
  formatarPp,
  media,
  pctInadimplencia,
  pctRecuperacao,
  pontoDaRpc,
  rotuloDia,
  rotuloMes,
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

const W = 600;
const H = 200;
const M = { top: 14, right: 16, bottom: 26, left: 44 };
// Faixas ocupa a largura toda: proporcao mais larga, para o texto nao
// crescer junto com o grafico.
const WF = 1200;
const HF = 260;

const GraficoLinha: React.FC<{
  titulo: string;
  subtitulo: string;
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
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
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
      <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
        {subtitulo}
      </div>
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`${titulo}: ${pontos.map((p) => `${p.rotulo} ${formatarPct(p.valor)}`).join(", ")}`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={W - M.right}
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
                y={H - 8}
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
              left: `${(x(hover) / W) * 100}%`,
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
    return chaves
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
      .sort((x, y) => pctInadimplencia(y.hoje) - pctInadimplencia(x.hoje));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agrupar, porLoja.dados, porCobrador.dados, lojasExcluidas]);

  const carregando = !empresa.dados && !empresa.erro;
  const erro = empresa.erro;

  const pctHoje = atual ? pctInadimplencia(atual) : 0;
  const varInad = atual
    ? variacaoPp(pctHoje, anterior ? pctInadimplencia(anterior) : null)
    : null;
  // Media da recuperacao so dos meses FECHADOS (o atual ainda esta correndo).
  const mediaRec = media(serie.slice(0, -1).map(pctRecuperacao));
  const idade = atual
    ? atrasoPorIdade(atual)
    : { ate90: 0, ate365: 0, maisDeAno: 0 };
  const totalAtraso = atual ? atrasoTotal(atual) : 0;
  const totalAtrasoAntes = anterior ? atrasoTotal(anterior) : null;
  const temRetrato = serie.some((p) => p.fonte === "retrato");

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
      </div>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          Não foi possível carregar a inadimplência. Recarregue a página; se
          continuar, avise o suporte.
        </div>
      )}

      {lojasFiltro && lojasFiltro.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
          Nenhuma loja selecionada.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <CardSimples
              icon={AlertTriangle}
              titulo="Inadimplência"
              tema="red"
              numero={carregando ? "…" : formatarPct(pctHoje)}
              numeroLoading={carregando}
              frase={`do que venceu nos últimos 12 meses não foi pago (atraso de ${INADIMPLENCIA_A_PARTIR_DIAS} dias ou mais)`}
              pilulas={
                atual
                  ? [
                      {
                        valor: fmtCurto(atual.naoPago),
                        rotulo: "Não pago",
                        tom: "red",
                      },
                      {
                        valor: fmtCurto(atual.venceu),
                        rotulo: "Venceu em 12 meses",
                        tom: "gray",
                      },
                      ...(varInad != null
                        ? [
                            {
                              valor: formatarPp(varInad),
                              rotulo: "desde o fim do mês passado",
                              tom: (varInad > 0.05
                                ? "red"
                                : varInad < -0.05
                                  ? "green"
                                  : "gray") as "red" | "green" | "gray",
                              hint: "Pontos percentuais: subir é ruim, cair é bom.",
                            },
                          ]
                        : []),
                    ]
                  : []
              }
            />
            <CardSimples
              icon={RotateCcw}
              titulo="Recuperação"
              tema="green"
              numero={
                carregando
                  ? "…"
                  : formatarPct(atual ? pctRecuperacao(atual) : 0)
              }
              numeroLoading={carregando}
              frase={`do atraso que vinha de antes foi pago neste mês (até ${atual ? rotuloDia(atual.dia) : "hoje"})`}
              pilulas={
                atual
                  ? [
                      {
                        valor: fmtCurto(atual.recuperadoMes),
                        rotulo: "Recuperado no mês",
                        tom: "green",
                      },
                      {
                        valor: fmtCurto(atual.atrasoInicioMes),
                        rotulo: "Atraso no início do mês",
                        tom: "gray",
                      },
                      {
                        valor: formatarPct(mediaRec),
                        rotulo: `Média dos ${Math.max(serie.length - 1, 0)} meses anteriores`,
                        tom: "gray",
                        hint: "Recuperação média dos meses já fechados (o mês atual ainda está correndo).",
                      },
                    ]
                  : []
              }
            />
            <CardSimples
              icon={Hourglass}
              titulo="Atraso acumulado"
              tema="slate"
              numero={carregando ? "…" : fmtCurto(totalAtraso)}
              numeroHint={fmtValor(totalAtraso)}
              numeroLoading={carregando}
              frase={
                totalAtrasoAntes != null
                  ? `em atraso hoje, de qualquer idade (${totalAtraso >= totalAtrasoAntes ? "+" : "−"}${fmtCurto(Math.abs(totalAtraso - totalAtrasoAntes))} no mês)`
                  : "em atraso hoje, de qualquer idade"
              }
              pilulas={
                atual
                  ? [
                      {
                        valor: fmtCurto(idade.ate90),
                        rotulo: "Até 90 dias",
                        tom: "amber",
                      },
                      {
                        valor: fmtCurto(idade.ate365),
                        rotulo: "91 dias a 1 ano",
                        tom: "amber",
                      },
                      {
                        valor: fmtCurto(idade.maisDeAno),
                        rotulo: "Mais de 1 ano",
                        tom: "red",
                      },
                    ]
                  : []
              }
            />
          </div>

          {serie.length > 0 && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <GraficoLinha
                  titulo="Inadimplência, mês a mês"
                  subtitulo="Quanto menor, melhor. No fim de cada mês."
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
                <GraficoLinha
                  titulo="Recuperação, mês a mês"
                  subtitulo="Quanto maior, melhor. Do atraso no início de cada mês."
                  cor={{ linha: "stroke-green-600", ponto: "fill-green-600" }}
                  pontos={serie.map((p, i) => ({
                    rotulo: rotulos[i],
                    valor: pctRecuperacao(p),
                    dica: [
                      `Recuperado: ${fmtValor(p.recuperadoMes)}`,
                      `Atraso no início: ${fmtValor(p.atrasoInicioMes)}`,
                    ],
                  }))}
                />
              </div>
              <GraficoFaixas serie={serie} rotulos={rotulos} />
            </>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-dark-border">
              <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                Quem está pior agora
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
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-dark-bg text-xs text-gray-500 dark:text-dark-text-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {agrupar === "loja" ? "Loja" : "Cobrador (de hoje)"}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Inadimplência
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Desde o mês passado
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Recuperação no mês
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Atraso acumulado
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Mais de 1 ano
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {!linhas ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-gray-400 animate-pulse"
                      >
                        Carregando…
                      </td>
                    </tr>
                  ) : linhas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-gray-400"
                      >
                        Nada em atraso.
                      </td>
                    </tr>
                  ) : (
                    linhas.map((l) => {
                      const pct = pctInadimplencia(l.hoje);
                      const v = variacaoPp(
                        pct,
                        l.antes ? pctInadimplencia(l.antes) : null,
                      );
                      return (
                        <tr
                          key={l.chave ?? "-"}
                          className="hover:bg-gray-50 dark:hover:bg-dark-bg"
                        >
                          <td className="px-3 py-2 text-gray-900 dark:text-dark-text">
                            {agrupar === "loja"
                              ? (l.chave ?? "Sem loja")
                              : nomeCobrador(l.chave)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-dark-text">
                            {formatarPct(pct)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              v == null
                                ? "text-gray-400"
                                : v > 0.05
                                  ? "text-red-600 dark:text-red-400"
                                  : v < -0.05
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-gray-500"
                            }`}
                          >
                            {v == null
                              ? "—"
                              : `${v > 0.05 ? "↑" : v < -0.05 ? "↓" : ""} ${formatarPp(v)}`}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-dark-text">
                            {formatarPct(pctRecuperacao(l.hoje))}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-dark-text">
                            {fmtValor(atrasoTotal(l.hoje))}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-dark-text">
                            {fmtValor(l.hoje.faixas.d365_mais)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
            Todos os títulos a prazo. Cancelados, agrupados e renegociados ficam
            fora.
            {temRetrato
              ? " Meses com retrato diário mostram o que se via no dia; os demais são reconstruídos pelas datas de pagamento."
              : " Os meses passados são reconstruídos pelas datas de pagamento; a partir de agora o sistema guarda um retrato por dia."}
            {agrupar === "cobrador" &&
              " Por cobrador, o atraso é de quem tem a carteira hoje."}
          </p>
        </>
      )}
    </div>
  );
};

export default AcompanhamentoInadimplencia;
