-- atribuir_clientes_em_lote: confirmar a situacao apenas quando a atual esta
-- FORA do dominio do perfil de destino.
--
-- Antes: situacao = COALESCE(p_situacao, b.situacao). O cliente externo nunca
-- recebia p_situacao (o app mandava NULL), entao um cliente em fila de outro
-- perfil — "Aguardando Interno", "Aguardando Jurídico" — era atribuido ao
-- cobrador externo MANTENDO a situacao da fase anterior. Como o app esconde do
-- cobrador as situacoes de outros perfis (situacoesOutsideProfile, ver
-- src/config/profiles.ts), o cliente ficava atribuido e invisivel para ele.
--
-- Agora a decisao e por LINHA:
--   situacao dentro de p_manter_situacoes  -> preserva (nao rebaixa
--                                             "Em tratamento" para "Em mãos")
--   situacao fora do dominio, ou NULL      -> grava p_situacao (fecha a fase
--                                             anterior)
--
-- p_manter_situacoes recebe SITUACAO_BY_PROFILE[perfil de destino].
-- Com p_situacao NULL o comportamento e o antigo (preserva tudo), o que mantem
-- a funcao segura para qualquer chamada que ainda nao envie os novos campos.

-- A assinatura muda (novo parametro). Removemos a antiga explicitamente para
-- nao deixar duas sobrecargas coexistindo e gerar ambiguidade no PostgREST.
DROP FUNCTION IF EXISTS public.atribuir_clientes_em_lote(
  text, text[], text[], text, text
);

CREATE OR REPLACE FUNCTION public.atribuir_clientes_em_lote(
  p_user_id           text,
  p_documentos        text[] DEFAULT '{}',
  p_clientes          text[] DEFAULT '{}',
  p_situacao          text   DEFAULT NULL,
  p_gerente_id        text   DEFAULT NULL,
  p_manter_situacoes  text[] DEFAULT '{}'
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
  --    NULL = ANY(...) resulta em NULL (nao TRUE), entao situacao vazia cai no
  --    ELSE e recebe a confirmacao — que e o desejado.
  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id::uuid,
      situacao = CASE
        WHEN p_situacao IS NULL THEN b.situacao
        WHEN b.situacao = ANY (COALESCE(p_manter_situacoes, '{}')) THEN b.situacao
        ELSE p_situacao
      END
  WHERE b.documento = ANY (p_documentos)
     OR b.cliente   = ANY (p_clientes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atribuir_clientes_em_lote(
  text, text[], text[], text, text, text[]
) TO anon, authenticated;
