import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCollection } from "../contexts/CollectionContext";

/**
 * Retorna a data de nascimento (ISO YYYY-MM-DD ou null) de um cliente pelo
 * documento.
 *
 * Estrategia: le do cadastro ja carregado (`clientesRegistry`) ou do
 * `clientDataCache` do contexto; so cai para UMA consulta leve a tabela
 * `clientes` se o cliente nao estiver em nenhum dos dois.
 *
 * Centraliza aqui a busca que antes vivia duplicada em cada modal de cliente.
 */
export function useClientBirthDate(documento?: string | null): string | null {
  const { clientDataCache, clientesRegistry } = useCollection();
  const [birthDate, setBirthDate] = useState<string | null>(null);

  const registryRef = useRef(clientesRegistry);
  registryRef.current = clientesRegistry;

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

    const cadastro = registryRef.current.get(documento);
    if (cadastro) {
      setBirthDate(cadastro.data_nascimento ?? null);
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
