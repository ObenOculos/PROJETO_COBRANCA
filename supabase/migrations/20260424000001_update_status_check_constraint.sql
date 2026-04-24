-- Update the status check constraint to include 'reagendada' status
ALTER TABLE scheduled_visits
DROP CONSTRAINT IF EXISTS scheduled_visits_status_check;

ALTER TABLE scheduled_visits
ADD CONSTRAINT scheduled_visits_status_check
CHECK (status IN ('agendada', 'realizada', 'cancelada', 'nao_encontrado', 'cancelamento_solicitado', 'pending_sync', 'reagendada'));