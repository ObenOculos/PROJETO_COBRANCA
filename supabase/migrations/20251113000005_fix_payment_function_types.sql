CREATE OR REPLACE FUNCTION public.process_payment(
    p_collector_id uuid,
    p_client_document text,
    p_payment_amount numeric,
    p_discount_amount numeric DEFAULT 0,
    p_payment_method text DEFAULT 'dinheiro',
    p_notes text DEFAULT '',
    p_sale_number integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
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
BEGIN
    -- Get client and collector names
    SELECT cliente INTO v_client_name FROM public."BANCO_DADOS" WHERE documento = p_client_document LIMIT 1;
    SELECT name INTO v_collector_name FROM public.users WHERE id = p_collector_id LIMIT 1;

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
        collector_name
    ) VALUES (
        p_collector_id,
        p_client_document,
        p_payment_amount,
        p_discount_amount,
        p_payment_method,
        p_notes,
        p_sale_number,
        v_client_name,
        v_collector_name
    )
    RETURNING id INTO v_payment_id;

    v_remaining_payment := p_payment_amount;
    v_remaining_discount := p_discount_amount;

    -- Loop through pending installments for the client
    FOR v_installments_to_update IN
        SELECT id_parcela, valor_original, valor_recebido, desconto, venda_n
        FROM public."BANCO_DADOS"
        WHERE documento = p_client_document
          AND (
            p_sale_number IS NULL -- General payment
            OR (p_sale_number = 0 AND venda_n IS NULL) -- Renegotiated sales
            OR (p_sale_number > 0 AND venda_n = p_sale_number) -- Specific sale
          )
          AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
        ORDER BY data_vencimento ASC, id_parcela ASC
    LOOP
        -- Safely convert text values to numeric for calculation
        v_current_original := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0);
        v_current_received := COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0);
        v_current_discount := COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);

        v_current_pending := v_current_original - v_current_received - v_current_discount;

        -- Apply discount first
        IF v_remaining_discount > 0 AND v_current_pending > 0 THEN
            v_discount_to_apply := LEAST(v_remaining_discount, v_current_pending);
            
            UPDATE public."BANCO_DADOS"
            SET desconto = TO_CHAR(v_current_discount + v_discount_to_apply, 'FM999999990.00')
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_discount := v_remaining_discount - v_discount_to_apply;
            v_current_pending := v_current_pending - v_discount_to_apply;
            v_current_discount := v_current_discount + v_discount_to_apply;
        END IF;

        -- Apply payment
        IF v_remaining_payment > 0 AND v_current_pending > 0 THEN
            v_payment_to_apply := LEAST(v_remaining_payment, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET valor_recebido = TO_CHAR(v_current_received + v_payment_to_apply, 'FM999999990.00'),
                data_de_recebimento = CURRENT_DATE
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

    -- Update client's total pending value in scheduled_visits (if any)
    SELECT SUM(COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) INTO v_total_pending_client
    FROM public."BANCO_DADOS"
    WHERE documento = p_client_document;

    UPDATE public.scheduled_visits
    SET total_pending_value = v_total_pending_client
    WHERE client_document = p_client_document;

END;
$$;
