import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Search, Store } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { Collection } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
import {
  resumoPorLoja,
  ResumoEmpresa as Resumo,
} from "../../filters/resumoEmpresa";
import {
  formatarInadimplencia,
  INADIMPLENCIA_A_PARTIR_DIAS,
  nivelInadimplencia,
} from "../../filters/inadimplencia";
import SortTh from "../common/SortTh";
import ModoVisualizacao, { Modo } from "../common/ModoVisualizacao";
import QuemDeveLoja from "./QuemDeveLoja";
import {
  CardCarteira,
  CardClientes,
  CardPrevisao,
  CardRecebidoEmpresa,
} from "./ResumoEmpresa";

// Aba "Por loja" do Resumo Geral (25/11): substitui a antiga Desempenho Loja.
// Mesma conta da visao da empresa (resumoPorLoja), em Tabela (uma linha por
// loja, para comparar) ou Cards (os 4 cards de cada loja) -- chave ao lado do
// Exportar, compartilhada com a aba Por cobrador. "Quem deve" abre ali mesmo,
// sem modal.

const fmtNum = (n: number): string => n.toLocaleString("pt-BR");
const fmtValor = (n: number): string => formatCurrency(n, false);

const COR_INAD = {
  baixa: "text-green-600 dark:text-green-400",
  media: "text-amber-600 dark:text-amber-400",
  alta: "text-red-600 dark:text-red-400",
} as const;

type Chave =
  | "loja"
  | "clientes"
  | "emAtraso"
  | "recebido"
  | "previsao"
  | "carteira"
  | "inadimplencia";

interface LinhaLoja {
  loja: string;
  r: Resumo;
  titulos: Collection[];
  /** Quem tem carteira na loja (clientes com saldo), mais clientes primeiro. */
  cobradores: { id: string; nome: string; clientes: number }[];
}

const valorDe: Record<Chave, (l: LinhaLoja) => number | string> = {
  loja: (l) => l.loja,
  clientes: (l) => l.r.clientes.total,
  emAtraso: (l) => l.r.clientes.emAtraso,
  recebido: (l) => l.r.recebido.erp,
  previsao: (l) => l.r.previsao.total,
  carteira: (l) => l.r.carteira.vencido + l.r.carteira.aVencer,
  inadimplencia: (l) => l.r.inadimplencia.pct,
};

