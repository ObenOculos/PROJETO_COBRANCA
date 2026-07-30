-- Motivo do reagendamento em coluna propria.
--
-- Ate agora o motivo so existia como texto dentro de scheduled_visits.notes
-- ("... Motivo: X") — e nem isso: a UI chamava rescheduleVisit sem o parametro
-- `reason`, entao nenhum motivo era registrado.
--
-- Coluna dedicada em vez de parsear a nota porque as notas ACUMULAM ao longo da
-- cadeia de reagendamentos (cada remarcacao concatena a anterior), o que torna
-- impossivel dizer com seguranca qual "Motivo:" pertence a qual remarcacao.
--
-- A coluna e preenchida no registro que FICA com status 'reagendada' — ou seja,
-- a visita que foi empurrada. Cada elo da cadeia carrega o proprio motivo.
--
-- Valores livres nao sao aceitos: o app grava as chaves do catalogo
-- src/config/rescheduleReasons.ts. Sem constraint no banco de proposito —
-- catalogo em evolucao; a validacao fica na aplicacao para nao exigir migration
-- a cada motivo novo.

ALTER TABLE public.scheduled_visits
ADD COLUMN IF NOT EXISTS reschedule_reason text;

COMMENT ON COLUMN public.scheduled_visits.reschedule_reason IS
  'Chave do motivo do reagendamento (src/config/rescheduleReasons.ts). Preenchida no registro que ficou com status = reagendada.';

-- Consulta tipica da aba Reincidentes: elos de cadeia por cliente.
CREATE INDEX IF NOT EXISTS scheduled_visits_reagendada_cliente_idx
  ON public.scheduled_visits (client_document)
  WHERE status = 'reagendada';
