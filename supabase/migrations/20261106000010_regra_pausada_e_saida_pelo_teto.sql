-- Ajuste da regra da carteira (decisoes do usuario em 2026-11-06, depois de
-- ver a simulacao com as regras da Monalisa):
--   1. Regra INATIVA = pausada: nao entrega cliente novo, mas o cobrador
--      MANTEM os clientes que ja tem naquela faixa (antes ela era ignorada e
--      350 clientes da Monalisa sairiam).
--   2. Cliente ABAIXO DA PRIMEIRA faixa do cobrador naquela loja continua com
--      ele: o atraso (parcela vencida mais antiga) so diminui quando o cliente
--      paga; tirar e devolver depois seria vai-e-vem (214 clientes no caso da
--      Monalisa). Cliente no BURACO entre duas faixas do mesmo cobrador (ex.:
--      61 a 365 entre "3 a 60" e "366 a 948") passou do teto e sai.
-- Resultado: o cliente fica se alguma regra dele (ativa ou pausada) cobre,
-- ou se esta abaixo do inicio da menor faixa dele naquela loja; senao sai.
-- Entregar cliente continua sendo so por regra ATIVA que cobre a faixa.
--
-- Corpos copiados da 0009 (aplicada em producao hoje).

CREATE OR REPLACE FUNCTION public.clientes_fora_da_faixa()
 RETURNS TABLE(documento text, cliente text, collector_id uuid, collector_name text, atraso_atual integer, faixa_min integer, faixa_max integer, dias_excedidos integer, bloqueado_por text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH doc AS (
    SELECT DISTINCT b.documento, b.cliente, b.user_id
    FROM public."BANCO_DADOS" b
    WHERE b.user_id IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
      AND EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = b.user_id AND r.vigente_ate IS NULL
      )
  ), base AS (
    SELECT d.*,
           public.cliente_max_atraso_dias(d.documento) AS dias,
           public.cliente_loja_referencia(d.documento) AS loja
    FROM doc d
  )
  SELECT
    b.documento,
    b.cliente,
    b.user_id AS collector_id,
    u.name AS collector_name,
    b.dias AS atraso_atual,
    ult.min_dias AS faixa_min,
    ult.max_dias AS faixa_max,
    b.dias - ult.max_dias AS dias_excedidos,
    CASE
      WHEN public.cliente_tem_acordo_ativo(b.documento) THEN 'acordo_ativo'
      WHEN public.cliente_tem_visita_agendada_ativa(b.documento) THEN 'visita_agendada'
      ELSE NULL
    END AS bloqueado_por
  FROM base b
  JOIN public.users u ON u.id = b.user_id
  LEFT JOIN LATERAL (
    SELECT r.min_dias, r.max_dias
    FROM public.collector_overdue_ranges r
    WHERE r.collector_id = b.user_id
      AND r.vigente_ate IS NULL
      AND r.max_dias IS NOT NULL
      AND r.max_dias < b.dias
      AND (r.lojas IS NULL OR b.loja = ANY (r.lojas))
    ORDER BY r.max_dias DESC
    LIMIT 1
  ) ult ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.collector_overdue_ranges r
    WHERE r.collector_id = b.user_id
      AND r.vigente_ate IS NULL
      AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, b.dias, b.loja)
  )
  AND NOT COALESCE(b.dias < (
    SELECT min(r.min_dias) FROM public.collector_overdue_ranges r
    WHERE r.collector_id = b.user_id
      AND r.vigente_ate IS NULL
      AND (r.lojas IS NULL OR b.loja = ANY (r.lojas))
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.plano_distribuicao_carteira(p_perfis jsonb)
 RETURNS TABLE(
   documento text, cliente text, loja text, atraso integer, situacao text,
   cobrador_atual uuid, cobrador_destino uuid, acao text, bloqueado_por text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_carga jsonb;
  v_encerramento text[] := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(p_perfis->'encerramento', '[]'::jsonb))
  );
  c record;
  v_dest uuid;
  v_bloq text;
BEGIN
  SELECT COALESCE(jsonb_object_agg(x.user_id::text, x.n), '{}'::jsonb) INTO v_carga
  FROM (
    SELECT b.user_id, count(DISTINCT b.documento) AS n
    FROM public."BANCO_DADOS" b
    WHERE b.user_id IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
    GROUP BY b.user_id
  ) x;

  FOR c IN
    WITH abertos AS (
      SELECT b.documento, b.cliente, b.user_id, b.situacao, b.nome_da_loja, b.data_vencimento
      FROM public."BANCO_DADOS" b
      WHERE b.documento IS NOT NULL
        AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
        AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
    ), por_cliente AS (
      SELECT
        a.documento,
        (array_agg(a.cliente ORDER BY a.data_vencimento ASC NULLS LAST, a.nome_da_loja))[1] AS cliente,
        (array_agg(a.nome_da_loja ORDER BY a.data_vencimento ASC NULLS LAST, a.nome_da_loja))[1] AS loja,
        (array_agg(a.user_id ORDER BY a.user_id NULLS LAST))[1] AS user_id,
        max(a.situacao) AS situacao
      FROM abertos a
      GROUP BY a.documento
    )
    SELECT pc.*, public.cliente_max_atraso_dias(pc.documento) AS atraso
    FROM por_cliente pc
    -- 6 = atraso: por ordinal porque "atraso" sem prefixo colide com o
    -- parametro OUT de mesmo nome (plpgsql recusa referencia ambigua).
    ORDER BY 6 DESC, pc.documento
  LOOP
    IF c.situacao = ANY (v_encerramento) THEN
      CONTINUE;
    END IF;

    IF c.user_id IS NOT NULL THEN
      -- Cobrador sem nenhuma regra: carteira manual, nao mexe.
      IF NOT EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id AND r.vigente_ate IS NULL
      ) THEN
        CONTINUE;
      END IF;
      -- Fica com ele: alguma regra dele cobre (ativa ou pausada -- inativa
      -- segura quem ja tem), ou o cliente esta abaixo do inicio da menor
      -- faixa dele naquela loja (o atraso so cai quando o cliente paga; quem
      -- recebeu continua com o cliente, sem vai-e-vem).
      IF EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL
          AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, c.atraso, c.loja)
      ) OR c.atraso < (
        SELECT min(r.min_dias) FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL
          AND (r.lojas IS NULL OR c.loja = ANY (r.lojas))
      ) THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT r.collector_id INTO v_dest
    FROM public.collector_overdue_ranges r
    JOIN public.users u ON u.id = r.collector_id
    WHERE r.vigente_ate IS NULL AND r.ativa
      AND u.active IS DISTINCT FROM false
      AND (p_perfis->'perfis') ? u.type
      AND r.collector_id IS DISTINCT FROM c.user_id
      AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, c.atraso, c.loja)
      AND (
        c.situacao IS NULL
        OR c.situacao NOT LIKE 'Aguardando %'
        OR c.situacao IN (
          SELECT jsonb_array_elements_text(p_perfis->'perfis'->u.type->'manter')
        )
      )
    ORDER BY COALESCE((v_carga->>r.collector_id::text)::integer, 0), r.collector_id
    LIMIT 1;

    IF c.user_id IS NULL AND v_dest IS NULL THEN
      documento := c.documento; cliente := c.cliente; loja := c.loja;
      atraso := c.atraso; situacao := c.situacao; cobrador_atual := NULL;
      cobrador_destino := NULL; acao := 'sem_regra'; bloqueado_por := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_bloq := CASE
      WHEN public.cliente_tem_acordo_ativo(c.documento) THEN 'acordo_ativo'
      WHEN public.cliente_tem_visita_agendada_ativa(c.documento) THEN 'agendamento_ativo'
      ELSE NULL
    END;

    documento := c.documento; cliente := c.cliente; loja := c.loja;
    atraso := c.atraso; situacao := c.situacao; cobrador_atual := c.user_id;
    cobrador_destino := v_dest; bloqueado_por := v_bloq;
    acao := CASE
      WHEN c.user_id IS NULL THEN 'entra'
      WHEN v_dest IS NOT NULL THEN 'troca'
      ELSE 'sai'
    END;
    RETURN NEXT;

    IF v_bloq IS NULL THEN
      IF v_dest IS NOT NULL THEN
        v_carga := jsonb_set(v_carga, ARRAY[v_dest::text],
          to_jsonb(COALESCE((v_carga->>v_dest::text)::integer, 0) + 1));
      END IF;
      IF c.user_id IS NOT NULL THEN
        v_carga := jsonb_set(v_carga, ARRAY[c.user_id::text],
          to_jsonb(COALESCE((v_carga->>c.user_id::text)::integer, 0) - 1));
      END IF;
    END IF;
  END LOOP;
END;
$function$;
