-- Item 93 (25/11), etapa 1a: inadimplencia mes a mes RECONSTRUIDA pelas
-- datas de recebimento (decisao do usuario: reconstruir o historico; o
-- retrato diario vem na etapa 1b).
--
-- Para cada "dia de corte" D (ultimo dia de cada um dos ultimos p_meses - 1
-- meses fechados + hoje), calcula como a carteira estava em D:
--
--   aberto_em(D) = valor_original - desconto           se ainda nao recebido em D
--                = original - recebido - desconto       se recebido ate D
--   (BANCO_DADOS guarda so a ultima data de recebimento: parcial pago em
--    varias vezes conta tudo na ultima data -- aproximacao aceita.)
--
-- Inadimplencia (mesma regra de src/filters/inadimplencia.ts): parcelas com
-- vencimento entre D-365 e D-3 (atraso a partir de 3 dias, janela de 12
-- meses); venceu = valor original; nao_pago = aberto_em(D).
-- Faixas: aberto_em(D) de TODO o atraso (sem janela), pela idade em D.
-- Recuperacao do mes: saldo em atraso (>= 3 dias, todas as idades) no dia
-- anterior ao inicio do mes (S) e quanto dele baixou ate D.
--
-- Fora da cobranca (cancelado/agrupado/renegociado, isForaDaCobranca) fica
-- fora de todos os meses: o banco nao guarda quando isso aconteceu.
-- Entram todos os titulos a prazo (decisao do usuario 25/11).
-- p_agrupar: NULL (empresa), 'loja' ou 'cobrador' (cobrador de HOJE --
-- o do passado so existira pelo retrato). So o gestor.

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
  v_primeiro date;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão para ver a inadimplência da empresa.';
  END IF;
  IF p_agrupar IS NOT NULL AND p_agrupar NOT IN ('loja', 'cobrador') THEN
    RAISE EXCEPTION 'p_agrupar deve ser loja, cobrador ou vazio.';
  END IF;

  -- Inicio do mes mais antigo pedido.
  v_primeiro := (date_trunc('month', v_hoje) - make_interval(months => v_meses - 1))::date;

  RETURN QUERY
  WITH cortes AS (
    SELECT
      LEAST((date_trunc('month', m) + interval '1 month - 1 day')::date, v_hoje) AS d,
      (m::date - 1) AS s
    FROM generate_series(v_primeiro, v_hoje, interval '1 month') AS m
  ),
  base AS (
    SELECT
      CASE p_agrupar
        WHEN 'loja' THEN b.nome_da_loja
        WHEN 'cobrador' THEN b.user_id::text
      END AS k,
      b.data_vencimento AS v,
      COALESCE(b.valor_original, 0) AS o,
      COALESCE(b.valor_original, 0) - COALESCE(b.desconto, 0) AS cheio,
      GREATEST(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
               - COALESCE(b.desconto, 0), 0) AS resto,
      b.data_de_recebimento AS p
    FROM "BANCO_DADOS" b
    WHERE b.data_vencimento IS NOT NULL
      AND b.data_vencimento <= v_hoje - 3
      AND lower(trim(COALESCE(b.status, ''))) NOT IN ('cancelado', 'agrupado', 'renegociado')
      AND (p_lojas IS NULL OR b.nome_da_loja = ANY (p_lojas))
      -- Pago antes do primeiro corte so importa para o "venceu" da janela.
      AND (b.data_de_recebimento IS NULL
           OR b.data_de_recebimento > v_primeiro - 1
           OR b.data_vencimento >= v_primeiro - 1 - 365)
  ),
  em AS (
    SELECT
      c.d, c.s, x.k, x.v, x.o,
      CASE WHEN x.p IS NULL OR x.p <= c.d THEN x.resto ELSE x.cheio END AS aberto_d,
      CASE WHEN x.p IS NULL OR x.p <= c.s THEN x.resto ELSE x.cheio END AS aberto_s
    FROM cortes c
    CROSS JOIN base x
  )
  SELECT
    e.d AS dia,
    e.k AS chave,
    ROUND(SUM(e.o) FILTER (WHERE e.v BETWEEN e.d - 365 AND e.d - 3), 2) AS venceu,
    ROUND(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 365 AND e.d - 3), 2) AS nao_pago,
    ROUND(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 30 AND e.d - 3), 2) AS atraso_3_30,
    ROUND(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 60 AND e.d - 31), 2) AS atraso_31_60,
    ROUND(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 90 AND e.d - 61), 2) AS atraso_61_90,
    ROUND(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 180 AND e.d - 91), 2) AS atraso_91_180,
    ROUND(SUM(e.aberto_d) FILTER (WHERE e.v BETWEEN e.d - 365 AND e.d - 181), 2) AS atraso_181_365,
    ROUND(SUM(e.aberto_d) FILTER (WHERE e.v < e.d - 365), 2) AS atraso_365_mais,
    ROUND(SUM(e.aberto_s) FILTER (WHERE e.v <= e.s - 3), 2) AS atraso_inicio_mes,
    ROUND(SUM(e.aberto_s - e.aberto_d) FILTER (WHERE e.v <= e.s - 3), 2) AS recuperado_mes
  FROM em e
  WHERE e.v <= e.d - 3
  GROUP BY e.d, e.k
  ORDER BY 1, 2 NULLS FIRST;
END;
$function$;

REVOKE ALL ON FUNCTION public.inadimplencia_historico(integer, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inadimplencia_historico(integer, text[], text) TO authenticated;
