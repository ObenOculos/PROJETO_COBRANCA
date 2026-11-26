-- Item 95 (26/11): inadimplencia_calculo descartava parcela vencida ha mais
-- de 1 ano com ultimo pagamento antes do mes, MESMO com saldo (pago parcial).
-- Ela faltava no atraso do inicio do mes (base da recuperacao) e na faixa
-- "mais de 1 ano": ate 83 parcelas / R$ 9,5 mil em 26/11 (~0,25% da base).
-- O corte dependia ainda das datas pedidas juntas (menor data do lote).
-- Corpo copiado de producao (pg_get_functiondef 26/11); so o filtro mudou.
-- Retratos ja gravados (fato historico) nao sao recalculados.

CREATE OR REPLACE FUNCTION public.inadimplencia_calculo(p_cortes date[], p_lojas text[] DEFAULT NULL::text[])
 RETURNS TABLE(dia date, nome_da_loja text, cobrador_id uuid, venceu numeric, nao_pago numeric, atraso_3_30 numeric, atraso_31_60 numeric, atraso_61_90 numeric, atraso_91_180 numeric, atraso_181_365 numeric, atraso_365_mais numeric, atraso_inicio_mes numeric, recuperado_mes numeric)
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
      -- Pago antes do primeiro corte so importa para o "venceu" da janela
      -- -- a menos que ainda tenha saldo (pago parcial): ai entra no atraso
      -- do inicio do mes e na faixa "mais de 1 ano" (26/11, item 95).
      AND (b.data_de_recebimento IS NULL
           OR b.data_de_recebimento > l.s_min
           OR b.data_vencimento >= l.s_min - 366
           OR COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
              - COALESCE(b.desconto, 0) > 0)
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
