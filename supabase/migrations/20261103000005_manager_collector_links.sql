-- Etapa 4 da iniciativa de metas/vinculo gerente-cobrador/carteira
-- automatica (ver memoria estado-metas-vinculo-carteira): vinculo
-- gerente<->cobrador, usado para consolidar desempenho de equipe e (no
-- futuro, fora de escopo aqui) calcular bonificacao do gestor. Greenfield
-- total -- users nao tinha nenhuma coluna de hierarquia.
--
-- Mesmo padrao de vigencia de collector_overdue_ranges (migration
-- 20261103000004): trocar o gestor responsavel por um cobrador no meio do
-- caminho nao pode reescrever a que gestor pertenciam os resultados do
-- periodo anterior -- a bonificacao de um mes fechado tem que olhar o
-- vinculo vigente NAQUELE periodo, nunca o vinculo "atual".

CREATE TABLE public.manager_collector_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.users(id),
  collector_id uuid NOT NULL REFERENCES public.users(id),
  vigente_desde date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  vigente_ate date,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manager_collector_links_sem_autovinculo CHECK (manager_id <> collector_id),
  CONSTRAINT manager_collector_links_vigencia_valida CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_desde)
);

-- No maximo 1 gestor ATIVO por cobrador (vigente_ate NULL = vigente agora).
-- Um cobrador pode ter so um gestor responsavel por vez; um gestor pode ter
-- varios cobradores (sem unicidade do lado do manager_id).
CREATE UNIQUE INDEX uniq_manager_collector_links_ativo
  ON public.manager_collector_links (collector_id)
  WHERE vigente_ate IS NULL;

CREATE INDEX idx_manager_collector_links_manager
  ON public.manager_collector_links (manager_id);
CREATE INDEX idx_manager_collector_links_collector
  ON public.manager_collector_links (collector_id);

COMMENT ON TABLE public.manager_collector_links IS
  'Vinculo gerente->cobrador com vigencia -- trocar o gestor de um cobrador fecha o vinculo vigente e abre um novo, nunca sobrescreve (resultados/bonificacao de periodo fechado usam o vinculo vigente NAQUELE periodo).';

ALTER TABLE public.manager_collector_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_todos" ON public.manager_collector_links
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "insert_gestor" ON public.manager_collector_links
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_current_user_type()) = 'manager');
CREATE POLICY "update_gestor" ON public.manager_collector_links
  FOR UPDATE TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager')
  WITH CHECK ((SELECT app_current_user_type()) = 'manager');
CREATE POLICY "delete_gestor" ON public.manager_collector_links
  FOR DELETE TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager');

-- Vincula um cobrador a um gestor: fecha o vinculo ativo anterior do
-- cobrador (se houver, com outro gestor) e abre um novo, atomicamente.
CREATE OR REPLACE FUNCTION public.vincular_cobrador_a_gerente(
  p_manager_id uuid,
  p_collector_id uuid
)
RETURNS public.manager_collector_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_novo public.manager_collector_links;
BEGIN
  IF (SELECT app_current_user_type()) <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem alterar vinculos de equipe.';
  END IF;

  UPDATE public.manager_collector_links
  SET vigente_ate = v_hoje
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;

  INSERT INTO public.manager_collector_links (
    manager_id, collector_id, vigente_desde, created_by
  ) VALUES (
    p_manager_id, p_collector_id, v_hoje, (SELECT app_current_user_id())
  )
  RETURNING * INTO v_novo;

  RETURN v_novo;
END;
$$;

COMMENT ON FUNCTION public.vincular_cobrador_a_gerente(uuid, uuid) IS
  'Fecha o vinculo ativo anterior do cobrador (se houver) e abre um novo com o gestor informado, atomicamente.';

-- Desvincula um cobrador de qualquer gestor (fica sem gestor responsavel).
CREATE OR REPLACE FUNCTION public.desvincular_cobrador(p_collector_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT app_current_user_type()) <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem alterar vinculos de equipe.';
  END IF;

  UPDATE public.manager_collector_links
  SET vigente_ate = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;
END;
$$;
