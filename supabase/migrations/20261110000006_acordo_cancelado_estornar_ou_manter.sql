-- Cancelar acordo com pagamento: quem cancela escolhe ESTORNAR ou MANTER
-- (decisao do usuario 2026-11-10, revendo a 20261110000005).
--
-- Problema: acordo cancelado por erro de lancamento e refeito em seguida --
-- o cobrador digita a entrada de novo no acordo novo e o dinheiro contaria
-- duas vezes (no cancelado e no novo). Caso real: OTICA FERNANDA (entrada
-- de R$ 500 no acordo cancelado; a 0005 ainda abateu os R$ 23,51 de juros).
--
--  - estornar: para cada pagamento do acordo, um registro de ESTORNO ligado
--    a ele (acordo_pagamentos.estorno_de, valores negativos, motivo); os
--    titulos voltam ao saldo de antes (o que o acordo espelhou e o que a
--    0005 reimputou). Nada e apagado: o historico mostra entrada e estorno.
--  - manter: como a 0005 (os juros ja pagos tambem abatem).
-- acordos.destino_pagamentos guarda a escolha.
--
-- Ajuste do caso real no fim: estorno da entrada da OTICA FERNANDA.

ALTER TABLE public.acordos
  ADD COLUMN destino_pagamentos text
  CHECK (destino_pagamentos IN ('estornar', 'manter'));
COMMENT ON COLUMN public.acordos.destino_pagamentos IS
  'Acordo cancelado com pagamento: estornar (sera refeito/nao aconteceu) ou manter (cliente pagou e desistiu).';

-- Tira `p_valor` do recebido do titulo (nunca abaixo de zero) e recalcula
-- status/data de recebimento. Uso interno.
CREATE OR REPLACE FUNCTION public.estornar_valor_no_titulo(p_id_parcela bigint, p_valor numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_novo numeric;
BEGIN
  IF COALESCE(p_valor, 0) <= 0.009 THEN
    RETURN;
  END IF;
  SELECT GREATEST(0, round(COALESCE(b.valor_recebido, 0) - p_valor, 2))
    INTO v_novo
  FROM public."BANCO_DADOS" b
  WHERE b.id_parcela = p_id_parcela
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE public."BANCO_DADOS" b
  SET valor_recebido = v_novo,
      data_de_recebimento = CASE WHEN v_novo <= 0.009 THEN NULL ELSE b.data_de_recebimento END,
      status = CASE
        WHEN v_novo + COALESCE(b.desconto, 0) >= COALESCE(b.valor_original, 0) - 0.009 THEN 'Pago'
        WHEN v_novo > 0.009 THEN 'Pago Parcial'
        WHEN b.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'em_atraso'
        ELSE 'pendente'
      END
  WHERE b.id_parcela = p_id_parcela;
END;
$function$;

-- Uso interno (cancelar_acordo e o ajuste abaixo). Idempotente: pagamento
-- que ja tem estorno nao e estornado de novo.
CREATE OR REPLACE FUNCTION public.estornar_pagamentos_acordo_cancelado(
  p_acordo_id uuid,
  p_motivo text
)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acordo public.acordos%ROWTYPE;
  v_autor uuid := (SELECT app_current_user_id());
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_pg RECORD;
  v_estorno_id uuid;
  v_linha RECORD;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND OR v_acordo.status <> 'cancelado' THEN
    RETURN 0;
  END IF;

  PERFORM set_config('cobranca.permitir_pagamento_acordo', 'true', true);

  FOR v_pg IN
    SELECT pg.*
    FROM public.acordo_pagamentos pg
    JOIN public.acordo_parcelas ap ON ap.id = pg.acordo_parcela_id
    WHERE ap.acordo_id = p_acordo_id
      AND pg.estorno_de IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.acordo_pagamentos e WHERE e.estorno_de = pg.id
      )
    ORDER BY pg.created_at
  LOOP
    INSERT INTO public.acordo_pagamentos (
      acordo_parcela_id, valor_pago, data_pagamento, collector_id, notes,
      estorno_de, motivo, registrado_por_id, valor_principal, valor_encargos
    ) VALUES (
      v_pg.acordo_parcela_id, -v_pg.valor_pago, v_hoje, v_pg.collector_id,
      'Estorno no cancelamento do acordo', v_pg.id, p_motivo, v_autor,
      -COALESCE(v_pg.valor_principal, 0), -COALESCE(v_pg.valor_encargos, 0)
    )
    RETURNING id INTO v_estorno_id;

    -- Desfaz nos titulos exatamente o que este pagamento espelhou.
    PERFORM set_config('cobranca.origem', 'acordo', true);
    PERFORM set_config('cobranca.acordo_pagamento_id', v_estorno_id::text, true);
    FOR v_linha IN
      SELECT h.id_parcela,
             SUM(COALESCE(h.recebido_depois, 0) - COALESCE(h.recebido_antes, 0)) AS delta
      FROM public.recebimentos_historico h
      WHERE h.acordo_pagamento_id = v_pg.id
      GROUP BY h.id_parcela
    LOOP
      PERFORM public.estornar_valor_no_titulo(v_linha.id_parcela, v_linha.delta);
    END LOOP;

    v_total := v_total + v_pg.valor_pago;
  END LOOP;

  -- Juros reimputados pela 0005 (so aconteceu no acordo da OTICA FERNANDA):
  -- desfaz as linhas 'acordo_cancelado' dos titulos deste acordo.
  IF COALESCE(v_acordo.encargos_reimputados, 0) > 0 THEN
    PERFORM set_config('cobranca.origem', 'acordo_cancelado', true);
    PERFORM set_config('cobranca.acordo_pagamento_id', '', true);
    FOR v_linha IN
      SELECT h.id_parcela,
             SUM(COALESCE(h.recebido_depois, 0) - COALESCE(h.recebido_antes, 0)) AS delta
      FROM public.recebimentos_historico h
      JOIN public.acordo_titulos t
        ON t.collection_id = h.id_parcela AND t.acordo_id = p_acordo_id
      WHERE h.origem = 'acordo_cancelado'
        AND h.registrado_em >= v_acordo.resolved_at
      GROUP BY h.id_parcela
    LOOP
      PERFORM public.estornar_valor_no_titulo(v_linha.id_parcela, v_linha.delta);
    END LOOP;
    UPDATE public.acordos SET encargos_reimputados = 0 WHERE id = p_acordo_id;
  END IF;

  PERFORM set_config('cobranca.origem', '', true);
  PERFORM set_config('cobranca.acordo_pagamento_id', '', true);
  PERFORM set_config('cobranca.permitir_pagamento_acordo', '', true);

  UPDATE public.acordos SET destino_pagamentos = 'estornar' WHERE id = p_acordo_id;
  RETURN round(v_total, 2);
