-- O app usa auth customizado (sem sessão Supabase), requests chegam como role anon.
-- Desabilitar RLS alinha com o padrão de BANCO_DADOS e demais tabelas operacionais.
ALTER TABLE public.atribuicoes_historico DISABLE ROW LEVEL SECURITY;
