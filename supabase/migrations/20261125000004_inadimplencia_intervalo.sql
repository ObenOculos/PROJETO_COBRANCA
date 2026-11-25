-- Item 93 (25/11): aba Inadimplencia com intervalo livre ("Tudo" ou de/ate)
-- sem recalcular a base a cada abertura (36 meses levavam ~11 s; egress e
-- CPU do Supabase).
--
-- 1) Fim de cada mes passado fica GUARDADO na tabela do retrato, marcado
--    fonte = 'reconstrucao' (calculado pelas datas de pagamento, com o
--    cobrador de hoje). Os retratos diarios gravados pelo pg_cron ficam
--    fonte = 'retrato'. So insere (fato historico), nunca altera.
-- 2) A gravacao diaria tambem cobre o fim do mes anterior se ele faltar
--    (ex.: o job falhou no dia 30).
-- 3) inadimplencia_historico passa a receber o intervalo (p_inicio/p_fim,
--    qualquer dia do mes) e le o que estiver guardado; so calcula na hora
--    o que faltar (sempre o dia de hoje).

-- 1) Coluna fonte ---------------------------------------------------------------
ALTER TABLE public.inadimplencia_retrato
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'retrato';

ALTER TABLE public.inadimplencia_retrato
  DROP CONSTRAINT IF EXISTS inadimplencia_retrato_fonte_check;
ALTER TABLE public.inadimplencia_retrato
  ADD CONSTRAINT inadimplencia_retrato_fonte_check
  CHECK (fonte IN ('retrato', 'reconstrucao'));

-- Carga dos fins de mes: de jan/2022 (a base comeca em jan/2021; o 1o ano
-- so forma a janela de 12 meses) ate o fim do mes passado. Em blocos de 12
-- meses para nao virar uma consulta so gigante.
DO $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ano integer;
  v_cortes date[];
BEGIN
  FOR v_ano IN 2022 .. EXTRACT(year FROM v_hoje)::integer LOOP
    SELECT array_agg((date_trunc('month', m) + interval '1 month - 1 day')::date)
    INTO v_cortes
    FROM generate_series(make_date(v_ano, 1, 1), make_date(v_ano, 12, 1), interval '1 month') AS m
    WHERE (date_trunc('month', m) + interval '1 month - 1 day')::date < date_trunc('month', v_hoje)::date;

    CONTINUE WHEN v_cortes IS NULL;

    INSERT INTO public.inadimplencia_retrato (
      dia, nome_da_loja, cobrador_id, venceu, nao_pago,
      atraso_3_30, atraso_31_60, atraso_61_90, atraso_91_180,
      atraso_181_365, atraso_365_mais, atraso_inicio_mes, recuperado_mes, fonte
    )
    SELECT
      c.dia, c.nome_da_loja, c.cobrador_id,
      ROUND(c.venceu, 2), ROUND(c.nao_pago, 2),
      ROUND(c.atraso_3_30, 2), ROUND(c.atraso_31_60, 2), ROUND(c.atraso_61_90, 2),
      ROUND(c.atraso_91_180, 2), ROUND(c.atraso_181_365, 2), ROUND(c.atraso_365_mais, 2),
      ROUND(c.atraso_inicio_mes, 2), ROUND(c.recuperado_mes, 2), 'reconstrucao'
    FROM public.inadimplencia_calculo(v_cortes, NULL) c
    ON CONFLICT ON CONSTRAINT inadimplencia_retrato_unico DO NOTHING;
  END LOOP;
END;
$$;

-- 2) Gravacao diaria (corpo de producao da 20261125000003 + fim do mes
--    anterior quando faltar) --------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_retrato_inadimplencia()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_fim_mes_anterior date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date - 1;
  v_linhas integer;
  v_extra integer := 0;
BEGIN
  -- Roda pelo pg_cron (sem usuario). Pelo app, so o gestor.
  IF auth.uid() IS NOT NULL
     AND (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão para gravar o retrato da inadimplência.';
  END IF;

  INSERT INTO inadimplencia_retrato (
    dia, nome_da_loja, cobrador_id, venceu, nao_pago,
    atraso_3_30, atraso_31_60, atraso_61_90, atraso_91_180,
    atraso_181_365, atraso_365_mais, atraso_inicio_mes, recuperado_mes
  )
  SELECT
    c.dia, c.nome_da_loja, c.cobrador_id,
    ROUND(c.venceu, 2), ROUND(c.nao_pago, 2),
    ROUND(c.atraso_3_30, 2), ROUND(c.atraso_31_60, 2), ROUND(c.atraso_61_90, 2),
    ROUND(c.atraso_91_180, 2), ROUND(c.atraso_181_365, 2), ROUND(c.atraso_365_mais, 2),
    ROUND(c.atraso_inicio_mes, 2), ROUND(c.recuperado_mes, 2)
  FROM inadimplencia_calculo(ARRAY[v_hoje], NULL) c
  ON CONFLICT ON CONSTRAINT inadimplencia_retrato_unico DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- Fim do mes anterior sem nada guardado (job falhou no dia): reconstroi.
  IF NOT EXISTS (SELECT 1 FROM inadimplencia_retrato WHERE dia = v_fim_mes_anterior) THEN
    INSERT INTO inadimplencia_retrato (
      dia, nome_da_loja, cobrador_id, venceu, nao_pago,
      atraso_3_30, atraso_31_60, atraso_61_90, atraso_91_180,
      atraso_181_365, atraso_365_mais, atraso_inicio_mes, recuperado_mes, fonte
    )
    SELECT
      c.dia, c.nome_da_loja, c.cobrador_id,
      ROUND(c.venceu, 2), ROUND(c.nao_pago, 2),
      ROUND(c.atraso_3_30, 2), ROUND(c.atraso_31_60, 2), ROUND(c.atraso_61_90, 2),
      ROUND(c.atraso_91_180, 2), ROUND(c.atraso_181_365, 2), ROUND(c.atraso_365_mais, 2),
      ROUND(c.atraso_inicio_mes, 2), ROUND(c.recuperado_mes, 2), 'reconstrucao'
    FROM inadimplencia_calculo(ARRAY[v_fim_mes_anterior], NULL) c
    ON CONFLICT ON CONSTRAINT inadimplencia_retrato_unico DO NOTHING;
    GET DIAGNOSTICS v_extra = ROW_COUNT;
  END IF;

  RETURN v_linhas + v_extra;
END;
$function$;

REVOKE ALL ON FUNCTION public.gravar_retrato_inadimplencia() FROM PUBLIC, anon;

-- 3) RPC com intervalo ------------------------------------------------------------
-- A versao por p_meses so foi usada no localhost (nunca publicada).
DROP FUNCTION IF EXISTS public.inadimplencia_historico(integer, text[], text);

