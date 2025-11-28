-- This script migrates the existing addresses from the `BANCO_DADOS` table
-- to the newly created `enderecos_historico` table.

-- It uses DISTINCT ON(documento) to get only one (the most recent) address
-- for each client, preventing duplicates. We assume the latest entry in BANCO_DADOS
-- for a client has their most current address.

INSERT INTO public.enderecos_historico (cliente_documento, logradouro, numero, bairro, cidade, estado, cep, is_atual)
WITH latest_address AS (
    -- Use a window function to pick the most recent entry per client.
    -- We assume the row with the latest 'data_lancamento' or 'id_parcela' holds the most current address.
    SELECT
        documento,
        endereco,
        numero,
        bairro,
        cidade,
        estado,
        cep,
        ROW_NUMBER() OVER(PARTITION BY documento ORDER BY data_lancamento DESC, id_parcela DESC) as rn
    FROM public."BANCO_DADOS"
    WHERE documento IS NOT NULL AND documento != '' AND endereco IS NOT NULL AND endereco != ''
)
SELECT
    documento,
    endereco,  -- Mapped to logradouro
    numero,
    bairro,
    cidade,
    estado,
    cep,
    true       -- Mark this as the current address
FROM latest_address
WHERE rn = 1;

-- Note: This migration makes an assumption that the record with the latest 'data_lancamento'
-- or 'id_parcela' holds the most current address for a client.