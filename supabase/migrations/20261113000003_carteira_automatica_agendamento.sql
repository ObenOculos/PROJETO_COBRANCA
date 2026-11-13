-- Item 55, etapa 4 (2026-11-13): carteira automatica todo dia as 7h.
--
-- Agendador do proprio Supabase (pg_cron), para nao depender do computador
-- do escritorio ligado (as importacoes rodam no Windows; esta roda no banco).
-- 7h em Fortaleza/Brasilia (UTC-3, sem horario de verao) = 10h UTC -- o
-- pg_cron do Supabase usa UTC. Depois das importacoes das 5h (Ciclone) e
-- 6h (SSOtica, ~40 min).
--
-- Cada execucao fica em public.distribuicao_execucoes; o historico de quem
-- entrou/saiu fica em atribuicoes_historico (motivos 'distribuicao_automatica'
-- e 'fora_da_faixa_sem_acao', gerente_id vazio).
--
-- Desligar: SELECT cron.unschedule('carteira_automatica_7h');

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'carteira_automatica_7h';

SELECT cron.schedule(
  'carteira_automatica_7h',
  '0 10 * * *',
  $$SELECT public.executar_distribuicao_automatica()$$
);
