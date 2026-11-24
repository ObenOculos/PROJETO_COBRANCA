-- Distribuição, etapa 2 (2026-11-24): editar a cobertura POR LOJA.
--
-- As regras (collector_overdue_ranges) valem para várias lojas ao mesmo
-- tempo (lojas = text[], NULL = todas). Editar uma loja pelo navegador em
-- vários passos (tirar a loja da regra compartilhada, criar as novas) podia
-- deixar a loja descoberta se um passo falhasse. Esta função faz tudo numa
-- transação:
--   1. Toda regra vigente que cobre a loja (ativa ou inativa) tem a vigência
--      fechada hoje. Se cobria também outras lojas, é recriada sem esta loja
--      (mesmo cobrador, faixa, ativa e configuração da Fila). NULL (todas as
--      lojas) vira a lista explícita das demais lojas conhecidas.
--   2. Cada faixa nova vira uma regra só desta loja.
--   3. Faixas de cobradores diferentes não podem se sobrepor nesta loja; as
--      outras lojas não mudam (as regras novas só têm esta loja).
-- Mesmo padrão de vigência de salvar_regra_carteira (fecha e reinsere; nada
-- é apagado -- o histórico das regras fica).
--
-- p_faixas = [{"collector_id": uuid, "min_dias": int, "max_dias": int|null}]
-- Lista vazia = a loja fica sem cobrador por regra.

CREATE OR REPLACE FUNCTION public.definir_cobertura_loja(p_loja text, p_faixas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usuario uuid := (SELECT app_current_user_id());
  v_todas text[];
  r public.collector_overdue_ranges%ROWTYPE;
  f record;
  g record;
  v_restantes text[];
  v_count integer := 0;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir regras da carteira.';
  END IF;
  IF NULLIF(trim(p_loja), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a loja.';
  END IF;

  -- Validação das faixas novas.
  FOR f IN
    SELECT (e->>'collector_id')::uuid AS collector_id,
           (e->>'min_dias')::integer AS min_dias,
           NULLIF(e->>'max_dias', '')::integer AS max_dias
    FROM jsonb_array_elements(COALESCE(p_faixas, '[]'::jsonb)) e
  LOOP
    IF f.collector_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = f.collector_id AND u.active IS DISTINCT FROM false
    ) THEN
      RAISE EXCEPTION 'Escolha um cobrador ativo para cada faixa.';
    END IF;
    IF f.min_dias IS NULL OR f.min_dias < 0 THEN
      RAISE EXCEPTION 'Informe o início de cada faixa (0 ou mais).';
    END IF;
    IF f.max_dias IS NOT NULL AND f.max_dias <= f.min_dias THEN
      RAISE EXCEPTION 'O fim da faixa deve ser maior que o início, ou vazio (sem limite).';
    END IF;
  END LOOP;

  -- Sobreposição entre cobradores diferentes nesta loja.
  SELECT a.min_dias AS a_min, a.max_dias AS a_max, b.min_dias AS b_min, b.max_dias AS b_max,
         ua.name AS a_nome, ub.name AS b_nome
  INTO g
  FROM (SELECT (e->>'collector_id')::uuid AS collector_id, (e->>'min_dias')::integer AS min_dias,
               NULLIF(e->>'max_dias', '')::integer AS max_dias, ord
        FROM jsonb_array_elements(COALESCE(p_faixas, '[]'::jsonb)) WITH ORDINALITY x(e, ord)) a
  JOIN (SELECT (e->>'collector_id')::uuid AS collector_id, (e->>'min_dias')::integer AS min_dias,
               NULLIF(e->>'max_dias', '')::integer AS max_dias, ord
        FROM jsonb_array_elements(COALESCE(p_faixas, '[]'::jsonb)) WITH ORDINALITY x(e, ord)) b
    ON b.ord > a.ord
   AND a.min_dias <= COALESCE(b.max_dias, 2147483647)
   AND b.min_dias <= COALESCE(a.max_dias, 2147483647)
  JOIN public.users ua ON ua.id = a.collector_id
  JOIN public.users ub ON ub.id = b.collector_id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'As faixas de % (% dias) e % (% dias) se sobrepõem.',
      g.a_nome,
      CASE WHEN g.a_max IS NULL THEN g.a_min || '+' ELSE g.a_min || ' a ' || g.a_max END,
      g.b_nome,
      CASE WHEN g.b_max IS NULL THEN g.b_min || '+' ELSE g.b_min || ' a ' || g.b_max END;
  END IF;

  LOCK TABLE public.collector_overdue_ranges IN SHARE ROW EXCLUSIVE MODE;

  SELECT array_agg(DISTINCT l.loja ORDER BY l.loja) INTO v_todas FROM public.lojas_carteira() l;

  -- 1. Tira a loja das regras vigentes que a cobrem.
  FOR r IN
    SELECT * FROM public.collector_overdue_ranges x
    WHERE x.vigente_ate IS NULL
      AND (x.lojas IS NULL OR p_loja = ANY (x.lojas))
    FOR UPDATE
  LOOP
    UPDATE public.collector_overdue_ranges SET vigente_ate = v_hoje WHERE id = r.id;
    v_restantes := array_remove(COALESCE(r.lojas, v_todas), p_loja);
    IF cardinality(v_restantes) > 0 THEN
      INSERT INTO public.collector_overdue_ranges (
        collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by,
        fila_peso, fila_peso_tarde, fila_ordem, fila_saldo_min, fila_saldo_max
      ) VALUES (
        r.collector_id, r.min_dias, r.max_dias, v_restantes, r.ativa, v_hoje, v_usuario,
        r.fila_peso, r.fila_peso_tarde, r.fila_ordem, r.fila_saldo_min, r.fila_saldo_max
      );
    END IF;
  END LOOP;

  -- 2. Faixas novas, só desta loja (Fila: herda do cobrador, se ele já tinha).
  FOR f IN
    SELECT (e->>'collector_id')::uuid AS collector_id,
           (e->>'min_dias')::integer AS min_dias,
           NULLIF(e->>'max_dias', '')::integer AS max_dias
    FROM jsonb_array_elements(COALESCE(p_faixas, '[]'::jsonb)) e
  LOOP
    INSERT INTO public.collector_overdue_ranges (
      collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by,
      fila_ordem
    ) VALUES (
      f.collector_id, f.min_dias, f.max_dias, ARRAY[p_loja], true, v_hoje, v_usuario,
      COALESCE((SELECT x.fila_ordem FROM public.collector_overdue_ranges x
                WHERE x.collector_id = f.collector_id AND x.vigente_ate IS NULL
                ORDER BY x.vigente_desde DESC LIMIT 1), 'atraso')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.definir_cobertura_loja(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_cobertura_loja(text, jsonb) TO authenticated;
