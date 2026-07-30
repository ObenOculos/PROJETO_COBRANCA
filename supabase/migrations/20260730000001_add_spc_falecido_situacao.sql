-- Desfechos terminais de visita viram situacao propria.
--
-- Quando o cobrador conclui a visita com "contestou a dívida - (SPC)" ou
-- "cliente faleceu", cobranca presencial nao resolve mais o caso: o cliente
-- sai da carteira (user_id = NULL) e fica marcado com a situacao abaixo,
-- aguardando o gerente redistribuir na aba de Atribuicao.
--
-- Sao situacoes de FILA (user_id nulo), como "Aguardando Interno". Nao entram
-- em SITUACAO_BY_PROFILE (src/config/profiles.ts) de proposito: se entrassem,
-- situacoesOutsideProfile as esconderia do cobrador que as recebesse depois —
-- e a atribuicao a cobrador externo preserva a situacao existente.

ALTER TABLE public."BANCO_DADOS"
DROP CONSTRAINT IF EXISTS "BANCO_DADOS_situacao_check";

ALTER TABLE public."BANCO_DADOS"
ADD CONSTRAINT "BANCO_DADOS_situacao_check"
CHECK (
  situacao IN (
    'Em mãos',
    'Em tratamento',
    'Cobrança Interna',
    'Aguardando Interno',
    'Cobrança Terceirizada',
    'Aguardando Terceirizado',
    'SPC',
    'Falecido'
  ) OR situacao IS NULL
);
