-- Item 95 (26/11): cards da aba Inadimplencia seguem o periodo do Resumo Geral
-- (usuario: "conta do periodo, igual ao Geral"). A aba nao carrega a base
-- inteira (egress), entao a conta vem do banco, com a MESMA regra do
-- navegador (src/filters/inadimplencia.ts):
--   inadimplencia = parcelas com vencimento no periodo e atraso >= 3 dias
--                   hoje: valor original (venceu) x saldo em aberto (nao_pago)
--   atraso_recente = saldo das que venceram no periodo ha 1-2 dias
--   recuperacao   = do saldo em atraso (>= 3 dias) na vespera do inicio,
--                   quanto foi pago ate o fim do periodo (no maximo hoje);
--                   mesma regra de inadimplencia_calculo com inicio livre.
-- Fora da cobranca (cancelado/agrupado/renegociado) nao entra.

CREATE OR REPLACE FUNCTION public.inadimplencia_periodo(
  p_de date,
  p_ate date,
  p_lojas text[] DEFAULT NULL
)
RETURNS TABLE(
  venceu numeric,
  nao_pago numeric,
  atraso_recente numeric,
  base_recuperacao numeric,
  recuperado numeric,
  ate_efetivo date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_fim date;
  v_s date;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão para ver a inadimplência da empresa.';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_de > p_ate THEN
    RAISE EXCEPTION 'Período inválido.';
  END IF;

  v_fim := LEAST(p_ate, v_hoje);
  v_s := p_de - 1;

  RETURN QUERY
  WITH base AS (
    SELECT
      b.data_vencimento AS v,
      COALESCE(b.valor_original, 0) AS o,
      COALESCE(b.valor_original, 0) - COALESCE(b.desconto, 0) AS cheio,
      GREATEST(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
               - COALESCE(b.desconto, 0), 0) AS resto,
      b.data_de_recebimento AS p
    FROM "BANCO_DADOS" b
    WHERE b.data_vencimento IS NOT NULL
      AND b.data_vencimento <= GREATEST(LEAST(p_ate, v_hoje - 1), v_s - 3)
      AND lower(trim(COALESCE(b.status, ''))) NOT IN ('cancelado', 'agrupado', 'renegociado')
      AND (p_lojas IS NULL OR b.nome_da_loja = ANY (p_lojas))
  ),
  em AS (
    SELECT
      x.v, x.o, x.resto,
      CASE WHEN x.p IS NULL OR x.p <= v_s THEN x.resto ELSE x.cheio END AS aberto_s,
      CASE WHEN x.p IS NULL OR x.p <= v_fim THEN x.resto ELSE x.cheio END AS aberto_d
    FROM base x
  )
  SELECT
    ROUND(COALESCE(SUM(e.o) FILTER (
      WHERE e.v BETWEEN p_de AND p_ate AND e.v <= v_hoje - 3), 0), 2),
    ROUND(COALESCE(SUM(e.resto) FILTER (
      WHERE e.v BETWEEN p_de AND p_ate AND e.v <= v_hoje - 3 AND e.resto > 0.01), 0), 2),
    ROUND(COALESCE(SUM(e.resto) FILTER (
      WHERE e.v BETWEEN p_de AND p_ate AND e.v > v_hoje - 3 AND e.v < v_hoje
        AND e.resto > 0.01), 0), 2),
    CASE WHEN p_de <= v_fim THEN
      ROUND(COALESCE(SUM(e.aberto_s) FILTER (WHERE e.v <= v_s - 3), 0), 2)
    END,
    CASE WHEN p_de <= v_fim THEN
      ROUND(COALESCE(SUM(e.aberto_s - e.aberto_d) FILTER (WHERE e.v <= v_s - 3), 0), 2)
    END,
    v_fim
  FROM em e;
END;
$function$;

REVOKE ALL ON FUNCTION public.inadimplencia_periodo(date, date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inadimplencia_periodo(date, date, text[]) TO authenticated;
