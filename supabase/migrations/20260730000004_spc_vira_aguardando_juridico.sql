-- SPC deixa de ser situacao propria e passa a usar a fila do perfil Juridico.
--
-- Motivo: o projeto ja modela desfecho terminal de visita como "fila do perfil
-- de destino" — "nao encontrado" grava 'Aguardando Interno' + user_id NULL e o
-- gerente redistribui. Divida contestada e caso juridico, entao a fila correta
-- e 'Aguardando Jurídico'. Assim o par Aguardando/Cobranca fica completo e a
-- atribuicao a um usuario Cobranca Juridica ja converte para 'Cobrança Jurídica'
-- sem codigo extra.
--
-- O MOTIVO (SPC) nao se perde: continua registrado na observacao da visita
-- (scheduled_visits.notes), que e filtravel na Atribuicao, na Cobranca e no
-- Acompanhamento. Deixa de estar duplicado numa situacao que poderia divergir.
--
-- 'Falecido' permanece situacao propria e fora de SITUACAO_BY_PROFILE: e
-- encerramento, nao fase de cobranca — nao ha perfil a quem atribuir.

-- 1) Migra as linhas existentes ANTES de apertar a constraint.
UPDATE public."BANCO_DADOS"
SET situacao = 'Aguardando Jurídico'
WHERE situacao = 'SPC';

-- 2) Remove 'SPC' dos valores aceitos.
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
    'Cobrança Jurídica',
    'Aguardando Jurídico',
    'Falecido'
  ) OR situacao IS NULL
);
