-- Item 55 (2026-11-13): carteira automatica, etapas 1 e 2.
--
-- Decisoes do usuario:
--   * entra sozinho na carteira quem a regra (faixa de dias x loja) de um
--     cobrador cobre -- o mesmo motor da tela Distribuicao, sem regra paralela;
--   * quem SAI da faixa fica com o cobrador se ele teve ACAO sobre o cliente
--     (Atender, inclusive tentativa sem sucesso; pagamento; acordo; pagamento
--     de acordo; contato/visita agendada) desde que entrou na carteira dele,
--     nos ultimos 30 dias; sem acao, troca/sai e fica registrado com motivo
--     'fora_da_faixa_sem_acao' em atribuicoes_historico (lista do gestor);
--   * roda todo dia as 7h no banco -- o agendamento (pg_cron) e a etapa 4,
--     NAO esta nesta migration: aqui nada roda sozinho ainda.
--
-- plano_distribuicao_carteira e aplicar_distribuicao_carteira: corpo de
-- producao (pg_get_functiondef em 2026-11-13) com so as mudancas descritas.
-- Cobrador ativo SEM regra continua com carteira manual (p_retirar_de vazio
-- na rotina automatica = nunca tira dele).

-- ------------------------------------------------------------ acao recente
CREATE OR REPLACE FUNCTION public.cobrador_teve_acao_recente(p_documento text, p_cobrador uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH entrada AS (
    SELECT max(h.assigned_at) AS t
    FROM public.atribuicoes_historico h
    WHERE h.documento = p_documento AND h.cobrador_novo_id = p_cobrador::text
  )
  SELECT COALESCE(GREATEST(
    (SELECT max(a.created_at)
       FROM public."BANCO_DADOS" b
       JOIN public.collection_attempts a ON a.collection_id = b.id_parcela::text
      WHERE b.documento = p_documento AND a.collector_id = p_cobrador),
    (SELECT max(p.created_at) FROM public.sale_payments p
      WHERE p.client_document = p_documento AND p.collector_id = p_cobrador),
    (SELECT max(ac.created_at) FROM public.acordos ac
      WHERE ac.client_document = p_documento AND ac.collector_id = p_cobrador),
    (SELECT max(ap.created_at)
       FROM public.acordo_pagamentos ap
       JOIN public.acordo_parcelas pa ON pa.id = ap.acordo_parcela_id
       JOIN public.acordos ac ON ac.id = pa.acordo_id
      WHERE ac.client_document = p_documento AND ap.collector_id = p_cobrador),
    (SELECT max(v.created_at) FROM public.scheduled_visits v
      WHERE v.client_document = p_documento AND v.collector_id = p_cobrador::text)
  ) >= GREATEST(now() - interval '30 days',
                COALESCE((SELECT t FROM entrada), '-infinity'::timestamptz)), false);
$function$;

COMMENT ON FUNCTION public.cobrador_teve_acao_recente(text, uuid) IS
  'Carteira automatica (item 55): o cobrador registrou algo sobre o cliente (Atender, pagamento, acordo, pagamento de acordo, agendamento) desde que o cliente entrou na carteira dele, nos ultimos 30 dias.';

-- ---------------------------------------------------- configuracao/execucoes
-- Regras de perfil (p_perfis) da ultima vez que o gestor aplicou a
-- Distribuicao: a fonte continua sendo src/config/profiles.ts
-- (distribuicaoPerfisPayload); a rotina automatica so reaproveita o que a
-- tela mandou. Semente = o payload atual do app (2026-11-13).
CREATE TABLE IF NOT EXISTS public.distribuicao_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  perfis jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por text
);
ALTER TABLE public.distribuicao_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distribuicao_config_gestor_le ON public.distribuicao_config;
CREATE POLICY distribuicao_config_gestor_le ON public.distribuicao_config
  FOR SELECT TO authenticated USING (app_current_user_type() = 'manager');
INSERT INTO public.distribuicao_config (id, perfis, atualizado_por)
VALUES (1, '{"perfis": {"collector": {"confirmar": "Em mãos", "manter": ["Em mãos", "Em tratamento"]}, "internal_collector": {"confirmar": "Cobrança Interna", "manter": ["Cobrança Interna", "Aguardando Interno", "Em acordo"]}, "third_party_collector": {"confirmar": "Cobrança Terceirizada", "manter": ["Cobrança Terceirizada", "Aguardando Terceirizado", "Em acordo"]}, "legal_collector": {"confirmar": "Cobrança Jurídica", "manter": ["Cobrança Jurídica", "Aguardando Jurídico", "Em acordo"]}}, "encerramento": ["Falecido"]}'::jsonb, 'migration 20261113000002')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.distribuicao_execucoes (
  id bigserial PRIMARY KEY,
  executado_em timestamptz NOT NULL DEFAULT now(),
  resultado jsonb,
  erro text
);
ALTER TABLE public.distribuicao_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distribuicao_execucoes_gestor_le ON public.distribuicao_execucoes;
CREATE POLICY distribuicao_execucoes_gestor_le ON public.distribuicao_execucoes
  FOR SELECT TO authenticated USING (app_current_user_type() = 'manager');

