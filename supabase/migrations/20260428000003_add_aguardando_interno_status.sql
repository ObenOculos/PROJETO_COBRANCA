-- Migration to add "Aguardando Interno" to situacao constraint
ALTER TABLE public."BANCO_DADOS" DROP CONSTRAINT IF EXISTS "BANCO_DADOS_situacao_check";

ALTER TABLE public."BANCO_DADOS"
ADD CONSTRAINT "BANCO_DADOS_situacao_check"
CHECK (situacao IN ('Em mãos', 'Em tratamento', 'Cobrança Interna', 'Aguardando Interno') OR situacao IS NULL);
