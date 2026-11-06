-- Dados de cadastro do ERP Ciclone na tabela `clientes`.
--
-- PROBLEMA: o sync do Ciclone (sync_cobranca/sync_financeiro.py, repo
-- Ciclone) gravava so o NOME FANTASIA em `clientes.nome` e descartava a razao
-- social. Em 1.828 dos 1.891 clientes da Focco Brasil os dois sao diferentes
-- ("OTICAS ELISA" x "LUCIANO DA SILVA MOURA LTDA"), e o cobrador nao conseguia
-- reconhecer a empresa pelo nome do CNPJ, do boleto ou da nota. Tambem nao
-- chegavam o contato (dono/responsavel), o vendedor e a regiao.
--
-- DECISAO (2026-11-06): `nome` continua sendo o nome fantasia (como o cobrador
-- conhece a loja; busca, listas e historico seguem iguais). A razao social e
-- os demais dados entram em colunas proprias.
--
-- DONO DO DADO: estas colunas sao ESPELHO DO ERP. O sync sobrescreve todas a
-- cada rodada, inclusive apagando quando o ERP apaga -- diferente de
-- nome/telefone/celular/email, que o sync so preenche quando vazios porque o
-- gestor pode corrigi-los no app. Correcao destes campos se faz no Ciclone.
-- Clientes de outras lojas (planilha) ficam com NULL.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS razao_social         text,
  ADD COLUMN IF NOT EXISTS contato_nome         text,
  ADD COLUMN IF NOT EXISTS contato_telefone     text,
  ADD COLUMN IF NOT EXISTS contato_telefone2    text,
  ADD COLUMN IF NOT EXISTS vendedor_responsavel text,
  ADD COLUMN IF NOT EXISTS regiao               text,
  ADD COLUMN IF NOT EXISTS observacao_erp       text,
  ADD COLUMN IF NOT EXISTS erp_atualizado_em    timestamptz;

COMMENT ON COLUMN public.clientes.razao_social         IS 'Razao social (pgview_nome do Ciclone). Espelho do ERP: o sync sobrescreve; corrigir no Ciclone. `nome` guarda o nome fantasia.';
COMMENT ON COLUMN public.clientes.contato_nome         IS 'Pessoa de contato / responsavel (pgview_nomecontato do Ciclone). Espelho do ERP.';
COMMENT ON COLUMN public.clientes.contato_telefone     IS 'Telefone do contato (pgview_telefonecontato do Ciclone). Espelho do ERP.';
COMMENT ON COLUMN public.clientes.contato_telefone2    IS 'Segundo telefone do contato (pgview_telefonecontato2 do Ciclone). Espelho do ERP.';
COMMENT ON COLUMN public.clientes.vendedor_responsavel IS 'Nome do vendedor responsavel no Ciclone (pg_funcionario via pgview_vendedorresponsavel). Espelho do ERP.';
COMMENT ON COLUMN public.clientes.regiao               IS 'Regiao comercial do Ciclone (pg_regiao.pgreg_descricao). Espelho do ERP.';
COMMENT ON COLUMN public.clientes.observacao_erp       IS 'Observacao do cadastro no Ciclone (pgview_observacao). Espelho do ERP.';
COMMENT ON COLUMN public.clientes.erp_atualizado_em    IS 'Ultima vez que o sync do Ciclone ALTEROU os campos espelho do ERP deste cliente (rodada sem mudanca nao grava). NULL = cliente fora do Ciclone.';

-- Busca por razao social no app e feita em memoria (registro carregado
-- inteiro), entao nao precisa de indice aqui.
