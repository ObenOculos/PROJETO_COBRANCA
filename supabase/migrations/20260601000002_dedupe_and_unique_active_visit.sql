-- Impede, no nível do banco, a existência de mais de uma visita ATIVA
-- ('agendada') para o mesmo cobrador + cliente + data. Esta é a rede de
-- segurança definitiva contra as visitas duplicadas geradas pela lógica de
-- reagendamento (a correção na aplicação trata a origem; este índice garante
-- a invariante mesmo diante de qualquer caminho de código futuro).
--
-- IMPORTANTE: um índice único parcial NÃO pode ser criado enquanto existirem
-- duplicatas. Por isso, primeiro resolvemos as duplicatas já existentes.
--
-- Estratégia de limpeza (não destrutiva): para cada grupo
-- (collector_id, client_document, scheduled_date) com mais de uma visita
-- 'agendada', mantemos a MAIS RECENTE (created_at) e marcamos as demais como
-- 'cancelada', anexando uma nota de auditoria. Assim nenhuma linha é apagada e
-- o histórico fica rastreável.

-- 1) Resolver duplicatas existentes
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY collector_id, client_document, scheduled_date
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM scheduled_visits
  WHERE status = 'agendada'
)
UPDATE scheduled_visits AS sv
SET
  status = 'cancelada',
  notes = COALESCE(sv.notes || E'\n', '')
    || '• [Sistema] Visita duplicada resolvida automaticamente em '
    || to_char(now(), 'DD/MM/YYYY')
    || ' (mantida apenas uma visita agendada por cliente/data).',
  updated_at = now()
FROM ranked
WHERE sv.id = ranked.id
  AND ranked.rn > 1;

-- 2) Criar o índice único parcial que impede novas duplicatas ativas
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_visit_per_client_date
  ON scheduled_visits (collector_id, client_document, scheduled_date)
  WHERE status = 'agendada';
