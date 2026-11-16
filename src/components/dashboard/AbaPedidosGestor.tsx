import React, { useState } from "react";
import PedidosCorrecao from "./PedidosCorrecao";
import PedidosAtribuicao from "./PedidosAtribuicao";

// Aba "Correções" do gestor: pedidos de correção de pagamento (item 62) e
// pagos na loja depois da cobrança (item 66). Cada um carrega só quando
// aparece.

type Visao = "correcoes" | "loja";

const VISOES: { key: Visao; label: string }[] = [
  { key: "correcoes", label: "Correções de pagamento" },
  { key: "loja", label: "Pagos na loja" },
];

const AbaPedidosGestor: React.FC = () => {
  const [visao, setVisao] = useState<Visao>("correcoes");
  return (
    <div className="space-y-3">
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
      {visao === "correcoes" ? <PedidosCorrecao /> : <PedidosAtribuicao />}
    </div>
  );
};

export default AbaPedidosGestor;
