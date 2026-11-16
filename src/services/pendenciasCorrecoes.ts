import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Ponto vermelho no menu "Correções" do gestor: há pedido sem decisão em
// alguma das três filas da aba (correção de pagamento - item 62, pago na loja
// - item 66, desconto - item 71). Pendente = decisao IS NULL nas três.
// So conta (head + count), nao baixa linhas.

const EVENTO = "pendencias-correcoes-mudaram";

/** Chamar depois de decidir um pedido: o menu reconta na hora. */
export const avisarPendenciasMudaram = () => {
  window.dispatchEvent(new Event(EVENTO));
};

export const contarPendenciasCorrecoes = async (): Promise<number> => {
  const contar = async (
    tabela: "pedidos_correcao_pagamento" | "atribuicoes_pagamento" | "pedidos_desconto",
  ) => {
    const { count, error } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .is("decisao", null);
    if (error) throw error;
    return count ?? 0;
  };
  const totais = await Promise.all([
    contar("pedidos_correcao_pagamento"),
    contar("atribuicoes_pagamento"),
    contar("pedidos_desconto"),
  ]);
  return totais.reduce((s, n) => s + n, 0);
};

const INTERVALO_MS = 2 * 60 * 1000;

/** Quantos pedidos esperam decisão. Reconta a cada 2 min, ao voltar para a
 * aba do navegador e quando uma decisão é registrada. */
export const usePendenciasCorrecoes = (ativo: boolean): number => {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!ativo) {
      setTotal(0);
      return;
    }
    let cancelado = false;
    const recontar = () => {
      if (document.visibilityState === "hidden") return;
      contarPendenciasCorrecoes()
        .then((n) => {
          if (!cancelado) setTotal(n);
        })
        .catch((e) => console.error("Erro ao contar pendências de correções:", e));
    };
    recontar();
    const timer = window.setInterval(recontar, INTERVALO_MS);
    window.addEventListener(EVENTO, recontar);
    document.addEventListener("visibilitychange", recontar);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
      window.removeEventListener(EVENTO, recontar);
      document.removeEventListener("visibilitychange", recontar);
    };
  }, [ativo]);

  return total;
};
