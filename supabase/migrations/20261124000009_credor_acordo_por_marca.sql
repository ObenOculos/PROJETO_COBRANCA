-- Item 91, ajuste de 24/11: o credor do acordo (nome, CNPJ, endereco, chave
-- Pix e logo) passa a ser cadastrado por MARCA (Focco, Oticas Luana,
-- Excellence). Toda loja da marca herda; a loja so guarda excecao
-- (acordo_credor_loja, migration 20261124000008) no que for diferente --
-- dados proprios e/ou logo propria.
--
-- Ordem de resolucao (src/utils/credorAcordo.ts):
--   dados: excecao da loja -> marca da loja -> padrao (acordo_configuracao_padrao)
--   logo:  excecao da loja -> marca da loja -> logo do app se os dados vieram do padrao
--
-- Historico como em acordo_credor_loja: trocar os dados/logo da marca fecha o
-- registro vigente e abre outro; o Termo de um acordo antigo usa o registro
-- vigente quando ele foi criado. O vinculo loja -> marca nao tem historico
-- (troca de marca de uma loja e raro; Termo antigo regenerado seguiria a
-- marca nova).

CREATE TABLE public.marcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE CHECK (btrim(nome) <> ''),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.marcas IS
  'Marcas (redes) das lojas: Focco, Oticas Luana, Excellence. Agrupam as lojas para o credor do acordo (marca_credor).';

CREATE TABLE public.marca_credor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id),
  empresa_nome text,
  empresa_cnpj text,
  empresa_endereco text,
  empresa_chave_pix text,
  logo_path text,
  vigente_ate timestamptz,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- dados completos (nome + CNPJ + Pix) ou nenhum (lojas usam o padrao);
  -- logo independente
  CONSTRAINT marca_credor_dados_completos CHECK (
    (empresa_nome IS NOT NULL AND empresa_cnpj IS NOT NULL AND empresa_chave_pix IS NOT NULL)
    OR (empresa_nome IS NULL AND empresa_cnpj IS NULL AND empresa_endereco IS NULL
        AND empresa_chave_pix IS NULL)
  )
);

CREATE UNIQUE INDEX uniq_marca_credor_vigente
  ON public.marca_credor (marca_id)
  WHERE vigente_ate IS NULL;

COMMENT ON TABLE public.marca_credor IS
  'Credor do acordo por marca (nome, CNPJ, endereco, Pix, logo) com historico: trocar fecha o vigente e abre outro. Herdado por todas as lojas da marca.';

CREATE TABLE public.loja_marca (
  nome_da_loja text PRIMARY KEY,
  marca_id uuid NOT NULL REFERENCES public.marcas(id),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loja_marca IS
  'A qual marca cada loja (BANCO_DADOS.nome_da_loja) pertence. Loja sem linha = sem marca (usa o padrao).';

-- A excecao da loja agora pode ser so a logo (dados seguindo a marca).
ALTER TABLE public.acordo_credor_loja
  DROP CONSTRAINT acordo_credor_loja_completo;
ALTER TABLE public.acordo_credor_loja
  ADD CONSTRAINT acordo_credor_loja_dados_completos CHECK (
    (empresa_nome IS NOT NULL AND empresa_cnpj IS NOT NULL AND empresa_chave_pix IS NOT NULL)
    OR (empresa_nome IS NULL AND empresa_cnpj IS NULL AND empresa_endereco IS NULL
        AND empresa_chave_pix IS NULL)
  );
COMMENT ON TABLE public.acordo_credor_loja IS
  'Excecao da loja ao credor da marca (dados proprios e/ou logo propria), com historico: trocar fecha o vigente e abre outro. Dados NULL = segue a marca; logo NULL = segue a marca.';

ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marca_credor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loja_marca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_todos" ON public.marcas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_todos" ON public.marca_credor
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_todos" ON public.loja_marca
  FOR SELECT TO authenticated USING (true);

-- Marcas de hoje e o vinculo das lojas existentes, pelo prefixo do nome.
INSERT INTO public.marcas (nome) VALUES
  ('Focco Brasil'), ('Óticas Luana'), ('Excellence Óticas');

INSERT INTO public.loja_marca (nome_da_loja, marca_id)
SELECT l.nome_da_loja, m.id
FROM (
  SELECT DISTINCT nome_da_loja FROM public."BANCO_DADOS"
  WHERE nome_da_loja IS NOT NULL AND btrim(nome_da_loja) <> ''
) l
JOIN public.marcas m ON m.nome = CASE
  WHEN l.nome_da_loja ILIKE 'Oticas Luana%' OR l.nome_da_loja ILIKE 'Óticas Luana%' THEN 'Óticas Luana'
  WHEN l.nome_da_loja ILIKE 'Excellence%' THEN 'Excellence Óticas'
  WHEN l.nome_da_loja ILIKE 'Focco%' THEN 'Focco Brasil'
END;

CREATE OR REPLACE FUNCTION public.criar_marca(p_nome text)
RETURNS public.marcas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nova public.marcas;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem cadastrar marcas.';
  END IF;
  IF NULLIF(btrim(p_nome), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da marca.';
  END IF;

  INSERT INTO public.marcas (nome, created_by)
  VALUES (btrim(p_nome), (SELECT app_current_user_id()))
  RETURNING * INTO v_nova;
  RETURN v_nova;
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_credor_marca(
  p_marca_id uuid,
  p_empresa_nome text,
  p_empresa_cnpj text,
  p_empresa_endereco text,
  p_empresa_chave_pix text,
  p_logo_path text
)
RETURNS public.marca_credor
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nova public.marca_credor;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir os dados da marca.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marcas WHERE id = p_marca_id) THEN
    RAISE EXCEPTION 'Marca não encontrada.';
  END IF;

  UPDATE public.marca_credor
  SET vigente_ate = now()
  WHERE marca_id = p_marca_id AND vigente_ate IS NULL;

  INSERT INTO public.marca_credor (
    marca_id, empresa_nome, empresa_cnpj, empresa_endereco,
    empresa_chave_pix, logo_path, created_by
  ) VALUES (
    p_marca_id,
    NULLIF(btrim(p_empresa_nome), ''),
    NULLIF(btrim(p_empresa_cnpj), ''),
    NULLIF(btrim(p_empresa_endereco), ''),
    NULLIF(btrim(p_empresa_chave_pix), ''),
    NULLIF(btrim(p_logo_path), ''),
    (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;
  RETURN v_nova;
END;
$function$;

-- p_marca_id NULL = loja sem marca.
CREATE OR REPLACE FUNCTION public.definir_marca_da_loja(
  p_nome_da_loja text,
  p_marca_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loja text := NULLIF(btrim(p_nome_da_loja), '');
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir a marca da loja.';
  END IF;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'Informe a loja.';
  END IF;

  IF p_marca_id IS NULL THEN
    DELETE FROM public.loja_marca WHERE nome_da_loja = v_loja;
    RETURN;
  END IF;

  INSERT INTO public.loja_marca (nome_da_loja, marca_id, updated_by, updated_at)
  VALUES (v_loja, p_marca_id, (SELECT app_current_user_id()), now())
  ON CONFLICT (nome_da_loja) DO UPDATE
    SET marca_id = EXCLUDED.marca_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.criar_marca(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_credor_marca(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_marca_da_loja(text, uuid) TO authenticated;
