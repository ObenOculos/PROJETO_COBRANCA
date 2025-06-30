/*
  # Configurar políticas de acesso para autenticação

  1. Políticas para tabela users
    - Permitir leitura e gerenciamento para usuários autenticados
  
  2. Políticas para tabela BANCO_DADOS_COBRANÇA
    - Permitir leitura e atualização para usuários autenticados
  
  3. Políticas para tabela collector_stores
    - Permitir leitura e gerenciamento para usuários autenticados
  
  4. Políticas para tabela collection_attempts
    - Permitir acesso completo para usuários autenticados
*/

-- Remover políticas existentes da tabela users
DROP POLICY IF EXISTS "Users can read all users" ON users;
DROP POLICY IF EXISTS "Only managers can insert users" ON users;
DROP POLICY IF EXISTS "Only managers can update users" ON users;
DROP POLICY IF EXISTS "Only managers can delete users" ON users;

-- Criar políticas mais permissivas para users
CREATE POLICY "Authenticated users can read users"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage users"
  ON users
  FOR ALL
  TO authenticated
  USING (true);

-- Configurar RLS e políticas para BANCO_DADOS_COBRANÇA
ALTER TABLE "BANCO_DADOS_COBRANÇA" ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes se houver
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can read collections" ON "BANCO_DADOS_COBRANÇA";
  DROP POLICY IF EXISTS "Authenticated users can update collections" ON "BANCO_DADOS_COBRANÇA";
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Criar políticas para BANCO_DADOS_COBRANÇA
CREATE POLICY "Authenticated users can read collections"
  ON "BANCO_DADOS_COBRANÇA"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update collections"
  ON "BANCO_DADOS_COBRANÇA"
  FOR UPDATE
  TO authenticated
  USING (true);

-- Remover políticas existentes da tabela collector_stores
DROP POLICY IF EXISTS "Users can read collector stores" ON collector_stores;
DROP POLICY IF EXISTS "Only managers can manage collector stores" ON collector_stores;

-- Criar políticas para collector_stores
CREATE POLICY "Authenticated users can read collector stores"
  ON collector_stores
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage collector stores"
  ON collector_stores
  FOR ALL
  TO authenticated
  USING (true);

-- Configurar RLS e políticas para collection_attempts
ALTER TABLE collection_attempts ENABLE ROW LEVEL SECURITY;

-- Remover política existente se houver
DROP POLICY IF EXISTS "Authenticated users can manage collection attempts" ON collection_attempts;

-- Criar política para collection_attempts
CREATE POLICY "Authenticated users can manage collection attempts"
  ON collection_attempts
  FOR ALL
  TO authenticated
  USING (true);