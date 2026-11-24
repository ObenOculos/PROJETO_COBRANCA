-- Item 91 (24/11): credor do acordo por loja -- nome, CNPJ, endereco, chave
-- Pix e logo de cada loja (BANCO_DADOS.nome_da_loja). O Termo, o Resumo e o
-- QR Pix da entrada saem com os dados da loja dos titulos; loja sem
-- cadastro usa o padrao (acordo_configuracao_padrao, Focco).
--
-- Decisoes do usuario (24/11): tudo por loja (o dinheiro do Pix tem que cair
-- na conta da loja que vendeu); um acordo so junta titulos de UMA loja.
--
-- Historico em vez de UPDATE: trocar os dados fecha o registro vigente e abre
-- outro. O Termo de um acordo antigo usa o registro vigente quando ele foi
-- criado (created_at), entao trocar a chave hoje nao reescreve o termo de
-- ontem. "Voltar ao padrao" e um registro novo com tudo NULL.

CREATE TABLE public.acordo_credor_loja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_da_loja text NOT NULL,
  empresa_nome text,
  empresa_cnpj text,
  empresa_endereco text,
  empresa_chave_pix text,
  -- caminho no bucket logos-lojas (arquivo nunca e sobrescrito)
  logo_path text,
  vigente_ate timestamptz,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- configurado = nome + CNPJ + chave Pix; ou tudo NULL = usa o padrao
  CONSTRAINT acordo_credor_loja_completo CHECK (
    (empresa_nome IS NOT NULL AND empresa_cnpj IS NOT NULL AND empresa_chave_pix IS NOT NULL)
    OR (empresa_nome IS NULL AND empresa_cnpj IS NULL AND empresa_endereco IS NULL
        AND empresa_chave_pix IS NULL AND logo_path IS NULL)
  )
);

CREATE UNIQUE INDEX uniq_acordo_credor_loja_vigente
  ON public.acordo_credor_loja (nome_da_loja)
  WHERE vigente_ate IS NULL;

COMMENT ON TABLE public.acordo_credor_loja IS
  'Credor do acordo por loja (nome, CNPJ, endereco, chave Pix, logo) com historico: trocar fecha o vigente (vigente_ate) e abre outro. Tudo NULL = loja usa o padrao de acordo_configuracao_padrao. Termo antigo usa o registro vigente no created_at do acordo.';

ALTER TABLE public.acordo_credor_loja ENABLE ROW LEVEL SECURITY;

-- Leitura para todo autenticado (o cobrador gera o Pix/Termo). Escrita so
-- pela RPC abaixo.
CREATE POLICY "select_todos" ON public.acordo_credor_loja
  FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.definir_credor_acordo_loja(
  p_nome_da_loja text,
  p_empresa_nome text,
  p_empresa_cnpj text,
  p_empresa_endereco text,
  p_empresa_chave_pix text,
  p_logo_path text
)
RETURNS public.acordo_credor_loja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nova public.acordo_credor_loja;
  v_loja text := NULLIF(btrim(p_nome_da_loja), '');
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir os dados da loja no acordo.';
  END IF;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'Informe a loja.';
  END IF;

  UPDATE public.acordo_credor_loja
  SET vigente_ate = now()
  WHERE nome_da_loja = v_loja AND vigente_ate IS NULL;

  INSERT INTO public.acordo_credor_loja (
    nome_da_loja, empresa_nome, empresa_cnpj, empresa_endereco,
    empresa_chave_pix, logo_path, created_by
  ) VALUES (
    v_loja,
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

GRANT EXECUTE ON FUNCTION public.definir_credor_acordo_loja(text, text, text, text, text, text)
  TO authenticated;

-- Um acordo so junta titulos de uma loja (cada loja tem seu Pix). Trava no
-- banco alem da tela: titulo de loja diferente dos que o acordo ja tem e
-- recusado.
CREATE OR REPLACE FUNCTION public.acordo_titulos_mesma_loja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loja_nova text;
  v_loja_outra text;
BEGIN
  SELECT nome_da_loja INTO v_loja_nova
  FROM public."BANCO_DADOS" WHERE id_parcela = NEW.collection_id;

  SELECT b.nome_da_loja INTO v_loja_outra
  FROM public.acordo_titulos t
  JOIN public."BANCO_DADOS" b ON b.id_parcela = t.collection_id
  WHERE t.acordo_id = NEW.acordo_id
    AND t.id IS DISTINCT FROM NEW.id
    AND b.nome_da_loja IS DISTINCT FROM v_loja_nova
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Um acordo só pode ter títulos de uma loja (% e %). Faça um acordo por loja.',
      coalesce(v_loja_outra, 'sem loja'), coalesce(v_loja_nova, 'sem loja');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_acordo_titulos_mesma_loja
  BEFORE INSERT ON public.acordo_titulos
  FOR EACH ROW EXECUTE FUNCTION public.acordo_titulos_mesma_loja();

-- Logos das lojas: bucket publico (o PDF e a tela leem pela URL publica),
-- so PNG/JPEG (o jsPDF so desenha esses), ate 1 MB. Escrita so do gestor;
-- sem UPDATE/DELETE -- cada troca sobe arquivo novo, o antigo fica para o
-- historico dos termos ja emitidos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos-lojas', 'logos-lojas', true, 1048576, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "logos_lojas_insert_gestor" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos-lojas'
    AND (SELECT public.app_current_user_type()) = 'manager'
  );
