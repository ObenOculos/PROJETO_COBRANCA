-- Item 39 -- Fila de Cobranca: ordenacao e faixa de divida por regra.
-- (inspirado no "Grupo do Contato Ativo" do Cedrus)
--
--   fila_ordem       'atraso' (padrao, maior atraso primeiro) ou 'valor'
--                    (maior divida vencida primeiro), dentro da faixa.
--   fila_saldo_min/  divida VENCIDA do cliente (R$) para entrar na fila desta
--   fila_saldo_max   faixa; NULL = sem limite. Fora disso o cliente vai para o
--                    fim da lista (nao some da carteira).
-- So valem com a fila ligada (fila_peso preenchido).
--
-- salvar_regra_carteira, definir_regra_carteira_ativa e definir_fila_cobranca:
-- corpo de PRODUCAO (migration 20261109000010, aplicada hoje), passando a
-- carregar as colunas novas.

ALTER TABLE public.collector_overdue_ranges
  ADD COLUMN fila_ordem text NOT NULL DEFAULT 'atraso'
    CHECK (fila_ordem IN ('atraso', 'valor')),
  ADD COLUMN fila_saldo_min numeric(12,2)
    CHECK (fila_saldo_min IS NULL OR fila_saldo_min >= 0),
  ADD COLUMN fila_saldo_max numeric(12,2)
    CHECK (fila_saldo_max IS NULL OR fila_saldo_max >= 0),
  ADD CONSTRAINT collector_overdue_ranges_fila_saldo_faixa
    CHECK (fila_saldo_min IS NULL OR fila_saldo_max IS NULL OR fila_saldo_max >= fila_saldo_min);

COMMENT ON COLUMN public.collector_overdue_ranges.fila_ordem IS
  'Fila de Cobranca: ordem dentro da faixa -- atraso (maior primeiro) ou valor (maior divida vencida primeiro).';
COMMENT ON COLUMN public.collector_overdue_ranges.fila_saldo_min IS
  'Fila de Cobranca: divida vencida minima (R$) para entrar na fila; fora vai para o fim da lista.';
COMMENT ON COLUMN public.collector_overdue_ranges.fila_saldo_max IS
  'Fila de Cobranca: divida vencida maxima (R$) para entrar na fila; fora vai para o fim da lista.';

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
    fila_peso, fila_peso_tarde, fila_ordem, fila_saldo_min, fila_saldo_max
  ) VALUES (
    v_atual.collector_id, v_atual.min_dias, v_atual.max_dias, v_atual.lojas, p_ativa,
    v_hoje, (SELECT app_current_user_id()),
    v_atual.fila_peso, v_atual.fila_peso_tarde, v_atual.fila_ordem,
    v_atual.fila_saldo_min, v_atual.fila_saldo_max
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

-- p_pesos: [{"regra_id", "peso", "peso_tarde", "ordem", "saldo_min", "saldo_max"}]
--   ordem: 'atraso' (padrao) ou 'valor'; saldo_*: numero ou null.
--   NULL ou [] = desliga a fila (pesos, ordem e saldos voltam ao padrao).
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
  v_ordem text;
  v_saldo_min numeric(12,2);
  v_saldo_max numeric(12,2);
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
    IF COALESCE(v_item->>'ordem', 'atraso') NOT IN ('atraso', 'valor') THEN
      RAISE EXCEPTION 'Ordenação inválida na fila.';
    END IF;
    v_saldo_min := (v_item->>'saldo_min')::numeric;
    v_saldo_max := (v_item->>'saldo_max')::numeric;
    IF v_saldo_min < 0 OR v_saldo_max < 0 THEN
      RAISE EXCEPTION 'Os valores da dívida não podem ser negativos.';
    END IF;
    IF v_saldo_max < v_saldo_min THEN
      RAISE EXCEPTION 'Na dívida vencida, o "até" deve ser maior ou igual ao "de".';
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
    SELECT (e->>'peso')::integer, (e->>'peso_tarde')::integer,
           COALESCE(e->>'ordem', 'atraso'),
           (e->>'saldo_min')::numeric, (e->>'saldo_max')::numeric
      INTO v_peso, v_peso_tarde, v_ordem, v_saldo_min, v_saldo_max
    FROM jsonb_array_elements(v_itens) e
    WHERE (e->>'regra_id')::uuid = v_regra.id;
    IF NOT FOUND THEN
      v_peso := NULL;
      v_peso_tarde := NULL;
      v_ordem := 'atraso';
      v_saldo_min := NULL;
      v_saldo_max := NULL;
    END IF;

    IF v_peso IS DISTINCT FROM v_regra.fila_peso
       OR v_peso_tarde IS DISTINCT FROM v_regra.fila_peso_tarde
       OR v_ordem IS DISTINCT FROM v_regra.fila_ordem
       OR v_saldo_min IS DISTINCT FROM v_regra.fila_saldo_min
       OR v_saldo_max IS DISTINCT FROM v_regra.fila_saldo_max THEN
      UPDATE public.collector_overdue_ranges SET vigente_ate = v_hoje WHERE id = v_regra.id;
      INSERT INTO public.collector_overdue_ranges (
        collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by,
        fila_peso, fila_peso_tarde, fila_ordem, fila_saldo_min, fila_saldo_max
      ) VALUES (
        v_regra.collector_id, v_regra.min_dias, v_regra.max_dias, v_regra.lojas,
        v_regra.ativa, v_hoje, (SELECT app_current_user_id()),
        v_peso, v_peso_tarde, v_ordem, v_saldo_min, v_saldo_max
      );
    END IF;
  END LOOP;
END;
$function$;
