DROP FUNCTION IF EXISTS public.process_payment(uuid,text,numeric,numeric,text,text,integer);

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
    v_total_original_client numeric;
    v_total_received_client numeric;
    v_total_discount_client numeric;
    v_installments_to_update record;
    v_client_name text;
    v_collector_name text;
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

    -- Function to apply discount and payment to installments with specific filters
    -- This approach prioritizes installments with zero received value for discounts
    
    -- Case 1: Specific sale_number (not NULL and not 0)
    IF p_sale_number IS NOT NULL AND p_sale_number != 0 THEN
        -- First pass: Apply discounts ONLY to installments with zero received value
        IF v_remaining_discount > 0 THEN
            FOR v_installments_to_update IN
                SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
                FROM public."BANCO_DADOS"
                WHERE documento = p_client_document
                  AND venda_n = p_sale_number
                  AND COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) = 0  -- Only zero received value
                  AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
                ORDER BY data_vencimento ASC, id_parcela ASC
            LOOP
                DECLARE
                    v_pending_after_discount numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_discount_to_apply numeric := LEAST(v_remaining_discount, v_pending_after_discount);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        desconto = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply, 'FM999999990.00'),
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'pago com desconto'
                                    ELSE 'parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_discount := v_remaining_discount - v_discount_to_apply;
                    
                    EXIT WHEN v_remaining_discount <= 0;
                END;
            END LOOP;
        END IF;

        -- Second pass: Apply remaining discounts to installments with partial payments (if any discount left)
        IF v_remaining_discount > 0 THEN
            FOR v_installments_to_update IN
                SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
                FROM public."BANCO_DADOS"
                WHERE documento = p_client_document
                  AND venda_n = p_sale_number
                  AND COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) > 0  -- Only partial payments
                  AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
                ORDER BY data_vencimento ASC, id_parcela ASC
            LOOP
                DECLARE
                    v_pending_after_discount numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_discount_to_apply numeric := LEAST(v_remaining_discount, v_pending_after_discount);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        desconto = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply, 'FM999999990.00'),
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'pago com desconto'
                                    ELSE 'parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_discount := v_remaining_discount - v_discount_to_apply;
                    
                    EXIT WHEN v_remaining_discount <= 0;
                END;
            END LOOP;
        END IF;

        -- Third pass: Apply payments to all pending installments
        FOR v_installments_to_update IN
            SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
            FROM public."BANCO_DADOS"
            WHERE documento = p_client_document
              AND venda_n = p_sale_number
              AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
            ORDER BY data_vencimento ASC, id_parcela ASC
        LOOP
            -- Apply payment
            IF v_remaining_payment > 0 THEN
                DECLARE
                    v_current_pending numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_payment_to_apply numeric := LEAST(v_remaining_payment, v_current_pending);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        valor_recebido = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + v_payment_to_apply, 'FM999999990.00'),
                        data_de_recebimento = CURRENT_DATE,
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + v_payment_to_apply + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0)) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'Pago'
                                    ELSE 'Pago Parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_payment := v_remaining_payment - v_payment_to_apply;
                END;
            END IF;

            EXIT WHEN v_remaining_payment <= 0;
        END LOOP;

    -- Case 2: p_sale_number is 0 (representing renegotiated sales / null venda_n in BANCO_DADOS)
    ELSIF p_sale_number = 0 THEN
        -- First pass: Apply discounts ONLY to installments with zero received value
        IF v_remaining_discount > 0 THEN
            FOR v_installments_to_update IN
                SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
                FROM public."BANCO_DADOS"
                WHERE documento = p_client_document
                  AND venda_n IS NULL -- Target installments with NULL venda_n
                  AND COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) = 0  -- Only zero received value
                  AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
                ORDER BY data_vencimento ASC, id_parcela ASC
            LOOP
                DECLARE
                    v_pending_after_discount numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_discount_to_apply numeric := LEAST(v_remaining_discount, v_pending_after_discount);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        desconto = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply, 'FM999999990.00'),
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'pago com desconto'
                                    ELSE 'parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_discount := v_remaining_discount - v_discount_to_apply;
                    
                    EXIT WHEN v_remaining_discount <= 0;
                END;
            END LOOP;
        END IF;

        -- Second pass: Apply remaining discounts to installments with partial payments
        IF v_remaining_discount > 0 THEN
            FOR v_installments_to_update IN
                SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
                FROM public."BANCO_DADOS"
                WHERE documento = p_client_document
                  AND venda_n IS NULL -- Target installments with NULL venda_n
                  AND COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) > 0  -- Only partial payments
                  AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
                ORDER BY data_vencimento ASC, id_parcela ASC
            LOOP
                DECLARE
                    v_pending_after_discount numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_discount_to_apply numeric := LEAST(v_remaining_discount, v_pending_after_discount);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        desconto = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply, 'FM999999990.00'),
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'pago com desconto'
                                    ELSE 'parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_discount := v_remaining_discount - v_discount_to_apply;
                    
                    EXIT WHEN v_remaining_discount <= 0;
                END;
            END LOOP;
        END IF;

        -- Third pass: Apply payments to all pending installments
        FOR v_installments_to_update IN
            SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
            FROM public."BANCO_DADOS"
            WHERE documento = p_client_document
              AND venda_n IS NULL -- Target installments with NULL venda_n
              AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
            ORDER BY data_vencimento ASC, id_parcela ASC
        LOOP
            -- Apply payment
            IF v_remaining_payment > 0 THEN
                DECLARE
                    v_current_pending numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_payment_to_apply numeric := LEAST(v_remaining_payment, v_current_pending);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        valor_recebido = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + v_payment_to_apply, 'FM999999990.00'),
                        data_de_recebimento = CURRENT_DATE,
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + v_payment_to_apply + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0)) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'Pago'
                                    ELSE 'Pago Parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_payment := v_remaining_payment - v_payment_to_apply;
                END;
            END IF;

            EXIT WHEN v_remaining_payment <= 0;
        END LOOP;

    ELSE -- Case 3: p_sale_number is NULL (general payment, distribute across all pending installments for the client)
        -- First pass: Apply discounts ONLY to installments with zero received value
        IF v_remaining_discount > 0 THEN
            FOR v_installments_to_update IN
                SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
                FROM public."BANCO_DADOS"
                WHERE documento = p_client_document
                  AND COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) = 0  -- Only zero received value
                  AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
                ORDER BY data_vencimento ASC, id_parcela ASC
            LOOP
                DECLARE
                    v_pending_after_discount numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_discount_to_apply numeric := LEAST(v_remaining_discount, v_pending_after_discount);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        desconto = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply, 'FM999999990.00'),
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'pago com desconto'
                                    ELSE 'parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_discount := v_remaining_discount - v_discount_to_apply;
                    
                    EXIT WHEN v_remaining_discount <= 0;
                END;
            END LOOP;
        END IF;

        -- Second pass: Apply remaining discounts to installments with partial payments
        IF v_remaining_discount > 0 THEN
            FOR v_installments_to_update IN
                SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
                FROM public."BANCO_DADOS"
                WHERE documento = p_client_document
                  AND COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) > 0  -- Only partial payments
                  AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
                ORDER BY data_vencimento ASC, id_parcela ASC
            LOOP
                DECLARE
                    v_pending_after_discount numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_discount_to_apply numeric := LEAST(v_remaining_discount, v_pending_after_discount);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        desconto = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply, 'FM999999990.00'),
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0) + v_discount_to_apply) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'pago com desconto'
                                    ELSE 'parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_discount := v_remaining_discount - v_discount_to_apply;
                    
                    EXIT WHEN v_remaining_discount <= 0;
                END;
            END LOOP;
        END IF;

        -- Third pass: Apply payments to all pending installments
        FOR v_installments_to_update IN
            SELECT id_parcela, valor_original, valor_reajustado, valor_recebido, desconto
            FROM public."BANCO_DADOS"
            WHERE documento = p_client_document
              AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
            ORDER BY data_vencimento ASC, id_parcela ASC
        LOOP
            -- Apply payment
            IF v_remaining_payment > 0 THEN
                DECLARE
                    v_current_pending numeric := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);
                    v_payment_to_apply numeric := LEAST(v_remaining_payment, v_current_pending);
                BEGIN
                    UPDATE public."BANCO_DADOS"
                    SET
                        valor_recebido = TO_CHAR(COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + v_payment_to_apply, 'FM999999990.00'),
                        data_de_recebimento = CURRENT_DATE,
                        status = CASE
                                    WHEN (COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0) + v_payment_to_apply + COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0)) >= COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0) THEN 'Pago'
                                    ELSE 'Pago Parcial'
                                 END
                    WHERE id_parcela = v_installments_to_update.id_parcela;
                    v_remaining_payment := v_remaining_payment - v_payment_to_apply;
                END;
            END IF;

            EXIT WHEN v_remaining_payment <= 0;
        END LOOP;
    END IF;

    -- Update client's total pending value in scheduled_visits (if any)
    SELECT SUM(COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) INTO v_total_pending_client
    FROM public."BANCO_DADOS"
    WHERE documento = p_client_document;

    UPDATE public.scheduled_visits
    SET total_pending_value = v_total_pending_client
    WHERE client_document = p_client_document;

END;
$$;