-- Normaliza o cadastro do cliente na tabela `clientes`.
--
-- PROBLEMA: apelido, telefone, celular, celular1, celular2 e email moram em
-- BANCO_DADOS, que e UMA LINHA POR PARCELA. Um cliente com 20 parcelas tem os
-- seis campos repetidos 20 vezes, sem nada garantindo que as copias sejam
-- iguais -- o valor exibido depende de qual parcela a tela pegou primeiro
-- (ClientAssignment.tsx tinha um "if (!apelido) apelido = ..." so para cacar o
-- apelido em alguma parcela que o tivesse). Atualizar um campo custava N
-- UPDATEs, e as seis colunas ainda entravam 111 mil vezes no heap do navegador
-- (ver a migration 20260827000001).
--
-- `clientes` ja era o registro por documento (nome, data_nascimento,
-- created_at, reincidencia_reset_at); o cadastro de contato so nunca foi
-- movido para la.
--
-- FASE 1 (esta migration): `clientes` vira a fonte de verdade. As colunas de
-- BANCO_DADOS ficam onde estao, como espelho legado -- o app le de `clientes`
-- e cai para BANCO_DADOS quando o cadastro nao tem valor, entao nao existe
-- janela de quebra e o rollback e so reverter o codigo.
-- FASE 2 (depois): parar de selecionar as colunas, recriar a view
-- banco_dados_clientes_ativos sem elas e so entao dropa-las de BANCO_DADOS.
--
-- ENDERECO FICA DE FORA de proposito: tem historico proprio em
-- enderecos_historico e RPC dedicada (update_client_address); gravar direto
-- pularia esse registro.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS apelido  text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS celular  text,
  ADD COLUMN IF NOT EXISTS celular1 text,
  ADD COLUMN IF NOT EXISTS celular2 text,
  ADD COLUMN IF NOT EXISTS email    text;

COMMENT ON COLUMN public.clientes.apelido  IS 'Apelido do cliente. Fonte de verdade; a coluna homonima em BANCO_DADOS e legado (fase 2 remove).';
COMMENT ON COLUMN public.clientes.telefone IS 'Telefone fixo. Fonte de verdade; a coluna homonima em BANCO_DADOS e legado (fase 2 remove).';
COMMENT ON COLUMN public.clientes.celular  IS 'Celular principal. Fonte de verdade; a coluna homonima em BANCO_DADOS e legado (fase 2 remove).';
COMMENT ON COLUMN public.clientes.celular1 IS 'Celular alternativo 1. Fonte de verdade; a coluna homonima em BANCO_DADOS e legado (fase 2 remove).';
COMMENT ON COLUMN public.clientes.celular2 IS 'Celular alternativo 2. Fonte de verdade; a coluna homonima em BANCO_DADOS e legado (fase 2 remove).';
COMMENT ON COLUMN public.clientes.email    IS 'E-mail do cliente. Fonte de verdade; a coluna homonima em BANCO_DADOS e legado (fase 2 remove).';

-- ---------------------------------------------------------------------------
-- 1. Consolida o cadastro que hoje esta espalhado pelas parcelas.
--
-- Por COLUNA, e nao por linha: pegamos o valor nao-vazio da parcela mais
-- recente de cada campo independentemente, para que um cliente cujo apelido so
-- foi preenchido numa parcela antiga nao perca o dado por a parcela mais nova
-- ter o campo vazio.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE cadastro_consolidado ON COMMIT DROP AS
SELECT
  b.documento,
  (array_agg(nullif(btrim(b.cliente),  '') ORDER BY b.id_parcela DESC)
     FILTER (WHERE nullif(btrim(b.cliente),  '') IS NOT NULL))[1] AS nome,
  (array_agg(nullif(btrim(b.apelido),  '') ORDER BY b.id_parcela DESC)
     FILTER (WHERE nullif(btrim(b.apelido),  '') IS NOT NULL))[1] AS apelido,
  (array_agg(nullif(btrim(b.telefone), '') ORDER BY b.id_parcela DESC)
     FILTER (WHERE nullif(btrim(b.telefone), '') IS NOT NULL))[1] AS telefone,
  (array_agg(nullif(btrim(b.celular),  '') ORDER BY b.id_parcela DESC)
     FILTER (WHERE nullif(btrim(b.celular),  '') IS NOT NULL))[1] AS celular,
  (array_agg(nullif(btrim(b.celular1), '') ORDER BY b.id_parcela DESC)
     FILTER (WHERE nullif(btrim(b.celular1), '') IS NOT NULL))[1] AS celular1,
  (array_agg(nullif(btrim(b.celular2), '') ORDER BY b.id_parcela DESC)
     FILTER (WHERE nullif(btrim(b.celular2), '') IS NOT NULL))[1] AS celular2,
  (array_agg(nullif(btrim(b.email),    '') ORDER BY b.id_parcela DESC)
     FILTER (WHERE nullif(btrim(b.email),    '') IS NOT NULL))[1] AS email
