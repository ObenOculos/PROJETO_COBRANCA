CREATE OR REPLACE FUNCTION public.update_client_address(
    p_cliente_documento text,
    p_logradouro text,
    p_numero text,
    p_bairro text,
    p_cidade text,
    p_estado text,
    p_cep text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Ensures the function runs with the privileges of the function owner (typically postgres)
AS $$
BEGIN
    -- Start a transaction to ensure atomicity
    BEGIN
        -- Deactivate the current address for the given client_documento
        UPDATE public.enderecos_historico
        SET is_atual = false
        WHERE cliente_documento = p_cliente_documento AND is_atual = true;

        -- Insert the new address as the current one
        INSERT INTO public.enderecos_historico (
            cliente_documento,
            logradouro,
            numero,
            bairro,
            cidade,
            estado,
            cep,
            is_atual
        ) VALUES (
            p_cliente_documento,
            p_logradouro,
            p_numero,
            p_bairro,
            p_cidade,
            p_estado,
            p_cep,
            true
        );

    -- If any error occurs, rollback the transaction
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Failed to update client address: %', SQLERRM;
    END;
END;
$$;

-- Grant execution privileges to authenticated users
GRANT EXECUTE ON FUNCTION public.update_client_address(text, text, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_client_address IS 'Updates the current address for a client and archives the old one.';
