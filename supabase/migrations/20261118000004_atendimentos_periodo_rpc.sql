-- Atendimentos por cobrador no periodo, contados no banco (2026-11-18).
--
-- Antes o front (hooks/useAtendimentosPeriodo.ts) baixava cada linha de
-- collection_attempts do periodo (2.577 no mes para um cobrador = 3 paginas
-- de 1000), buscava o documento dos titulos fora da carteira e as visitas
-- presenciais, tudo em sequencia -- 2 a 3 s a cada troca de periodo no card
-- "Meu desempenho". Aqui a mesma conta vira uma ida e volta so.
--
-- Mesma regra do hook (que passa a so chamar esta funcao):
--  * Contado por CLIENTE (documento do titulo em BANCO_DADOS; sem documento,
--    o proprio titulo 't:<id>' vira a chave), nunca por titulo nem por dia.
--  * Visitas presenciais concluidas (realizada / nao_encontrado / reagendada,
--    canal nulo ou presencial) entram como atendimento; data = data da visita
--    realizada, senao a agendada. Visita "realizada" = conversou.
--  * conversou = resultado de contato efetivo. ATENCAO: lista repetida de
--    EFFECTIVE_ATTEMPT_RESULTS (src/config/collectionAttempts.ts). Mudou la,
--    mude aqui.
--  * tentativas = total de linhas (attempts + visitas), sem deduplicar.
--
-- Permissao: gestor ve todos (p_collector nulo) ou um; os demais so os
-- proprios numeros.

CREATE OR REPLACE FUNCTION public.atendimentos_periodo(
  p_inicio date,
  p_fim date,
  p_collector text DEFAULT NULL
)
RETURNS TABLE (
  collector_id text,
  clientes integer,
  conversaram integer,
  promessas integer,
  tentativas integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager'
     AND (p_collector IS NULL
          OR p_collector IS DISTINCT FROM (SELECT app_current_user_id())::text) THEN
    RAISE EXCEPTION 'Sem permissão para ver atendimentos de outro cobrador.';
  END IF;

  RETURN QUERY
  WITH linhas AS (
    SELECT
      a.collector_id::text AS cobrador,
      COALESCE(b.documento, 't:' || a.collection_id) AS cliente,
      a.result IN (
        'promise', 'refusal', 'partial_payment', 'full_payment',
        'contact_made', 'message_sent', 'agreement', 'disputed',
        'claims_paid', 'sale_cancel_reported'
      ) AS conversou,
      a.result = 'promise' AS prometeu
    FROM collection_attempts a
    LEFT JOIN "BANCO_DADOS" b
      ON b.id_parcela = CASE
           WHEN a.collection_id ~ '^[0-9]{1,18}$' THEN a.collection_id::bigint
         END
    WHERE a.date >= p_inicio::text
      AND a.date <= p_fim::text
      AND a.collector_id IS NOT NULL
      AND (p_collector IS NULL OR a.collector_id::text = p_collector)
    UNION ALL
    SELECT
      v.collector_id,
      COALESCE(v.client_document, 'v:' || v.id::text),
      v.status = 'realizada',
      false
    FROM scheduled_visits v
    WHERE v.status IN ('realizada', 'nao_encontrado', 'reagendada')
      AND (v.channel IS NULL OR v.channel = 'presencial')
      AND v.collector_id IS NOT NULL
      AND (p_collector IS NULL OR v.collector_id = p_collector)
      AND (
        (v.data_visita_realizada BETWEEN p_inicio AND p_fim)
        OR (v.data_visita_realizada IS NULL
            AND v.scheduled_date BETWEEN p_inicio AND p_fim)
      )
  ),
  por_cliente AS (
    SELECT
      l.cobrador,
      l.cliente,
      bool_or(l.conversou) AS conversou,
      bool_or(l.prometeu) AS prometeu,
      count(*) AS n
    FROM linhas l
    GROUP BY l.cobrador, l.cliente
  )
  SELECT
    pc.cobrador,
    count(*)::integer,
    count(*) FILTER (WHERE pc.conversou)::integer,
    count(*) FILTER (WHERE pc.prometeu)::integer,
    sum(pc.n)::integer
  FROM por_cliente pc
  GROUP BY pc.cobrador;
END;
$$;

COMMENT ON FUNCTION public.atendimentos_periodo(date, date, text) IS
  'Clientes acionados / conversaram / promessas / acionamentos por cobrador no periodo. Fonte do card Desempenho (cobrador) e do Resumo por Cobrador (gestor).';

GRANT EXECUTE ON FUNCTION public.atendimentos_periodo(date, date, text) TO authenticated;
