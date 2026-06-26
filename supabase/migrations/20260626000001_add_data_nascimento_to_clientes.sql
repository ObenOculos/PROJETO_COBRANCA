-- Adiciona a Data de Nascimento ao cadastro do cliente.
-- Atributo POR CLIENTE (1 por CPF), por isso fica em `clientes` e nao em
-- BANCO_DADOS (que e por parcela e repetiria a data em N linhas).
-- Tipo `date` (sem hora/fuso) para evitar o deslocamento de -1 dia que
-- ocorre com timestamptz ao formatar no fuso local.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS data_nascimento date;

COMMENT ON COLUMN clientes.data_nascimento IS 'Data de nascimento do cliente (importada do relatorio de clientes).';
