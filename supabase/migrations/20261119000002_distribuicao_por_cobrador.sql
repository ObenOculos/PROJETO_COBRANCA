-- Distribuicao da carteira so para os cobradores escolhidos (2026-11-19).
--
-- Pedido do usuario: "quero poder selecionar qual cobrador eu quero fazer a
-- atribuicao. Hoje se eu sincronizar, ele pega todo mundo de uma unica vez."
--
-- A selecao vai dentro de p_perfis, na chave 'cobradores' (lista de ids), para
-- nao mudar a assinatura das funcoes (previa/aplicar/_aplicar so repassam
-- p_perfis ao plano). Sem a chave = todos, como antes.
--
-- Regra (decisao do usuario): entra todo cliente que entra, sai ou troca
-- envolvendo um cobrador escolhido, mesmo que o outro lado nao esteja
-- escolhido (ex.: escolheu a Aline; cliente que iria do Jose para ela vai).
-- "Sem regra" (nenhum cobrador nos dois lados) fica fora quando ha selecao.
-- Movimento fora da selecao nao entra no calculo de carga (nao sera aplicado).
--
-- aplicar_distribuicao_carteira grava p_perfis em distribuicao_config, que a
-- rotina automatica diaria reusa: grava SEM 'cobradores', senao a automatica
-- passaria a distribuir so para os escolhidos.
--
-- Corpos copiados de producao (pg_get_functiondef, 2026-11-19). CREATE OR
-- REPLACE mantem os grants (plano so service_role; previa/aplicar
-- authenticated).

CREATE OR REPLACE FUNCTION public.plano_distribuicao_carteira(p_perfis jsonb, p_retirar_de uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(documento text, cliente text, loja text, atraso integer, situacao text, cobrador_atual uuid, cobrador_destino uuid, acao text, bloqueado_por text)
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
  v_ativo boolean;
  -- Selecao de cobradores (2026-11-19): p_perfis->'cobradores' = lista de
  -- ids. Ausente = todos (rotina automatica e chamadas antigas).
  v_sel uuid[] := CASE
    WHEN jsonb_typeof(p_perfis->'cobradores') = 'array' THEN ARRAY(
      SELECT jsonb_array_elements_text(p_perfis->'cobradores')::uuid
    )
  END;
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

    -- Dono da regra ativa que cobre o cliente (menor carga primeiro).
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

    IF c.user_id IS NOT NULL THEN
      SELECT u.active IS DISTINCT FROM false INTO v_ativo
      FROM public.users u WHERE u.id = c.user_id;
      v_ativo := COALESCE(v_ativo, false);

      -- Cobrador ATIVO sem regra = carteira manual: a distribuicao nao tira
      -- dele por conta propria (2026-11-09, substitui a "regra mestre" do
      -- 20261109000003). Cliente que nenhuma regra cobre fica; cliente que
      -- uma regra cobre so vai para o dono dela se o GESTOR marcou este
      -- cobrador em p_retirar_de -- senao volta como 'retido' (aviso com
      -- checkbox na tela), sem mexer.
      IF v_ativo AND NOT EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id AND r.vigente_ate IS NULL
      ) THEN
        IF v_dest IS NULL THEN
          CONTINUE;
        END IF;
        IF NOT (c.user_id = ANY (COALESCE(p_retirar_de, '{}'::uuid[]))) THEN
          IF v_sel IS NOT NULL
             AND NOT (COALESCE(c.user_id = ANY (v_sel), false)
                      OR COALESCE(v_dest = ANY (v_sel), false)) THEN
            CONTINUE;
          END IF;
          v_bloq := CASE
            WHEN public.cliente_tem_acordo_ativo(c.documento) THEN 'acordo_ativo'
            WHEN public.cliente_tem_visita_agendada_ativa(c.documento) THEN 'agendamento_ativo'
            ELSE NULL
          END;
          documento := c.documento; cliente := c.cliente; loja := c.loja;
          atraso := c.atraso; situacao := c.situacao; cobrador_atual := c.user_id;
          cobrador_destino := v_dest; acao := 'retido'; bloqueado_por := v_bloq;
          RETURN NEXT;
          CONTINUE;
        END IF;
      -- Cobrador ativo COM regra: fica com o que alguma regra dele cobre
      -- (ativa ou pausada) e com quem esta abaixo da 1a faixa dele na loja.
      -- Inativo nao segura nada.
      ELSIF v_ativo AND (EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL
          AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, c.atraso, c.loja)
      ) OR c.atraso < (
        SELECT min(r.min_dias) FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL
          AND (r.lojas IS NULL OR c.loja = ANY (r.lojas))
      )
      -- Saiu da faixa, mas o cobrador AGIU sobre o cliente (desde que ele
      -- entrou na carteira, nos ultimos 30 dias): fica com ele, como no
      -- Cedrus (item 55, 2026-11-13). Sem acao, segue para troca/saida --
      -- e _aplicar_distribuicao_carteira registra 'fora_da_faixa_sem_acao'.
      OR public.cobrador_teve_acao_recente(c.documento, c.user_id)) THEN
        CONTINUE;
      END IF;
    END IF;

    IF c.user_id IS NULL AND v_dest IS NULL THEN
      IF v_sel IS NOT NULL THEN
        CONTINUE;
      END IF;
      documento := c.documento; cliente := c.cliente; loja := c.loja;
      atraso := c.atraso; situacao := c.situacao; cobrador_atual := NULL;
      cobrador_destino := NULL; acao := 'sem_regra'; bloqueado_por := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_sel IS NOT NULL
       AND NOT (COALESCE(c.user_id = ANY (v_sel), false)
                      OR COALESCE(v_dest = ANY (v_sel), false)) THEN
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

CREATE OR REPLACE FUNCTION public.aplicar_distribuicao_carteira(p_perfis jsonb, p_retirar_de uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem aplicar a distribuição da carteira.';
  END IF;

  -- Regras de perfil do app, reaproveitadas pela rotina automatica.
  INSERT INTO public.distribuicao_config (id, perfis, atualizado_em, atualizado_por)
  -- Sem 'cobradores': a selecao vale so para esta aplicacao manual; a
  -- rotina automatica continua distribuindo para todos.
  VALUES (1, p_perfis - 'cobradores', now(), (SELECT app_current_user_id())::text)
  ON CONFLICT (id) DO UPDATE
    SET perfis = EXCLUDED.perfis, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por;

  RETURN public._aplicar_distribuicao_carteira(
    p_perfis, p_retirar_de, 'distribuicao_regra', (SELECT app_current_user_id())::text);
END;
$function$;
