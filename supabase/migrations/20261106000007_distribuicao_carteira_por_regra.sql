-- Distribuicao da carteira por regra (faixa de atraso x lojas), pedido do
-- usuario em 2026-11-06. Ate aqui a faixa do cobrador so dizia quando o
-- cliente SAI da carteira (Clientes urgentes / painel do Resumo); nada usava
-- a faixa para ENTREGAR cliente a ninguem. Agora:
--
--   regra do cobrador = faixa de atraso (de/ate, inclusiva) + lojas
--   (NULL = todas). Continua 1 regra vigente por cobrador, com vigencia.
--
-- Decisoes (recomendacoes aceitas pelo usuario):
--   * Sobreposicao permitida: varios cobradores na mesma loja/faixa dividem
--     os clientes pela carga (quem tem menos clientes em aberto recebe).
--   * Aplicacao em 2 passos: previa (so leitura) e aplicar (gestor
--     confirma). Nada roda sozinho ainda.
--   * So mexe em cliente SEM cobrador ou cujo cobrador TEM regra e a regra
--     dele nao cobre mais o cliente. Cobrador sem regra = carteira manual,
--     intocada. Nunca reembaralha quem ainda esta dentro da regra.
--   * Loja do cliente = loja do titulo em aberto mais atrasado (48 de ~7 mil
--     clientes tem titulo em mais de uma loja); o cliente vai inteiro.
--   * Fora da distribuicao: encerramento (Falecido), e "Aguardando <perfil>"
--     so vai para cobrador daquele perfil (ex.: SPC -> Juridico).
--   * Acordo ativo ou agendamento ativo travam (mesmos guards de sempre).
--
-- A regra de situacao por perfil (qual situacao confirmar / quais manter)
-- NAO e reescrita aqui: vem do front em p_perfis, montada de
-- src/config/profiles.ts (fonte unica). Formato:
--   {"perfis": {"<user_type>": {"confirmar": "...", "manter": ["..."]}},
--    "encerramento": ["Falecido"]}

-- 0. Funcao legada, sem uso no app: distribuia TODOS os clientes sem
--    cobrador entre os users type='collector' (inclusive inativos), sem
--    auditoria de motivo nem situacao, executavel por qualquer logado.
DROP FUNCTION IF EXISTS public.distribuir_clientes_cobradores();

-- 1. Lojas na regra do cobrador.
ALTER TABLE public.collector_overdue_ranges ADD COLUMN lojas text[];
COMMENT ON COLUMN public.collector_overdue_ranges.lojas IS
  'Lojas (BANCO_DADOS.nome_da_loja) que a regra cobre; NULL = todas as lojas.';

