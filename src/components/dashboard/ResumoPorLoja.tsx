import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search } from "lucide-react";
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
import QuemDeveLoja from "./QuemDeveLoja";
import {
  CardCarteira,
  CardClientes,
  CardPrevisao,
  CardRecebidoEmpresa,
} from "./ResumoEmpresa";

// Aba "Por loja" do Resumo Geral (25/11): substitui a antiga Desempenho Loja.
// Uma linha por loja com a MESMA conta da visao da empresa (resumoPorLoja);
// clicar na linha abre os cards da loja e o "Quem deve" ali mesmo, sem modal.

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
}> = ({
  dateFrom,
  dateTo,
  today,
  acionados,
  registradosCobrador,
  registradoPorCliente,
  registradoCarregando = false,
}) => {
  const { collections, scheduledVisits, acordoAtivoOverdueMap, users } =
    useCollection();
  const [busca, setBusca] = useState("");
  const [lojaAberta, setLojaAberta] = useState<string | null>(null);
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
        <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
          Clique numa linha para ver os cards e quem deve.
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
      </div>

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
              const aberta = lojaAberta === l.loja;
              const c = l.r.clientes;
              const inad = l.r.inadimplencia;
              const nomes =
                l.cobradores.length === 0
                  ? null
                  : l.cobradores
                      .slice(0, 2)
                      .map((x) => x.nome)
                      .join(", ") +
                    (l.cobradores.length > 2
                      ? ` +${l.cobradores.length - 2}`
                      : "");
              return (
                <React.Fragment key={l.loja}>
                  <tr
                    onClick={() =>
                      setLojaAberta((cur) => (cur === l.loja ? null : l.loja))
                    }
                    className={`cursor-pointer transition-colors ${aberta ? "bg-blue-50/60 dark:bg-blue-900/10" : "hover:bg-gray-50 dark:hover:bg-dark-bg/25"}`}
                  >
                    <td className="px-2 py-3 text-center text-[10px] text-gray-400 dark:text-dark-text-secondary whitespace-nowrap">
                      <div className="flex items-center justify-center gap-0.5">
                        {aberta ? (
                          <ChevronDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        {i + 1}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-gray-900 dark:text-dark-text whitespace-nowrap">
                        {l.loja}
                      </div>
                      <div
                        className={`text-[10px] ${nomes ? "text-gray-400 dark:text-dark-text-secondary" : "font-semibold text-amber-700 dark:text-amber-400"}`}
                        title={l.cobradores
                          .map(
                            (x) => `${x.nome}: ${fmtNum(x.clientes)} clientes`,
                          )
                          .join("\n")}
                      >
                        {nomes ?? "Sem cobrador"}
                      </div>
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
                        {fmtValor(l.r.carteira.vencido + l.r.carteira.aVencer)}
                      </div>
                      <div className="text-[10px] text-red-500 dark:text-red-400">
                        {fmtValor(l.r.carteira.vencido)} vencido
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                        {fmtValor(l.r.carteira.aVencer)} a vencer
                      </div>
                    </td>
                    <td
                      className={`px-3 py-3 text-right whitespace-nowrap text-base font-bold ${inad.venceu > 0 ? COR_INAD[nivelInadimplencia(inad.pct)] : "text-gray-400 dark:text-dark-text-secondary"}`}
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
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            <CardClientes r={l.r} />
                            <CardPrevisao r={l.r} />
                            <CardRecebidoEmpresa
                              r={l.r}
                              registradoCarregando={registradoCarregando}
                            />
                            <CardCarteira r={l.r} empresa />
                          </div>
                          <QuemDeveLoja
                            titulos={l.titulos}
                            userNames={userNames}
                          />
                        </div>
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
      <p className="px-1 text-[11px] text-gray-400 dark:text-dark-text-secondary">
        Os valores das lojas somam o total da empresa. O número de clientes não:
        quem comprou em mais de uma loja aparece em cada uma.
      </p>
    </div>
  );
};

export default ResumoPorLoja;
