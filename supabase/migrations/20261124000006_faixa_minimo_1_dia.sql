-- Faixa de cobrador começa em 1 dia ou mais (decisão do usuário 2026-11-24).
-- faixa_cobre_cliente usa atraso >= min_dias: uma faixa "de 0" cobriria cliente
-- só a vencer (atraso 0), que a distribuição não deve entregar a cobrador.
-- Ninguém usava 0 (menor início vigente = 1); o banco e o editor aceitavam.
-- Só a definição da faixa muda; clientes e carteiras atuais não.
--
-- salvar_regra_carteira: corpo de produção (pg_get_functiondef em 24/11),
-- muda só a validação do início. definir_cobertura_loja: corpo da
-- 20261124000005, idem.

CREATE OR REPLACE FUNCTION public.salvar_regra_carteira(p_regra_id uuid, p_collector_id uuid, p_min_dias integer, p_max_dias integer, p_lojas text[] DEFAULT NULL::text[], p_ativa boolean DEFAULT true)
 RETURNS collector_overdue_ranges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_lojas text[] := NULLIF(p_lojas, '{}'::text[]);
  v_conflito text;
  v_nova public.collector_overdue_ranges;
  v_anterior public.collector_overdue_ranges;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir regras da carteira.';
  END IF;
  IF p_min_dias IS NULL OR p_min_dias < 1 THEN
    RAISE EXCEPTION 'A faixa começa em 1 dia de atraso ou mais (cliente a vencer não vai para cobrador).';
  END IF;
  IF p_max_dias IS NOT NULL AND p_max_dias <= p_min_dias THEN
    RAISE EXCEPTION 'O fim da faixa deve ser maior que o início, ou vazio (sem limite).';
  END IF;

  LOCK TABLE public.collector_overdue_ranges IN SHARE ROW EXCLUSIVE MODE;

  IF p_regra_id IS NOT NULL THEN
    SELECT * INTO v_anterior FROM public.collector_overdue_ranges r
    WHERE r.id = p_regra_id AND r.collector_id = p_collector_id AND r.vigente_ate IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Esta regra não está mais vigente. Atualize a tela.';
    END IF;
  END IF;

  IF COALESCE(p_ativa, true) THEN
    v_conflito := public.regra_carteira_conflito(p_regra_id, p_min_dias, p_max_dias, v_lojas);
    IF v_conflito IS NOT NULL THEN
      RAISE EXCEPTION '%', v_conflito;
    END IF;
  END IF;

  IF p_regra_id IS NOT NULL THEN
    UPDATE public.collector_overdue_ranges SET vigente_ate = v_hoje WHERE id = p_regra_id;
  END IF;

  -- Regra nova: pesos NULL (a fila trata como 1 se o cobrador ja tiver fila).
  INSERT INTO public.collector_overdue_ranges (
    collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by,
    fila_peso, fila_peso_tarde, fila_ordem, fila_saldo_min, fila_saldo_max
  ) VALUES (
    p_collector_id, p_min_dias, p_max_dias, v_lojas, COALESCE(p_ativa, true), v_hoje,
    (SELECT app_current_user_id()),
    v_anterior.fila_peso, v_anterior.fila_peso_tarde,
    COALESCE(v_anterior.fila_ordem, 'atraso'),
    v_anterior.fila_saldo_min, v_anterior.fila_saldo_max
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

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
    IF f.min_dias IS NULL OR f.min_dias < 1 THEN
      RAISE EXCEPTION 'Cada faixa começa em 1 dia de atraso ou mais (cliente a vencer não vai para cobrador).';
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
