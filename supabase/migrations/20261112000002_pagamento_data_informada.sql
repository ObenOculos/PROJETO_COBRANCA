-- Data do pagamento informada por quem registra (2026-11-12).
--
-- PROBLEMA: process_payment gravava sempre a data de HOJE (sale_payments.
-- payment_date pelo DEFAULT CURRENT_DATE e BANCO_DADOS.data_de_recebimento =
-- v_hoje). O cobrador interno muitas vezes dá a baixa no dia seguinte ao
-- pagamento (cliente pagou ontem por Pix, baixa lançada hoje) e o app
-- registrava a data errada -- e o pagamento offline sincronizado no outro dia
-- também.
--
-- AGORA: p_payment_date opcional (NULL = hoje, comportamento antigo). Vai para
-- sale_payments.payment_date e data_de_recebimento das parcelas. Limites: não
-- aceita data futura nem anterior a 30 dias. O momento real do registro fica
-- em sale_payments.created_at (auditoria).
--
-- Corpo copiado de produção (pg_get_functiondef em 2026-11-12, versão da
-- migration 20261109000008); únicas mudanças: o parâmetro, v_data, a
-- validação, payment_date no INSERT, data_de_recebimento = v_data e
-- search_path fixo.

DROP FUNCTION IF EXISTS public.process_payment(uuid, text, numeric, numeric, text, text, bigint, numeric);

