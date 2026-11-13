-- Renegociada na SSÓtica de parcela "Pago Parcial" COM SALDO no app ficava em
-- aberto (cobrada em dobro com as parcelas novas da renegociação).
--
-- importar_parcelas_ssotica ignorava a situação RE quando o status do app era
-- 'Pago'/'Pago Parcial', supondo que a parcela já estava fora de cobrança. Em
-- 2026-11-13 havia 29 parcelas 'Pago Parcial' com saldo (~R$ 1.650) que a
-- SSÓtica mostra como "Renegociado", com a renegociação nova já no app
-- (conferido na ficha de 23 clientes; as de Itapipoca Ext têm a renegociação
-- na loja Messejana, mesma empresa na SSÓtica).
--
-- Correção: "já fora de cobrança" passa a ser decidido pelo SALDO
-- (original - recebido - desconto <= 0,01) ou status Cancelado/Renegociado,
-- nunca pelo status Pago/Pago Parcial (regra do projeto: status diverge dos
-- valores). O resto da função é o corpo de produção (pg_get_functiondef em
-- 2026-11-13), sem outra mudança: acordo ativo, cancelado e pagamento do app
-- continuam protegidos depois deste ponto (_ign).

CREATE OR REPLACE FUNCTION public.importar_parcelas_ssotica(p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_inseridas integer := 0;
  v_atualizadas integer := 0;
  v_clientes integer := 0;
  v_enderecos integer := 0;
  v_recebidas integer := 0;
  v_reneg_fora integer := 0;
  v_renegociadas integer := 0;
  v_espelhadas integer := 0;
  v_pagos_acordo integer := 0;
  v_esp RECORD;
  v_ap_id uuid;
  v_saldo_ap numeric;
  v_aplicar numeric;
  v_ignoradas jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     AND (SELECT public.app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem importar o contas a receber.';
  END IF;

  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'p_linhas deve ser um array JSON.';
  END IF;

  -- Recebimentos gravados aqui ficam com origem própria no histórico.
  PERFORM set_config('cobranca.origem', 'ssotica', true);

  -- Mais de uma chamada na mesma transação (testes, lotes): as temporárias
  -- da chamada anterior ainda existem.
  DROP TABLE IF EXISTS _imp, _ign, _upd, _esp;

  CREATE TEMP TABLE _imp ON COMMIT DROP AS
  WITH bruto AS (
    SELECT DISTINCT ON ((e->>'id_parcela')::bigint)
           (e->>'id_parcela')::bigint                       AS id_parcela,
           NULLIF(trim(e->>'status'), '')                   AS status,
           NULLIF(trim(e->>'nome_da_loja'), '')             AS nome_da_loja,
           NULLIF(e->>'data_lancamento', '')::date          AS data_lancamento,
           NULLIF(e->>'data_vencimento', '')::date          AS data_vencimento,
           NULLIF(e->>'data_de_recebimento', '')::date      AS data_de_recebimento,
           round(NULLIF(e->>'valor_original', '')::numeric, 2) AS valor_original,
           round(NULLIF(e->>'valor_recebido', '')::numeric, 2) AS valor_recebido_ss,
           NULLIF(trim(e->>'tipo_de_cobranca'), '')         AS tipo_de_cobranca,
           NULLIF(e->>'numero_titulo', '')::bigint          AS numero_titulo,
           NULLIF(e->>'parcela', '')::bigint                AS parcela,
           NULLIF(trim(e->>'cliente'), '')                  AS cliente,
           NULLIF(trim(e->>'documento'), '')                AS documento,
           NULLIF(trim(e->>'endereco'), '')                 AS endereco,
           NULLIF(trim(e->>'numero'), '')                   AS numero,
           NULLIF(trim(e->>'bairro'), '')                   AS bairro,
           NULLIF(trim(e->>'complemento'), '')              AS complemento,
           NULLIF(trim(e->>'cep'), '')                      AS cep,
           NULLIF(trim(e->>'cidade'), '')                   AS cidade,
           NULLIF(trim(e->>'estado'), '')                   AS estado,
           NULLIF(trim(e->>'obs'), '')                      AS obs,
           NULLIF(trim(e->>'codigo_externo'), '')           AS codigo_externo,
           NULLIF(trim(e->>'descricao'), '')                AS descricao,
           NULLIF(e->>'venda_n', '')::bigint                AS venda_n,
           NULLIF(trim(e->>'convenio'), '')                 AS convenio,
           NULLIF(trim(e->>'apelido'), '')                  AS apelido,
           NULLIF(trim(e->>'telefone'), '')                 AS telefone,
           NULLIF(trim(e->>'celular'), '')                  AS celular,
           NULLIF(trim(e->>'celular1'), '')                 AS celular1,
           NULLIF(trim(e->>'celular2'), '')                 AS celular2,
           NULLIF(trim(e->>'email'), '')                    AS email
    FROM jsonb_array_elements(p_linhas) e
    WHERE NULLIF(e->>'id_parcela', '') IS NOT NULL
    ORDER BY (e->>'id_parcela')::bigint
  )
  SELECT b.*,
         CASE WHEN b.status = 'Pago' THEN b.valor_original
              ELSE b.valor_recebido_ss END                  AS valor_recebido,
         CASE WHEN b.status = 'Pago Parcial'
              THEN round(b.valor_original - COALESCE(b.valor_recebido_ss, 0), 2)
         END                                                AS desconto,
         x.id_parcela IS NOT NULL                           AS existe
  FROM bruto b
  LEFT JOIN public."BANCO_DADOS" x ON x.id_parcela = b.id_parcela;

  CREATE TEMP TABLE _ign (id_parcela bigint, motivo text) ON COMMIT DROP;

  INSERT INTO _ign
  SELECT id_parcela, 'status_desconhecido'
  FROM _imp
  WHERE status IS NULL OR status NOT IN ('Pago', 'Pago Parcial', 'Em atraso', 'A vencer', 'Renegociado');
  DELETE FROM _imp WHERE id_parcela IN (SELECT id_parcela FROM _ign);

  -- Renegociada que nunca entrou no app (ou já fora de cobrança lá): não é
  -- assunto do app. Só conta.
  SELECT count(*) INTO v_reneg_fora
  FROM _imp i
  LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = i.id_parcela
  WHERE i.status = 'Renegociado'
    AND (b.id_parcela IS NULL
         OR (lower(trim(COALESCE(b.status, ''))) IN ('cancelado', 'renegociado')
              OR round(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
                       - COALESCE(b.desconto, 0), 2) <= 0.01));
  DELETE FROM _imp i
  WHERE i.status = 'Renegociado'
    AND (NOT i.existe
         OR EXISTS (SELECT 1 FROM public."BANCO_DADOS" b
                    WHERE b.id_parcela = i.id_parcela
                      AND (lower(trim(COALESCE(b.status, ''))) IN ('cancelado', 'renegociado')
              OR round(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0)
                       - COALESCE(b.desconto, 0), 2) <= 0.01)));

  -- Acordo do app lançado na SSÓtica (migration 20261112000003): as parcelas
  -- novas de "Renegociação" de cliente com acordo ATIVO, lançadas no dia do
  -- acordo ou depois, são o próprio acordo na loja -> vão para o espelho
  -- ssotica_acordo_parcelas (parcela N da SSÓtica = parcela N do acordo), não
  -- para BANCO_DADOS. Parcela já ligada antes nunca entra como dívida, nem
  -- depois que o acordo termina (senão o recebido contaria duas vezes).
  CREATE TEMP TABLE _esp ON COMMIT DROP AS
  SELECT i.id_parcela,
         COALESCE(s.acordo_id, novo.acordo_id) AS acordo_id,
         i.parcela::integer AS numero,
         i.documento, i.nome_da_loja, i.data_lancamento, i.data_vencimento,
         i.valor_original AS valor, i.status,
         CASE WHEN i.status = 'Pago' AND i.valor_recebido_ss IS NULL THEN COALESCE(i.valor_original, 0)
              ELSE COALESCE(i.valor_recebido_ss, 0) END AS valor_recebido,
         i.data_de_recebimento
  FROM _imp i
  LEFT JOIN public.ssotica_acordo_parcelas s ON s.id_parcela = i.id_parcela
  LEFT JOIN LATERAL (
    SELECT ac.id AS acordo_id
    FROM public.acordos ac
    WHERE ac.client_document = i.documento
      AND ac.status = 'ativo'
      AND i.data_lancamento >= (ac.created_at AT TIME ZONE 'America/Sao_Paulo')::date
    ORDER BY ac.created_at DESC
    LIMIT 1
  ) novo ON s.id_parcela IS NULL AND i.descricao ILIKE 'renegocia%' AND i.documento IS NOT NULL
  WHERE NOT i.existe
    AND i.parcela IS NOT NULL
    AND (s.id_parcela IS NOT NULL OR novo.acordo_id IS NOT NULL);

  INSERT INTO public.ssotica_acordo_parcelas AS s (
    id_parcela, acordo_id, numero, documento, nome_da_loja, data_lancamento,
    data_vencimento, valor, status, valor_recebido, data_recebimento
  )
  SELECT id_parcela, acordo_id, numero, documento, nome_da_loja, data_lancamento,
         data_vencimento, valor, status, valor_recebido, data_de_recebimento
  FROM _esp
  ON CONFLICT (id_parcela) DO UPDATE
  SET data_vencimento  = EXCLUDED.data_vencimento,
      valor            = EXCLUDED.valor,
      status           = EXCLUDED.status,
      valor_recebido   = EXCLUDED.valor_recebido,
      data_recebimento = EXCLUDED.data_recebimento,
      atualizado_em    = now()
  WHERE (s.data_vencimento, s.valor, s.status, s.valor_recebido, s.data_recebimento)
        IS DISTINCT FROM
        (EXCLUDED.data_vencimento, EXCLUDED.valor, EXCLUDED.status, EXCLUDED.valor_recebido, EXCLUDED.data_recebimento);
  SELECT count(*) INTO v_espelhadas FROM _esp;
  DELETE FROM _imp WHERE id_parcela IN (SELECT id_parcela FROM _esp);

  -- Renegociação de cliente com acordo ativo que NÃO casou acima (lançada
  -- antes do acordo): não entra como dívida avulsa; vai para conferência.
  INSERT INTO _ign
  SELECT i.id_parcela, 'renegociacao_de_acordo'
  FROM _imp i
  WHERE NOT i.existe
    AND i.descricao ILIKE 'renegocia%'
    AND i.documento IS NOT NULL
    AND public.cliente_tem_acordo_ativo(i.documento);
  DELETE FROM _imp WHERE id_parcela IN (SELECT id_parcela FROM _ign WHERE motivo = 'renegociacao_de_acordo');

  -- ------------------------------------------------------------------ novas
  -- Cadastro antes da parcela (FK fk_banco_dados_documento). Primeira linha
  -- de cada documento vence. Cliente já cadastrado não é tocado.
  INSERT INTO public.clientes (nome, documento, apelido, telefone, celular, celular1, celular2, email)
  SELECT DISTINCT ON (i.documento)
         COALESCE(i.cliente, 'Cliente sem nome'), i.documento,
         i.apelido, i.telefone, i.celular, i.celular1, i.celular2, i.email
  FROM _imp i
  WHERE NOT i.existe
    AND i.documento IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.documento = i.documento)
  ORDER BY i.documento, i.id_parcela;
  GET DIAGNOSTICS v_clientes = ROW_COUNT;

  INSERT INTO public."BANCO_DADOS" (
    id_parcela, nome_da_loja, data_lancamento, data_vencimento, valor_original,
    valor_recebido, data_de_recebimento, desconto, tipo_de_cobranca,
    numero_titulo, parcela, status, cliente, documento, endereco, numero,
    bairro, complemento, cep, cidade, estado, obs, codigo_externo, descricao,
    venda_n, convenio
  )
  SELECT id_parcela, nome_da_loja, data_lancamento, data_vencimento, valor_original,
         valor_recebido, data_de_recebimento, desconto, tipo_de_cobranca,
         numero_titulo, parcela, status, cliente, documento, endereco, numero,
         bairro, complemento, cep, cidade, estado, obs, codigo_externo, descricao,
         venda_n, convenio
  FROM _imp
  WHERE NOT existe
  ORDER BY id_parcela
  ON CONFLICT (id_parcela) DO NOTHING;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;

  -- 1º endereço de quem ainda não tem histórico.
  INSERT INTO public.enderecos_historico (cliente_documento, logradouro, numero, bairro, cep, cidade, estado, complemento)
  SELECT DISTINCT ON (i.documento)
         i.documento, i.endereco, i.numero, i.bairro, i.cep, i.cidade, i.estado, i.complemento
  FROM _imp i
  WHERE NOT i.existe
    AND i.documento IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.enderecos_historico h WHERE h.cliente_documento = i.documento)
  ORDER BY i.documento, i.id_parcela;
  GET DIAGNOSTICS v_enderecos = ROW_COUNT;

  -- ------------------------------------------------------------- existentes
  -- Novo valor de cada campo (vazio da SSÓtica não apaga data/valor original).
  CREATE TEMP TABLE _upd ON COMMIT DROP AS
  SELECT b.id_parcela,
         b.status                                         AS status_app,
         b.valor_recebido                                 AS recebido_app,
         i.status,
         CASE WHEN i.status = 'Renegociado' THEN b.valor_original
              ELSE COALESCE(i.valor_original, b.valor_original) END AS valor_original,
         CASE WHEN i.status = 'Renegociado' THEN b.valor_recebido
              ELSE i.valor_recebido END                   AS valor_recebido,
         CASE WHEN i.status = 'Renegociado'
              THEN round(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0), 2)
              ELSE i.desconto END                         AS desconto,
         COALESCE(i.data_vencimento, b.data_vencimento)   AS data_vencimento,
         COALESCE(i.data_de_recebimento, b.data_de_recebimento) AS data_de_recebimento
  FROM _imp i
  JOIN public."BANCO_DADOS" b ON b.id_parcela = i.id_parcela
  WHERE i.existe
    AND (   b.status              IS DISTINCT FROM i.status
         OR (i.status <> 'Renegociado' AND (
                b.valor_original  IS DISTINCT FROM COALESCE(i.valor_original, b.valor_original)
             OR b.valor_recebido  IS DISTINCT FROM i.valor_recebido
             OR b.desconto        IS DISTINCT FROM i.desconto))
         OR b.data_vencimento     IS DISTINCT FROM COALESCE(i.data_vencimento, b.data_vencimento)
         OR b.data_de_recebimento IS DISTINCT FROM COALESCE(i.data_de_recebimento, b.data_de_recebimento)
         OR b.valor_reajustado IS NOT NULL OR b.multa IS NOT NULL OR b.juros_por_dia IS NOT NULL
         OR b.multa_aplicada IS NOT NULL OR b.juros_aplicado IS NOT NULL);

  INSERT INTO _ign
  SELECT u.id_parcela, 'cancelado_no_app'
  FROM _upd u
  WHERE lower(trim(COALESCE(u.status_app, ''))) = 'cancelado';

  INSERT INTO _ign
  SELECT u.id_parcela, 'acordo_ativo'
  FROM _upd u
  WHERE u.id_parcela NOT IN (SELECT id_parcela FROM _ign)
    AND public.titulo_em_acordo_ativo(u.id_parcela);

  INSERT INTO _ign
  SELECT u.id_parcela, 'pago_no_app'
  FROM _upd u
  WHERE u.id_parcela NOT IN (SELECT id_parcela FROM _ign)
    AND (   COALESCE(u.valor_recebido, 0) < COALESCE(u.recebido_app, 0)
         OR (u.status_app IN ('Pago', 'Pago Parcial') AND u.status IN ('Em atraso', 'A vencer'))
         OR (u.status = 'Renegociado' AND COALESCE(u.recebido_app, 0) > 0))
    AND (SELECT h.origem
         FROM public.recebimentos_historico h
         WHERE h.id_parcela = u.id_parcela
         ORDER BY h.registrado_em DESC, h.id DESC
         LIMIT 1) IN ('app', 'acordo');

  UPDATE public."BANCO_DADOS" b
  SET status              = u.status,
      valor_original      = u.valor_original,
      valor_recebido      = u.valor_recebido,
      desconto            = u.desconto,
      data_vencimento     = u.data_vencimento,
      data_de_recebimento = u.data_de_recebimento,
      valor_reajustado    = NULL,
      multa               = NULL,
      juros_por_dia       = NULL,
      multa_aplicada      = NULL,
      juros_aplicado      = NULL
  FROM _upd u
  WHERE b.id_parcela = u.id_parcela
    AND u.id_parcela NOT IN (SELECT id_parcela FROM _ign);
  GET DIAGNOSTICS v_atualizadas = ROW_COUNT;

  SELECT count(*) FILTER (WHERE u.status IN ('Pago', 'Pago Parcial')),
         count(*) FILTER (WHERE u.status = 'Renegociado')
  INTO v_recebidas, v_renegociadas
  FROM _upd u
  WHERE u.id_parcela NOT IN (SELECT id_parcela FROM _ign)
    AND u.status_app IS DISTINCT FROM u.status;

  -- ------------------------------------------------- pagamentos do acordo
  -- Parcela da renegociação paga na SSÓtica -> baixa na parcela de mesmo
  -- número do acordo do app (mesma imputação do pagamento pela tela), até o
  -- saldo dela: o que o app já recebeu (ex.: entrada via Pix) não duplica.
  -- recebido_espelhado guarda o que já foi tratado (idempotente). Recebido
  -- menor que o já tratado = estorno na loja: não desfaz sozinho, vai para
  -- conferência. Fica por último: registrar_pagamento_acordo_interno troca a
  -- origem do histórico para 'acordo' e libera a trava do título em acordo.
  FOR v_esp IN
    SELECT s.id_parcela, s.acordo_id, s.numero, s.nome_da_loja,
           s.valor_recebido, s.recebido_espelhado, s.data_recebimento,
           ac.collector_id
    FROM public.ssotica_acordo_parcelas s
    JOIN public.acordos ac ON ac.id = s.acordo_id
    WHERE s.id_parcela IN (SELECT id_parcela FROM _esp)
      AND abs(s.valor_recebido - s.recebido_espelhado) > 0.009
    ORDER BY s.acordo_id, s.numero
  LOOP
    IF v_esp.valor_recebido < v_esp.recebido_espelhado THEN
      INSERT INTO _ign VALUES (v_esp.id_parcela, 'estorno_ssotica_acordo');
      CONTINUE;
    END IF;
    -- Acordo terminou (cumprido/quebrado/cancelado), inclusive no meio deste laço.
    IF (SELECT ac.status FROM public.acordos ac WHERE ac.id = v_esp.acordo_id) <> 'ativo' THEN
      CONTINUE;
    END IF;
    v_ap_id := NULL;
    SELECT ap.id INTO v_ap_id
    FROM public.acordo_parcelas ap
    WHERE ap.acordo_id = v_esp.acordo_id AND ap.numero = v_esp.numero;
    IF v_ap_id IS NULL THEN
      INSERT INTO _ign VALUES (v_esp.id_parcela, 'parcela_sem_par_no_acordo');
      CONTINUE;
    END IF;
    v_saldo_ap := public.saldo_acordo_parcela(v_ap_id);
    v_aplicar := round(LEAST(v_esp.valor_recebido - v_esp.recebido_espelhado, v_saldo_ap), 2);
    IF v_aplicar > 0.009 THEN
      PERFORM public.registrar_pagamento_acordo_interno(
        v_ap_id, v_aplicar,
        COALESCE(v_esp.data_recebimento, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
        format('SSÓtica: parcela %s da renegociação paga na loja (%s).', v_esp.numero, v_esp.nome_da_loja),
        v_esp.collector_id, NULL
      );
      v_pagos_acordo := v_pagos_acordo + 1;
    END IF;
    UPDATE public.ssotica_acordo_parcelas
    SET recebido_espelhado = valor_recebido, atualizado_em = now()
    WHERE id_parcela = v_esp.id_parcela;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id_parcela', id_parcela, 'motivo', motivo) ORDER BY motivo, id_parcela), '[]'::jsonb)
  INTO v_ignoradas
  FROM _ign;

  RETURN jsonb_build_object(
    'recebidas', (SELECT count(*) FROM _imp) + v_reneg_fora + v_espelhadas
                 + (SELECT count(*) FROM _ign WHERE motivo IN ('status_desconhecido', 'renegociacao_de_acordo')),
    'inseridas', v_inseridas,
    'atualizadas', v_atualizadas,
    'quitadas', v_recebidas,
    'renegociadas', v_renegociadas,
    'renegociadas_fora_do_app', v_reneg_fora,
    'clientes_novos', v_clientes,
    'enderecos_novos', v_enderecos,
    'parcelas_acordo_ssotica', v_espelhadas,
    'pagamentos_acordo', v_pagos_acordo,
    'ignoradas', v_ignoradas
  );
END;
$function$;
