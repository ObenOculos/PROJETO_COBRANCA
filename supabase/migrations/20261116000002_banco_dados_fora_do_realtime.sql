-- BANCO_DADOS sai da publicacao do Realtime (2026-11-16).
--
-- Egress do Supabase estourou a cota do plano. As rotinas (sync do Ciclone
-- 3x/dia, importacao da SSOtica, carteira automatica) alteram milhares de
-- linhas desta tabela por rodada, e o Realtime mandava cada linha alterada
-- para cada aba aberta do app, que em seguida baixava a carteira inteira.
-- O front deixou de escutar esta tabela (CollectionContext: recarga ao voltar
-- para a aba depois de 30 min); tirar da publicacao corta tambem as abas que
-- ainda rodam a versao antiga e o trabalho de decodificar o WAL dela.
--
-- sale_payments continua na publicacao (o app escuta, volume pequeno).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'BANCO_DADOS'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public."BANCO_DADOS";
  END IF;
END $$;
