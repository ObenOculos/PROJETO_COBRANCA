-- 1. Create the new table to store address history
CREATE TABLE public.enderecos_historico (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    cliente_documento text NOT NULL,
    logradouro text,
    numero text,
    bairro text,
    cidade text,
    estado text,
    cep text,
    is_atual boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT enderecos_historico_pkey PRIMARY KEY (id)
);

-- Add an index on cliente_documento for faster lookups
CREATE INDEX idx_enderecos_historico_cliente_documento ON public.enderecos_historico(cliente_documento);

-- 2. Add comments to the table and columns for clarity
COMMENT ON TABLE public.enderecos_historico IS 'Stores current and historical addresses for clients.';
COMMENT ON COLUMN public.enderecos_historico.is_atual IS 'True if this is the current, active address for the client.';
COMMENT ON COLUMN public.enderecos_historico.cliente_documento IS 'Document number (CPF/CNPJ) of the client this address belongs to.';

-- 3. Enable Row Level Security (RLS) on the new table
ALTER TABLE public.enderecos_historico ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Allow authenticated users to view any address
CREATE POLICY "Allow authenticated user to view addresses"
ON public.enderecos_historico
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert new addresses
CREATE POLICY "Allow authenticated user to insert new addresses"
ON public.enderecos_historico
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update addresses
CREATE POLICY "Allow authenticated user to update addresses"
ON public.enderecos_historico
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);