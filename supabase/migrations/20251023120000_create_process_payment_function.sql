CREATE OR REPLACE FUNCTION public.process_payment(
    p_collector_id uuid,
    p_client_document text,
    p_payment_amount numeric,
    p_discount_amount numeric,
    p_payment_method text,
    p_notes text,
    p_sale_number integer DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_installment record;
    v_remaining_payment numeric;
    v_remaining_discount numeric;
    v_payment_for_installment numeric;
    v_discount_for_installment numeric;
    v_pending_amount numeric;
    v_distribution_details jsonb := '[]'::jsonb;
    v_client_name text;
    v_collector_name text;
    v_store_name text;
    v_updated_installments_count integer := 0;
    v_sale_installments CURSOR FOR
        SELECT *
        FROM "BANCO_DADOS"
        WHERE
            documento = p_client_document AND
            (p_sale_number IS NULL OR venda_n = p_sale_number) AND
            (
                COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
            )
        ORDER BY data_vencimento ASC, id_parcela ASC;

BEGIN
    v_remaining_payment := p_payment_amount;
    v_remaining_discount := p_discount_amount;

    -- Get client, collector and store names for the sale_payments record
    SELECT cliente, nome_da_loja INTO v_client_name, v_store_name
    FROM "BANCO_DADOS" WHERE documento = p_client_document LIMIT 1;

    SELECT name INTO v_collector_name FROM public.users WHERE id = p_collector_id;

    OPEN v_sale_installments;
    LOOP
        FETCH v_sale_installments INTO v_installment;
        EXIT WHEN NOT FOUND;

        IF v_remaining_payment <= 0 AND v_remaining_discount <= 0 THEN
            EXIT;
        END IF;

        v_pending_amount := COALESCE(REPLACE(v_installment.valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(v_installment.valor_recebido, ',', '.')::numeric, 0);

        -- Distribute discount first
        v_discount_for_installment := LEAST(v_remaining_discount, v_pending_amount);
        v_pending_amount := v_pending_amount - v_discount_for_installment;
        v_remaining_discount := v_remaining_discount - v_discount_for_installment;

        -- Then distribute payment
        v_payment_for_installment := LEAST(v_remaining_payment, v_pending_amount);
        v_pending_amount := v_pending_amount - v_payment_for_installment;
        v_remaining_payment := v_remaining_payment - v_payment_for_installment;

        IF v_payment_for_installment > 0 OR v_discount_for_installment > 0 THEN
            DECLARE
                v_new_valor_recebido numeric;
                v_new_desconto numeric;
                v_new_status text;
            BEGIN
                v_new_valor_recebido := COALESCE(REPLACE(v_installment.valor_recebido, ',', '.')::numeric, 0) + v_payment_for_installment;
                v_new_desconto := COALESCE(REPLACE(v_installment.desconto, ',', '.')::numeric, 0) + v_discount_for_installment;

                IF (v_new_valor_recebido + v_new_desconto) >= COALESCE(REPLACE(v_installment.valor_original, ',', '.')::numeric, 0) THEN
                    IF v_new_desconto > 0 THEN
                        v_new_status := 'Pago com Desconto';
                    ELSE
                        v_new_status := 'Pago';
                    END IF;
                ELSE
                    v_new_status := 'Parcial';
                END IF;

                UPDATE "BANCO_DADOS"
                SET
                    valor_recebido = TO_CHAR(v_new_valor_recebido, 'FM999999990.00'),
                    desconto = TO_CHAR(v_new_desconto, 'FM999999990.00'),
                    status = v_new_status,
                    data_de_recebimento = CURRENT_DATE::text
                WHERE id_parcela = v_installment.id_parcela;

                v_updated_installments_count := v_updated_installments_count + 1;

                v_distribution_details := v_distribution_details || jsonb_build_object(
                    'installmentId', v_installment.id_parcela,
                    'appliedAmount', v_payment_for_installment,
                    'appliedDiscount', v_discount_for_installment,
                    'installmentStatus', v_new_status
                );
            END;
        END IF;

    END LOOP;
    CLOSE v_sale_installments;

    -- Insert into sale_payments
    INSERT INTO public.sale_payments (
        sale_number,
        client_document,
        client_name,
        payment_amount,
        discount_amount,
        payment_date,
        payment_method,
        notes,
        collector_id,
        collector_name,
        store_name,
        distribution_details
    ) VALUES (
        p_sale_number,
        p_client_document,
        v_client_name,
        p_payment_amount,
        p_discount_amount,
        CURRENT_DATE,
        p_payment_method,
        p_notes,
        p_collector_id,
        v_collector_name,
        v_store_name,
        v_distribution_details
    );

    RETURN json_build_object(
        'status', 'success',
        'message', 'Payment processed successfully.',
        'updated_installments', v_updated_installments_count,
        'distribution', v_distribution_details
    );

EXCEPTION
    WHEN others THEN
        RETURN json_build_object(
            'status', 'error',
            'message', SQLERRM
        );
END;
$$ LANGUAGE plpgsql;