-- ------------------------------------------------------------------- plano
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

-- ------------------------------------------------------- aplicar (interno)
-- Corpo de aplicar_distribuicao_carteira sem o guard de gestor, com o motivo
-- e o usuario como parametro. Troca/saida de cliente de cobrador ATIVO COM
-- regra so chega aqui sem acao (o plano segura quem teve) -> motivo
-- 'fora_da_faixa_sem_acao'. Nao e chamavel pelo app (ver REVOKE abaixo).
CREATE OR REPLACE FUNCTION public._aplicar_distribuicao_carteira(
  p_perfis jsonb, p_retirar_de uuid[], p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  v_atribuidos integer := 0;
  v_retirados integer := 0;
  v_sem_acao integer := 0;
BEGIN
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario, ''), true);

  CREATE TEMP TABLE tmp_plano_distribuicao ON COMMIT DROP AS
  SELECT p.*,
         (p.cobrador_atual IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = p.cobrador_atual AND u.active IS DISTINCT FROM false)
          AND EXISTS (SELECT 1 FROM public.collector_overdue_ranges r
                      WHERE r.collector_id = p.cobrador_atual AND r.vigente_ate IS NULL)) AS sem_acao
  FROM public.plano_distribuicao_carteira(p_perfis, COALESCE(p_retirar_de, '{}'::uuid[])) p
  WHERE p.acao IN ('entra', 'troca', 'sai') AND p.bloqueado_por IS NULL;

  FOR d IN
    SELECT p.cobrador_destino, u.type, p.sem_acao, array_agg(p.documento) AS docs
    FROM tmp_plano_distribuicao p
    JOIN public.users u ON u.id = p.cobrador_destino
    WHERE p.acao IN ('entra', 'troca')
    GROUP BY p.cobrador_destino, u.type, p.sem_acao
  LOOP
    PERFORM set_config('cobranca.motivo',
      CASE WHEN d.sem_acao THEN 'fora_da_faixa_sem_acao' ELSE p_motivo END, true);
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
    IF d.sem_acao THEN
      v_sem_acao := v_sem_acao + cardinality(d.docs);
    END IF;
  END LOOP;

  FOR d IN SELECT DISTINCT p.sem_acao FROM tmp_plano_distribuicao p WHERE p.acao = 'sai'
  LOOP
    PERFORM set_config('cobranca.motivo',
      CASE WHEN d.sem_acao THEN 'fora_da_faixa_sem_acao' ELSE p_motivo END, true);
    UPDATE public."BANCO_DADOS" b
    SET user_id = NULL
    WHERE b.documento IN (SELECT p.documento FROM tmp_plano_distribuicao p
                          WHERE p.acao = 'sai' AND p.sem_acao = d.sem_acao)
      AND NOT public.cliente_tem_acordo_ativo(b.documento)
      AND NOT public.cliente_tem_visita_agendada_ativa(b.documento);
  END LOOP;

  SELECT count(*) INTO v_retirados FROM tmp_plano_distribuicao p WHERE p.acao = 'sai';
  v_sem_acao := v_sem_acao
    + (SELECT count(*) FROM tmp_plano_distribuicao p WHERE p.acao = 'sai' AND p.sem_acao);

  RETURN jsonb_build_object(
    'clientes_atribuidos', v_atribuidos,
    'clientes_retirados', v_retirados,
    'saidas_sem_acao', v_sem_acao
  );
END;
$function$;

-- ------------------------------------------------------ aplicar (gestor)
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
  VALUES (1, p_perfis, now(), (SELECT app_current_user_id())::text)
  ON CONFLICT (id) DO UPDATE
    SET perfis = EXCLUDED.perfis, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por;

  RETURN public._aplicar_distribuicao_carteira(
    p_perfis, p_retirar_de, 'distribuicao_regra', (SELECT app_current_user_id())::text);
END;
$function$;

-- ------------------------------------------------------ rotina automatica
-- Chamada pelo agendador (etapa 4) ou a mao pelo service_role. Sem gestor:
-- historico com gerente_id vazio e motivo 'distribuicao_automatica' (ou
-- 'fora_da_faixa_sem_acao'). Cada execucao fica em distribuicao_execucoes.
CREATE OR REPLACE FUNCTION public.executar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perfis jsonb;
  v_res jsonb;
BEGIN
  SELECT perfis INTO v_perfis FROM public.distribuicao_config WHERE id = 1;
  IF v_perfis IS NULL THEN
    INSERT INTO public.distribuicao_execucoes (erro) VALUES ('sem distribuicao_config');
    RETURN NULL;
  END IF;
  v_res := public._aplicar_distribuicao_carteira(v_perfis, '{}'::uuid[], 'distribuicao_automatica', '');
  INSERT INTO public.distribuicao_execucoes (resultado) VALUES (v_res);
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.cobrador_teve_acao_recente(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._aplicar_distribuicao_carteira(jsonb, uuid[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.executar_distribuicao_automatica() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.executar_distribuicao_automatica() TO service_role;
