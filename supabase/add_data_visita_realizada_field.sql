-- Adicionar campo data_visita_realizada à tabela scheduled_visits
-- Este campo armazenará a data em que a visita foi efetivamente realizada

ALTER TABLE public.scheduled_visits 
ADD COLUMN data_visita_realizada date NULL;

-- Adicionar comentário para documentar o campo
COMMENT ON COLUMN public.scheduled_visits.data_visita_realizada 
IS 'Data em que a visita foi efetivamente realizada (diferente da data agendada)';

-- Criar índice para otimizar consultas por data de realização
CREATE INDEX IF NOT EXISTS idx_scheduled_visits_data_visita_realizada 
ON public.scheduled_visits USING btree (data_visita_realizada) 
TABLESPACE pg_default;