CREATE OR REPLACE FUNCTION public.process_payment(p_collector_id uuid, p_client_document text, p_payment_amount numeric, p_discount_amount numeric DEFAULT 0, p_payment_method text DEFAULT 'dinheiro'::text, p_notes text DEFAULT ''::text, p_sale_number bigint DEFAULT NULL::bigint, p_juros_amount numeric DEFAULT 0, p_payment_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_payment_id uuid;
    v_remaining_payment numeric;
    v_remaining_discount numeric;
    v_total_pending_client numeric;
    v_installments_to_update record;
    v_client_name text;
    v_collector_name text;
    v_current_pending numeric;
    v_payment_to_apply numeric;
    v_discount_to_apply numeric;
    v_current_received numeric;
    v_current_discount numeric;
    v_current_original numeric;
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    -- Data em que o cliente PAGOU (informada por quem registra); o momento do
    -- registro continua em sale_payments.created_at.
    v_data date := COALESCE(p_payment_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
BEGIN
    IF v_data > v_hoje THEN
        RAISE EXCEPTION 'A data do pagamento não pode ser no futuro.';
    END IF;
    IF v_data < v_hoje - 30 THEN
        RAISE EXCEPTION 'A data do pagamento não pode ser anterior a 30 dias. Fale com o gestor.';
    END IF;

    -- Juros/multa cobrados do cliente: ficam so no registro do pagamento, NAO
    -- abatem parcela (o principal e p_payment_amount). Migration 20261109000008.
    IF COALESCE(p_juros_amount, 0) < 0 THEN
        RAISE EXCEPTION 'Juros/multa não pode ser negativo.';
    END IF;

    -- Get client and collector names
    SELECT cliente INTO v_client_name FROM public."BANCO_DADOS" WHERE documento = p_client_document LIMIT 1;
    SELECT name INTO v_collector_name FROM public.users WHERE id = p_collector_id LIMIT 1;

    -- Sem isto, um cliente cuja divida esteja inteiramente dentro de um
    -- acordo ativo geraria um sale_payments "fantasma" (credita merito ao
    -- cobrador) sem abater nada de verdade em nenhum titulo.
    IF NOT EXISTS (
        SELECT 1
        FROM public."BANCO_DADOS"
        WHERE documento = p_client_document
          AND (
            p_sale_number IS NULL
            OR (
              p_sale_number > 0 AND (
                numero_titulo = p_sale_number
                OR (numero_titulo IS NULL AND venda_n = p_sale_number)
              )
            )
            OR (p_sale_number = 0 AND numero_titulo IS NULL AND venda_n IS NULL)
          )
          AND (COALESCE(valor_recebido, 0) + COALESCE(desconto, 0)) < COALESCE(valor_original, 0)
          AND NOT public.titulo_em_acordo_ativo(id_parcela)
    ) THEN
        RAISE EXCEPTION 'Não há títulos disponíveis para pagamento direto (podem estar vinculados a um acordo ativo). Registre o pagamento pela tela do acordo.';
    END IF;

    -- Insert into sale_payments
    INSERT INTO public.sale_payments (
        collector_id,
        client_document,
        payment_amount,
        discount_amount,
        payment_method,
        notes,
        sale_number,
        client_name,
        collector_name,
        juros_amount,
        payment_date
    ) VALUES (
        p_collector_id,
        p_client_document,
        p_payment_amount,
        p_discount_amount,
        p_payment_method,
        p_notes,
        p_sale_number,
        v_client_name,
        v_collector_name,
        round(COALESCE(p_juros_amount, 0), 2),
        v_data
    )
    RETURNING id INTO v_payment_id;

    -- As mudancas de parcela abaixo sao registradas em recebimentos_historico
    -- como origem 'app', ligadas a este pagamento.
    PERFORM set_config('cobranca.origem', 'app', true);
    PERFORM set_config('cobranca.sale_payment_id', v_payment_id::text, true);

    v_remaining_payment := p_payment_amount;
    v_remaining_discount := p_discount_amount;

    -- Loop through pending installments for the client.
    -- Seleção da venda por numero_titulo (fallback venda_n); 0 = avulsa.
    -- Titulos vinculados a acordo ativo ficam de fora (ver RAISE acima e
    -- migration 20261102000005).
    FOR v_installments_to_update IN
        SELECT id_parcela, valor_original, valor_recebido, desconto, venda_n
        FROM public."BANCO_DADOS"
        WHERE documento = p_client_document
          AND (
            p_sale_number IS NULL -- General payment (todas as parcelas)
            OR (
              p_sale_number > 0 AND (
                numero_titulo = p_sale_number
                OR (numero_titulo IS NULL AND venda_n = p_sale_number) -- fallback
              )
            )
            OR (p_sale_number = 0 AND numero_titulo IS NULL AND venda_n IS NULL) -- avulsa
          )
          AND (COALESCE(valor_recebido, 0) + COALESCE(desconto, 0)) < COALESCE(valor_original, 0)
          AND NOT public.titulo_em_acordo_ativo(id_parcela)
        ORDER BY data_vencimento ASC, id_parcela ASC
    LOOP
        -- Colunas ja sao numeric (migration 20261102000004) -- sem parsing de texto.
        v_current_original := COALESCE(v_installments_to_update.valor_original, 0);
        v_current_received := COALESCE(v_installments_to_update.valor_recebido, 0);
        v_current_discount := COALESCE(v_installments_to_update.desconto, 0);

        v_current_pending := v_current_original - v_current_received - v_current_discount;

        -- Apply discount first
        IF v_remaining_discount > 0 AND v_current_pending > 0 THEN
            v_discount_to_apply := LEAST(v_remaining_discount, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET desconto = round(v_current_discount + v_discount_to_apply, 2)
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_discount := v_remaining_discount - v_discount_to_apply;
            v_current_pending := v_current_pending - v_discount_to_apply;
            v_current_discount := v_current_discount + v_discount_to_apply;
        END IF;

        -- Apply payment
        IF v_remaining_payment > 0 AND v_current_pending > 0 THEN
            v_payment_to_apply := LEAST(v_remaining_payment, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET valor_recebido = round(v_current_received + v_payment_to_apply, 2),
                data_de_recebimento = v_data
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_payment := v_remaining_payment - v_payment_to_apply;
            v_current_pending := v_current_pending - v_payment_to_apply;
            v_current_received := v_current_received + v_payment_to_apply;
        END IF;

        -- Update status based on the final state of the installment
        UPDATE public."BANCO_DADOS"
        SET status = CASE
                        WHEN v_current_pending <= 0.01 THEN 'Pago'
                        WHEN (v_current_received + v_current_discount) > 0 THEN 'Pago Parcial'
                        ELSE 'Em atraso'
                     END
        WHERE id_parcela = v_installments_to_update.id_parcela;

        -- Exit loop if payment and discount are fully distributed
        IF v_remaining_payment <= 0 AND v_remaining_discount <= 0 THEN
            EXIT;
        END IF;
    END LOOP;

    -- Valor em aberto do cliente nas visitas AINDA EM ABERTO. Visitas fechadas
    -- guardam o valor do momento em que aconteceram. Mantem TODOS os titulos
    -- (inclusive os de acordo ativo) -- e "quanto o cliente deve no total",
    -- nao "quanto pode ser pago por aqui".
    SELECT SUM(COALESCE(valor_original, 0) - COALESCE(valor_recebido, 0) - COALESCE(desconto, 0)) INTO v_total_pending_client
    FROM public."BANCO_DADOS"
    WHERE documento = p_client_document;

    UPDATE public.scheduled_visits
    SET total_pending_value = v_total_pending_client
    WHERE client_document = p_client_document
      AND status IN ('agendada', 'cancelamento_solicitado');

END;
$function$;

REVOKE ALL ON FUNCTION public.process_payment(uuid, text, numeric, numeric, text, text, bigint, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payment(uuid, text, numeric, numeric, text, text, bigint, numeric, date) TO authenticated, service_role;