END;
$function$;

REVOKE ALL ON FUNCTION public.estornar_valor_no_titulo(bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_valor_no_titulo(bigint, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.estornar_pagamentos_acordo_cancelado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pagamentos_acordo_cancelado(uuid, text) TO service_role;

-- cancelar_acordo: corpo da 20261110000005 (o de producao) + o destino dos
-- pagamentos. A assinatura muda: DROP + CREATE e GRANT explicito.
DROP FUNCTION public.cancelar_acordo(uuid, text);

CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid, p_motivo text, p_destino_pagamentos text DEFAULT NULL::text)
 RETURNS acordos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_acordo public.acordos%ROWTYPE;
  v_pago numeric;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório para cancelar um acordo.';
  END IF;

  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo não encontrado.';
  END IF;

  IF v_user_type IS DISTINCT FROM 'manager' AND v_acordo.collector_id IS DISTINCT FROM v_collector_id THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este acordo.';
  END IF;

  IF v_acordo.status <> 'ativo' THEN
    RAISE EXCEPTION 'Este acordo não está mais ativo (status atual: %).', v_acordo.status;
  END IF;

  -- Com pagamento registrado, quem cancela decide o destino dele.
  SELECT COALESCE(SUM(pg.valor_pago), 0) INTO v_pago
  FROM public.acordo_pagamentos pg
  JOIN public.acordo_parcelas ap ON ap.id = pg.acordo_parcela_id
  WHERE ap.acordo_id = p_acordo_id;

  IF v_pago > 0.009 THEN
    IF p_destino_pagamentos IS NULL OR p_destino_pagamentos NOT IN ('estornar', 'manter') THEN
      RAISE EXCEPTION 'Este acordo tem pagamento registrado: informe se os pagamentos serão estornados ou mantidos.';
    END IF;
  END IF;

  UPDATE public.acordos
  SET status = 'cancelado', motivo_cancelamento = p_motivo, resolved_at = now(),
      destino_pagamentos = CASE WHEN v_pago > 0.009 THEN p_destino_pagamentos END
  WHERE id = p_acordo_id
  RETURNING * INTO v_acordo;

  UPDATE public."BANCO_DADOS"
  SET situacao = public.situacao_primaria_do_tipo(
    (SELECT type FROM public.users WHERE id = v_acordo.collector_id)
  )
  WHERE documento = v_acordo.client_document AND situacao = 'Em acordo';

  -- Destino dos pagamentos (decisao 2026-11-10):
  --  estornar -> o acordo sera refeito / o pagamento nao aconteceu: estorno
  --              ligado a cada pagamento e titulos de volta ao saldo;
  --  manter   -> o cliente pagou e desistiu: os encargos ja pagos tambem
  --              abatem a divida (reimputar_encargos_acordo_cancelado).
  IF v_pago > 0.009 AND p_destino_pagamentos = 'estornar' THEN
    PERFORM public.estornar_pagamentos_acordo_cancelado(p_acordo_id, p_motivo);
  ELSE
    PERFORM public.reimputar_encargos_acordo_cancelado(p_acordo_id);
  END IF;
  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id;

  RETURN v_acordo;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_acordo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_acordo(uuid, text, text) TO authenticated, service_role;

-- Ajuste do caso real (pedido do usuario 2026-11-10): OTICA FERNANDA -- o
-- acordo foi cancelado por erro de lancamento e sera refeito; a entrada sai.
SELECT public.estornar_pagamentos_acordo_cancelado(
  a.id,
  'Acordo cancelado por erro de lançamento — será refeito (ajuste 2026-11-10)'
)
FROM public.acordos a
WHERE a.client_document = '02.630.279/0001-12'
  AND a.status = 'cancelado'
  AND a.destino_pagamentos IS NULL;
