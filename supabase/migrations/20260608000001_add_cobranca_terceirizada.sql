-- Add "Cobrança Terceirizada" profile support.
-- 1. Expand the users.type constraint to include 'third_party_collector'.
-- 2. Expand BANCO_DADOS.situacao constraint to include the two new phase values.

-- users.type constraint (the original only had 'manager' | 'collector';
-- 'internal_collector' was used in practice without a constraint update,
-- so we drop-and-recreate to cover all known types cleanly).
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_type_check;

ALTER TABLE public.users
ADD CONSTRAINT users_type_check
CHECK (type IN ('manager', 'collector', 'internal_collector', 'third_party_collector'));

-- BANCO_DADOS.situacao constraint
ALTER TABLE public."BANCO_DADOS"
DROP CONSTRAINT IF EXISTS "BANCO_DADOS_situacao_check";

ALTER TABLE public."BANCO_DADOS"
ADD CONSTRAINT "BANCO_DADOS_situacao_check"
CHECK (
  situacao IN (
    'Em mãos',
    'Em tratamento',
    'Cobrança Interna',
    'Aguardando Interno',
    'Cobrança Terceirizada',
    'Aguardando Terceirizado'
  ) OR situacao IS NULL
);
