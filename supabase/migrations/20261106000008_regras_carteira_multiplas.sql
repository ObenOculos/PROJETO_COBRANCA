-- Varias regras (faixa x lojas) por cobrador -- pedido do usuario em
-- 2026-11-06, comparando com o Cedrus, onde a mesma cobradora tem "3 a 60"
-- e "366 a 948" nas mesmas lojas e faixas diferentes em lojas diferentes.
-- A migration 20261106000007 so permitia 1 regra vigente por cobrador.
--
-- Decisoes do usuario:
--   * O mesmo cobrador pode ter quantas faixas quiser, na mesma loja ou em
--     lojas diferentes.
--   * Cobradores DIFERENTES nao podem cobrar a mesma faixa na mesma loja:
--     salvar_regra_carteira recusa a regra que se sobrepoe a outra vigente
--     (mesma loja -- NULL = todas -- e faixas que se cruzam). Vale tambem
--     entre regras do proprio cobrador, para a cobertura nao ficar ambigua.
--     As regras ja existentes nao sao reescritas: se houver conflito antigo,
--     a tela mostra e a distribuicao desempata pela carga (como antes).
--   * Cliente sem tratamento (sem acordo nem agendamento ativo) acompanha a
--     faixa: muda de cobrador conforme o atraso cresce e, se sair da faixa de
--     todo mundo, volta a ficar sem cobrador. Ja era o plano da 0007; aqui so
--     "coberto pelo cobrador atual" passa a ser QUALQUER regra dele.

-- 1. Sem o limite de 1 regra vigente por cobrador.
DROP INDEX IF EXISTS public.uniq_collector_overdue_ranges_ativa;

-- 2. Funcoes antigas de "a faixa do cobrador" (uma so) saem: definir fechava
--    TODAS as regras do cobrador e abria uma; encerrar fechava todas.
--    executar_saida_carteira_fora_da_faixa nunca foi ligada e foi substituida
--    pela distribuicao (aplicar_distribuicao_carteira).
DROP FUNCTION IF EXISTS public.definir_faixa_atraso_cobrador(uuid, integer, integer, text[]);
DROP FUNCTION IF EXISTS public.encerrar_faixa_atraso_cobrador(uuid);
DROP FUNCTION IF EXISTS public.executar_saida_carteira_fora_da_faixa();

-- 3. Criar ou editar UMA regra. p_regra_id NULL = regra nova; senao a regra
--    vigente informada e encerrada (vigente_ate = hoje) e a versao nova e
--    aberta -- mesma regra de vigencia de sempre, nada de UPDATE destrutivo.
CREATE FUNCTION public.salvar_regra_carteira(
  p_regra_id uuid,
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
  v_lojas text[] := NULLIF(p_lojas, '{}'::text[]);
  v_conflito record;
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

  -- Serializa gravacoes de regra: duas telas salvando ao mesmo tempo nao
  -- podem passar as duas pela checagem de conflito.
  LOCK TABLE public.collector_overdue_ranges IN SHARE ROW EXCLUSIVE MODE;

  IF p_regra_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.collector_overdue_ranges r
    WHERE r.id = p_regra_id
      AND r.collector_id = p_collector_id
      AND r.vigente_ate IS NULL
  ) THEN
    RAISE EXCEPTION 'Esta regra não está mais vigente. Atualize a tela.';
  END IF;

  SELECT u.name, r.min_dias, r.max_dias, r.lojas INTO v_conflito
  FROM public.collector_overdue_ranges r
  JOIN public.users u ON u.id = r.collector_id
  WHERE r.vigente_ate IS NULL
    AND r.id IS DISTINCT FROM p_regra_id
    -- faixas se cruzam (inclusivas)
    AND r.min_dias <= COALESCE(p_max_dias, 2147483647)
    AND p_min_dias <= COALESCE(r.max_dias, 2147483647)
    -- lojas se cruzam (NULL = todas)
    AND (r.lojas IS NULL OR v_lojas IS NULL OR r.lojas && v_lojas)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Conflito com a regra de % (% dias) em %.',
      v_conflito.name,
      CASE WHEN v_conflito.max_dias IS NULL
        THEN v_conflito.min_dias || '+'
        ELSE v_conflito.min_dias || ' a ' || v_conflito.max_dias END,
      CASE WHEN v_conflito.lojas IS NULL OR v_lojas IS NULL
        THEN 'todas as lojas'
        ELSE array_to_string(ARRAY(
          SELECT unnest(v_conflito.lojas) INTERSECT SELECT unnest(v_lojas)
        ), ', ') END;
  END IF;

  IF p_regra_id IS NOT NULL THEN
    UPDATE public.collector_overdue_ranges
    SET vigente_ate = v_hoje
    WHERE id = p_regra_id;
  END IF;

  INSERT INTO public.collector_overdue_ranges (
    collector_id, min_dias, max_dias, lojas, vigente_desde, created_by
  ) VALUES (
    p_collector_id, p_min_dias, p_max_dias, v_lojas, v_hoje,
    (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.salvar_regra_carteira(uuid, uuid, integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_regra_carteira(uuid, uuid, integer, integer, text[]) TO authenticated;

-- 4. Encerrar UMA regra (vigente_ate = hoje). Idempotente.
CREATE FUNCTION public.encerrar_regra_carteira(p_regra_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem remover regras da carteira.';
  END IF;

  UPDATE public.collector_overdue_ranges
  SET vigente_ate = v_hoje
  WHERE id = p_regra_id
    AND vigente_ate IS NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.encerrar_regra_carteira(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_regra_carteira(uuid) TO authenticated;

-- 5. Loja do cliente (titulo em aberto mais atrasado) -- fonte unica no
--    banco, usada pelo plano e pelo painel "fora da faixa". Espelho no
--    front: lojaDoCliente (src/filters/priority.ts).
CREATE FUNCTION public.cliente_loja_referencia(p_documento text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT b.nome_da_loja
  FROM public."BANCO_DADOS" b
  WHERE b.documento = p_documento
    AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
    AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
  ORDER BY b.data_vencimento ASC NULLS LAST, b.nome_da_loja
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.cliente_loja_referencia(text) TO authenticated;

-- 6. clientes_fora_da_faixa: clientes de cobrador COM regra que nenhuma regra
--    dele cobre mais. faixa_min/faixa_max = a regra dele naquela loja que o
--    cliente acabou de ultrapassar (maior teto abaixo do atraso); NULL quando
--    a loja nem esta nas regras dele. Mesmas colunas de antes (o painel do
--    Resumo continua lendo igual).
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
  );
$function$;

-- 7. Plano: corpo da 0007 (copiado do repositorio, aplicado hoje), so muda
--    "regra do cobrador atual" de UMA para QUALQUER das regras dele.
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
      -- Alguma regra dele ainda cobre: fica.
      IF EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL
          AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, c.atraso, c.loja)
      ) THEN
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
