-- Etapa 3 da iniciativa de metas/vinculo gerente-cobrador/carteira
-- automatica (ver memoria estado-metas-vinculo-carteira): cadastro de
-- faixa de atraso POR COBRADOR INDIVIDUAL (decisao do usuario em
-- 2026-11-03 -- nao por perfil/tipo). So o cadastro nesta etapa, sem
-- automacao ligada ainda (etapa 7).
--
-- Vigencia em vez de UPDATE destrutivo: trocar a faixa de um cobrador nao
-- pode reescrever o motivo historico de uma saida de carteira que ja
-- aconteceu sob a faixa anterior (mesmo principio de atribuicoes_historico
-- -- fato nunca se sobrescreve). "Faixa atual" = vigente_ate IS NULL.

CREATE TABLE public.collector_overdue_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES public.users(id),
  min_dias integer NOT NULL,
  max_dias integer,
  vigente_desde date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  vigente_ate date,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collector_overdue_ranges_min_valido CHECK (min_dias >= 0),
  CONSTRAINT collector_overdue_ranges_max_valido CHECK (max_dias IS NULL OR max_dias > min_dias),
  CONSTRAINT collector_overdue_ranges_vigencia_valida CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_desde)
);

-- No maximo 1 faixa ATIVA por cobrador (vigente_ate NULL = vigente agora).
CREATE UNIQUE INDEX uniq_collector_overdue_ranges_ativa
  ON public.collector_overdue_ranges (collector_id)
  WHERE vigente_ate IS NULL;

CREATE INDEX idx_collector_overdue_ranges_collector
  ON public.collector_overdue_ranges (collector_id);

COMMENT ON TABLE public.collector_overdue_ranges IS
  'Faixa de dias de atraso que cada cobrador atende, com vigencia -- trocar a faixa fecha a vigente (vigente_ate) e abre uma nova, nunca sobrescreve.';

ALTER TABLE public.collector_overdue_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_todos" ON public.collector_overdue_ranges
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "insert_gestor" ON public.collector_overdue_ranges
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_current_user_type()) = 'manager');
CREATE POLICY "update_gestor" ON public.collector_overdue_ranges
  FOR UPDATE TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager')
  WITH CHECK ((SELECT app_current_user_type()) = 'manager');
CREATE POLICY "delete_gestor" ON public.collector_overdue_ranges
  FOR DELETE TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager');

-- Troca a faixa de um cobrador: fecha a vigente (se houver) e abre uma
-- nova atomicamente -- evita a janela "sem faixa ativa" de um
-- UPDATE+INSERT feito em dois passos pelo client.
CREATE OR REPLACE FUNCTION public.definir_faixa_atraso_cobrador(
  p_collector_id uuid,
  p_min_dias integer,
  p_max_dias integer
)
RETURNS public.collector_overdue_ranges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_nova public.collector_overdue_ranges;
BEGIN
  IF (SELECT app_current_user_type()) <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir faixa de atraso.';
  END IF;

  UPDATE public.collector_overdue_ranges
  SET vigente_ate = v_hoje
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;

  INSERT INTO public.collector_overdue_ranges (
    collector_id, min_dias, max_dias, vigente_desde, created_by
  ) VALUES (
    p_collector_id, p_min_dias, p_max_dias, v_hoje, (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$$;

COMMENT ON FUNCTION public.definir_faixa_atraso_cobrador(uuid, integer, integer) IS
  'Fecha a faixa vigente do cobrador (se houver) e abre uma nova, atomicamente. Unico caminho esperado para mudar faixa -- preserva a vigencia anterior.';
