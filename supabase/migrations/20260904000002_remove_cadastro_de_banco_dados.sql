-- FASE 2 da normalizacao do cadastro do cliente (ver 20260904000001).
--
-- Remove de BANCO_DADOS as seis colunas de cadastro que agora vivem em
-- `clientes`: apelido, telefone, celular, celular1, celular2 e email.
--
-- E DESTRUTIVA E IRREVERSIVEL. Por isso, antes de dropar qualquer coisa:
--   1. exige que a fase 1 tenha rodado (as colunas precisam existir em
--      `clientes`), abortando com mensagem clara em vez de apagar dados;
--   2. REEXECUTA o backfill. Entre a fase 1 e agora podem ter entrado parcelas
--      novas com contato que nunca chegou ao cadastro (importacao de Novas
--      Parcelas e "Adicionar Titulo" gravavam na parcela). Este passo captura
--      essa deriva -- sem ele, o DROP levaria junto o unico registro desses
--      contatos.
--
-- ORDEM IMPORTA: a view banco_dados_clientes_ativos lista as colunas uma a uma,
-- entao ela precisa ser derrubada antes do ALTER e recriada depois. Um
-- CREATE OR REPLACE nao serve: o Postgres nao permite remover colunas de uma
-- view existente.
--
-- ORDEM DE PUBLICACAO: suba o codigo da fase 2 junto ou antes desta migration.
-- O codigo da fase 1 sobrevive ao DROP na leitura (ele ja prefere o cadastro e
-- o fallback so vira undefined), mas a importacao de Novas Parcelas dele ainda
-- tentaria gravar as colunas removidas.

-- ---------------------------------------------------------------------------
-- 1. Trava: a fase 1 rodou?
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(c.coluna, ', ')
  INTO faltando
  FROM (VALUES ('apelido'), ('telefone'), ('celular'), ('celular1'),
               ('celular2'), ('email')) AS c(coluna)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clientes'
      AND column_name = c.coluna
  );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION
      'A migration 20260904000001 nao foi aplicada: faltam em public.clientes as colunas %. Aplique a fase 1 antes -- sem ela este script apagaria o cadastro.',
      faltando;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Backfill de novo, para nao perder o que entrou depois da fase 1.
--    Mesma logica de la: por COLUNA, valor nao-vazio da parcela mais recente.
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

-- created_at = NULL: `clientes.created_at` define "cliente novo" no card Novos
-- Clientes; gravar now() aqui marcaria como novo quem so ganhou uma parcela.
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

-- coalesce: o que ja esta no cadastro sempre vence. So preenchemos buraco.
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

-- ---------------------------------------------------------------------------
-- 3. Conferencia final: nenhum contato pode ficar so em BANCO_DADOS.
--    Se algo escapou do passo 2, aborta a transacao inteira (a migration roda
--    em transacao, entao o backfill acima tambem e desfeito -- nada fica pela
--    metade) em vez de dropar dado que existe num lugar so.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  orfaos bigint;
BEGIN
  SELECT count(*)
  INTO orfaos
  FROM cadastro_consolidado s
  LEFT JOIN public.clientes c ON c.documento = s.documento
  WHERE (s.apelido  IS NOT NULL AND c.apelido  IS NULL)
     OR (s.telefone IS NOT NULL AND c.telefone IS NULL)
     OR (s.celular  IS NOT NULL AND c.celular  IS NULL)
     OR (s.celular1 IS NOT NULL AND c.celular1 IS NULL)
     OR (s.celular2 IS NOT NULL AND c.celular2 IS NULL)
     OR (s.email    IS NOT NULL AND c.email    IS NULL);

  IF orfaos > 0 THEN
    RAISE EXCEPTION
      'Abortado: % documento(s) ainda tem contato apenas em BANCO_DADOS. O DROP apagaria esses dados.',
      orfaos;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Recria a view sem as seis colunas e as remove da tabela.
--
--    A view lista as colunas explicitamente de proposito (ver 20260827000001):
--    com b.* uma coluna nova em BANCO_DADOS nao apareceria aqui e o desencontro
--    passaria despercebido. Espelha as 38 colunas restantes.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.banco_dados_clientes_ativos;

ALTER TABLE public."BANCO_DADOS"
  DROP COLUMN IF EXISTS apelido,
  DROP COLUMN IF EXISTS telefone,
  DROP COLUMN IF EXISTS celular,
  DROP COLUMN IF EXISTS celular1,
  DROP COLUMN IF EXISTS celular2,
  DROP COLUMN IF EXISTS email;

CREATE VIEW public.banco_dados_clientes_ativos
WITH (security_invoker = on) AS
SELECT
  b.nome_da_loja,
  b.data_lancamento,
  b.data_vencimento,
  b.valor_original,
  b.valor_reajustado,
  b.multa,
  b.juros_por_dia,
  b.multa_aplicada,
  b.juros_aplicado,
  b.valor_recebido,
  b.data_de_recebimento,
  b.dias_em_atraso,
  b.dias_carencia,
  b.desconto,
  b.acrescimo,
  b.multa_paga,
  b.juros_pago,
  b.tipo_de_cobranca,
  b.numero_titulo,
  b.parcela,
  b.id_parcela,
  b.status,
  b.cliente,
  b.documento,
  b.endereco,
  b.numero,
  b.bairro,
  b.complemento,
  b.cep,
  b.cidade,
  b.estado,
  b.obs,
  b.codigo_externo,
  b.descricao,
  b.venda_n,
  b.convenio,
  b.user_id,
  b.situacao
FROM public."BANCO_DADOS" b
WHERE
  b.status IS DISTINCT FROM 'Pago'
  OR EXISTS (
    SELECT 1
    FROM public."BANCO_DADOS" o
    WHERE o.documento = b.documento
      AND o.status IS DISTINCT FROM 'Pago'
  );

COMMENT ON VIEW public.banco_dados_clientes_ativos IS
  'Todas as parcelas dos clientes que ainda tem algo em aberto. Escopo da carga inicial do gestor (src/contexts/CollectionContext.tsx). Exclui apenas clientes 100% quitados; Desempenho/Dashboard precisam do conjunto completo e o carregam sob demanda. Cadastro do cliente (apelido/contatos) vem de `clientes`, nao daqui.';

GRANT SELECT ON public.banco_dados_clientes_ativos TO anon, authenticated;
