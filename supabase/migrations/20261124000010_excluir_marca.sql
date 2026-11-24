-- Item 91b (24/11): apagar marca pela tela. Exclusao logica (excluida_em):
-- o historico de dados/logo da marca (marca_credor) fica, porque Termos
-- antigos podem ter saido com ele. So apaga marca sem loja vinculada.
-- O nome volta a ficar livre para uma marca nova.

ALTER TABLE public.marcas ADD COLUMN excluida_em timestamptz;
ALTER TABLE public.marcas ADD COLUMN excluida_por uuid REFERENCES public.users(id);

ALTER TABLE public.marcas DROP CONSTRAINT marcas_nome_key;
CREATE UNIQUE INDEX uniq_marcas_nome_ativa
  ON public.marcas (lower(nome))
  WHERE excluida_em IS NULL;

CREATE OR REPLACE FUNCTION public.excluir_marca(p_marca_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lojas integer;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem apagar marcas.';
  END IF;

  SELECT count(*) INTO v_lojas FROM public.loja_marca WHERE marca_id = p_marca_id;
  IF v_lojas > 0 THEN
    RAISE EXCEPTION 'Esta marca ainda tem % loja(s). Mova as lojas para outra marca antes de apagar.', v_lojas;
  END IF;

  UPDATE public.marcas
  SET excluida_em = now(), excluida_por = (SELECT app_current_user_id())
  WHERE id = p_marca_id AND excluida_em IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada.';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.excluir_marca(uuid) TO authenticated;

-- Loja nao pode ser ligada a marca apagada.
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

  IF NOT EXISTS (
    SELECT 1 FROM public.marcas WHERE id = p_marca_id AND excluida_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Marca não encontrada.';
  END IF;

  INSERT INTO public.loja_marca (nome_da_loja, marca_id, updated_by, updated_at)
  VALUES (v_loja, p_marca_id, (SELECT app_current_user_id()), now())
  ON CONFLICT (nome_da_loja) DO UPDATE
    SET marca_id = EXCLUDED.marca_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
END;
$function$;
