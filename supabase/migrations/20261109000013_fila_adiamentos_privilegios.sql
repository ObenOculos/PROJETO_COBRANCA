-- Item 39 -- fila_adiamentos e fato historico: so INSERT e SELECT.
-- A 0012 deu GRANT SELECT, INSERT, mas o default do Supabase ja tinha dado
-- todos os privilegios a authenticated (inclusive TRUNCATE, que ignora RLS).
-- Sem policy de UPDATE/DELETE a RLS ja bloqueava; aqui fecha no privilegio.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.fila_adiamentos FROM authenticated, anon;
