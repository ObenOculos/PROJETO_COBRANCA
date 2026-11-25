-- Item 93 (25/11), etapa 1b: RETRATO DIARIO da inadimplencia (decisao do
-- usuario: reconstruir o passado E guardar o retrato daqui para frente).
--
-- Por que guardar se da para reconstruir: a reconstrucao usa o que o banco
-- sabe HOJE (cobrador de hoje, cancelamentos/renegociacoes de hoje). O
-- retrato congela o que se via no dia, inclusive quem era o cobrador.
-- Fato historico: nunca e sobrescrito (ON CONFLICT DO NOTHING).
--
-- A conta fica em UM lugar: inadimplencia_calculo (interna, sem acesso
-- pelo app). A RPC inadimplencia_historico (etapa 1a) e o retrato usam ela.

-- 1) Conta unica, por dia de corte x loja x cobrador ------------------------
CREATE OR REPLACE FUNCTION public.inadimplencia_calculo(
  p_cortes date[],
  p_lojas text[] DEFAULT NULL
)
RETURNS TABLE(
  dia date,
  nome_da_loja text,
  cobrador_id uuid,
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
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- Regras (iguais a src/filters/inadimplencia.ts; ver 20261125000002):
  --   aberto em D = original - desconto se ainda nao recebido em D,
  --                 original - recebido - desconto se recebido ate D;
  --   inadimplencia = vencimento entre D-365 e D-3; faixas = todo atraso;
  --   recuperacao = saldo em atraso no dia anterior ao inicio do mes (S)
  --   que baixou ate D. Fora da cobranca nao entra. Todos os titulos.
  WITH cortes AS (
    SELECT DISTINCT c AS d, (date_trunc('month', c)::date - 1) AS s
    FROM unnest(p_cortes) AS c
    WHERE c IS NOT NULL
  ),
  limite AS (
    SELECT MIN(s) AS s_min, MAX(d) AS d_max FROM cortes
  ),
  base AS (
    SELECT
      b.nome_da_loja AS loja,
      b.user_id AS cob,
      b.data_vencimento AS v,
      COALESCE(b.valor_original, 0) AS o,
      COALESCE(b.valor_original, 0) - COALESCE(b.desconto, 0) AS cheio,
      GREATEST(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
               - COALESCE(b.desconto, 0), 0) AS resto,
      b.data_de_recebimento AS p
    FROM "BANCO_DADOS" b, limite l
    WHERE b.data_vencimento IS NOT NULL
      AND b.data_vencimento <= l.d_max - 3
      AND lower(trim(COALESCE(b.status, ''))) NOT IN ('cancelado', 'agrupado', 'renegociado')
      AND (p_lojas IS NULL OR b.nome_da_loja = ANY (p_lojas))
      -- Pago antes do primeiro corte so importa para o "venceu" da janela.
      AND (b.data_de_recebimento IS NULL
           OR b.data_de_recebimento > l.s_min
           OR b.data_vencimento >= l.s_min - 366)
  ),
  em AS (
    SELECT
      c.d, c.s, x.loja, x.cob, x.v, x.o,
      CASE WHEN x.p IS NULL OR x.p <= c.d THEN x.resto ELSE x.cheio END AS aberto_d,
      CASE WHEN x.p IS NULL OR x.p <= c.s THEN x.resto ELSE x.cheio END AS aberto_s
    FROM cortes c
    CROSS JOIN base x
    WHERE x.v <= c.d - 3
  )
  SELECT
    e.d AS dia,
    e.loja AS nome_da_loja,
    e.cob AS cobrador_id,
    COALESCE(SUM(e.o) FILTER (WHERE e.v BETWEEN e.d - 365 AND e.d - 3), 0) AS venceu,
    COALESCE(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 365 AND e.d - 3), 0) AS nao_pago,
    COALESCE(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 30 AND e.d - 3), 0) AS atraso_3_30,
    COALESCE(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 60 AND e.d - 31), 0) AS atraso_31_60,
    COALESCE(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 90 AND e.d - 61), 0) AS atraso_61_90,
    COALESCE(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 180 AND e.d - 91), 0) AS atraso_91_180,
    COALESCE(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 365 AND e.d - 181), 0) AS atraso_181_365,
    COALESCE(SUM(e.aberto_d) FILTER (WHERE e.v < e.d - 365), 0) AS atraso_365_mais,
    COALESCE(SUM(e.aberto_s) FILTER (WHERE e.v <= e.s - 3), 0) AS atraso_inicio_mes,
    COALESCE(SUM(e.aberto_s - e.aberto_d) FILTER (WHERE e.v <= e.s - 3), 0) AS recuperado_mes
  FROM em e
  GROUP BY e.d, e.loja, e.cob;
$function$;

