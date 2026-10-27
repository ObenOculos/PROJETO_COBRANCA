-- Item 8 (docs/PROGRESSO.md): o filtro "Pago" da tela de Cobrancas promovia o
-- gestor para o escopo "all" (BANCO_DADOS inteiro, 128 mil linhas) so para
-- achar os clientes 100% quitados -- a view banco_dados_clientes_ativos
-- exclui exatamente esses clientes, e a classificacao "pago" (getClientPaymentStatus,
-- src/filters/clientStatus.ts) e por VALOR, nao pela coluna `status`.
--
-- De caminho, fecha o item 1c (bug ja registrado em 2026-10-05): a view
-- banco_dados_clientes_ativos decidia "em aberto" pela coluna `status`, que
-- diverge dos valores reais em ~40 linhas (13 "Pago" com saldo, 27 "Pago
-- Parcial" sem saldo). A regra de "o cliente deve?" ja tem fonte unica no
-- banco -- cliente_tem_saldo_aberto (migration 20261005000001), espelho de
-- hasOpenBalance/getClientPending do front. As duas views abaixo passam a
-- usar essa mesma funcao em vez de duas contas divergentes (arquiteto-cobranca:
-- duas telas calculando a "mesma" situacao de formas diferentes e bug de
-- arquitetura, nao coincidencia).
--
-- Redefine so o WHERE (mesmas 38 colunas, CREATE OR REPLACE VIEW aceita).
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
WHERE public.cliente_tem_saldo_aberto(b.documento);

COMMENT ON VIEW public.banco_dados_clientes_ativos IS
  'Todas as parcelas dos clientes que ainda devem algo, pela mesma regra de valor de cliente_tem_saldo_aberto (nao mais a coluna status). Escopo da carga inicial do gestor (src/contexts/CollectionContext.tsx). Exclui so quem quitou tudo; Desempenho/Dashboard/Lojas/Clientes precisam do conjunto completo e o carregam sob demanda. Cadastro do cliente (apelido/contatos) vem de `clientes`, nao daqui.';

-- Complemento exato da view acima: so os clientes 100% quitados. Usada
-- quando o gestor filtra a Cobranca por "Pago" -- em vez de promover para a
-- tabela inteira (ensureAllCollections), o front busca so este recorte e
-- mescla com o que ja estiver carregado (ver ensureSettledCollections em
-- CollectionContext.tsx). Mesma lista de colunas e mesma security_invoker.
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
WHERE NOT public.cliente_tem_saldo_aberto(b.documento);

COMMENT ON VIEW public.banco_dados_clientes_quitados IS
  'Complemento de banco_dados_clientes_ativos: todas as parcelas dos clientes 100% quitados (sem saldo aberto por valor). Carregada sob demanda so quando o gestor filtra a Cobranca por "Pago" (ver ensureSettledCollections em src/contexts/CollectionContext.tsx).';

-- anon ja nao tem acesso a nada desde a Etapa 2a (revoke all on all tables);
-- so authenticated precisa de GRANT explicito numa view nova.
GRANT SELECT ON public.banco_dados_clientes_quitados TO authenticated;
