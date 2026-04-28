-- Transfer all clients with "nao_encontrado" visits to internal collector wallet
-- This migration:
-- 1. Updates the constraint to allow "Cobrança Interna"
-- 2. Transfers BANCO_DADOS records for clients with nao_encontrado visits
-- 3. Sets situacao = 'Cobrança Interna' WITHOUT automatically assigning a specific internal_collector
--    The manager must manually assign clients to the desired internal collector afterward

-- First, update the constraint to allow "Cobrança Interna"
ALTER TABLE public."BANCO_DADOS"
DROP CONSTRAINT IF EXISTS "BANCO_DADOS_situacao_check";

ALTER TABLE public."BANCO_DADOS"
ADD CONSTRAINT "BANCO_DADOS_situacao_check"
CHECK (situacao IN ('Em mãos', 'Em tratamento', 'Cobrança Interna') OR situacao IS NULL);

BEGIN;

-- Get the internal collector ID (assuming there's only one)
CREATE TEMP TABLE temp_internal_collector AS
SELECT id
FROM public.users
WHERE type = 'internal_collector'
LIMIT 1;

-- Update BANCO_DADOS records for clients with nao_encontrado visits
UPDATE public."BANCO_DADOS" bd
SET
  situacao = 'Cobrança Interna',
  user_id = (SELECT id FROM temp_internal_collector)
WHERE bd.documento IN (
  SELECT DISTINCT sv.client_document
  FROM public.scheduled_visits sv
  WHERE sv.status = 'nao_encontrado'
  AND sv.client_document IS NOT NULL
  AND sv.client_document != ''
);

-- Log the changes
DO $$
DECLARE
  updated_count INTEGER;
  internal_collector_id TEXT;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public."BANCO_DADOS" bd
  WHERE bd.situacao = 'Cobrança Interna'
  AND bd.user_id = (SELECT id FROM temp_internal_collector);

  SELECT id INTO internal_collector_id FROM temp_internal_collector;

  RAISE NOTICE 'Transferred % clients to internal collector wallet (ID: %)', updated_count, internal_collector_id;
END $$;

-- Clean up temp table
DROP TABLE temp_internal_collector;

COMMIT;