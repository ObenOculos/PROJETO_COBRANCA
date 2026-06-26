import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCollection } from "../contexts/CollectionContext";

/**
 * Retorna a data de nascimento (ISO YYYY-MM-DD ou null) de um cliente pelo
 * documento.
 *
 * Estrategia: reaproveita o `clientDataCache` do contexto (ja populado em lote
 * para os clientes visiveis). Se o cliente ja estiver no cache, usa o valor sem
 * nova requisicao; caso contrario, faz UMA consulta leve a tabela `clientes`.
 *
 * Centraliza aqui a busca que antes vivia duplicada em cada modal de cliente.
 */
export function useClientBirthDate(documento?: string | null): string | null {
  const { clientDataCache } = useCollection();
  const [birthDate, setBirthDate] = useState<string | null>(null);

  // Ref para ler o cache mais recente sem re-disparar o efeito a cada
  // atualizacao do Map (evita refetch enquanto o cache vai sendo populado).
  const cacheRef = useRef(clientDataCache);
  cacheRef.current = clientDataCache;

  useEffect(() => {
    let cancelled = false;

    if (!documento) {
      setBirthDate(null);
      return;
    }

    const cached = cacheRef.current.get(documento);
    if (
      cached &&
      !cached.error &&
      !cached.empty &&
      "data_nascimento" in cached
    ) {
      setBirthDate(cached.data_nascimento ?? null);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("data_nascimento")
        .eq("documento", documento)
        .maybeSingle();

      if (!cancelled && !error) {
        setBirthDate(data?.data_nascimento ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documento]);

  return birthDate;
}
