/*
  # Adicionar campo de cobrador à tabela de cobranças

  1. Alterações
    - Adicionar coluna `collector_id` à tabela BANCO_DADOS_COBRANÇA
    - Criar índice para melhor performance
    - Adicionar foreign key constraint

  2. Segurança
    - Manter RLS existente
*/

-- Adicionar coluna collector_id se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BANCO_DADOS_COBRANÇA' AND column_name = 'collector_id'
  ) THEN
    ALTER TABLE "BANCO_DADOS_COBRANÇA" ADD COLUMN collector_id uuid REFERENCES users(id);
  END IF;
END $$;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_banco_dados_collector_id ON "BANCO_DADOS_COBRANÇA"(collector_id);

-- Criar índice para busca por cliente
CREATE INDEX IF NOT EXISTS idx_banco_dados_cliente ON "BANCO_DADOS_COBRANÇA"("CLIENTE");

-- Criar índice para busca por documento
CREATE INDEX IF NOT EXISTS idx_banco_dados_documento ON "BANCO_DADOS_COBRANÇA"("DOCUMENTO");

-- Criar índice para busca por loja
CREATE INDEX IF NOT EXISTS idx_banco_dados_loja ON "BANCO_DADOS_COBRANÇA"("NOME_DA_LOJA");