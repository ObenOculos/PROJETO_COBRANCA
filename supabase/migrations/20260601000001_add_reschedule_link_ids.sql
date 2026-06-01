-- Vínculo rastreável entre uma visita reagendada e a nova visita gerada.
--
-- Contexto: ao reagendar, a visita original é preservada como histórico
-- (status = 'reagendada') e uma nova visita 'agendada' é criada. Até aqui o
-- único vínculo era a coluna `rescheduled_to`, que guarda apenas a DATA de
-- destino — insuficiente para reconstruir a cadeia com certeza quando há mais
-- de uma visita no mesmo dia.
--
-- Estas colunas criam o vínculo explícito por ID, nos dois sentidos:
--   - rescheduled_from_id: na visita NOVA, aponta para a visita de origem.
--   - rescheduled_to_id:   na visita ORIGINAL, aponta para a visita gerada.

ALTER TABLE scheduled_visits
  ADD COLUMN IF NOT EXISTS rescheduled_from_id UUID
    REFERENCES scheduled_visits (id) ON DELETE SET NULL;

ALTER TABLE scheduled_visits
  ADD COLUMN IF NOT EXISTS rescheduled_to_id UUID
    REFERENCES scheduled_visits (id) ON DELETE SET NULL;

-- Índices para navegar a cadeia de reagendamentos com eficiência.
CREATE INDEX IF NOT EXISTS idx_scheduled_visits_rescheduled_from_id
  ON scheduled_visits (rescheduled_from_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_visits_rescheduled_to_id
  ON scheduled_visits (rescheduled_to_id);
