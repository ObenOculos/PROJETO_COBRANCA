import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Search, Store, X } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { ClientGroup, Collection } from "../../types";
import { criarCalculoAtraso, formatCurrency } from "../../utils/formatters";
import { clientKey } from "../../filters/clientStatus";
import { resolveSaleKey } from "../../filters/sales";
import { documentoCombina } from "../../filters/documento";
import Pagination from "../common/Pagination";
import ClientDetailModal from "./ClientDetailModal";

// "Quem deve" de uma loja (aba Por loja do Resumo Geral, 25/11), em modal
// (pedido do usuario). Veio do modal da antiga Desempenho Loja. A Ficha abre
// por cima e este modal fica escondido ate ela fechar (um modal por vez).
// Saldo sempre em vencido x a vencer (nunca um "em aberto" unico).

interface Devedor {
  key: string;
  name: string;
  document: string;
  city: string;
  /** Cobrador com mais titulos em aberto do cliente nesta loja. */
  collectorId: string;
  sales: number;
  vencido: number;
  aVencer: number;
  /** Maior atraso entre as parcelas vencidas com saldo. */
  maxDays: number;
}

const SEM_COBRADOR = "__sem__";
const POR_PAGINA = 20;

const QuemDeveLoja: React.FC<{
  loja: string;
  /** Titulos da loja. */
  titulos: Collection[];
  userNames: Map<string, string>;
  onClose: () => void;
}> = ({ loja, titulos, userNames, onClose }) => {
  const { getClientGroups } = useCollection();
  const [busca, setBusca] = useState("");
  const [cobradorFiltro, setCobradorFiltro] = useState("");
  const [soVencido, setSoVencido] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [ficha, setFicha] = useState<ClientGroup | null>(null);

  useEffect(() => {
    setPagina(1);
  }, [busca, cobradorFiltro, soVencido]);

  // Trava o scroll do fundo enquanto aberto.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  // ESC fecha (nao enquanto a Ficha estiver por cima).
  useEffect(() => {
    if (ficha) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, ficha]);

  const { devedores, quitados } = useMemo(() => {
    const atrasoDias = criarCalculoAtraso();
    const porCliente = new Map<
      string,
      Omit<Devedor, "key" | "collectorId" | "sales"> & {
        sales: Set<string>;
        abertoPorCobrador: Map<string, number>;
      }
    >();
    titulos.forEach((c) => {
      const key = clientKey(c);
      if (!key) return;
      let e = porCliente.get(key);
      if (!e) {
        e = {
          name: c.cliente || c.documento || "Sem nome",
          document: c.documento || "",
          city: c.cidade || "",
          sales: new Set(),
          vencido: 0,
          aVencer: 0,
          maxDays: 0,
          abertoPorCobrador: new Map(),
        };
        porCliente.set(key, e);
      }
      e.sales.add(String(resolveSaleKey(c)));
      const aberto =
        Number(c.valor_original || 0) -
        Number(c.valor_recebido || 0) -
        Number(c.desconto || 0);
      if (aberto <= 0.01) return;
      const cob = c.user_id || SEM_COBRADOR;
      e.abertoPorCobrador.set(cob, (e.abertoPorCobrador.get(cob) || 0) + 1);
      const dias = atrasoDias(c.data_vencimento);
      if (dias > 0) {
        e.vencido += aberto;
        if (dias > e.maxDays) e.maxDays = dias;
      } else {
        e.aVencer += aberto;
      }
    });

    const lista: Devedor[] = [];
    let pagos = 0;
    porCliente.forEach((e, key) => {
      if (e.vencido + e.aVencer <= 0.01) {
        pagos += 1;
        return;
      }
      const collectorId =
        Array.from(e.abertoPorCobrador.entries()).sort(
          (a, b) => b[1] - a[1],
        )[0]?.[0] ?? SEM_COBRADOR;
      lista.push({
        key,
        name: e.name,
        document: e.document,
        city: e.city,
        collectorId,
        sales: e.sales.size,
        vencido: e.vencido,
        aVencer: e.aVencer,
        maxDays: e.maxDays,
      });
    });
    lista.sort((a, b) => b.vencido - a.vencido || b.aVencer - a.aVencer);
    return { devedores: lista, quitados: pagos };
  }, [titulos]);

  // Quem cobra quantos dos que devem (filtra a lista).
  const chips = useMemo(() => {
    const qtd = new Map<string, number>();
    devedores.forEach((d) =>
      qtd.set(d.collectorId, (qtd.get(d.collectorId) || 0) + 1),
    );
    return Array.from(qtd.entries())
      .map(([id, n]) => ({
        id,
        name:
          id === SEM_COBRADOR
            ? "Sem cobrador"
            : userNames.get(id) || "Usuário removido",
        count: n,
      }))
      .sort((a, b) =>
        a.id === SEM_COBRADOR
          ? 1
          : b.id === SEM_COBRADOR
            ? -1
            : b.count - a.count,
      );
  }, [devedores, userNames]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return devedores.filter((d) => {
      if (cobradorFiltro && d.collectorId !== cobradorFiltro) return false;
      if (soVencido && d.vencido <= 0.01) return false;
      if (!termo) return true;
      return (
        d.name.toLowerCase().includes(termo) ||
        d.city.toLowerCase().includes(termo) ||
        documentoCombina(d.document, termo)
      );
    });
  }, [devedores, busca, cobradorFiltro, soVencido]);

  const pagina_ = filtrados.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA,
  );
  const temFiltro = !!busca || !!cobradorFiltro || soVencido;

  const abrirFicha = (d: Devedor) => {
    if (!d.document) return;
    const grupo = getClientGroups().find((g) => g.document === d.document);
    if (grupo) setFicha(grupo);
  };

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quem-deve-titulo"
        onMouseDown={onClose}
        className={`fixed inset-0 bg-black/50 items-center justify-center p-2 sm:p-4 z-50 ${ficha ? "hidden" : "flex"}`}
      >
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-100 dark:border-dark-border"
        >
          <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between gap-3 bg-gray-50 dark:bg-dark-bg">
            <div className="flex items-center gap-2 min-w-0">
              <Store className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <h3
                id="quem-deve-titulo"
                className="text-base font-bold text-gray-900 dark:text-dark-text truncate"
              >
                {loja}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-text-secondary dark:hover:bg-red-950/20 shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4 overflow-y-auto flex-1 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-bold text-gray-900 dark:text-dark-text">
                Quem deve{" "}
                <span className="text-xs font-semibold text-gray-400 dark:text-dark-text-secondary">
                  {temFiltro
                    ? `${filtrados.length.toLocaleString("pt-BR")} de ${devedores.length.toLocaleString("pt-BR")}`
                    : devedores.length.toLocaleString("pt-BR")}{" "}
                  clientes
                </span>
              </h4>
              {quitados > 0 && (
                <span className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                  {quitados.toLocaleString("pt-BR")} quitados não aparecem
                </span>
              )}
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c) => {
                  const ativo = cobradorFiltro === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCobradorFiltro(ativo ? "" : c.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        ativo
                          ? "bg-blue-600 border-blue-600 text-white"
                          : c.id === SEM_COBRADOR
                            ? "border-amber-300 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            : "border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg"
                      }`}
                    >
                      {c.name} · {c.count.toLocaleString("pt-BR")}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Buscar cliente</span>
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, CPF/CNPJ ou cidade"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-dark-text-secondary cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={soVencido}
                  onChange={(e) => setSoVencido(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Só com valor vencido
              </label>
            </div>

            <div className="rounded-lg border border-gray-100 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
              {filtrados.length === 0 ? (
                <div className="p-6 text-center text-xs font-medium text-gray-400 dark:text-dark-text-secondary">
                  {devedores.length === 0
                    ? "Ninguém devendo nesta loja."
                    : "Nenhum cliente para os filtros aplicados."}
                </div>
              ) : (
                pagina_.map((d) => {
                  const cobrador =
                    d.collectorId === SEM_COBRADOR
                      ? "Sem cobrador"
                      : userNames.get(d.collectorId) || "Usuário removido";
                  return (
                    <button
                      key={d.key}
                      type="button"
                      disabled={!d.document}
                      onClick={() => abrirFicha(d)}
                      title={
                        d.document
                          ? "Abrir a Ficha do cliente"
                          : "Cliente sem CPF/CNPJ: Ficha indisponível"
                      }
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50/40 dark:hover:bg-blue-900/10 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-dark-text truncate">
                          {d.name}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-dark-text-secondary truncate">
                          <span
                            className={
                              d.collectorId === SEM_COBRADOR
                                ? "text-amber-600 dark:text-amber-400 font-semibold"
                                : ""
                            }
                          >
                            {cobrador}
                          </span>
                          {d.city && ` · ${d.city}`} · {d.sales}{" "}
                          {d.sales === 1 ? "venda" : "vendas"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {d.vencido > 0.01 ? (
                          <p className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400">
                            {formatCurrency(d.vencido)}{" "}
                            <span className="text-[10px] font-semibold">
                              vencido há {d.maxDays.toLocaleString("pt-BR")}{" "}
                              {d.maxDays === 1 ? "dia" : "dias"}
                            </span>
                          </p>
                        ) : (
                          <p className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                            nada vencido
                          </p>
                        )}
                        {d.aVencer > 0.01 && (
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-dark-text-secondary">
                            {formatCurrency(d.aVencer)} a vencer
                          </p>
                        )}
                      </div>
                      {d.document && (
                        <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <Pagination
              page={pagina}
              total={filtrados.length}
              perPage={POR_PAGINA}
              onChange={setPagina}
            />
          </div>
        </div>
      </div>

      {ficha && (
        <ClientDetailModal
          clientGroup={ficha}
          userType="manager"
          onClose={() => setFicha(null)}
        />
      )}
    </>,
    document.body,
  );
};

export default QuemDeveLoja;