-- Interna: so as funcoes SECURITY DEFINER abaixo chamam.
REVOKE ALL ON FUNCTION public.inadimplencia_calculo(date[], text[]) FROM PUBLIC, anon, authenticated;

-- 2) RPC da etapa 1a passa a usar a conta unica (mesma assinatura e saida) --
CREATE OR REPLACE FUNCTION public.inadimplencia_historico(
  p_meses integer DEFAULT 12,
  p_lojas text[] DEFAULT NULL,
  p_agrupar text DEFAULT NULL
)
RETURNS TABLE(
  dia date,
  chave text,
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
  v_meses integer := LEAST(GREATEST(COALESCE(p_meses, 12), 1), 36);
  v_cortes date[];
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão para ver a inadimplência da empresa.';
  END IF;
  IF p_agrupar IS NOT NULL AND p_agrupar NOT IN ('loja', 'cobrador') THEN
    RAISE EXCEPTION 'p_agrupar deve ser loja, cobrador ou vazio.';
  END IF;

  -- Ultimo dia de cada mes fechado + hoje.
  SELECT array_agg(LEAST((date_trunc('month', m) + interval '1 month - 1 day')::date, v_hoje))
  INTO v_cortes
  FROM generate_series(
    date_trunc('month', v_hoje) - make_interval(months => v_meses - 1),
    v_hoje,
    interval '1 month'
  ) AS m;

  RETURN QUERY
  SELECT
    c.dia,
    CASE p_agrupar
      WHEN 'loja' THEN c.nome_da_loja
      WHEN 'cobrador' THEN c.cobrador_id::text
    END AS chave,
    ROUND(SUM(c.venceu), 2),
    ROUND(SUM(c.nao_pago), 2),
    ROUND(SUM(c.atraso_3_30), 2),
    ROUND(SUM(c.atraso_31_60), 2),
    ROUND(SUM(c.atraso_61_90), 2),
    ROUND(SUM(c.atraso_91_180), 2),
    ROUND(SUM(c.atraso_181_365), 2),
    ROUND(SUM(c.atraso_365_mais), 2),
    ROUND(SUM(c.atraso_inicio_mes), 2),
    ROUND(SUM(c.recuperado_mes), 2)
  FROM inadimplencia_calculo(v_cortes, p_lojas) c
  GROUP BY 1, 2
  ORDER BY 1, 2 NULLS FIRST;
END;
$function$;

-- 3) Tabela do retrato --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inadimplencia_retrato (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia date NOT NULL,
  nome_da_loja text,
  -- Cobrador da carteira NO DIA (users.id); NULL = sem cobrador.
  cobrador_id uuid,
  venceu numeric(14,2) NOT NULL DEFAULT 0,
  nao_pago numeric(14,2) NOT NULL DEFAULT 0,
  atraso_3_30 numeric(14,2) NOT NULL DEFAULT 0,
  atraso_31_60 numeric(14,2) NOT NULL DEFAULT 0,
  atraso_61_90 numeric(14,2) NOT NULL DEFAULT 0,
  atraso_91_180 numeric(14,2) NOT NULL DEFAULT 0,
  atraso_181_365 numeric(14,2) NOT NULL DEFAULT 0,
  atraso_365_mais numeric(14,2) NOT NULL DEFAULT 0,
  atraso_inicio_mes numeric(14,2) NOT NULL DEFAULT 0,
  recuperado_mes numeric(14,2) NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inadimplencia_retrato_unico
    UNIQUE NULLS NOT DISTINCT (dia, nome_da_loja, cobrador_id)
);

CREATE INDEX IF NOT EXISTS inadimplencia_retrato_dia_idx
  ON public.inadimplencia_retrato (dia);

COMMENT ON TABLE public.inadimplencia_retrato IS
  'Item 93: retrato diario da inadimplencia por loja x cobrador do dia. Fato historico: so insere, nunca altera.';

ALTER TABLE public.inadimplencia_retrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inadimplencia_retrato_gestor_le ON public.inadimplencia_retrato;
CREATE POLICY inadimplencia_retrato_gestor_le
  ON public.inadimplencia_retrato
  FOR SELECT
  TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager');

REVOKE ALL ON public.inadimplencia_retrato FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inadimplencia_retrato FROM authenticated;

-- 4) Gravacao do retrato do dia (pg_cron) -------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_retrato_inadimplencia()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_linhas integer;
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
  RETURN v_linhas;
END;
$function$;

REVOKE ALL ON FUNCTION public.gravar_retrato_inadimplencia() FROM PUBLIC, anon;

-- Todo dia 7h30 de Brasilia (10h30 UTC): depois do sync do Ciclone (5h),
-- da SSOtica (6h) e da carteira automatica (7h).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'retrato_inadimplencia_7h30';

SELECT cron.schedule(
  'retrato_inadimplencia_7h30',
  '30 10 * * *',
  $$SELECT public.gravar_retrato_inadimplencia()$$
);