FROM public."BANCO_DADOS" b
WHERE nullif(btrim(b.documento), '') IS NOT NULL
GROUP BY b.documento;

CREATE INDEX ON cadastro_consolidado (documento);

-- ---------------------------------------------------------------------------
-- 2. Cria as linhas faltantes: documentos que existem em BANCO_DADOS mas nunca
--    ganharam cadastro. Sem isso esses clientes ficariam fora do alcance da
--    importacao de cadastro para sempre.
--
--    created_at = NULL de proposito. `clientes.created_at` e o que define
--    "cliente novo" no card Novos Clientes (ClientAssignment.tsx); gravar
--    now() aqui faria milhares de clientes antigos aparecerem como novos deste
--    mes. O filtro la ja ignora linha com created_at nulo, entao esses
--    clientes ficam corretamente como "data de entrada desconhecida" -- e a
--    importacao de cadastro aceita a coluna "Data do Cadastro" justamente para
--    preencher esses nulos com a data real do sistema de origem.
--
--    NOT EXISTS em vez de ON CONFLICT: nao dependemos de haver uma constraint
--    unica em `documento`.
-- ---------------------------------------------------------------------------
INSERT INTO public.clientes (
  documento, nome, created_at,
  apelido, telefone, celular, celular1, celular2, email
)
SELECT
  s.documento,
  coalesce(s.nome, 'Cliente sem nome'),
  NULL,
  s.apelido, s.telefone, s.celular, s.celular1, s.celular2, s.email
FROM cadastro_consolidado s
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes c WHERE c.documento = s.documento
);

-- ---------------------------------------------------------------------------
-- 3. Backfill de quem ja tinha cadastro.
--
--    coalesce(c.x, s.x): o valor que ja esta em `clientes` sempre vence, entao
--    rodar a migration duas vezes nao sobrescreve nada -- e uma edicao feita
--    pela importacao depois desta migration nao volta atras.
--
--    `nome` NAO entra: a linha existente em `clientes` e considerada mais
--    confiavel que o nome da nota em BANCO_DADOS.
-- ---------------------------------------------------------------------------
UPDATE public.clientes c
SET apelido  = coalesce(c.apelido,  s.apelido),
    telefone = coalesce(c.telefone, s.telefone),
    celular  = coalesce(c.celular,  s.celular),
    celular1 = coalesce(c.celular1, s.celular1),
    celular2 = coalesce(c.celular2, s.celular2),
    email    = coalesce(c.email,    s.email)
FROM cadastro_consolidado s
WHERE c.documento = s.documento
  AND (
    (c.apelido  IS NULL AND s.apelido  IS NOT NULL) OR
    (c.telefone IS NULL AND s.telefone IS NOT NULL) OR
    (c.celular  IS NULL AND s.celular  IS NOT NULL) OR
    (c.celular1 IS NULL AND s.celular1 IS NOT NULL) OR
    (c.celular2 IS NULL AND s.celular2 IS NOT NULL) OR
    (c.email    IS NULL AND s.email    IS NOT NULL)
  );

-- Buscas por documento vindas do app (registry, importacao, useClientBirthDate).
CREATE INDEX IF NOT EXISTS clientes_documento_idx ON public.clientes (documento);
