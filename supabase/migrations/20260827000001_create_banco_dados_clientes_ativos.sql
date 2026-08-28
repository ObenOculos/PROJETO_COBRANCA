-- Escopo "clientes ativos na cobranca" para a carga inicial do gestor.
--
-- PROBLEMA: o app carrega BANCO_DADOS inteiro na memoria do navegador. Em
-- 2026-08-27 sao 111.131 linhas (~109 MB de heap so para esse array). O Quitto
-- roda como app nativo (Capacitor) no celular do cobrador, onde o WebView e
-- morto bem antes disso. Projetado para 500 mil titulos, dariam ~491 MB — o
-- app fecha sozinho.
--
-- POR QUE NAO FILTRAR SO OS "EM ABERTO": uma venda tem parcelas pagas e em
-- aberto misturadas. calculateSaleBalance, getClientGroups e
-- getCollectorPerformance somam valor_original e valor_recebido de TODAS as
-- parcelas da venda. Carregar so as em aberto faria o saldo de cada venda ficar
-- errado — sem erro nenhum na tela, so numero torto.
--
-- O CORTE SEGURO: o cliente e a unidade da cobranca. Esta view devolve TODAS as
-- parcelas (inclusive as ja quitadas) de quem ainda deve alguma coisa, e
-- descarta apenas os clientes 100% liquidados. Saldo de venda, card do cliente,
-- historico e reincidencia continuam exatos; some so quem ja saiu da operacao.
--
-- Medido em 2026-08-27: 57.016 das 111.131 linhas (51%), ~56 MB em vez de
-- ~109 MB. 5.784 dos 13.464 clientes tem algo em aberto.
--
-- O QUE ESTA VIEW *NAO* ATENDE: Desempenho e Dashboard somam recebimentos de
-- clientes que ja quitaram tudo — inclusive quem quitou no mes corrente, que
-- esta view exclui. Essas telas carregam o conjunto completo sob demanda
-- (ensureAllCollections no CollectionContext). Nao troque a fonte delas por
-- esta view sem antes migrar os totais para agregacao no banco.

-- Sustenta o EXISTS abaixo e as buscas por documento em geral.
CREATE INDEX IF NOT EXISTS banco_dados_documento_status_idx
  ON public."BANCO_DADOS" (documento, status);

-- security_invoker: a view respeita as policies de RLS de quem consulta, em vez
-- de rodar com os privilegios do dono. Sem isso a view viraria um contorno da
-- RLS de BANCO_DADOS. Requer Postgres 15+ (o projeto esta no 17).
CREATE OR REPLACE VIEW public.banco_dados_clientes_ativos
WITH (security_invoker = on) AS
-- Colunas listadas uma a uma, e nao b.*: o Postgres congela a lista de
-- colunas de uma view no momento da criacao. Com b.* uma coluna nova em
-- BANCO_DADOS nao apareceria aqui e o desencontro passaria despercebido
-- ate alguem notar o campo faltando na tela. Explicito, a dependencia fica
-- visivel: ao adicionar coluna la, adicione aqui e rode CREATE OR REPLACE VIEW.
-- Espelha as 44 colunas de BANCO_DADOS em 2026-08-28.
SELECT
  b.nome_da_loja,
  b.data_lancamento,
  b.data_vencimento,
  b.valor_original,
  b.valor_reajustado,
  b.multa,
  b.juros_por_dia,
  b.multa_aplicada,
  b.juros_aplicado,
  b.valor_recebido,
  b.data_de_recebimento,
  b.dias_em_atraso,
  b.dias_carencia,
  b.desconto,
  b.acrescimo,
  b.multa_paga,
  b.juros_pago,
  b.tipo_de_cobranca,
  b.numero_titulo,
  b.parcela,
  b.id_parcela,
  b.status,
  b.cliente,
  b.documento,
  b.endereco,
  b.numero,
  b.bairro,
  b.complemento,
  b.cep,
  b.cidade,
  b.estado,
  b.obs,
  b.codigo_externo,
  b.descricao,
  b.venda_n,
  b.convenio,
  b.telefone,
  b.celular,
  b.celular1,
  b.celular2,
  b.email,
  b.user_id,
  b.situacao,
  b.apelido
FROM public."BANCO_DADOS" b
WHERE
  -- A propria parcela esta em aberto. IS DISTINCT FROM (e nao <>) para que uma
  -- linha com status nulo conte como aberta: sumir com ela seria pior do que
  -- carrega-la a mais.
  b.status IS DISTINCT FROM 'Pago'
  -- ...ou o cliente tem outra parcela em aberto; ai trazemos o historico dele
  -- inteiro, que e o que mantem o saldo da venda correto.
  OR EXISTS (
    SELECT 1
    FROM public."BANCO_DADOS" o
    WHERE o.documento = b.documento
      AND o.status IS DISTINCT FROM 'Pago'
  );

COMMENT ON VIEW public.banco_dados_clientes_ativos IS
  'Todas as parcelas dos clientes que ainda tem algo em aberto. Escopo da carga inicial do gestor (src/contexts/CollectionContext.tsx). Exclui apenas clientes 100% quitados; Desempenho/Dashboard precisam do conjunto completo e o carregam sob demanda.';

GRANT SELECT ON public.banco_dados_clientes_ativos TO anon, authenticated;
