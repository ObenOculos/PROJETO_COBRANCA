-- Imputacao do pagamento de acordo: a ENTRADA abate so valor original
-- (decisao do usuario 2026-11-10: "a entrada nao pega juros e multa").
-- Demais parcelas: proporcional entre o original que sobrou e os encargos.
-- Revisa a 20261105000002 (antes a entrada tambem era proporcional).
--
-- Exemplo (OTICA FERNANDA): original 1.357,56, negociado 1.424,53, entrada
-- 500. Antes: 476,49 original + 23,51 encargos. Agora: 500 original; a 2a
-- parcela (924,53) = 857,56 original + 66,97 encargos.
--
-- registrar_pagamento_acordo: corpo de producao (pg_get_functiondef
-- 2026-11-10), muda so o calculo de v_valor_principal.

CREATE OR REPLACE FUNCTION public.registrar_pagamento_acordo(p_acordo_parcela_id uuid, p_valor_pago numeric, p_data_pagamento date, p_notes text DEFAULT NULL::text)
 RETURNS acordo_pagamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_acordo public.acordos%ROWTYPE;
  v_saldo numeric;
  v_saldo_acordo numeric;
  v_principal_total numeric;
  v_principal_cap numeric;
  v_pago_antes numeric;
  v_principal_antes numeric;
  v_principal_alvo numeric;
  v_valor_principal numeric;
  v_cumpre boolean;
  -- Entrada (parcela 1) abate so valor original (decisao 2026-11-10).
  v_eh_entrada boolean;
  v_entrada_valor numeric;
  v_entrada_principal_cap numeric;
  v_principal_entrada_antes numeric;
  v_pago_resto_antes numeric;
  v_principal_resto_antes numeric;
  v_resto_principal numeric;
  v_resto_total numeric;
  v_pagamento public.acordo_pagamentos%ROWTYPE;
  v_remaining numeric;
  v_titulo RECORD;
  v_pending numeric;
  v_to_apply numeric;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser positivo.';
  END IF;

  SELECT a.* INTO v_acordo
  FROM public.acordos a
  JOIN public.acordo_parcelas ap ON ap.acordo_id = a.id
  WHERE ap.id = p_acordo_parcela_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela de acordo não encontrada.';
  END IF;

  IF v_user_type IS DISTINCT FROM 'manager' AND v_acordo.collector_id IS DISTINCT FROM v_collector_id THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento neste acordo.';
  END IF;

  IF v_acordo.status <> 'ativo' THEN
    RAISE EXCEPTION 'Este acordo não está mais ativo (status atual: %).', v_acordo.status;
  END IF;

  v_saldo := public.saldo_acordo_parcela(p_acordo_parcela_id);
  IF p_valor_pago > v_saldo + 0.01 THEN
    RAISE EXCEPTION 'Valor informado (%) é maior que o saldo da parcela (%).', p_valor_pago, v_saldo;
  END IF;

  -- Imputacao (decisao 2026-11-10, revendo a de 2026-11-05):
  --  - ENTRADA (parcela 1): 100% valor original, ate o original do acordo;
  --  - DEMAIS parcelas: proporcional entre o original que sobrou e os
  --    encargos (multa/juros - desconto), sobre o acumulado delas.
  SELECT COALESCE(SUM(GREATEST(COALESCE(at2.saldo_no_momento, 0), 0)), 0)
    INTO v_principal_total
  FROM public.acordo_titulos at2
  WHERE at2.acordo_id = v_acordo.id;

  v_principal_cap := LEAST(v_principal_total, v_acordo.valor_negociado);

  SELECT COALESCE(SUM(pg.valor_pago), 0),
         COALESCE(SUM(COALESCE(pg.valor_principal, 0)), 0)
    INTO v_pago_antes, v_principal_antes
  FROM public.acordo_pagamentos pg
  JOIN public.acordo_parcelas ap ON ap.id = pg.acordo_parcela_id
  WHERE ap.acordo_id = v_acordo.id;

  SELECT COALESCE(SUM(public.saldo_acordo_parcela(ap.id)), 0)
    INTO v_saldo_acordo
  FROM public.acordo_parcelas ap
  WHERE ap.acordo_id = v_acordo.id;

  v_cumpre := (v_saldo_acordo - p_valor_pago) <= 0.01;

  SELECT ap.numero = 1 INTO v_eh_entrada
  FROM public.acordo_parcelas ap WHERE ap.id = p_acordo_parcela_id;

  SELECT COALESCE(MAX(ap.valor_parcela), 0) INTO v_entrada_valor
  FROM public.acordo_parcelas ap
  WHERE ap.acordo_id = v_acordo.id AND ap.numero = 1;
  v_entrada_principal_cap := LEAST(v_entrada_valor, v_principal_cap);

  SELECT COALESCE(SUM(COALESCE(pg.valor_principal, 0)) FILTER (WHERE ap.numero = 1), 0),
         COALESCE(SUM(pg.valor_pago) FILTER (WHERE ap.numero <> 1), 0),
         COALESCE(SUM(COALESCE(pg.valor_principal, 0)) FILTER (WHERE ap.numero <> 1), 0)
    INTO v_principal_entrada_antes, v_pago_resto_antes, v_principal_resto_antes
  FROM public.acordo_pagamentos pg
  JOIN public.acordo_parcelas ap ON ap.id = pg.acordo_parcela_id
  WHERE ap.acordo_id = v_acordo.id;

  IF COALESCE(v_eh_entrada, false) THEN
    -- Entrada: tudo para o valor original (ate o teto da entrada).
    v_valor_principal := GREATEST(0, LEAST(p_valor_pago,
      v_entrada_principal_cap - v_principal_entrada_antes));
  ELSE
    -- Demais: proporcao do que sobrou depois da entrada. Alvo sobre o
    -- ACUMULADO destas parcelas (evita deriva de centavos); no ultimo
    -- pagamento do acordo o alvo fecha o original inteiro.
    v_resto_principal := v_principal_cap - v_entrada_principal_cap;
    v_resto_total := v_acordo.valor_negociado - v_entrada_valor;
    v_principal_alvo := CASE
      WHEN v_cumpre THEN v_principal_cap - v_principal_entrada_antes
      WHEN v_resto_total <= 0.009 THEN v_principal_resto_antes + p_valor_pago
      ELSE round(v_resto_principal * (v_pago_resto_antes + p_valor_pago) / v_resto_total, 2)
    END;
    v_valor_principal := GREATEST(0, LEAST(p_valor_pago,
      v_principal_alvo - v_principal_resto_antes));
  END IF;

  INSERT INTO public.acordo_pagamentos (
    acordo_parcela_id, valor_pago, data_pagamento, collector_id, notes, registrado_por_id,
    valor_principal, valor_encargos
  ) VALUES (
    p_acordo_parcela_id, p_valor_pago, p_data_pagamento, v_collector_id, p_notes, v_collector_id,
    v_valor_principal, p_valor_pago - v_valor_principal
  )
  RETURNING * INTO v_pagamento;

  -- Avisa o gatilho trg_bancodados_protege_titulo_em_acordo que e a propria
  -- RPC do acordo escrevendo -- senao ela bloquearia a si mesma. E marca a
  -- origem para recebimentos_historico.
  PERFORM set_config('cobranca.permitir_pagamento_acordo', 'true', true);
  PERFORM set_config('cobranca.origem', 'acordo', true);
  PERFORM set_config('cobranca.acordo_pagamento_id', v_pagamento.id::text, true);

  -- Espelha SO a parte de valor original nos titulos (mais antigo primeiro),
  -- nunca alem do saldo de cada titulo.
  v_remaining := v_valor_principal;

  FOR v_titulo IN
    SELECT
      b.id_parcela,
      COALESCE(b.valor_original, 0) AS valor_original,
      COALESCE(b.valor_recebido, 0) AS valor_recebido,
      COALESCE(b.desconto, 0) AS desconto
    FROM public.acordo_titulos at2
    JOIN public."BANCO_DADOS" b ON b.id_parcela = at2.collection_id
    WHERE at2.acordo_id = v_acordo.id
    ORDER BY b.data_vencimento ASC NULLS LAST, b.id_parcela ASC
    FOR UPDATE OF b
  LOOP
    EXIT WHEN v_remaining <= 0.009;

    v_pending := v_titulo.valor_original - v_titulo.valor_recebido - v_titulo.desconto;
    IF v_pending > 0.009 THEN
      v_to_apply := LEAST(v_remaining, v_pending);

      UPDATE public."BANCO_DADOS"
      SET valor_recebido = round(v_titulo.valor_recebido + v_to_apply, 2),
          data_de_recebimento = p_data_pagamento,
          status = CASE
                     WHEN v_to_apply >= v_pending - 0.01 THEN 'Pago'
                     ELSE 'Pago Parcial'
                   END
      WHERE id_parcela = v_titulo.id_parcela;

      v_remaining := v_remaining - v_to_apply;
    END IF;
  END LOOP;

  -- Todas as parcelas quitadas? Acordo cumprido: saldo que restar nos titulos
  -- (negociado < original, ou saldo_no_momento divergente) e baixado como
  -- desconto concedido no acordo; cliente volta pra fila normal do perfil.
  IF NOT EXISTS (
    SELECT 1 FROM public.acordo_parcelas ap2
    WHERE ap2.acordo_id = v_acordo.id
      AND public.saldo_acordo_parcela(ap2.id) > 0.01
  ) THEN
    UPDATE public."BANCO_DADOS" b
    SET desconto = round(COALESCE(b.desconto, 0)
                         + (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)), 2),
        status = 'Pago'
    FROM public.acordo_titulos at2
    WHERE at2.acordo_id = v_acordo.id
      AND b.id_parcela = at2.collection_id
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.009;

    UPDATE public.acordos
    SET status = 'cumprido', resolved_at = now()
    WHERE id = v_acordo.id;

    UPDATE public."BANCO_DADOS"
    SET situacao = public.situacao_primaria_do_tipo(
      (SELECT type FROM public.users WHERE id = v_acordo.collector_id)
    )
    WHERE documento = v_acordo.client_document AND situacao = 'Em acordo';
  END IF;

  RETURN v_pagamento;
