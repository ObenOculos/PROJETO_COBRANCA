-- Item 50: depois de importar o historico de contatos do Cedrus (43 mil
-- atendimentos), a carteira do cobrador passou a ler 2-4,5 mil linhas de
-- collection_attempts para descobrir o ultimo contato de cada titulo (a RLS
-- devolve os contatos de qualquer operador nos titulos da carteira dele).
-- Esta funcao faz isso no banco: para cada titulo pedido, no maximo DUAS
-- linhas -- o ultimo contato ('ultimo') e o ultimo contato efetivo
-- ('efetivo'). A lista de resultados efetivos vem do app
-- (config/collectionAttempts), para a regra nao ficar duplicada aqui.
--
-- Ordem igual a da tela antes: created_at DESC, id DESC.
-- Somente leitura e SECURITY INVOKER: a RLS de collection_attempts decide o
-- que cada um ve (cobrador: titulos da carteira dele; gestor: todos).
CREATE OR REPLACE FUNCTION public.ultimos_contatos_titulos(
  p_ids text[],
  p_desde text,
  p_efetivos text[]
)
 RETURNS TABLE(
   collection_id text,
   papel text,
   date text,
   result text,
   notes text,
   next_action_date text
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH a AS (
    SELECT ca.id, ca.collection_id, ca.date, ca.result, ca.notes,
           ca.next_action_date, ca.created_at
    FROM public.collection_attempts ca
    WHERE ca.collection_id = ANY (p_ids)
      AND ca.date >= p_desde
  ), ultimo AS (
    SELECT DISTINCT ON (a.collection_id)
           a.collection_id, 'ultimo'::text AS papel, a.date, a.result, a.notes,
           a.next_action_date
    FROM a
    ORDER BY a.collection_id, a.created_at DESC, a.id DESC
  ), efetivo AS (
    SELECT DISTINCT ON (a.collection_id)
           a.collection_id, 'efetivo'::text AS papel, a.date, a.result, a.notes,
           a.next_action_date
    FROM a
    WHERE a.result = ANY (p_efetivos)
    ORDER BY a.collection_id, a.created_at DESC, a.id DESC
  )
  SELECT * FROM ultimo
  UNION ALL
  SELECT * FROM efetivo;
$function$;

REVOKE ALL ON FUNCTION public.ultimos_contatos_titulos(text[], text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ultimos_contatos_titulos(text[], text, text[]) TO authenticated, service_role;
