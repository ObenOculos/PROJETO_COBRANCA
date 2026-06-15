-- Cria a tabela collection_attempts (historico de tentativas de cobranca).
-- O codigo (CollectionContext.addAttempt, acionado pelo CollectionModal) ja
-- inseria nesta tabela, mas ela nao existia no schema -- os inserts falhavam e
-- os registros eram perdidos. Esta migration alinha o banco ao codigo.
--
-- Tipos seguem o que o codigo grava: collection_id e enviado como texto
-- (collectionId.toString()); date/next_action_date sao strings ISO.
CREATE TABLE IF NOT EXISTS public.collection_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id text NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  result text NOT NULL,
  notes text,
  next_action text,
  next_action_date text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_attempts_collection_id
  ON public.collection_attempts (collection_id);
