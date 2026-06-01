-- Reconstituída do baseline remoto (migração 20250617180825 'yellow_poetry').
-- Gerada a partir de supabase_migrations.schema_migrations para alinhar repo <-> banco.

-- Primeiro, adicionar a coluna collector_id na tabela existente se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'banco_dados_cobradores' AND column_name = 'collector_id'
  ) THEN
    ALTER TABLE banco_dados_cobradores ADD COLUMN collector_id uuid REFERENCES users(id);

END IF;

END $$;

-- Atualizar alguns registros existentes com cobradores (dados de exemplo)
UPDATE banco_dados_cobradores 
SET collector_id = (SELECT id FROM users WHERE login = 'cobrador1' LIMIT 1)
WHERE "CLIENTE" IN ('Ana Paula Oliveira', 'Carlos Eduardo Santos', 'Juliana Ferreira');

UPDATE banco_dados_cobradores 
SET collector_id = (SELECT id FROM users WHERE login = 'cobrador2' LIMIT 1)
WHERE "CLIENTE" IN ('Fernanda Lima', 'Roberto Almeida');

-- Criar tabela de tentativas de cobrança
CREATE TABLE IF NOT EXISTS collection_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id bigint REFERENCES banco_dados_cobradores("ID_PARCELA") ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('call', 'visit', 'email', 'whatsapp')),
  result text NOT NULL CHECK (result IN ('no_answer', 'busy', 'not_found', 'promise', 'refusal', 'partial_payment', 'full_payment')),
  notes text,
  next_action text,
  next_action_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE collection_attempts ENABLE ROW LEVEL SECURITY;

-- Política para cobradores verem tentativas de suas cobranças
CREATE POLICY "Collectors can view own attempts"
  ON collection_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM banco_dados_cobradores c
      WHERE c."ID_PARCELA" = collection_attempts.collection_id
      AND (c.collector_id::text = auth.uid()::text OR
           EXISTS (SELECT 1 FROM users WHERE id::text = auth.uid()::text AND type = 'manager'))
    )
  );

-- Política para cobradores criarem tentativas em suas cobranças
CREATE POLICY "Collectors can create attempts"
  ON collection_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM banco_dados_cobradores c
      WHERE c."ID_PARCELA" = collection_attempts.collection_id
      AND (c.collector_id::text = auth.uid()::text OR
           EXISTS (SELECT 1 FROM users WHERE id::text = auth.uid()::text AND type = 'manager'))
    )
  );

-- Política para cobradores atualizarem tentativas
CREATE POLICY "Collectors can update attempts"
  ON collection_attempts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM banco_dados_cobradores c
      WHERE c."ID_PARCELA" = collection_attempts.collection_id
      AND (c.collector_id::text = auth.uid()::text OR
           EXISTS (SELECT 1 FROM users WHERE id::text = auth.uid()::text AND type = 'manager'))
    )
  );

-- Política para gerentes gerenciarem todas as tentativas
CREATE POLICY "Managers can manage all attempts"
  ON collection_attempts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id::text = auth.uid()::text AND type = 'manager')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id::text = auth.uid()::text AND type = 'manager')
  );