CREATE FUNCTION public.inadimplencia_historico(
  p_inicio date,
  p_fim date,
  p_lojas text[] DEFAULT NULL,
  p_agrupar text DEFAULT NULL
)
RETURNS TABLE(
  dia date,
  chave text,
  fonte text,
  venceu numeric,
  nao_pago numeric,
  atraso_3_30 numeric,
  atraso_31_60 numeric,
  atraso_61_90 numeric,
  atraso_91_180 numeric,
  atraso_181_365 numeric,
  atraso_365_mais numeric,
  atraso_inicio_mes numeric,
  recuperado_mes numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini date;
  v_fim date;
  v_cortes date[];
  v_guardados date[];
  v_calcular date[];
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão para ver a inadimplência da empresa.';
  END IF;
  IF p_agrupar IS NOT NULL AND p_agrupar NOT IN ('loja', 'cobrador') THEN
    RAISE EXCEPTION 'p_agrupar deve ser loja, cobrador ou vazio.';
  END IF;

  v_ini := date_trunc('month', COALESCE(p_inicio, v_hoje))::date;
  v_fim := LEAST(date_trunc('month', COALESCE(p_fim, v_hoje))::date,
                 date_trunc('month', v_hoje)::date);
  IF v_ini > v_fim THEN
    v_ini := v_fim;
  END IF;
  -- No maximo 10 anos de pontos.
  v_ini := GREATEST(v_ini, (v_fim - interval '119 months')::date);

  -- Ultimo dia de cada mes; o mes corrente vale ate hoje.
  SELECT array_agg(LEAST((date_trunc('month', m) + interval '1 month - 1 day')::date, v_hoje))
  INTO v_cortes
  FROM generate_series(v_ini, v_fim, interval '1 month') AS m;

  -- Dias anteriores a hoje que ja estao guardados (retrato ou reconstrucao).
  SELECT array_agg(DISTINCT r.dia)
  INTO v_guardados
  FROM inadimplencia_retrato r
  WHERE r.dia = ANY (v_cortes)
    AND r.dia < v_hoje;

  SELECT array_agg(c)
  INTO v_calcular
  FROM unnest(v_cortes) AS c
  WHERE NOT (c = ANY (COALESCE(v_guardados, '{}'::date[])));

  RETURN QUERY
  SELECT
    t.dia,
    CASE p_agrupar
      WHEN 'loja' THEN t.nome_da_loja
      WHEN 'cobrador' THEN t.cobrador_id::text
    END AS chave,
    MIN(t.fonte) AS fonte,
    ROUND(SUM(t.venceu), 2),
    ROUND(SUM(t.nao_pago), 2),
    ROUND(SUM(t.atraso_3_30), 2),
    ROUND(SUM(t.atraso_31_60), 2),
    ROUND(SUM(t.atraso_61_90), 2),
    ROUND(SUM(t.atraso_91_180), 2),
    ROUND(SUM(t.atraso_181_365), 2),
    ROUND(SUM(t.atraso_365_mais), 2),
    ROUND(SUM(t.atraso_inicio_mes), 2),
    ROUND(SUM(t.recuperado_mes), 2)
  FROM (
    SELECT r.dia, r.nome_da_loja, r.cobrador_id, r.fonte,
           r.venceu, r.nao_pago, r.atraso_3_30, r.atraso_31_60, r.atraso_61_90,
           r.atraso_91_180, r.atraso_181_365, r.atraso_365_mais,
           r.atraso_inicio_mes, r.recuperado_mes
    FROM inadimplencia_retrato r
    WHERE r.dia = ANY (COALESCE(v_guardados, '{}'::date[]))
      AND (p_lojas IS NULL OR r.nome_da_loja = ANY (p_lojas))
    UNION ALL
    SELECT c.dia, c.nome_da_loja, c.cobrador_id, 'calculado'::text,
           c.venceu, c.nao_pago, c.atraso_3_30, c.atraso_31_60, c.atraso_61_90,
           c.atraso_91_180, c.atraso_181_365, c.atraso_365_mais,
           c.atraso_inicio_mes, c.recuperado_mes
    FROM inadimplencia_calculo(COALESCE(v_calcular, '{}'::date[]), p_lojas) c
  ) t
  GROUP BY 1, 2
  ORDER BY 1, 2 NULLS FIRST;
END;
$function$;

REVOKE ALL ON FUNCTION public.inadimplencia_historico(date, date, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inadimplencia_historico(date, date, text[], text) TO authenticated;
