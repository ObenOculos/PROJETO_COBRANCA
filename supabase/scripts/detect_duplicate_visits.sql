-- =============================================================================
-- Script de DIAGNÓSTICO (somente leitura) — visitas duplicadas
-- =============================================================================
-- Use no SQL Editor do Supabase ANTES de aplicar a migração
-- 20260601000002_dedupe_and_unique_active_visit.sql para revisar o que será
-- afetado. Nenhuma destas consultas altera dados.
--
-- "Duplicata" = mais de uma visita com status 'agendada' para o mesmo
-- cobrador + cliente + data.

-- 1) Resumo: quantos grupos duplicados existem e quantas linhas excedentes
SELECT
  COUNT(*)                       AS grupos_duplicados,
  COALESCE(SUM(qtd - 1), 0)      AS visitas_excedentes_a_resolver
FROM (
  SELECT collector_id, client_document, scheduled_date, COUNT(*) AS qtd
  FROM scheduled_visits
  WHERE status = 'agendada'
  GROUP BY collector_id, client_document, scheduled_date
  HAVING COUNT(*) > 1
) grupos;

-- 2) Detalhe por grupo duplicado (ordenado pelos maiores ofensores)
SELECT
  collector_id,
  client_document,
  client_name,
  scheduled_date,
  COUNT(*)            AS qtd_agendadas,
  MIN(created_at)     AS criada_mais_antiga,
  MAX(created_at)     AS criada_mais_recente
FROM scheduled_visits
WHERE status = 'agendada'
GROUP BY collector_id, client_document, client_name, scheduled_date
HAVING COUNT(*) > 1
ORDER BY qtd_agendadas DESC, scheduled_date DESC;

-- 3) Linhas individuais que SERIAM marcadas como 'cancelada' pela migração
--    (todas, exceto a mais recente de cada grupo). Revise antes de aplicar.
WITH ranked AS (
  SELECT
    id, collector_id, client_document, client_name, scheduled_date,
    scheduled_time, status, created_at, reschedule_count,
    ROW_NUMBER() OVER (
      PARTITION BY collector_id, client_document, scheduled_date
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM scheduled_visits
  WHERE status = 'agendada'
)
SELECT *
FROM ranked
WHERE rn > 1
ORDER BY client_document, scheduled_date, created_at;
