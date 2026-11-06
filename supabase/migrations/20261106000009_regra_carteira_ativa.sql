-- Regra ativa/inativa (pedido do usuario em 2026-11-06, mesma logica do
-- Cedrus: a regra fica cadastrada mas pode estar desligada). Regra INATIVA
-- nao entrega nem segura cliente -- a distribuicao e o painel "fora da
-- faixa" so enxergam regras ativas (cobrador so com regras inativas = como
-- se nao tivesse regra: carteira manual). Conflito entre cobradores so e
-- checado entre regras ATIVAS, e de novo ao ativar.
--
-- Trocar ativa/inativa segue a vigencia de sempre (encerra a versao e abre
-- outra), para o historico mostrar quando a regra valeu.

ALTER TABLE public.collector_overdue_ranges
  ADD COLUMN ativa boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.collector_overdue_ranges.ativa IS
  'Regra desligada (false) fica cadastrada mas a distribuicao ignora.';

-- salvar_regra_carteira ganha p_ativa. Assinatura muda: drop + create.
DROP FUNCTION public.salvar_regra_carteira(uuid, uuid, integer, integer, text[]);

-- Checagem de conflito, compartilhada por salvar e ativar.
CREATE FUNCTION public.regra_carteira_conflito(
  p_ignorar_id uuid,
  p_min_dias integer,
  p_max_dias integer,
  p_lojas text[]
)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v record;
BEGIN
  SELECT u.name, r.min_dias, r.max_dias, r.lojas INTO v
  FROM public.collector_overdue_ranges r
  JOIN public.users u ON u.id = r.collector_id
  WHERE r.vigente_ate IS NULL
    AND r.ativa
    AND r.id IS DISTINCT FROM p_ignorar_id
    AND r.min_dias <= COALESCE(p_max_dias, 2147483647)
    AND p_min_dias <= COALESCE(r.max_dias, 2147483647)
    AND (r.lojas IS NULL OR p_lojas IS NULL OR r.lojas && p_lojas)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN format('Conflito com a regra ativa de %s (%s dias) em %s.',
    v.name,
    CASE WHEN v.max_dias IS NULL THEN v.min_dias || '+'
         ELSE v.min_dias || ' a ' || v.max_dias END,
    CASE WHEN v.lojas IS NULL OR p_lojas IS NULL THEN 'todas as lojas'
         ELSE array_to_string(ARRAY(
           SELECT unnest(v.lojas) INTERSECT SELECT unnest(p_lojas)
         ), ', ') END);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.regra_carteira_conflito(uuid, integer, integer, text[]) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.salvar_regra_carteira(
  p_regra_id uuid,
  p_collector_id uuid,
  p_min_dias integer,
  p_max_dias integer,
  p_lojas text[] DEFAULT NULL,
  p_ativa boolean DEFAULT true
)
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

  IF p_regra_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.collector_overdue_ranges r
    WHERE r.id = p_regra_id AND r.collector_id = p_collector_id AND r.vigente_ate IS NULL
  ) THEN
    RAISE EXCEPTION 'Esta regra não está mais vigente. Atualize a tela.';
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

  INSERT INTO public.collector_overdue_ranges (
    collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by
  ) VALUES (
    p_collector_id, p_min_dias, p_max_dias, v_lojas, COALESCE(p_ativa, true), v_hoje,
    (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.salvar_regra_carteira(uuid, uuid, integer, integer, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_regra_carteira(uuid, uuid, integer, integer, text[], boolean) TO authenticated;

-- Liga/desliga uma regra (nova versao com o mesmo conteudo).
CREATE FUNCTION public.definir_regra_carteira_ativa(p_regra_id uuid, p_ativa boolean)
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
    collector_id, min_dias, max_dias, lojas, ativa, vigente_desde, created_by
  ) VALUES (
    v_atual.collector_id, v_atual.min_dias, v_atual.max_dias, v_atual.lojas, p_ativa,
    v_hoje, (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.definir_regra_carteira_ativa(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_regra_carteira_ativa(uuid, boolean) TO authenticated;

-- Painel "fora da faixa" e plano: corpo da 0008 (aplicada), so regras ATIVAS.
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
        WHERE r.collector_id = b.user_id AND r.vigente_ate IS NULL AND r.ativa
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
      AND r.vigente_ate IS NULL AND r.ativa
      AND r.max_dias IS NOT NULL
      AND r.max_dias < b.dias
      AND (r.lojas IS NULL OR b.loja = ANY (r.lojas))
    ORDER BY r.max_dias DESC
    LIMIT 1
  ) ult ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.collector_overdue_ranges r
    WHERE r.collector_id = b.user_id
      AND r.vigente_ate IS NULL AND r.ativa
      AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, b.dias, b.loja)
  );
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
        WHERE r.collector_id = c.user_id AND r.vigente_ate IS NULL AND r.ativa
      ) THEN
        CONTINUE;
      END IF;
      -- Alguma regra dele ainda cobre: fica.
      IF EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL AND r.ativa
          AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, c.atraso, c.loja)
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
