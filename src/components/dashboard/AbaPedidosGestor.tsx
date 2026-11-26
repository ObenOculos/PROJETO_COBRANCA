import React, { useState } from "react";
import { Scale } from "lucide-react";
import PedidosCorrecao from "./PedidosCorrecao";
import PedidosAtribuicao from "./PedidosAtribuicao";
import PedidosDesconto from "./PedidosDesconto";
import CasosGestor from "./CasosGestor";
import PainelCheques from "./PainelCheques";
import PainelDivergencias from "./PainelDivergencias";

// Aba "Correções" do gestor: pedidos de correção de pagamento (item 62) e
// pagos na loja depois da cobrança (item 66), pedidos de desconto (item 71)
// clientes reincidentes (item 83), clientes em condição de cheque (item 87)
// e divergências app × ERP (item 89).
// Cada um carrega só quando aparece.

type Visao =
  | "correcoes"
  | "loja"
  | "descontos"
  | "reincidentes"
  | "cheques"
  | "divergencias";

const VISOES: { key: Visao; label: string }[] = [
  { key: "correcoes", label: "Correções de pagamento" },
  { key: "loja", label: "Pagos na loja" },
  { key: "descontos", label: "Descontos" },
  { key: "reincidentes", label: "Reincidentes" },
  { key: "cheques", label: "Cheques" },
  { key: "divergencias", label: "Divergências" },
];

const AbaPedidosGestor: React.FC = () => {
  // A Conferência de recebimentos abre direto em "Pagos na loja" (link do
  // pedido em análise): le e apaga a aba pedida.
  const [visao, setVisao] = useState<Visao>(() => {
    try {
      const pedida = localStorage.getItem("correcoesVisao");
      localStorage.removeItem("correcoesVisao");
      return pedida === "loja" ||
        pedida === "descontos" ||
        pedida === "reincidentes" ||
        pedida === "cheques" ||
        pedida === "divergencias"
        ? pedida
        : "correcoes";
    } catch {
      return "correcoes";
    }
  });
  // Subabas ja abertas ficam montadas e so escondidas (26/11): trocar de
  // subaba nao refaz a busca nem mostra "carregando" de novo. Cada uma ainda
  // so carrega quando aparece pela primeira vez.
  const [visitadas, setVisitadas] = useState<Set<Visao>>(
    () => new Set([visao]),
  );
  const abrir = (v: Visao) => {
    setVisao(v);
    setVisitadas((s) => (s.has(v) ? s : new Set(s).add(v)));
  };
  const PAINEIS: Record<Visao, React.ReactNode> = {
    correcoes: <PedidosCorrecao />,
    loja: <PedidosAtribuicao />,
    descontos: <PedidosDesconto />,
    reincidentes: <CasosGestor />,
    cheques: <PainelCheques />,
    divergencias: <PainelDivergencias />,
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
      <div
        role="tablist"
        className="inline-flex flex-wrap gap-0.5 rounded-lg bg-gray-100 dark:bg-dark-bg p-0.5"
      >
        {VISOES.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={visao === v.key}
            onClick={() => abrir(v.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all touch-manipulation ${
              visao === v.key
                ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
        {/* Atalho: a conferencia do mes (Cobradores > Conferência) mostra o
            dinheiro baixado x registrado e o pedido de cada cliente. */}
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("notificationClick", {
                detail: {
                  destino: {
                    aba: "collectors-summary",
                    cobradores: "conferencia",
                  },
                },
              }),
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg"
        >
          <Scale className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          Conferência de recebimentos
        </button>
      </div>
      {VISOES.filter((v) => visitadas.has(v.key)).map((v) => (
        <div key={v.key} className={visao === v.key ? "" : "hidden"}>
          {PAINEIS[v.key]}
        </div>
      ))}
    </div>
  );
};

export default AbaPedidosGestor;
