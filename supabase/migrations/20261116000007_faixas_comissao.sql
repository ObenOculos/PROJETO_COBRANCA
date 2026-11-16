-- Item 72 -- Faixas de comissao por meta (cobrador e gestor).
--
-- Antes: monthly_goals guardava UMA meta de valor por usuario/mes, sem
-- percentual. Caso real (2026-11-16): Jose tem 3 metas no mes --
-- R$ 90.000 -> 0,889%, R$ 110.000 -> 1,3%, R$ 130.000 -> 1,5%.
--
-- Decisoes do usuario (2026-11-16):
--  * vale a MAIOR faixa atingida (nao progressivo). Duas formas, escolhidas
--    pelo gestor por usuario/mes (todas as faixas do mes na mesma forma):
--      'percentual': % da faixa sobre TODO o recebido no mes
--        (Jose 90 mil -> 0,889%; Monalisa 20 mil -> 2%; Francisco 12 mil -> 10%);
--      'fixo': valor em R$ da faixa (Aline 4 mil -> R$ 100, 5 mil -> R$ 200).
--    Fixo nao vira %: com 4% na faixa de 5 mil, quem recebe 5.900 ganharia
--    R$ 236 em vez de R$ 200 -- e outra regra de pagamento;
--  * abaixo da 1a faixa nao ha comissao;
--  * gestor: mesma regra, sobre o recebido da equipe vinculada a ele
--    (manager_collector_links);
--  * mes que ja passou nao se altera mais (comissao calculada/paga nao muda).
--
-- Modelo: as faixas do mes sao um conjunto; editar = marcar o conjunto vigente
-- como substituido (substituida_em) e gravar o novo. Nada e apagado -- fica o
-- historico de quem mudou e quando. monthly_goals.payments_goal continua sendo
-- lido por varias telas como "a meta do mes": passa a ser a meta da 1a faixa
-- (onde a comissao comeca), gravado pela mesma RPC.

CREATE TABLE public.comissao_faixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  month date NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  meta_valor numeric(14,2) NOT NULL CHECK (meta_valor > 0),
  forma text NOT NULL CHECK (forma IN ('percentual', 'fixo')),
  -- 'percentual': pontos percentuais (0.889 = 0,889%); 'fixo': R$.
  valor numeric(14,3) NOT NULL CHECK (valor >= 0),
  CHECK (forma <> 'percentual' OR valor <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  substituida_em timestamptz,
  substituida_por uuid REFERENCES public.users(id)
);

COMMENT ON TABLE public.comissao_faixas IS
  'Faixas de comissao por usuario/mes (item 72). Vale a maior faixa atingida: forma percentual = valor% sobre todo o recebido do mes; forma fixo = valor em R$. Vigente = substituida_em IS NULL. So grava via definir_metas_mes.';

CREATE UNIQUE INDEX comissao_faixas_vigente_uk
  ON public.comissao_faixas (user_id, month, meta_valor)
  WHERE substituida_em IS NULL;

CREATE INDEX comissao_faixas_user_month_idx
  ON public.comissao_faixas (user_id, month);

ALTER TABLE public.comissao_faixas ENABLE ROW LEVEL SECURITY;

-- Leitura: gestor ve tudo, cada usuario ve as proprias. Escrita so pela RPC.
CREATE POLICY select_dono_ou_gestor ON public.comissao_faixas
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR user_id = (SELECT app_current_user_id())
  );