const ResumoPorLoja: React.FC<{
  dateFrom: string;
  dateTo: string;
  today: string;
  acionados: Set<string> | null;
  registradosCobrador: Set<string>;
  registradoPorCliente: Map<string, number>;
  registradoCarregando?: boolean;
  modo: Modo;
  onModo: (m: Modo) => void;
}> = ({
  dateFrom,
  dateTo,
  today,
  acionados,
  registradosCobrador,
  registradoPorCliente,
  registradoCarregando = false,
  modo,
  onModo,
}) => {
  const { collections, scheduledVisits, acordoAtivoOverdueMap, users } =
    useCollection();
  const [busca, setBusca] = useState("");
  // Loja com o "Quem deve" aberto.
  const [quemDeve, setQuemDeve] = useState<string | null>(null);
  // Padrao: pior inadimplencia primeiro.
  const [chave, setChave] = useState<Chave>("inadimplencia");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const userNames = useMemo(
    () => new Map(users.map((u) => [u.id, u.name] as const)),
    [users],
  );

  // So calcula com a aba aberta (o componente so monta nela).
  const resumos = useMemo(
    () =>
      resumoPorLoja({
        collections,
        scheduledVisits,
        acordoAtivoParcelas: acordoAtivoOverdueMap,
        dateFrom,
        dateTo,
        today,
        acionados,
        registradosCobrador,
        registradoPorCliente,
      }),
    [
      collections,
      scheduledVisits,
      acordoAtivoOverdueMap,
      dateFrom,
      dateTo,
      today,
      acionados,
      registradosCobrador,
      registradoPorCliente,
    ],
  );

  // Titulos e cobradores de cada loja numa passada.
  const linhas = useMemo((): LinhaLoja[] => {
    const titulos = new Map<string, Collection[]>();
    const carteira = new Map<string, Map<string, Set<string>>>();
    collections.forEach((c) => {
      const loja = c.nome_da_loja;
      if (!loja || !resumos.has(loja)) return;
      const lista = titulos.get(loja);
      if (lista) lista.push(c);
      else titulos.set(loja, [c]);
      const aberto =
        Number(c.valor_original || 0) -
        Number(c.valor_recebido || 0) -
        Number(c.desconto || 0);
      if (!c.user_id || !c.documento || aberto <= 0.01) return;
      let porCob = carteira.get(loja);
      if (!porCob) {
        porCob = new Map();
        carteira.set(loja, porCob);
      }
      let docs = porCob.get(c.user_id);
      if (!docs) {
        docs = new Set();
        porCob.set(c.user_id, docs);
      }
      docs.add(c.documento);
    });
    return Array.from(resumos.entries()).map(([loja, r]) => ({
      loja,
      r,
      titulos: titulos.get(loja) ?? [],
      cobradores: Array.from(carteira.get(loja)?.entries() ?? [])
        .map(([id, docs]) => ({
          id,
          nome: userNames.get(id) || "Usuário removido",
          clientes: docs.size,
        }))
        .sort((a, b) => b.clientes - a.clientes),
    }));
  }, [collections, resumos, userNames]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo
      ? linhas.filter((l) => l.loja.toLowerCase().includes(termo))
      : [...linhas];
    const pegar = valorDe[chave];
    lista.sort((a, b) => {
      const va = pegar(a);
      const vb = pegar(b);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "pt-BR")
          : (va as number) - (vb as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [linhas, busca, chave, dir]);

  const semCobrador = linhas.filter((l) => l.cobradores.length === 0).length;

  const ordenar = (k: Chave) => {
    if (k === chave) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setChave(k);
      setDir(k === "loja" ? "asc" : "desc");
    }
  };

  const exportarCsv = () => {
    const cab = [
      "Loja",
      "Cobradores",
      "Clientes",
      "Quitados",
      "Em dia",
      "Em atraso",
      "Atraso sem cobrador",
      "Recebido no período (ERP)",
      "Registrado pelos cobradores",
      "Previsão",
      "Vencido",
      "A vencer",
      "Inadimplência (%)",
    ];
    const corpo = visiveis.map((l) => [
      l.loja,
      l.cobradores.map((c) => c.nome).join(" / ") || "Sem cobrador",
      l.r.clientes.total,
      l.r.clientes.quitados,
      l.r.clientes.emDia,
      l.r.clientes.emAtraso,
      l.r.clientes.semCobrador,
      l.r.recebido.erp.toFixed(2),
      l.r.recebido.cobrador.toFixed(2),
      l.r.previsao.total.toFixed(2),
      l.r.carteira.vencido.toFixed(2),
      l.r.carteira.aVencer.toFixed(2),
      l.r.inadimplencia.venceu > 0 ? l.r.inadimplencia.pct.toFixed(1) : "",
    ]);
    const csv = [cab, ...corpo]
      .map((linha) =>
        linha
          .map((cel) => {
            const t = String(cel).replace(/"/g, '""');
            return /[",;\n\r]/.test(t) ? `"${t}"` : t;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `resumo-por-loja-${todayLocalStr()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const th = "px-3 py-2.5 text-right whitespace-nowrap";

  const botaoQuemDeve = (loja: string) => {
    const aberto = quemDeve === loja;
    return (
      <button
        type="button"
        onClick={() => setQuemDeve(aberto ? null : loja)}
        className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
      >
        Quem deve
        {aberto ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
    );
  };

  const nomesCobradores = (l: LinhaLoja) =>
    l.cobradores.length === 0
      ? null
      : l.cobradores
          .slice(0, 2)
          .map((x) => x.nome)
          .join(", ") +
        (l.cobradores.length > 2 ? ` +${l.cobradores.length - 2}` : "");

  const corInad = (l: LinhaLoja) =>
    l.r.inadimplencia.venceu > 0
      ? COR_INAD[nivelInadimplencia(l.r.inadimplencia.pct)]
      : "text-gray-400 dark:text-dark-text-secondary";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Buscar loja</span>
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar loja"
            className="w-56 pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <span className="text-sm text-gray-500 dark:text-dark-text-secondary">
          {fmtNum(visiveis.length)} {visiveis.length === 1 ? "loja" : "lojas"}
          {semCobrador > 0 && (
            <span className="ml-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              · {semCobrador} sem cobrador
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={exportarCsv}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:text-blue-600"
          title="Baixar a tabela em planilha (CSV)"
        >
          <Download className="h-4 w-4" />
          Exportar
        </button>
        <ModoVisualizacao modo={modo} onChange={onModo} />
      </div>

      {modo === "cards" ? (
        // Cards: mesmo modelo do Por cobrador (2 lojas por linha, os 4
        // cards de cada uma).
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visiveis.map((l, i) => {
            const nomes = nomesCobradores(l);
            return (
              <div
                key={l.loja}
                className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="flex-shrink-0 mt-0.5 flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 dark:bg-dark-bg text-[10px] font-bold text-gray-500 dark:text-dark-text-secondary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-dark-text truncate">
                        <Store className="h-4 w-4 text-gray-400 shrink-0" />
                        {l.loja}
                      </div>
                      <div
                        className={`text-[10px] ${nomes ? "text-gray-400 dark:text-dark-text-secondary" : "font-semibold text-amber-700 dark:text-amber-400"}`}
                      >
                        {nomes ?? "Sem cobrador"}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-3">
                    <span
                      className={`text-sm font-bold ${corInad(l)}`}
                      title="Inadimplência da loja"
                    >
                      {formatarInadimplencia(
                        l.r.inadimplencia.pct,
                        l.r.inadimplencia.venceu,
                      )}{" "}
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-dark-text-secondary">
                        inadimplência
                      </span>
                    </span>
                    {botaoQuemDeve(l.loja)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <CardClientes r={l.r} />
                  <CardPrevisao r={l.r} />
                  <CardRecebidoEmpresa
                    r={l.r}
                    registradoCarregando={registradoCarregando}
                  />
                  <CardCarteira r={l.r} empresa />
                </div>
                {quemDeve === l.loja && (
                  <QuemDeveLoja titulos={l.titulos} userNames={userNames} />
                )}
              </div>
            );
          })}
          {visiveis.length === 0 && (
            <div className="col-span-full bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border px-6 py-12 text-center text-sm text-gray-400 dark:text-dark-text-secondary">
              Nenhuma loja encontrada.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-dark-border/40 text-[10px] font-bold text-gray-400 dark:text-dark-text-secondary uppercase tracking-wider bg-gray-50 dark:bg-dark-bg/50">
                <th className="px-2 py-2.5 text-center">#</th>
                <SortTh
                  active={chave === "loja"}
                  dir={dir}
                  onClick={() => ordenar("loja")}
                  className="px-3 py-2.5 text-left whitespace-nowrap"
                >
                  Loja
                </SortTh>
                <SortTh
                  active={chave === "clientes"}
                  dir={dir}
                  onClick={() => ordenar("clientes")}
                  className={th}
                  title="Clientes da loja (quem comprou em mais de uma loja aparece em cada uma)"
                >
                  Clientes
                </SortTh>
                <SortTh
                  active={chave === "emAtraso"}
                  dir={dir}
                  onClick={() => ordenar("emAtraso")}
                  className={th}
                  title="Clientes com alguma parcela vencida"
                >
                  Em atraso
                </SortTh>
                <SortTh
                  active={chave === "recebido"}
                  dir={dir}
                  onClick={() => ordenar("recebido")}
                  className={th}
                  title="Baixado no ERP no período (o registrado pelos cobradores já está dentro)"
                >
                  Recebido
                </SortTh>
                <SortTh
                  active={chave === "previsao"}
                  dir={dir}
                  onClick={() => ordenar("previsao")}
                  className={th}
                  title="Quanto deve entrar de hoje até o fim do período"
                >
                  Previsão
                </SortTh>
                <SortTh
                  active={chave === "carteira"}
                  dir={dir}
                  onClick={() => ordenar("carteira")}
                  className={th}
                  title="Quanto os clientes da loja devem hoje"
                >
                  Carteira
                </SortTh>
                <SortTh
                  active={chave === "inadimplencia"}
                  dir={dir}
                  onClick={() => ordenar("inadimplencia")}
                  className={th}
                  title={`Do que venceu nos últimos 12 meses (atraso a partir de ${INADIMPLENCIA_A_PARTIR_DIAS} dias), quanto não foi pago`}
                >
                  Inadimplência
                </SortTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border/20 text-gray-700 dark:text-dark-text">
              {visiveis.map((l, i) => {
                const aberta = quemDeve === l.loja;
                const c = l.r.clientes;
                const inad = l.r.inadimplencia;
                const nomes = nomesCobradores(l);
                return (
                  <React.Fragment key={l.loja}>
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-dark-bg/25 transition-colors">
                      <td className="px-2 py-3 text-center text-[10px] text-gray-400 dark:text-dark-text-secondary whitespace-nowrap">
                        {i + 1}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900 dark:text-dark-text whitespace-nowrap">
                          {l.loja}
                        </div>
                        <div
                          className={`text-[10px] ${nomes ? "text-gray-400 dark:text-dark-text-secondary" : "font-semibold text-amber-700 dark:text-amber-400"}`}
                          title={l.cobradores
                            .map(
                              (x) =>
                                `${x.nome}: ${fmtNum(x.clientes)} clientes`,
                            )
                            .join("\n")}
                        >
                          {nomes ?? "Sem cobrador"}
                        </div>
                        {botaoQuemDeve(l.loja)}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="font-semibold">{fmtNum(c.total)}</div>
                        <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                          {fmtNum(c.quitados)} quitados
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div
                          className={`font-semibold ${c.emAtraso > 0 ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {fmtNum(c.emAtraso)}
                        </div>
                        {c.semCobrador > 0 && (
                          <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            {fmtNum(c.semCobrador)} sem cobrador
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="font-semibold text-green-600 dark:text-green-400">
                          {fmtValor(l.r.recebido.erp)}
                        </div>
                        <div
                          className={`text-[10px] text-gray-400 dark:text-dark-text-secondary ${registradoCarregando ? "animate-pulse" : ""}`}
                        >
                          {registradoCarregando
                            ? "…"
                            : fmtValor(l.r.recebido.cobrador)}{" "}
                          pelos cobradores
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap font-semibold text-blue-700 dark:text-blue-400">
                        {fmtValor(l.r.previsao.total)}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="font-semibold">
                          {fmtValor(
                            l.r.carteira.vencido + l.r.carteira.aVencer,
                          )}
                        </div>
                        <div className="text-[10px] text-red-500 dark:text-red-400">
                          {fmtValor(l.r.carteira.vencido)} vencido
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                          {fmtValor(l.r.carteira.aVencer)} a vencer
                        </div>
                      </td>
                      <td
                        className={`px-3 py-3 text-right whitespace-nowrap text-base font-bold ${corInad(l)}`}
                        title={
                          inad.venceu > 0
                            ? `${fmtValor(inad.naoPago)} não pago de ${fmtValor(inad.venceu)}`
                            : undefined
                        }
                      >
                        {formatarInadimplencia(inad.pct, inad.venceu)}
                      </td>
                    </tr>
                    {aberta && (
                      <tr className="bg-blue-50/40 dark:bg-blue-900/5">
                        <td colSpan={8} className="px-3 pb-4 pt-1">
                          <QuemDeveLoja
                            titulos={l.titulos}
                            userNames={userNames}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-10 text-center text-sm text-gray-400 dark:text-dark-text-secondary"
                  >
                    Nenhuma loja encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-1 text-[11px] text-gray-400 dark:text-dark-text-secondary">
        Os valores das lojas somam o total da empresa. O número de clientes não:
        quem comprou em mais de uma loja aparece em cada uma.
      </p>
    </div>
  );
};

export default ResumoPorLoja;
