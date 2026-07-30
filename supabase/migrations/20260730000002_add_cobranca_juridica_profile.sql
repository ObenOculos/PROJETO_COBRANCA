-- Perfil "Cobrança Jurídica" (users.type = 'legal_collector').
--
-- APENAS ESTRUTURA: nao ha nenhuma logica automatica de atribuicao ou
-- movimentacao de clientes para este perfil. Ele existe para representar os
-- responsaveis por clientes de SPC e demais cobrancas juridicas; o gerente
-- atribui manualmente pela aba de Atribuicao, como nos demais perfis.
--
-- Segue exatamente o molde de 'third_party_collector'
-- (20260608000001_add_cobranca_terceirizada.sql):
--   fase confirmada -> 'Cobrança Jurídica'   (PRIMARY_SITUACAO)
--   fila de espera  -> 'Aguardando Jurídico'
-- Ambas mapeadas em SITUACAO_BY_PROFILE (src/config/profiles.ts).
--
-- Nota: as situacoes 'SPC' e 'Falecido' (20260730000001) permanecem FORA de
-- SITUACAO_BY_PROFILE de proposito. Vincula-las a este perfil as esconderia
-- dos cobradores externos via situacoesOutsideProfile, o que seria mudanca de
-- comportamento — nao e o escopo desta migration.

-- users.type
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_type_check;

ALTER TABLE public.users
ADD CONSTRAINT users_type_check
CHECK (
  type IN (
    'manager',
    'collector',
    'internal_collector',
    'third_party_collector',
    'legal_collector'
  )
);

-- BANCO_DADOS.situacao
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
    'Aguardando Terceirizado',
    'Cobrança Jurídica',
    'Aguardando Jurídico',
    'SPC',
    'Falecido'
  ) OR situacao IS NULL
);
