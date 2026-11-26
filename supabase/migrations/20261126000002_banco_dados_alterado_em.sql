-- Item 94 (26/11), etapa 1: base para a carga INCREMENTAL da carteira.
-- Egress do Supabase: cada F5 do gestor baixava a base inteira (~59 MB de
-- ativos + ~74 MB de quitados, item 65). A ideia e guardar a base no
-- navegador e, a cada abertura, buscar so o que mudou. Para isso:
--
-- 1) BANCO_DADOS.alterado_em: quando a linha mudou de verdade. As rotinas
--    (Ciclone, SSOtica, carteira 7h) regravam milhares de linhas com o MESMO
--    valor (1,2 mi de UPDATEs em 165 mil linhas) -- o gatilho so marca quando
--    algum valor muda, senao todo dia "tudo mudou" e o incremental nao serve.
--    Linhas que ja existem ficam com a hora desta migration (o navegador que
--    ainda nao tem copia faz a carga completa de qualquer jeito).
-- 2) Indice em alterado_em (a busca "mudou desde X" nao varre a tabela).
-- 3) banco_dados_excluidos: id_parcela + quando foi excluida (o navegador
--    tira da copia local). So insere; ninguem do app grava aqui.
--
-- Nao muda nenhuma tela nem regra: so prepara. O app passa a usar na etapa 2.

-- 1) Coluna --------------------------------------------------------------------
-- now() e STABLE: o Postgres guarda como valor padrao "rapido" (sem reescrever
-- as 165 mil linhas).
ALTER TABLE public."BANCO_DADOS"
  ADD COLUMN IF NOT EXISTS alterado_em timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.trg_banco_dados_marca_alteracao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Compara a linha inteira (alterado_em ainda igual nos dois lados): so
  -- marca quando algum valor mudou de fato.
  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    NEW.alterado_em := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$function$;

-- Nome com "zz_": os gatilhos BEFORE rodam em ordem alfabetica, e este tem de
-- ver a linha DEPOIS dos outros (protege_*), que podem mexer em NEW.
DROP TRIGGER IF EXISTS zz_banco_dados_marca_alteracao ON public."BANCO_DADOS";
CREATE TRIGGER zz_banco_dados_marca_alteracao
  BEFORE UPDATE ON public."BANCO_DADOS"
  FOR EACH ROW EXECUTE FUNCTION public.trg_banco_dados_marca_alteracao();

-- 2) Indice --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_banco_dados_alterado_em
  ON public."BANCO_DADOS" (alterado_em);

-- 3) Exclusoes -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.banco_dados_excluidos (
  id_parcela bigint NOT NULL,
  excluido_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_banco_dados_excluidos_em
  ON public.banco_dados_excluidos (excluido_em);

ALTER TABLE public.banco_dados_excluidos ENABLE ROW LEVEL SECURITY;
-- So o id da parcela e a hora: o app le para tirar da copia local.
DROP POLICY IF EXISTS leitura_autenticado ON public.banco_dados_excluidos;
CREATE POLICY leitura_autenticado ON public.banco_dados_excluidos
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.banco_dados_excluidos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.banco_dados_excluidos FROM authenticated;
GRANT SELECT ON public.banco_dados_excluidos TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_banco_dados_registra_exclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.banco_dados_excluidos (id_parcela)
  SELECT v.id_parcela FROM velhas v;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_banco_dados_registra_exclusao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS banco_dados_registra_exclusao ON public."BANCO_DADOS";
CREATE TRIGGER banco_dados_registra_exclusao
  AFTER DELETE ON public."BANCO_DADOS"
  REFERENCING OLD TABLE AS velhas
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_banco_dados_registra_exclusao();
