-- Item 94 (26/11), etapa 2: hora do SERVIDOR para a carga incremental.
-- O app guarda quando sincronizou pela ultima vez e, na proxima abertura,
-- pede o que mudou desde essa hora (menos uma margem). Usar a maior
-- alterado_em recebida nao serve: quando nada muda, a janela nao anda e o
-- ultimo lote de alteracoes (ex.: as 165 mil linhas marcadas pela migration
-- 20261126000002, ou o lote de uma rotina) vinha de novo a cada F5. A hora do
-- aparelho tambem nao serve (relogio errado). So leitura, sem dado nenhum.

CREATE OR REPLACE FUNCTION public.agora_servidor()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT now();
$function$;

REVOKE ALL ON FUNCTION public.agora_servidor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agora_servidor() TO authenticated;
