-- Item 14 do docs/PROGRESSO.md: o guard de visita/contato agendado ativo
-- (cliente_tem_visita_agendada_ativa, criado na 20261103000006 pra saida
-- automatica de carteira por faixa) ja protege essa automacao, mas nao
-- as duas RPCs manuais que o gestor usa pra mover cliente entre
-- cobradores -- so cliente_tem_acordo_ativo esta nelas. Sem isso, o
-- gestor podia reatribuir/remover cliente com visita/ligacao/WhatsApp
-- agendado para hoje sem aviso, deixando o agendamento orfao (aponta
-- pro cobrador antigo, que nao ve mais o cliente na carteira).
--
-- Mesmo padrao de bloqueio silencioso que cliente_tem_acordo_ativo ja
-- usa aqui (exclui da UPDATE via WHERE, sem excecao nem contagem
-- separada de bloqueados) -- RPC so devolve quantas parcelas mudaram.

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
  PERFORM set_config('cobranca.motivo', 'atribuicao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_gerente_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id::uuid,
      situacao = CASE
        WHEN p_situacao IS NULL THEN b.situacao
        WHEN b.situacao = ANY (COALESCE(p_manter_situacoes, '{}')) THEN b.situacao
        ELSE p_situacao
      END
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND NOT public.cliente_tem_acordo_ativo(b.documento)
    AND NOT public.cliente_tem_visita_agendada_ativa(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_cobrador_em_lote(
  p_documentos  text[] DEFAULT '{}',
  p_clientes    text[] DEFAULT '{}',
  p_usuario_id  text   DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'remocao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND b.user_id IS NOT NULL
    AND NOT public.cliente_tem_acordo_ativo(b.documento)
    AND NOT public.cliente_tem_visita_agendada_ativa(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
