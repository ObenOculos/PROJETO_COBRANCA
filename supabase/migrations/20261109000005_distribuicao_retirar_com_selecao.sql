-- Distribuicao: nao tira cliente de outra carteira sem o gestor marcar.
--
-- VOLTA ATRAS da "regra mestre" (20261109000003, aplicada mas NUNCA usada --
-- nenhuma distribuicao foi aplicada com ela). Usuario, 2026-11-09: "esse
-- sistema de distribuicao nao deveria retirar da outra carteira. O gestor deve
-- ter a responsabilidade" -- e a base do Francisco (externo) nao pode sair.
--
-- COMO FICA:
--   - Cobrador ATIVO sem regra (carteira manual: Francisco, Juridica...):
--     cliente que nenhuma regra cobre FICA; cliente que uma regra cobre so vai
--     para o dono dela se o gestor marcou aquele cobrador (p_retirar_de). Sem
--     marcar, o plano devolve acao 'retido' -- a tela mostra "existem clientes
--     atrelados a outro cobrador" com um checkbox por cobrador; 'retido' nunca
--     e aplicado (aplicar so executa entra/troca/sai).
--   - Cobrador com regra: como antes (20261106000010) -- fica com o que a
--     regra dele cobre (ativa ou pausada) e abaixo da 1a faixa; o resto troca
--     ou sai.
--   - Cobrador INATIVO nao segura nada (mantido do 0003; desde o 0004 a
--     carteira dele ja e liberada ao inativar).
-- Travas mantidas: acordo/agendamento ativo, Falecido, "Aguardando <perfil>".
--
-- Assinatura ganha p_retirar_de uuid[] DEFAULT '{}': DROP + CREATE das tres.
-- O front publicado chama so com p_perfis -- continua funcionando, com o
-- comportamento seguro (ninguem e retirado). Previa e aplicar copiadas de
-- PRODUCAO trocando so a assinatura e a chamada ao plano. Grants iguais aos
-- de producao: plano so service_role (interna); previa/aplicar para
-- authenticated e service_role (guard de gestor dentro).

DROP FUNCTION public.aplicar_distribuicao_carteira(jsonb);
DROP FUNCTION public.distribuicao_carteira_previa(jsonb);
DROP FUNCTION public.plano_distribuicao_carteira(jsonb);

CREATE FUNCTION public.plano_distribuicao_carteira(p_perfis jsonb, p_retirar_de uuid[] DEFAULT '{}'::uuid[])
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
      )) THEN
        CONTINUE;
      END IF;
    END IF;

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

REVOKE ALL ON FUNCTION public.plano_distribuicao_carteira(jsonb, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plano_distribuicao_carteira(jsonb, uuid[]) TO service_role;

CREATE FUNCTION public.distribuicao_carteira_previa(p_perfis jsonb, p_retirar_de uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem ver a distribuição da carteira.';
  END IF;

  WITH plano AS (
    SELECT * FROM public.plano_distribuicao_carteira(p_perfis, p_retirar_de)
  )
  SELECT jsonb_build_object(
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'documento', p.documento, 'cliente', p.cliente, 'loja', p.loja,
        'atraso', p.atraso, 'situacao', p.situacao,
        'cobrador_atual', p.cobrador_atual, 'cobrador_destino', p.cobrador_destino,
        'acao', p.acao, 'bloqueado_por', p.bloqueado_por
      ) ORDER BY p.atraso DESC, p.documento)
      FROM plano p WHERE p.acao <> 'sem_regra'
    ), '[]'::jsonb),
    'sem_regra_por_loja', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('loja', s.loja, 'clientes', s.n) ORDER BY s.n DESC)
      FROM (
        SELECT p.loja, count(*) AS n FROM plano p
        WHERE p.acao = 'sem_regra' GROUP BY p.loja
      ) s
    ), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.distribuicao_carteira_previa(jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuicao_carteira_previa(jsonb, uuid[]) TO authenticated, service_role;

CREATE FUNCTION public.aplicar_distribuicao_carteira(p_perfis jsonb, p_retirar_de uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  v_n integer;
  v_atribuidos integer := 0;
  v_retirados integer := 0;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem aplicar a distribuição da carteira.';
  END IF;

  PERFORM set_config('cobranca.motivo', 'distribuicao_regra', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE((SELECT app_current_user_id())::text, ''), true);

  CREATE TEMP TABLE tmp_plano_distribuicao ON COMMIT DROP AS
  SELECT * FROM public.plano_distribuicao_carteira(p_perfis, p_retirar_de)
  WHERE acao IN ('entra', 'troca', 'sai') AND bloqueado_por IS NULL;

  FOR d IN
    SELECT p.cobrador_destino, u.type, array_agg(p.documento) AS docs
    FROM tmp_plano_distribuicao p
    JOIN public.users u ON u.id = p.cobrador_destino
    WHERE p.acao IN ('entra', 'troca')
    GROUP BY p.cobrador_destino, u.type
  LOOP
    UPDATE public."BANCO_DADOS" b
    SET user_id = d.cobrador_destino,
        situacao = CASE
          WHEN b.situacao IN (
            SELECT jsonb_array_elements_text(p_perfis->'perfis'->d.type->'manter')
          ) THEN b.situacao
          ELSE COALESCE(p_perfis->'perfis'->d.type->>'confirmar', b.situacao)
        END
    WHERE b.documento = ANY (d.docs)
      AND NOT public.cliente_tem_acordo_ativo(b.documento)
      AND NOT public.cliente_tem_visita_agendada_ativa(b.documento);
    v_atribuidos := v_atribuidos + cardinality(d.docs);
  END LOOP;

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL
  WHERE b.documento IN (SELECT p.documento FROM tmp_plano_distribuicao p WHERE p.acao = 'sai')
    AND NOT public.cliente_tem_acordo_ativo(b.documento)
    AND NOT public.cliente_tem_visita_agendada_ativa(b.documento);
  SELECT count(*) INTO v_n FROM tmp_plano_distribuicao p WHERE p.acao = 'sai';
  v_retirados := v_n;

  RETURN jsonb_build_object(
    'clientes_atribuidos', v_atribuidos,
    'clientes_retirados', v_retirados
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.aplicar_distribuicao_carteira(jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_distribuicao_carteira(jsonb, uuid[]) TO authenticated, service_role;
