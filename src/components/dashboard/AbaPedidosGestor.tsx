import React, { useState } from "react";
import { Scale } from "lucide-react";
import PedidosCorrecao from "./PedidosCorrecao";
import PedidosAtribuicao from "./PedidosAtribuicao";
import PedidosDesconto from "./PedidosDesconto";
import CasosGestor from "./CasosGestor";

// Aba "Correções" do gestor: pedidos de correção de pagamento (item 62) e
// pagos na loja depois da cobrança (item 66), pedidos de desconto (item 71)
// e clientes reincidentes (item 83). Cada um carrega só quando aparece.

type Visao = "correcoes" | "loja" | "descontos" | "reincidentes";

const VISOES: { key: Visao; label: string }[] = [
  { key: "correcoes", label: "Correções de pagamento" },
  { key: "loja", label: "Pagos na loja" },
  { key: "descontos", label: "Descontos" },
  { key: "reincidentes", label: "Reincidentes" },
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
        pedida === "reincidentes"
        ? pedida
        : "correcoes";
    } catch {
      return "correcoes";
    }
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
      <div
        role="tablist"
        className="inline-flex rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary p-1"
      >
        {VISOES.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={visao === v.key}
            onClick={() => setVisao(v.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              visao === v.key
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-600 hover:bg-gray-50 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
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
      {visao === "correcoes" ? (
        <PedidosCorrecao />
      ) : visao === "loja" ? (
        <PedidosAtribuicao />
      ) : visao === "descontos" ? (
        <PedidosDesconto />
      ) : (
        <CasosGestor />
      )}
    </div>
  );
};

export default AbaPedidosGestor;
