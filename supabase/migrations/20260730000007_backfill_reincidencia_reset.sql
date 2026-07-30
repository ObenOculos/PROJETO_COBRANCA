-- Backfill unico do marco de ciclo de inadimplencia.
--
-- Marca com a data de HOJE os clientes que, neste momento, estao com saldo
-- zerado. Nao inventa datas passadas: o marco significa "constatado agora que
-- este cliente nao deve nada", o que e verdadeiro e verificavel. Reconstruir
-- QUANDO cada um zerou seria impossivel — nao existe snapshot historico do
-- saldo.
--
-- Efeito: quem ja quitou tudo sai da aba Reincidentes de imediato, em vez de
-- carregar remarcacoes de um ciclo encerrado ate a proxima quitacao.
--
-- A regra de saldo espelha getClientPending (src/filters/clientStatus.ts):
--   pendente = SUM(valor_original) - SUM(valor_recebido) - SUM(desconto)
-- sobre os titulos ATIVOS do cliente (cancelados ficam de fora de toda a
-- cobranca ativa — ver isCancelado em src/types/status.ts). Divergir dessa
-- definicao marcaria clientes errados.
--
-- Tolerancia de 0,01 igual a da aplicacao, para ruido de ponto flutuante.
--
-- Idempotente: so grava onde reincidencia_reset_at ainda e nulo, entao rodar
-- de novo nao sobrescreve marcos legitimos gravados pelo app.

-- Os valores vem tipados como string no typegen do Supabase (comportamento
-- padrao para numeric). O cast ::text::numeric funciona tanto se a coluna for
-- numeric quanto text com ponto decimal, sem assumir um dos dois.
WITH saldo_por_cliente AS (
  SELECT
    b.documento,
    COALESCE(SUM(NULLIF(b.valor_original::text, '')::numeric), 0) AS total_original,
    ROUND(
      COALESCE(SUM(NULLIF(b.valor_original::text, '')::numeric), 0)
      - COALESCE(SUM(NULLIF(b.valor_recebido::text, '')::numeric), 0)
      - COALESCE(SUM(NULLIF(b.desconto::text, '')::numeric), 0)
    , 2) AS pendente
  FROM public."BANCO_DADOS" b
  WHERE b.documento IS NOT NULL
    -- Cancelado nao entra na cobranca ativa.
    AND LOWER(TRIM(COALESCE(b.status, ''))) <> 'cancelado'
  GROUP BY b.documento
)
UPDATE public.clientes c
SET reincidencia_reset_at = now()
FROM saldo_por_cliente s
WHERE c.documento = s.documento
  AND s.pendente <= 0.01
  -- Exige que tenha havido divida: sem isso, cliente cujos titulos estao com
  -- valor_original nulo/zero (ausencia de dado, nao quitacao) tambem daria
  -- pendente = 0 e seria marcado como ciclo encerrado.
  AND s.total_original > 0
  AND c.reincidencia_reset_at IS NULL;