END;
$function$;

-- Correcao do acordo ATIVO da OTICA FERNANDA pela regra nova (pedido do
-- usuario). Fato historico nao se edita: ESTORNO da entrada como foi
-- imputada (500 = 476,49 + 23,51) e um lancamento NOVO de 500 todo em
-- valor original, ligados pela observacao. O titulo vai de 476,49 a 500.
DO $fix$
DECLARE
  v_pg public.acordo_pagamentos%ROWTYPE;
  v_estorno uuid;
  v_novo uuid;
  v_titulo bigint;
  v_aplicado numeric;
  v_pendente numeric;
BEGIN
  SELECT pg.* INTO v_pg
  FROM public.acordo_pagamentos pg
  JOIN public.acordo_parcelas ap ON ap.id = pg.acordo_parcela_id
  JOIN public.acordos a ON a.id = ap.acordo_id
  WHERE a.client_document = '02.630.279/0001-12'
    AND a.status = 'ativo'
    AND ap.numero = 1
    AND pg.estorno_de IS NULL
    AND COALESCE(pg.valor_encargos, 0) > 0.009
    AND NOT EXISTS (SELECT 1 FROM public.acordo_pagamentos e WHERE e.estorno_de = pg.id);
  IF NOT FOUND THEN
    RAISE NOTICE 'OTICA FERNANDA: nada a corrigir.';
    RETURN;
  END IF;

  PERFORM set_config('cobranca.permitir_pagamento_acordo', 'true', true);

  -- 1. Estorno da entrada como foi imputada.
  INSERT INTO public.acordo_pagamentos (
    acordo_parcela_id, valor_pago, data_pagamento, collector_id, notes,
    estorno_de, motivo, registrado_por_id, valor_principal, valor_encargos
  ) VALUES (
    v_pg.acordo_parcela_id, -v_pg.valor_pago, v_pg.data_pagamento, v_pg.collector_id,
    'Reimputacao da entrada pela regra nova (100% valor original)', v_pg.id,
    'Regra alterada em 2026-11-10: a entrada nao paga juros e multa', NULL,
    -COALESCE(v_pg.valor_principal, 0), -COALESCE(v_pg.valor_encargos, 0)
  ) RETURNING id INTO v_estorno;

  PERFORM set_config('cobranca.origem', 'acordo', true);
  PERFORM set_config('cobranca.acordo_pagamento_id', v_estorno::text, true);
  FOR v_titulo, v_aplicado IN
    SELECT h.id_parcela, SUM(COALESCE(h.recebido_depois, 0) - COALESCE(h.recebido_antes, 0))
    FROM public.recebimentos_historico h
    WHERE h.acordo_pagamento_id = v_pg.id
    GROUP BY h.id_parcela
  LOOP
    PERFORM public.estornar_valor_no_titulo(v_titulo, v_aplicado);
  END LOOP;

  -- 2. Lancamento novo: o mesmo valor, todo em valor original.
  INSERT INTO public.acordo_pagamentos (
    acordo_parcela_id, valor_pago, data_pagamento, collector_id, notes,
    registrado_por_id, valor_principal, valor_encargos
  ) VALUES (
    v_pg.acordo_parcela_id, v_pg.valor_pago, v_pg.data_pagamento, v_pg.collector_id,
    coalesce(v_pg.notes, '') || ' [relancada pela regra nova da entrada, 2026-11-10]',
    v_pg.registrado_por_id, v_pg.valor_pago, 0
  ) RETURNING id INTO v_novo;

  PERFORM set_config('cobranca.acordo_pagamento_id', v_novo::text, true);
  v_aplicado := v_pg.valor_pago;
  FOR v_titulo, v_pendente IN
    SELECT b.id_parcela,
           COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)
    FROM public.acordo_parcelas ap
    JOIN public.acordo_titulos t ON t.acordo_id = ap.acordo_id
    JOIN public."BANCO_DADOS" b ON b.id_parcela = t.collection_id
    WHERE ap.id = v_pg.acordo_parcela_id
    ORDER BY b.data_vencimento ASC NULLS LAST, b.id_parcela ASC
  LOOP
    EXIT WHEN v_aplicado <= 0.009;
    CONTINUE WHEN v_pendente <= 0.009;
    UPDATE public."BANCO_DADOS" b
    SET valor_recebido = round(COALESCE(b.valor_recebido, 0) + LEAST(v_aplicado, v_pendente), 2),
        data_de_recebimento = v_pg.data_pagamento,
        status = CASE WHEN v_aplicado >= v_pendente - 0.01 THEN 'Pago' ELSE 'Pago Parcial' END
    WHERE b.id_parcela = v_titulo;
    v_aplicado := v_aplicado - LEAST(v_aplicado, v_pendente);
  END LOOP;

  PERFORM set_config('cobranca.origem', '', true);
  PERFORM set_config('cobranca.acordo_pagamento_id', '', true);
  PERFORM set_config('cobranca.permitir_pagamento_acordo', '', true);
END;
$fix$;
