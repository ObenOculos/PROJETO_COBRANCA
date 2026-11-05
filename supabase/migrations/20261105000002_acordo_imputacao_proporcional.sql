-- Acordo: imputacao PROPORCIONAL do pagamento (decisao 2026-11-05).
--
-- Cada pagamento de acordo abate valor original e encargos (multa + juros)
-- na mesma proporcao em que eles compoem o valor negociado. So a parte de
-- valor original e espelhada nos titulos (BANCO_DADOS.valor_recebido); a parte
-- de encargos fica registrada no proprio pagamento (acordo_pagamentos).
--
-- Corrige:
--  1. registrar_pagamento_acordo em producao (corpo da 20261104000007) perdeu o
--     set_config('cobranca.permitir_pagamento_acordo') da 20261102000005 --
--     TODO pagamento de acordo falhava no trg_protege_titulo_em_acordo.
--  2. A 007 espelhava multa/juros no titulo: valor_recebido > valor_original e,
--     antes disso, o titulo zerava antes do fim do acordo -> cliente sumia da
--     carteira ativa, visitas eram canceladas e aparecia como quitado.
--     Com a regra proporcional o titulo so zera quando o acordo e cumprido.
--  3. O espelho ficava em recebimentos_historico como 'erp_ou_manual'. Agora
--     origem = 'acordo' e acordo_pagamento_id aponta o pagamento.
--
-- Arredondamento: o alvo de valor original e calculado sobre o ACUMULADO pago
-- no acordo (nao por pagamento), entao centavos nao se acumulam. No pagamento
-- que cumpre o acordo o alvo e o total de valor original. Se ainda sobrar
-- saldo em algum titulo nessa hora (valor negociado menor que o original, ou
-- saldo_no_momento divergente), ele e baixado como DESCONTO -- abatimento
-- concedido no acordo, registrado em recebimentos_historico com origem 'acordo'.
--
-- Corpos partem de pg_get_functiondef de producao em 2026-11-05.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
ALTER TABLE public.acordo_pagamentos
  ADD COLUMN IF NOT EXISTS valor_principal numeric,
  ADD COLUMN IF NOT EXISTS valor_encargos numeric;

COMMENT ON COLUMN public.acordo_pagamentos.valor_principal IS
  'Parte do pagamento imputada ao valor original dos titulos (espelhada em BANCO_DADOS.valor_recebido). NULL = pagamento anterior a regra proporcional (migration 20261105000002).';
COMMENT ON COLUMN public.acordo_pagamentos.valor_encargos IS
  'Parte do pagamento imputada a multa/juros do acordo (nao espelhada nos titulos). NULL = pagamento anterior a regra proporcional.';

ALTER TABLE public.recebimentos_historico
  ADD COLUMN IF NOT EXISTS acordo_pagamento_id uuid
    REFERENCES public.acordo_pagamentos(id);

COMMENT ON COLUMN public.recebimentos_historico.acordo_pagamento_id IS
  'Pagamento de acordo que gerou esta mudanca (origem = ''acordo'').';

ALTER TABLE public.recebimentos_historico
  DROP CONSTRAINT IF EXISTS recebimentos_historico_origem_check;
ALTER TABLE public.recebimentos_historico
  ADD CONSTRAINT recebimentos_historico_origem_check
  CHECK (origem = ANY (ARRAY['app'::text, 'erp_ou_manual'::text, 'foto_inicial'::text, 'acordo'::text]));

-- ---------------------------------------------------------------------------
-- 2. Historico de recebimentos grava o pagamento de acordo (corpo de producao
--    + acordo_pagamento_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_recebimentos_historico_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.recebimentos_historico (
    id_parcela, documento, chave_venda,
    recebido_antes, recebido_depois, desconto_antes, desconto_depois,
    data_de_recebimento, origem, sale_payment_id, cobrador_carteira_id,
    acordo_pagamento_id
  )
  SELECT
    n.id_parcela,
    n.documento,
    COALESCE(n.numero_titulo, n.venda_n, 0),
    o.valor_recebido,
    n.valor_recebido,
    o.desconto,
    n.desconto,
    n.data_de_recebimento,
    COALESCE(NULLIF(current_setting('cobranca.origem', true), ''), 'erp_ou_manual'),
    NULLIF(current_setting('cobranca.sale_payment_id', true), '')::uuid,
    n.user_id,
    NULLIF(current_setting('cobranca.acordo_pagamento_id', true), '')::uuid
  FROM novas n
  JOIN antigas o ON o.id_parcela = n.id_parcela
  WHERE COALESCE(o.valor_recebido, 0)
          IS DISTINCT FROM COALESCE(n.valor_recebido, 0)
     OR COALESCE(o.desconto, 0)
          IS DISTINCT FROM COALESCE(n.desconto, 0);

  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. registrar_pagamento_acordo com imputacao proporcional
--    (guards de producao/20261105000001 preservados)
-- ---------------------------------------------------------------------------
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

  -- Imputacao proporcional: fracao de valor original = original / negociado
  -- (limitada a 1 quando o negociado e menor que o original).
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

  -- Alvo sobre o ACUMULADO (evita deriva de centavos); no ultimo pagamento o
  -- alvo e o total de valor original.
  v_principal_alvo := CASE
    WHEN v_cumpre THEN v_principal_cap
    ELSE round(v_principal_cap * (v_pago_antes + p_valor_pago) / v_acordo.valor_negociado, 2)
  END;

  v_valor_principal := GREATEST(0, LEAST(p_valor_pago, v_principal_alvo - v_principal_antes));

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
