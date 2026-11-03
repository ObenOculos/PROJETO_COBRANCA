-- Etapa 2 da iniciativa de metas/vinculo gerente-cobrador/carteira
-- automatica (ver memoria estado-metas-vinculo-carteira): espelha no banco
-- a regra de atraso financeiro que ja e a fonte unica no front
-- (clientMaxOverdueDays, src/filters/clientStatus.ts) -- maior atraso entre
-- as parcelas do cliente que ainda tem saldo, ignorando canceladas e
-- vencimento futuro. Sem isto, a automacao de carteira (etapa 7) teria que
-- reimplementar a regra em SQL por conta propria, ou carregar BANCO_DADOS
-- inteiro no navegador so pra decidir -- os dois seriam uma segunda fonte
-- da mesma verdade.
--
-- "Hoje" segue a mesma convencao ja usada em process_payment/criar_acordo
-- (now() AT TIME ZONE 'America/Sao_Paulo'), nao CURRENT_DATE: o fuso da
-- sessao do Postgres nao e garantido, e a meia-noite UTC já é a noite
-- anterior em Brasilia.
--
-- Filtro por `documento` (indexado -- migration 20261102000002), pensado
-- para consulta por cliente, nao para varrer BANCO_DADOS inteira a cada
-- leitura (essa pegadinha de performance ja aconteceu antes, ver
-- saldo_por_documento_tbl na migration 20261102000001). Uso em lote
-- (listagem/automacao) fica para quando houver consumidor real (etapas
-- 6/7), com GROUP BY em vez de uma chamada por cliente.

CREATE OR REPLACE FUNCTION public.cliente_max_atraso_dias(p_documento text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(MAX(
    GREATEST(0, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - bd.data_vencimento))
  ), 0)::integer
  FROM public."BANCO_DADOS" bd
  WHERE bd.documento = p_documento
    AND bd.data_vencimento IS NOT NULL
    AND lower(trim(COALESCE(bd.status, ''))) <> 'cancelado'
    AND (COALESCE(bd.valor_original, 0) - COALESCE(bd.valor_recebido, 0) - COALESCE(bd.desconto, 0)) > 0.01
$$;

COMMENT ON FUNCTION public.cliente_max_atraso_dias(text) IS
  'Maior atraso (dias) entre as parcelas em aberto do cliente -- espelho de clientMaxOverdueDays (src/filters/clientStatus.ts). Fonte unica para qualquer regra de faixa/carteira automatica no banco.';
