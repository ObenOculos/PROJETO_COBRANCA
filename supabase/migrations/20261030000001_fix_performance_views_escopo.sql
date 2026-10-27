-- Regressao encontrada em 2026-10-27/30, durante teste do item 1c: desde a
-- migration 20261029000003, as views banco_dados_clientes_ativos/_quitados
-- chamam cliente_tem_saldo_aberto(b.documento) no WHERE, uma vez POR LINHA de
-- BANCO_DADOS (127.977 vezes). A funcao (STABLE, SET search_path = public)
-- nao e otimizada pelo planner: cada chamada reagrega do zero as parcelas
-- daquele documento, sem aproveitar que varias linhas de BANCO_DADOS sao do
-- mesmo cliente. Confirmado no banco (EXPLAIN + teste de timeout curto): a
-- contagem da view estoura o statement_timeout (2min) sozinha, com o erro
-- apontando pra essa funcao. Efeito em producao: todo login de gestor cai
-- pro fallback de BANCO_DADOS inteiro (CollectionContext.tsx:936) -- os 40s+
-- do item 8 -- e as vezes nem isso, porque a paginacao por OFFSET profunda
-- no fallback tambem estoura o mesmo timeout (causa raiz ja documentada do
-- item 8, nao resolvida aqui).
--
-- CORRECAO: mesma regra de negocio (saldo = original - recebido - desconto,
-- ignorando parcela cancelada), mas calculada UMA VEZ por documento (GROUP BY)
-- e ligada via JOIN, em vez de uma chamada de funcao por linha. Testado no
-- banco: 1,8s (ativos, 58.075 linhas) e 1,2s (quitados, 69.902 linhas) --
-- ~65x mais rapido, mesmos numeros ja documentados (58.075+69.902=127.977).
--
-- Factoring: a soma agregada mora so em saldo_por_documento (CREATE abaixo),
-- usada pelas duas views -- nao duplica a formula entre elas. A funcao
-- cliente_tem_saldo_aberto(text) continua existindo e inalterada (usada em
-- contextos de poucas linhas: cancelar_visitas_de_clientes_quitados e o
-- gatilho de importacao), onde o custo por chamada nunca foi o problema.

CREATE OR REPLACE VIEW public.saldo_por_documento
WITH (security_invoker = on) AS
SELECT
  documento,
  SUM(
    COALESCE(NULLIF(REPLACE(valor_original, ',', '.'), '')::numeric, 0)
    - COALESCE(NULLIF(REPLACE(valor_recebido, ',', '.'), '')::numeric, 0)
    - COALESCE(NULLIF(REPLACE(desconto, ',', '.'), '')::numeric, 0)
  ) AS saldo
FROM public."BANCO_DADOS"
WHERE lower(trim(COALESCE(status, ''))) <> 'cancelado'
GROUP BY documento;

COMMENT ON VIEW public.saldo_por_documento IS
  'Saldo (original - recebido - desconto) agregado por documento, uma linha por cliente, ignorando parcela cancelada. Espelha a mesma formula de cliente_tem_saldo_aberto/hasOpenBalance, mas calculada uma vez por GROUP BY em vez de uma chamada de funcao por linha de BANCO_DADOS -- usada pelas views banco_dados_clientes_ativos/_quitados para nao estourar o statement_timeout numa varredura da tabela inteira.';

GRANT SELECT ON public.saldo_por_documento TO authenticated;

-- Mesmas 38 colunas de 20261029000003; so o WHERE muda (join em vez de
-- chamar a funcao por linha).
CREATE OR REPLACE VIEW public.banco_dados_clientes_ativos
WITH (security_invoker = on) AS
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
  b.user_id,
  b.situacao
FROM public."BANCO_DADOS" b
LEFT JOIN public.saldo_por_documento s ON s.documento = b.documento
-- Sem nenhuma parcela ativa (s.documento nulo): trata como "deve" (mesmo
-- fallback conservador de cliente_tem_saldo_aberto) -- nunca exclui um
-- documento que nao reconhecemos.
WHERE COALESCE(s.saldo > 0.01, true);

COMMENT ON VIEW public.banco_dados_clientes_ativos IS
  'Todas as parcelas dos clientes que ainda devem algo, pela mesma regra de valor de cliente_tem_saldo_aberto (calculada via saldo_por_documento, nao mais chamando a funcao por linha). Escopo da carga inicial do gestor (src/contexts/CollectionContext.tsx). Exclui so quem quitou tudo; Desempenho/Dashboard/Lojas/Clientes precisam do conjunto completo e o carregam sob demanda. Cadastro do cliente (apelido/contatos) vem de `clientes`, nao daqui.';

CREATE OR REPLACE VIEW public.banco_dados_clientes_quitados
WITH (security_invoker = on) AS
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
  b.user_id,
  b.situacao
FROM public."BANCO_DADOS" b
JOIN public.saldo_por_documento s ON s.documento = b.documento
WHERE s.saldo <= 0.01;

COMMENT ON VIEW public.banco_dados_clientes_quitados IS
  'Complemento de banco_dados_clientes_ativos: todas as parcelas dos clientes 100% quitados (sem saldo aberto por valor, via saldo_por_documento). Carregada sob demanda so quando o gestor filtra a Cobranca por "Pago" (ver ensureSettledCollections em src/contexts/CollectionContext.tsx).';
