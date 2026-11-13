-- Item 62 -- Correcao de pagamento refeita: o gestor estorna (total ou parte)
-- um pagamento registrado no app, com motivo. Substitui o "Editar pagamentos"
-- antigo, que redistribuia o recebido da venda a partir da parcela 1, punha a
-- data de hoje nas parcelas e pedia token ate ao proprio gestor.
--
-- Regras:
-- * So gestor (guard IS DISTINCT FROM 'manager'); motivo obrigatorio.
-- * Fato historico: o pagamento original nao muda; o estorno e um registro
--   novo em sale_payments (valor negativo, estorno_de = original), como no
--   estorno de registrar_ajuste_recebimento.
-- * Parcelas: desfaz SO o que este pagamento aplicou, pelo historico
--   (recebimentos_historico com sale_payment_id do original, liquido do que
--   estornos anteriores ja desfizeram), da ultima parcela aplicada para a
--   primeira, sem passar do recebido atual da parcela. Pagamento sem
--   historico (anterior ao historico) so ganha o registro do estorno.
-- * Nao trava o sistema: nada marca a parcela; a proxima sincronizacao do ERP
--   ou das lojas continua valendo por cima (o ERP e a fonte da baixa).
-- * As mudancas de parcela entram no historico com origem 'estorno' e
--   sale_payment_id = o registro do estorno.
-- * Desconto (decisao do usuario, 2026-11-13): o estorno que zera o pagamento
--   (total) desfaz tambem o desconto que ele aplicou nas parcelas (pelo
--   historico) e leva discount_amount negativo, para os relatorios nao
--   seguirem contando o desconto; estorno parcial mantem o desconto.

ALTER TABLE public.recebimentos_historico
  DROP CONSTRAINT IF EXISTS recebimentos_historico_origem_check;
ALTER TABLE public.recebimentos_historico
  ADD CONSTRAINT recebimentos_historico_origem_check
  CHECK (origem = ANY (ARRAY[
    'app', 'erp_ou_manual', 'foto_inicial', 'acordo', 'acordo_cancelado',
    'ssotica', 'estorno'
  ]));

