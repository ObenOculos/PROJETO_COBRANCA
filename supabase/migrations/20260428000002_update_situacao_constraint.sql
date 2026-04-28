-- Update BANCO_DADOS situacao check constraint to include "Cobrança Interna"
-- This allows the transfer of clients to internal collector wallet

ALTER TABLE public."BANCO_DADOS"
DROP CONSTRAINT IF EXISTS "BANCO_DADOS_situacao_check";

ALTER TABLE public."BANCO_DADOS"
ADD CONSTRAINT "BANCO_DADOS_situacao_check"
CHECK (situacao IN ('Em mãos', 'Em tratamento', 'Cobrança Interna') OR situacao IS NULL);