-- 2. definir_faixa_atraso_cobrador ganha p_lojas (DEFAULT NULL: chamada
--    antiga com 3 argumentos nomeados continua resolvendo). Corpo copiado
--    de producao (pg_get_functiondef em 2026-11-06).
DROP FUNCTION public.definir_faixa_atraso_cobrador(uuid, integer, integer);
CREATE FUNCTION public.definir_faixa_atraso_cobrador(
  p_collector_id uuid,
  p_min_dias integer,
  p_max_dias integer,
  p_lojas text[] DEFAULT NULL
)
 RETURNS collector_overdue_ranges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_nova public.collector_overdue_ranges;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir faixa de atraso.';
  END IF;

  UPDATE public.collector_overdue_ranges
  SET vigente_ate = v_hoje
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;

  INSERT INTO public.collector_overdue_ranges (
    collector_id, min_dias, max_dias, lojas, vigente_desde, created_by
  ) VALUES (
    p_collector_id, p_min_dias, p_max_dias,
    NULLIF(p_lojas, '{}'::text[]),
    v_hoje, (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.definir_faixa_atraso_cobrador(uuid, integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_faixa_atraso_cobrador(uuid, integer, integer, text[]) TO authenticated;

-- 3. Fonte unica no banco de "a regra cobre este cliente". Faixa
--    INCLUSIVA nas duas pontas: "1 a 60" cobre o dia 60 e "61 a 120"
--    comeca no 61 -- antes o teto era exclusivo (o cliente saia NO dia 60),
--    o que deixava um buraco entre faixas escritas do jeito natural.
--    Espelho no front: faixaCobreAtraso (src/filters/priority.ts).
CREATE FUNCTION public.faixa_cobre_cliente(
  p_min_dias integer,
  p_max_dias integer,
  p_lojas text[],
  p_atraso integer,
  p_loja text
)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_atraso >= p_min_dias
     AND (p_max_dias IS NULL OR p_atraso <= p_max_dias)
     AND (p_lojas IS NULL OR p_loja = ANY (p_lojas));
$function$;

GRANT EXECUTE ON FUNCTION public.faixa_cobre_cliente(integer, integer, text[], integer, text) TO authenticated;

-- 4. clientes_fora_da_faixa: mesmo corpo de producao, so o teto passa a
--    ser inclusivo (sai quando PASSA do maximo).
CREATE OR REPLACE FUNCTION public.clientes_fora_da_faixa()
 RETURNS TABLE(documento text, cliente text, collector_id uuid, collector_name text, atraso_atual integer, faixa_min integer, faixa_max integer, dias_excedidos integer, bloqueado_por text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    doc.documento,
    doc.cliente,
    doc.user_id AS collector_id,
    u.name AS collector_name,
    atraso.dias AS atraso_atual,
    faixa.min_dias AS faixa_min,
    faixa.max_dias AS faixa_max,
    atraso.dias - faixa.max_dias AS dias_excedidos,
    CASE
      WHEN public.cliente_tem_acordo_ativo(doc.documento) THEN 'acordo_ativo'
      WHEN public.cliente_tem_visita_agendada_ativa(doc.documento) THEN 'visita_agendada'
      ELSE NULL
    END AS bloqueado_por
  FROM (
    SELECT DISTINCT b.documento, b.cliente, b.user_id
    FROM public."BANCO_DADOS" b
    WHERE b.user_id IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
  ) doc
  JOIN public.users u ON u.id = doc.user_id
  JOIN public.collector_overdue_ranges faixa
    ON faixa.collector_id = doc.user_id AND faixa.vigente_ate IS NULL
  CROSS JOIN LATERAL (
    SELECT public.cliente_max_atraso_dias(doc.documento) AS dias
  ) atraso
  WHERE faixa.max_dias IS NOT NULL
    AND atraso.dias > faixa.max_dias;
$function$;

-- 5. Lojas existentes, com quantos clientes tem saldo em aberto em cada uma
--    (pela loja do titulo mais atrasado, a mesma regra da distribuicao).
CREATE FUNCTION public.lojas_carteira()
 RETURNS TABLE(loja text, clientes_em_aberto integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH abertos AS (
    SELECT b.documento, b.nome_da_loja, b.data_vencimento
    FROM public."BANCO_DADOS" b
    WHERE b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
  ), por_cliente AS (
    SELECT (array_agg(a.nome_da_loja ORDER BY a.data_vencimento ASC NULLS LAST, a.nome_da_loja))[1] AS loja
    FROM abertos a
    GROUP BY a.documento
  )
  SELECT l.nome_da_loja, COALESCE(c.n, 0)::integer
  FROM (SELECT DISTINCT nome_da_loja FROM public."BANCO_DADOS" WHERE nome_da_loja IS NOT NULL) l
  LEFT JOIN (SELECT loja, count(*) AS n FROM por_cliente GROUP BY loja) c ON c.loja = l.nome_da_loja
  ORDER BY l.nome_da_loja;
$function$;

REVOKE EXECUTE ON FUNCTION public.lojas_carteira() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lojas_carteira() TO authenticated;

-- 6. O plano (interno): uma linha por cliente que a distribuicao mexeria.
--    acao: entra (sem cobrador -> cobrador), troca (cobrador cuja regra nao
--    cobre mais -> outro), sai (nao cobre mais e ninguem cobre -> fica sem
--    cobrador), sem_regra (sem cobrador e nenhuma regra cobre).
--    Carga = clientes com saldo em aberto por cobrador, atualizada a cada
--    decisao (divide a sobreposicao de forma igual). Ordem: mais atrasado
--    primeiro, documento como desempate (deterministico: a previa e a
--    aplicacao chegam no mesmo plano com os mesmos dados).
CREATE FUNCTION public.plano_distribuicao_carteira(p_perfis jsonb)
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
  v_regra_atual record;
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
      SELECT r.min_dias, r.max_dias, r.lojas INTO v_regra_atual
      FROM public.collector_overdue_ranges r
      WHERE r.collector_id = c.user_id AND r.vigente_ate IS NULL;
      -- Cobrador sem regra: carteira manual, nao mexe.
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      -- Ainda dentro da regra dele: fica.
      IF public.faixa_cobre_cliente(
           v_regra_atual.min_dias, v_regra_atual.max_dias, v_regra_atual.lojas,
           c.atraso, c.loja) THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT r.collector_id INTO v_dest
    FROM public.collector_overdue_ranges r
    JOIN public.users u ON u.id = r.collector_id
    WHERE r.vigente_ate IS NULL
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

-- Interna: so as duas funcoes abaixo (dono postgres) chamam.
REVOKE EXECUTE ON FUNCTION public.plano_distribuicao_carteira(jsonb) FROM PUBLIC, anon, authenticated;

-- 7. Previa (so leitura): itens que mudariam + clientes sem regra por loja.
CREATE FUNCTION public.distribuicao_carteira_previa(p_perfis jsonb)
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
    SELECT * FROM public.plano_distribuicao_carteira(p_perfis)
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

REVOKE EXECUTE ON FUNCTION public.distribuicao_carteira_previa(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuicao_carteira_previa(jsonb) TO authenticated;

-- 8. Aplicar: recalcula o plano no servidor (nao confia em lista vinda do
--    client) e grava numa transacao, com motivo proprio no historico de
--    atribuicoes (trigger historico_carteira_upd le cobranca.motivo).
CREATE FUNCTION public.aplicar_distribuicao_carteira(p_perfis jsonb)
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
  SELECT * FROM public.plano_distribuicao_carteira(p_perfis)
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

REVOKE EXECUTE ON FUNCTION public.aplicar_distribuicao_carteira(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_distribuicao_carteira(jsonb) TO authenticated;
