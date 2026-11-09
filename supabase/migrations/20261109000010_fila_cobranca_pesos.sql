-- Item 39 -- Fila de Cobranca, etapa 1: proporcao por faixa na lista "Ligar".
--
-- O gestor diz, por regra (faixa x lojas) do cobrador, "a cada N clientes,
-- quantos desta faixa". A lista do cobrador intercala as faixas nessa
-- proporcao (front, etapa 2). Turnos (manha/tarde, virada 12h) sao opcionais:
--   fila_peso       NULL em todas as regras do cobrador = fila desligada
--                   (lista na ordem de hoje: maior atraso primeiro).
--   fila_peso_tarde NULL em todas = sem turnos (fila_peso vale o dia todo);
--                   preenchido = fila_peso vale ate 12h e este depois.
--   0 = a faixa nao e intercalada naquele turno (vai para o fim da lista).
--
-- O peso fica NA REGRA e muda por versao nova (encerra a vigente e insere a
-- copia), como faixa/lojas/ativa: fica o historico de quem mudou e quando.
-- salvar_regra_carteira e definir_regra_carteira_ativa: corpo copiado de
-- PRODUCAO (pg_get_functiondef em 2026-11-09), so passando a carregar os
-- pesos da versao anterior para a nova.

ALTER TABLE public.collector_overdue_ranges
  ADD COLUMN fila_peso integer
    CHECK (fila_peso IS NULL OR fila_peso BETWEEN 0 AND 99),
  ADD COLUMN fila_peso_tarde integer
    CHECK (fila_peso_tarde IS NULL OR fila_peso_tarde BETWEEN 0 AND 99);

COMMENT ON COLUMN public.collector_overdue_ranges.fila_peso IS
  'Fila de Cobranca: quantos clientes desta faixa a cada rodada (manha, ou dia todo sem turnos). NULL = fila desligada.';
