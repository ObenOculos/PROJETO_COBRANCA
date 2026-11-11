-- Item 47 (docs/PROGRESSO.md): carga da carteira do cobrador.
--
-- O app pagina a carteira por faixa de id_parcela com `user_id = eu`
-- (`... WHERE user_id = $1 AND id_parcela >= $2 ORDER BY id_parcela LIMIT
-- 1000`). Com o indice so em user_id, cada pagina le TODAS as parcelas do
-- cobrador (9-13 mil) e ordena para devolver 1000. Com (user_id,
-- id_parcela) a pagina e uma leitura direta na ordem certa.
--
-- O indice antigo so em user_id fica redundante (este cobre o mesmo
-- prefixo) e sai, para nao pesar nas escritas da importacao/sync.
--
-- Sem CONCURRENTLY: o `db push` roda em transacao. BANCO_DADOS tem ~165
-- mil linhas; o build leva poucos segundos (bloqueia escrita nesse tempo,
-- leitura segue normal).

CREATE INDEX IF NOT EXISTS idx_banco_dados_user_id_parcela
  ON public."BANCO_DADOS" (user_id, id_parcela);

DROP INDEX IF EXISTS public.idx_banco_dados_user_id;
