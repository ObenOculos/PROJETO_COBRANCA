-- Corrige atribuir_clientes_em_lote: a coluna BANCO_DADOS.user_id e do tipo
-- uuid, mas o parametro p_user_id e text. Dentro do plpgsql nao ha conversao
-- implicita text -> uuid, entao o UPDATE falhava com:
--   42804: column "user_id" is of type uuid but expression is of type text
--
-- Solucao: castar p_user_id::uuid no UPDATE e b.user_id::text ao gravar o
-- cobrador anterior no historico (coluna text). Assinatura e grants inalterados.
CREATE OR REPLACE FUNCTION public.atribuir_clientes_em_lote(
  p_user_id    text,
  p_documentos text[] DEFAULT '{}',
  p_clientes   text[] DEFAULT '{}',
  p_situacao   text   DEFAULT NULL,
  p_gerente_id text   DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- 1) Historico: um registro por cliente (documento), com o cobrador anterior
  --    capturado antes do update. Apenas para clientes identificados por documento.
  IF array_length(p_documentos, 1) > 0 THEN
    INSERT INTO public.atribuicoes_historico (
      documento,
      cliente_nome,
      nome_da_loja,
      cobrador_anterior_id,
      cobrador_novo_id,
      gerente_id
    )
    SELECT DISTINCT ON (b.documento)
      b.documento,
      b.cliente,
      b.nome_da_loja,
      b.user_id::text,
      p_user_id,
      COALESCE(p_gerente_id, '')
    FROM public."BANCO_DADOS" b
    WHERE b.documento = ANY (p_documentos)
    ORDER BY b.documento, b.id_parcela;
  END IF;

  -- 2) Atualizacao atomica por documento e/ou por nome do cliente.
  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id::uuid,
      situacao = COALESCE(p_situacao, b.situacao)
  WHERE b.documento = ANY (p_documentos)
     OR b.cliente   = ANY (p_clientes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atribuir_clientes_em_lote(text, text[], text[], text, text)
  TO anon, authenticated;
