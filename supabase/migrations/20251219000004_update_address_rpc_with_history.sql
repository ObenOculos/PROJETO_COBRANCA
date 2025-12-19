CREATE OR REPLACE FUNCTION public.update_client_address(
    p_cliente_documento text,
    p_logradouro text,
    p_numero text,
    p_bairro text,
    p_cidade text,
    p_estado text,
    p_cep text,
    p_complemento text DEFAULT NULL -- Add optional complemento parameter
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_history boolean;
    v_original_address record;
BEGIN
    -- Check if there is any history for this client
    SELECT EXISTS (
        SELECT 1 FROM public.enderecos_historico
        WHERE cliente_documento = p_cliente_documento
    ) INTO v_has_history;

    -- If no history exists, it means this is the FIRST update.
    -- We need to archive the original address from BANCO_DADOS before adding the new one.
    IF NOT v_has_history THEN
        -- Find the most recent address entry in BANCO_DADOS for this client
        SELECT
            endereco,
            numero,
            bairro,
            cidade,
            estado,
            cep,
            complemento
        INTO v_original_address
        FROM public."BANCO_DADOS"
        WHERE documento = p_cliente_documento
          AND endereco IS NOT NULL
        ORDER BY data_lancamento DESC, id_parcela DESC
        LIMIT 1;

        -- If we found an original address, save it as a historical record (is_atual = false)
        IF FOUND THEN
            INSERT INTO public.enderecos_historico (
                cliente_documento,
                logradouro,
                numero,
                bairro,
                cidade,
                estado,
                cep,
                complemento,
                is_atual,
                created_at -- Backdate it slightly so it appears older than the new one
            ) VALUES (
                p_cliente_documento,
                v_original_address.endereco,
                v_original_address.numero,
                v_original_address.bairro,
                v_original_address.cidade,
                v_original_address.estado,
                v_original_address.cep,
                v_original_address.complemento,
                false,
                NOW() - INTERVAL '1 second'
            );
        END IF;
    ELSE
        -- If history exists, just deactivate the currently active address
        UPDATE public.enderecos_historico
        SET is_atual = false
        WHERE cliente_documento = p_cliente_documento AND is_atual = true;
    END IF;

    -- Insert the NEW address as the current one (is_atual = true)
    INSERT INTO public.enderecos_historico (
        cliente_documento,
        logradouro,
        numero,
        bairro,
        cidade,
        estado,
        cep,
        complemento,
        is_atual
    ) VALUES (
        p_cliente_documento,
        p_logradouro,
        p_numero,
        p_bairro,
        p_cidade,
        p_estado,
        p_cep,
        p_complemento,
        true
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to update client address: %', SQLERRM;
END;
$$;
