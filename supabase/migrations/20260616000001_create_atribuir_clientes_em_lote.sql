-- Atribuicao de clientes a um cobrador, em lote e de forma ATOMICA.
--
-- Substitui o fluxo client-side (SELECT + UPDATE por lista de id_parcela +
-- INSERT de historico em requisicoes separadas), que era nao-transacional
-- (estado parcial em caso de falha) e podia montar URLs gigantes.
--
-- Esta funcao faz, em uma unica transacao:
--   1) grava o historico (um registro por documento, capturando o cobrador
--      anterior ANTES do update);
--   2) atualiza BANCO_DADOS (user_id e, opcionalmente, situacao);
-- e retorna a quantidade de parcelas atualizadas.
--
-- SECURITY DEFINER: roda como dono da funcao, para conseguir gravar em
-- atribuicoes_historico (que tem RLS apenas para 'authenticated', enquanto o
-- app usa a anon key) e atualizar BANCO_DADOS de forma consistente.
--
-- Observacao: a funcao antiga atribuir_multiplos_clientes nao e usada pelo
-- front-end e foi deixada intacta.
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
      b.user_id,
      p_user_id,
      COALESCE(p_gerente_id, '')
    FROM public."BANCO_DADOS" b
    WHERE b.documento = ANY (p_documentos)
    ORDER BY b.documento, b.id_parcela;
  END IF;

  -- 2) Atualizacao atomica por documento e/ou por nome do cliente.
  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id,
      situacao = COALESCE(p_situacao, b.situacao)
  WHERE b.documento = ANY (p_documentos)
     OR b.cliente   = ANY (p_clientes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atribuir_clientes_em_lote(text, text[], text[], text, text)
  TO anon, authenticated;
