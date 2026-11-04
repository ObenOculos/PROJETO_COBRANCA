-- Corrige cliente_max_atraso_dias (migration 20261103000003) para refletir o
-- cronograma do acordo ATIVO quando ele existe, em vez do vencimento do
-- titulo original. Achado junto com o usuario (2026-11-04): o pagamento do
-- acordo ja se espelha no titulo (registrar_pagamento_acordo), mas enquanto a
-- parcela do acordo nao e totalmente quitada, o titulo original continua
-- "em aberto" com a data de vencimento PRE-acordo (imutavel, por natureza) --
-- entao um cliente que acabou de assinar e esta em dia com a parcela nova
-- aparecia com o mesmo atraso gigante de antes do acordo (ex.: 700+ dias),
-- indistinguivel de um cliente que esta de fato ignorando o acordo.
--
-- Esta e uma metrica OPERACIONAL (fila/prioridade de cobranca, faixa
-- automatica de carteira) -- nao mexe no titulo original (fato historico
-- intacto, usado no Termo de Acordo para justificar multa/juros) nem em
-- nenhuma coluna de acordos/acordo_parcelas.
--
-- Mesma nocao ja usada em marcar_acordos_quebrados (quebra automatica por
-- parcela de acordo com >15 dias de atraso): parcela de acordo em aberto
-- (saldo_acordo_parcela > 0.01) vencida ha mais dias.
--
-- So ha no maximo 1 acordo ATIVO por cliente (uniq_acordo_ativo_por_cliente),
-- entao o EXISTS/JOIN abaixo nunca mistura dois acordos. Quando o acordo sai
-- de "ativo" (cumprido, cancelado ou quebrado automaticamente), a funcao
-- volta sozinha a usar o titulo original -- nao precisa de um caminho de
-- "reversao" a parte.
--
-- Espelho exato em JS: clientMaxOverdueDays (src/filters/clientStatus.ts).

CREATE OR REPLACE FUNCTION public.cliente_max_atraso_dias(p_documento text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.acordos a
      WHERE a.client_document = p_documento AND a.status = 'ativo'
    )
    THEN COALESCE((
      SELECT MAX(
        GREATEST(0, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - ap.data_vencimento))
      )
      FROM public.acordos a
      JOIN public.acordo_parcelas ap ON ap.acordo_id = a.id
      WHERE a.client_document = p_documento
        AND a.status = 'ativo'
        AND public.saldo_acordo_parcela(ap.id) > 0.01
    ), 0)
    ELSE COALESCE((
      SELECT MAX(
        GREATEST(0, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - bd.data_vencimento))
      )
      FROM public."BANCO_DADOS" bd
      WHERE bd.documento = p_documento
        AND bd.data_vencimento IS NOT NULL
        AND lower(trim(COALESCE(bd.status, ''))) <> 'cancelado'
        AND (COALESCE(bd.valor_original, 0) - COALESCE(bd.valor_recebido, 0) - COALESCE(bd.desconto, 0)) > 0.01
    ), 0)
  END::integer
$$;

COMMENT ON FUNCTION public.cliente_max_atraso_dias(text) IS
  'Maior atraso (dias): se o cliente tem acordo ATIVO, maior atraso entre as parcelas em aberto do acordo (cronograma novo); senao, maior atraso entre as parcelas em aberto do titulo original. Espelho de clientMaxOverdueDays (src/filters/clientStatus.ts). Fonte unica para qualquer regra de faixa/carteira automatica no banco.';