COMMENT ON COLUMN public.collector_overdue_ranges.fila_peso_tarde IS
  'Fila de Cobranca: peso a partir das 12h. NULL = sem turnos.';

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
  IF p_min_dias IS NULL OR p_min_dias < 0 THEN
    RAISE EXCEPTION 'Informe o início da faixa (0 ou mais).';
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
    fila_peso, fila_peso_tarde
  ) VALUES (
    p_collector_id, p_min_dias, p_max_dias, v_lojas, COALESCE(p_ativa, true), v_hoje,
    (SELECT app_current_user_id()),
    v_anterior.fila_peso, v_anterior.fila_peso_tarde
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_regra_carteira_ativa(p_regra_id uuid, p_ativa boolean)
 RETURNS collector_overdue_ranges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_atual public.collector_overdue_ranges;
  v_conflito text;
  v_nova public.collector_overdue_ranges;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem alterar regras da carteira.';
  END IF;

  LOCK TABLE public.collector_overdue_ranges IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_atual FROM public.collector_overdue_ranges
  WHERE id = p_regra_id AND vigente_ate IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta regra não está mais vigente. Atualize a tela.';
  END IF;
  IF v_atual.ativa = p_ativa THEN
    RETURN v_atual;
  END IF;

  IF p_ativa THEN
    v_conflito := public.regra_carteira_conflito(
      v_atual.id, v_atual.min_dias, v_atual.max_dias, v_atual.lojas);
    IF v_conflito IS NOT NULL THEN
      RAISE EXCEPTION '%', v_conflito;
    END IF;
  END IF;

  UPDATE public.collector_overdue_ranges SET vigente_ate = v_hoje WHERE id = v_atual.id;

  INSERT INTO public.collector_overdue_ranges (
    collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by,
    fila_peso, fila_peso_tarde
  ) VALUES (
    v_atual.collector_id, v_atual.min_dias, v_atual.max_dias, v_atual.lojas, p_ativa,
    v_hoje, (SELECT app_current_user_id()),
    v_atual.fila_peso, v_atual.fila_peso_tarde
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

-- Define a fila de um cobrador de uma vez (todas as regras vigentes dele).
-- p_pesos: [{"regra_id": uuid, "peso": int, "peso_tarde": int|null}, ...]
--   NULL ou [] = desliga a fila (volta a ordem padrao).
--   Regra vigente do cobrador fora da lista fica com peso NULL.
--   peso_tarde: todos NULL (sem turnos) ou todos preenchidos (com turnos).
-- So cria versao nova das regras cujo peso mudou.
CREATE OR REPLACE FUNCTION public.definir_fila_cobranca(p_collector_id uuid, p_pesos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_itens jsonb := COALESCE(p_pesos, '[]'::jsonb);
  v_item jsonb;
  v_regra public.collector_overdue_ranges;
  v_peso integer;
  v_peso_tarde integer;
  v_com_tarde integer := 0;
  v_soma integer := 0;
  v_soma_tarde integer := 0;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir a fila de cobrança.';
  END IF;
  IF jsonb_typeof(v_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Formato inválido da fila.';
  END IF;

  LOCK TABLE public.collector_overdue_ranges IN SHARE ROW EXCLUSIVE MODE;

  -- Validacao de tudo antes de gravar qualquer coisa.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.collector_overdue_ranges r
      WHERE r.id = (v_item->>'regra_id')::uuid
        AND r.collector_id = p_collector_id AND r.vigente_ate IS NULL
    ) THEN
      RAISE EXCEPTION 'Uma das faixas não está mais vigente. Atualize a tela.';
    END IF;
    v_peso := (v_item->>'peso')::integer;
    v_peso_tarde := (v_item->>'peso_tarde')::integer;
    IF v_peso IS NULL OR v_peso NOT BETWEEN 0 AND 99
       OR (v_peso_tarde IS NOT NULL AND v_peso_tarde NOT BETWEEN 0 AND 99) THEN
      RAISE EXCEPTION 'Use números de 0 a 99 na fila.';
    END IF;
    v_soma := v_soma + v_peso;
    IF v_peso_tarde IS NOT NULL THEN
      v_com_tarde := v_com_tarde + 1;
      v_soma_tarde := v_soma_tarde + v_peso_tarde;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_itens) > 0 THEN
    IF v_com_tarde NOT IN (0, jsonb_array_length(v_itens)) THEN
      RAISE EXCEPTION 'Com manhã e tarde separadas, preencha a tarde de todas as faixas.';
    END IF;
    IF v_soma = 0 OR (v_com_tarde > 0 AND v_soma_tarde = 0) THEN
      RAISE EXCEPTION 'Coloque ao menos uma faixa com número maior que zero em cada turno.';
    END IF;
  END IF;

  FOR v_regra IN
    SELECT * FROM public.collector_overdue_ranges r
    WHERE r.collector_id = p_collector_id AND r.vigente_ate IS NULL
  LOOP
    SELECT (e->>'peso')::integer, (e->>'peso_tarde')::integer
      INTO v_peso, v_peso_tarde
    FROM jsonb_array_elements(v_itens) e
    WHERE (e->>'regra_id')::uuid = v_regra.id;
    IF NOT FOUND THEN
      v_peso := NULL;
      v_peso_tarde := NULL;
    END IF;

    IF v_peso IS DISTINCT FROM v_regra.fila_peso
       OR v_peso_tarde IS DISTINCT FROM v_regra.fila_peso_tarde THEN
      UPDATE public.collector_overdue_ranges SET vigente_ate = v_hoje WHERE id = v_regra.id;
      INSERT INTO public.collector_overdue_ranges (
        collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by,
        fila_peso, fila_peso_tarde
      ) VALUES (
        v_regra.collector_id, v_regra.min_dias, v_regra.max_dias, v_regra.lojas,
        v_regra.ativa, v_hoje, (SELECT app_current_user_id()),
        v_peso, v_peso_tarde
      );
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.definir_fila_cobranca(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_fila_cobranca(uuid, jsonb) TO authenticated, service_role;
