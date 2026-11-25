-- Item 92 (reuniao 25/11): no Resumo, entre os clientes em atraso, mostrar
-- quantos foram ACIONADOS no periodo (ligacao, WhatsApp, visita), com ou sem
-- agendamento -- o interno trabalha pela Fila e quase nao agenda, entao
-- "sem agendamento" sozinho parece "ninguem trabalhou".
--
-- Mesma regra de atendimentos_periodo (20261118000004): collection_attempts
-- do periodo + visitas presenciais concluidas. Aqui devolve a LISTA de
-- clientes (documento) por cobrador, para o front cruzar com a situacao do
-- cliente (em atraso, sem agendamento). So o gestor.

CREATE OR REPLACE FUNCTION public.clientes_acionados_periodo(
  p_inicio date,
  p_fim date
)
RETURNS TABLE(collector_id text, documento text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão para ver os acionamentos de todos os cobradores.';
  END IF;

  RETURN QUERY
  SELECT DISTINCT x.cobrador, x.documento
  FROM (
    SELECT a.collector_id::text AS cobrador, b.documento
    FROM collection_attempts a
    JOIN "BANCO_DADOS" b
      ON b.id_parcela = CASE
           WHEN a.collection_id ~ '^[0-9]{1,18}$' THEN a.collection_id::bigint
         END
    WHERE a.date >= p_inicio::text
      AND a.date <= p_fim::text
      AND a.collector_id IS NOT NULL
      AND b.documento IS NOT NULL
    UNION ALL
    SELECT v.collector_id, v.client_document
    FROM scheduled_visits v
    WHERE v.status IN ('realizada', 'nao_encontrado', 'reagendada')
      AND (v.channel IS NULL OR v.channel = 'presencial')
      AND v.collector_id IS NOT NULL
      AND v.client_document IS NOT NULL
      AND (
        (v.data_visita_realizada BETWEEN p_inicio AND p_fim)
        OR (v.data_visita_realizada IS NULL
            AND v.scheduled_date BETWEEN p_inicio AND p_fim)
      )
  ) x
  -- Ordem unica: o front pagina com .range() (limite de 1000 do PostgREST).
  ORDER BY 1, 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.clientes_acionados_periodo(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clientes_acionados_periodo(date, date) TO authenticated;
