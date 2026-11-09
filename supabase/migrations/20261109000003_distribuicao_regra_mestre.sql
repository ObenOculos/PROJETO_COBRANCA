-- Distribuicao da carteira: as regras passam a ser MESTRE.
--
-- PEDIDO (2026-11-09): "as regras da Distribuicao devem ser as regras
-- mestre; o que estiver la e o que deve ser". Achado que motivou: o Jonathan
-- tinha 73 clientes, mas as faixas ativas dele cobriam 723 -- os outros 650
-- estavam com cobradores SEM regra (Samila, Beatriz, Carlos, Francisco,
-- Juridica), e o plano tratava carteira de cobrador sem regra como manual,
-- intocavel (migration 20261106000007/8).
--
-- DECISOES DO USUARIO (2026-11-09):
--   - cliente coberto por uma regra ativa vai para o dono dela, venha de
--     QUALQUER cobrador (inclusive externo e Juridica);
--   - cliente que nenhuma regra cobre e esta com cobrador sem regra SAI
--     (fica sem cobrador).
-- Continuam valendo: acordo/agendamento ativo travam; situacao de
-- encerramento (Falecido) fica de fora; "Aguardando <perfil>" so vai para
-- aquele perfil; cobrador COM regra mantem quem a regra dele cobre (ativa ou
-- pausada) e quem esta abaixo da 1a faixa dele na loja.
--
-- Tambem (mesmo dia): cobrador INATIVO deixa de segurar cliente mesmo com
-- regra (antes so nao RECEBIA cliente novo).
--
-- So o plano muda. Nada e movido por esta migration: os clientes so mudam
-- quando o gestor clica em "Aplicar" na tela Distribuicao (a simulacao
-- mostra antes). Corpo copiado de PRODUCAO (pg_get_functiondef em
-- 2026-11-09), removido so o bloco "cobrador sem regra: nao mexe" e
-- acrescentada a condicao de cobrador ativo no "fica com ele".
-- CREATE OR REPLACE com a mesma assinatura: grants preservados.

CREATE OR REPLACE FUNCTION public.plano_distribuicao_carteira(p_perfis jsonb)
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
      -- Regra MESTRE (2026-11-09): cobrador sem regra NAO tem mais carteira
      -- manual protegida. Sem regra, os dois testes abaixo dao falso (EXISTS
      -- vazio; min() NULL) e o cliente segue: vai para o dono da regra que o
      -- cobre ("troca") ou fica sem cobrador ("sai").
      -- Fica com ele: alguma regra dele cobre (ativa ou pausada -- inativa
      -- segura quem ja tem), ou o cliente esta abaixo do inicio da menor
      -- faixa dele naquela loja (o atraso so cai quando o cliente paga; quem
      -- recebeu continua com o cliente, sem vai-e-vem).
      -- Cobrador INATIVO nao segura cliente nenhum (2026-11-09): mesmo com
      -- regra, o cliente vai para o dono da regra ativa que o cobre ou sai.
      IF EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = c.user_id AND u.active IS DISTINCT FROM false
      ) AND (EXISTS (
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
