-- Correcao de seguranca (2026-11-06): funcao nova ainda nascia executavel por
-- anon, apesar da migration 20261103000008.
--
-- Achado pelo npm run check:db depois da 20261106000002:
-- acordo_lancamento_ciclone(uuid) executavel por anon. Causa (confirmada em
-- pg_proc.proacl = {=X/postgres,...} e pg_default_acl): o Postgres da
-- EXECUTE a PUBLIC em toda funcao nova por padrao GLOBAL. A 20261103000008
-- fez "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ... FROM anon", que
-- so mexe no grant DIRETO a anon no nivel do schema -- o grant a PUBLIC vem
-- do padrao global (nao do schema) e anon herda por PUBLIC. Default
-- privileges por schema so conseguem ADICIONAR ao global, nunca tirar.
--
-- Correcao:
--   1) fecha a funcao afetada (PUBLIC e anon);
--   2) tira EXECUTE de PUBLIC no padrao GLOBAL do papel postgres (dono das
--      funcoes criadas pelas migrations). authenticated/service_role seguem
--      recebendo EXECUTE pelo padrao do schema public (pg_default_acl do
--      postgres: authenticated=X, service_role=X), entao nada que o app usa
--      deixa de funcionar.
-- Efeito so para funcoes criadas daqui para frente; as existentes ja passam
-- no check:db.

REVOKE EXECUTE ON FUNCTION public.acordo_lancamento_ciclone(uuid) FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
