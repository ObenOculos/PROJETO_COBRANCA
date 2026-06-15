-- Adiciona a coluna client_number (número do endereço do cliente) em scheduled_visits.
-- O código de agendamento/reagendamento já grava e lê esse campo
-- (CollectionContext: insert/leitura de visitas), mas a coluna não existia no schema,
-- então o valor era silenciosamente descartado. Esta migration alinha o banco ao código.
ALTER TABLE public.scheduled_visits
ADD COLUMN IF NOT EXISTS client_number text;
