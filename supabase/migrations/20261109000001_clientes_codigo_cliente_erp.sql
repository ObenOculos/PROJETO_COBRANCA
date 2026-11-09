-- Codigo do cliente no ERP Ciclone na tabela `clientes`.
--
-- PEDIDO (2026-11-09): o financeiro e o ERP identificam o cliente pelo codigo
-- do Ciclone (`pgcln_codigo`, faixa 100001..102423 nos clientes da Focco
-- Brasil). O app so tinha CPF/CNPJ. O codigo da SSOtica existe, mas nao e
-- usado -- fica de fora.
--
-- TEXTO, nao inteiro: medido no Ciclone em 2026-11-09, 1.889 dos 1.890
-- CPF/CNPJ tem um codigo so; 1 tem dois. O app guarda um registro por
-- documento, entao nesse caso os codigos vao juntos ("100123, 100456"), em
-- ordem, para nenhum se perder.
--
-- DONO DO DADO: espelho do ERP, como as colunas da migration
-- 20261106000011 -- o sync sobrescreve a cada rodada; correcao e no Ciclone.
-- Clientes de outras lojas (planilha) ficam com NULL.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo_cliente_erp text;

COMMENT ON COLUMN public.clientes.codigo_cliente_erp IS 'Codigo do cliente no Ciclone (fn_crtitulo.pgcln_codigo). Mais de um codigo para o mesmo CPF/CNPJ vem separado por virgula, em ordem. Espelho do ERP: o sync sobrescreve; corrigir no Ciclone. NULL = cliente fora do Ciclone.';

-- Busca por codigo no app e feita em memoria (registro carregado inteiro),
-- entao nao precisa de indice aqui.