-- Grava meta de atendimentos/visitas + faixas de comissao do mes de uma vez.
-- p_forma: 'percentual' | 'fixo'
-- p_faixas: [{"meta_valor": 90000, "valor": 0.889}, ...]
CREATE OR REPLACE FUNCTION public.definir_metas_mes(
  p_user_id uuid,
  p_month date,
  p_visits_goal integer,
  p_forma text,
  p_faixas jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_mes_atual date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
  v_eu uuid := (SELECT app_current_user_id());
  v_faixa record;
  v_meta_anterior numeric := NULL;
  v_valor_anterior numeric := NULL;
  v_primeira_meta numeric := 0;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir metas.';
  END IF;
  IF p_month IS NULL OR EXTRACT(DAY FROM p_month) <> 1 THEN
    RAISE EXCEPTION 'Mês inválido.';
  END IF;
  IF p_month < v_mes_atual THEN
    RAISE EXCEPTION 'Mês que já passou não pode ser alterado.';
  END IF;
  IF COALESCE(p_visits_goal, 0) < 0 THEN
    RAISE EXCEPTION 'Meta de atendimentos não pode ser negativa.';
  END IF;
  IF p_forma IS NULL OR p_forma NOT IN ('percentual', 'fixo') THEN
    RAISE EXCEPTION 'Forma de comissão inválida.';
  END IF;
  IF p_faixas IS NULL OR jsonb_typeof(p_faixas) <> 'array' THEN
    RAISE EXCEPTION 'Faixas inválidas.';
  END IF;

  -- Valida em ordem de meta: metas diferentes e valor que nao cai de uma
  -- faixa para a seguinte (como vale so a maior faixa, uma faixa mais alta
  -- com valor menor faria o cobrador ganhar menos ao receber mais).
  FOR v_faixa IN
    SELECT (f->>'meta_valor')::numeric AS meta_valor,
           (f->>'valor')::numeric AS valor
    FROM jsonb_array_elements(p_faixas) f
    ORDER BY (f->>'meta_valor')::numeric
  LOOP
    IF v_faixa.meta_valor IS NULL OR v_faixa.meta_valor <= 0 THEN
      RAISE EXCEPTION 'Toda faixa precisa de uma meta maior que zero.';
    END IF;
    IF v_faixa.valor IS NULL OR v_faixa.valor < 0 THEN
      RAISE EXCEPTION 'Toda faixa precisa de um valor de comissão.';
    END IF;
    IF p_forma = 'percentual' AND v_faixa.valor > 100 THEN
      RAISE EXCEPTION 'Percentual da faixa deve estar entre 0 e 100.';
    END IF;
    IF v_meta_anterior IS NOT NULL AND v_faixa.meta_valor = v_meta_anterior THEN
      RAISE EXCEPTION 'Duas faixas com a mesma meta.';
    END IF;
    IF v_valor_anterior IS NOT NULL AND v_faixa.valor < v_valor_anterior THEN
      RAISE EXCEPTION 'Uma faixa maior não pode pagar menos que a faixa anterior.';
    END IF;
    IF v_meta_anterior IS NULL THEN
      v_primeira_meta := v_faixa.meta_valor;
    END IF;
    v_meta_anterior := v_faixa.meta_valor;
    v_valor_anterior := v_faixa.valor;
  END LOOP;

  UPDATE public.comissao_faixas
  SET substituida_em = now(), substituida_por = v_eu
  WHERE user_id = p_user_id AND month = p_month AND substituida_em IS NULL;

  INSERT INTO public.comissao_faixas (user_id, month, meta_valor, forma, valor, created_by)
  SELECT p_user_id, p_month, (f->>'meta_valor')::numeric, p_forma, (f->>'valor')::numeric, v_eu
  FROM jsonb_array_elements(p_faixas) f;

  INSERT INTO public.monthly_goals (user_id, month, visits_goal, payments_goal)
  VALUES (p_user_id, p_month, COALESCE(p_visits_goal, 0), v_primeira_meta)
  ON CONFLICT (user_id, month) DO UPDATE
    SET visits_goal = EXCLUDED.visits_goal,
        payments_goal = EXCLUDED.payments_goal,
        updated_at = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.definir_metas_mes(uuid, date, integer, text, jsonb) TO authenticated;

-- Mes que ja passou fica so para leitura tambem em monthly_goals (a tela ainda
-- tinha upsert direto; qualquer escrita por fora da RPC cai aqui igual).
CREATE OR REPLACE FUNCTION public.monthly_goals_trava_mes_passado()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  v_mes_atual date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.month < v_mes_atual THEN
    RAISE EXCEPTION 'Meta de mês que já passou não pode ser alterada.';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.month < v_mes_atual THEN
    RAISE EXCEPTION 'Meta de mês que já passou não pode ser alterada.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER monthly_goals_trava_mes_passado
  BEFORE INSERT OR UPDATE OR DELETE ON public.monthly_goals
  FOR EACH ROW EXECUTE FUNCTION public.monthly_goals_trava_mes_passado();

-- Faixas de quem ja tem meta de valor no mes atual ou futuro: vira 1 faixa com
-- 0% (meta sem comissao) para a tela abrir com o que existe hoje. O gestor
-- completa os percentuais.
INSERT INTO public.comissao_faixas (user_id, month, meta_valor, forma, valor)
SELECT g.user_id, g.month, g.payments_goal, 'percentual', 0
FROM public.monthly_goals g
WHERE g.month >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date
  AND g.payments_goal > 0;
