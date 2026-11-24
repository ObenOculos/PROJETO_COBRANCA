import { useCallback, useEffect, useState } from "react";
import {
  CondicaoChequeCliente,
  carregarCondicaoCheque,
} from "../utils/cheques";

// Item 87: condicao de cheque do cliente (Ficha). Falha de rede ou migration
// ausente: segue sem a condicao (null).

export interface CondicaoChequeFicha {
  cond: CondicaoChequeCliente | null;
  recarregar: () => Promise<void>;
}

export const useCondicaoCheque = (documento: string): CondicaoChequeFicha => {
  const [cond, setCond] = useState<CondicaoChequeCliente | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setCond(await carregarCondicaoCheque(documento));
    } catch (e) {
      console.warn("Condição de cheque indisponível:", e);
      setCond(null);
    }
  }, [documento]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { cond, recarregar };
};