CREATE OR REPLACE FUNCTION public.estornar_pagamento(
  p_pagamento uuid,
  p_valor numeric,
  p_motivo text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id   uuid := (SELECT app_current_user_id());
  v_usuario_nome text;
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_original     public.sale_payments%ROWTYPE;
  v_ja_estornado numeric;
  v_disponivel   numeric;
  v_valor        numeric := round(COALESCE(p_valor, 0), 2);
  v_estorno_id   uuid;
  v_resto        numeric;
  v_revertido    numeric := 0;
  v_parcelas     integer := 0;
  r              record;
  v_tirar        numeric;
  v_novo         numeric;
  v_total        boolean;
  v_desc_rev     numeric := 0;
  v_desc_novo    numeric;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da correção.';
  END IF;
  IF v_valor < 0.01 THEN
    RAISE EXCEPTION 'Informe o valor a estornar.';
  END IF;

  SELECT * INTO v_original
  FROM public.sale_payments
  WHERE id = p_pagamento
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;
  IF v_original.payment_amount <= 0 OR v_original.estorno_de IS NOT NULL
     OR COALESCE(v_original.payment_method, '') ~* '^(ajuste|estorno)' THEN
    RAISE EXCEPTION 'Só é possível estornar um pagamento registrado no app.';
  END IF;

  SELECT COALESCE(-SUM(payment_amount), 0) INTO v_ja_estornado
  FROM public.sale_payments
  WHERE estorno_de = v_original.id;
  v_disponivel := round(v_original.payment_amount - v_ja_estornado, 2);
  IF v_valor > v_disponivel THEN
    RAISE EXCEPTION 'O valor passa do que resta deste pagamento (R$ %).',
      to_char(v_disponivel, 'FM999G999G990D00');
  END IF;

  v_total := v_disponivel - v_valor < 0.01;

  SELECT name INTO v_usuario_nome FROM public.users WHERE id = v_usuario_id;

  INSERT INTO public.sale_payments (
    sale_number, client_document, client_name, payment_amount, payment_date,
    payment_method, notes, collector_id, collector_name, estorno_de, motivo,
    registrado_por_id, discount_amount
  ) VALUES (
    v_original.sale_number, v_original.client_document,
    v_original.client_name, -v_valor, v_hoje, 'Estorno',
    'Estorno do pagamento de ' || to_char(v_original.payment_date, 'DD/MM/YYYY')
      || COALESCE(' registrado por ' || v_usuario_nome, ''),
    v_original.collector_id, v_original.collector_name, v_original.id,
    trim(p_motivo), v_usuario_id,
    CASE WHEN v_total AND COALESCE(v_original.discount_amount, 0) > 0
         THEN -v_original.discount_amount ELSE 0 END
  )
  RETURNING id INTO v_estorno_id;

  PERFORM set_config('cobranca.origem', 'estorno', true);
  PERFORM set_config('cobranca.sale_payment_id', v_estorno_id::text, true);

  -- O que o pagamento aplicou em cada parcela, menos o que estornos
  -- anteriores dele ja desfizeram; ultima parcela aplicada primeiro.
  v_resto := v_valor;
  FOR r IN
    WITH mov AS (
      SELECT h.id_parcela,
             COALESCE(h.recebido_depois, 0) - COALESCE(h.recebido_antes, 0) AS delta,
             h.id
      FROM public.recebimentos_historico h
      WHERE h.sale_payment_id = v_original.id
         OR h.sale_payment_id IN (
              SELECT e.id FROM public.sale_payments e
              WHERE e.estorno_de = v_original.id AND e.id <> v_estorno_id)
    )
    SELECT m.id_parcela, sum(m.delta) AS liquido, max(m.id) AS ordem
    FROM mov m
    GROUP BY m.id_parcela
    HAVING sum(m.delta) > 0.009
    ORDER BY max(m.id) DESC
  LOOP
    EXIT WHEN v_resto < 0.01;
    -- Parcela que entrou em acordo depois: o acordo manda nela (o trigger de
    -- protecao recusaria a mudanca); fica so o registro do estorno.
    CONTINUE WHEN public.titulo_em_acordo_ativo(r.id_parcela);
    SELECT COALESCE(valor_recebido, 0) INTO v_novo
    FROM public."BANCO_DADOS"
    WHERE id_parcela = r.id_parcela
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    v_tirar := round(LEAST(v_resto, r.liquido, v_novo), 2);
    CONTINUE WHEN v_tirar < 0.01;
    v_novo := round(v_novo - v_tirar, 2);

    UPDATE public."BANCO_DADOS"
    SET valor_recebido = v_novo,
        data_de_recebimento = CASE WHEN v_novo < 0.01 THEN NULL
                                   ELSE data_de_recebimento END,
        status = CASE
          WHEN COALESCE(valor_original, 0) - v_novo - COALESCE(desconto, 0) <= 0.01
            THEN 'Pago'
          WHEN v_novo + COALESCE(desconto, 0) > 0 THEN 'Pago Parcial'
          WHEN data_vencimento < v_hoje THEN 'Em atraso'
          ELSE 'A vencer'
        END
    WHERE id_parcela = r.id_parcela;

    v_resto := round(v_resto - v_tirar, 2);
    v_revertido := v_revertido + v_tirar;
    v_parcelas := v_parcelas + 1;
  END LOOP;

  -- Estorno total: desfaz o desconto que o pagamento aplicou (liquido por
  -- parcela no historico), sem passar do desconto atual da parcela.
  IF v_total THEN
    FOR r IN
      SELECT h.id_parcela,
             sum(COALESCE(h.desconto_depois, 0) - COALESCE(h.desconto_antes, 0)) AS liquido
      FROM public.recebimentos_historico h
      WHERE h.sale_payment_id = v_original.id
         OR h.sale_payment_id IN (
              SELECT e.id FROM public.sale_payments e
              WHERE e.estorno_de = v_original.id)
      GROUP BY h.id_parcela
      HAVING sum(COALESCE(h.desconto_depois, 0) - COALESCE(h.desconto_antes, 0)) > 0.009
    LOOP
      CONTINUE WHEN public.titulo_em_acordo_ativo(r.id_parcela);
      SELECT COALESCE(desconto, 0), COALESCE(valor_recebido, 0)
        INTO v_desc_novo, v_novo
      FROM public."BANCO_DADOS"
      WHERE id_parcela = r.id_parcela
      FOR UPDATE;
      CONTINUE WHEN NOT FOUND;
      v_tirar := round(LEAST(r.liquido, v_desc_novo), 2);
      CONTINUE WHEN v_tirar < 0.01;
      v_desc_novo := round(v_desc_novo - v_tirar, 2);

      UPDATE public."BANCO_DADOS"
      SET desconto = v_desc_novo,
          status = CASE
            WHEN COALESCE(valor_original, 0) - v_novo - v_desc_novo <= 0.01
              THEN 'Pago'
            WHEN v_novo + v_desc_novo > 0 THEN 'Pago Parcial'
            WHEN data_vencimento < v_hoje THEN 'Em atraso'
            ELSE 'A vencer'
          END
      WHERE id_parcela = r.id_parcela;

      v_desc_rev := v_desc_rev + v_tirar;
    END LOOP;
  END IF;

  PERFORM set_config('cobranca.origem', '', true);
  PERFORM set_config('cobranca.sale_payment_id', '', true);

  RETURN jsonb_build_object(
    'estorno_id', v_estorno_id,
    'valor', v_valor,
    'revertido_parcelas', round(v_revertido, 2),
    'parcelas', v_parcelas,
    'desconto_revertido', round(v_desc_rev, 2)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.estornar_pagamento(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento(uuid, numeric, text) TO authenticated, service_role;
