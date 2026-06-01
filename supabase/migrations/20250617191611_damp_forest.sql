-- Reconstituída do baseline remoto (migração 20250617191611 'damp_forest').
-- Gerada a partir de supabase_migrations.schema_migrations para alinhar repo <-> banco.

-- Criar tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  login text UNIQUE NOT NULL,
  password text NOT NULL,
  type text NOT NULL CHECK (type IN ('manager', 'collector')),
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de cobranças
CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  store_name text NOT NULL,
  launch_date date NOT NULL,
  due_date date NOT NULL,
  original_value decimal(10,2) NOT NULL DEFAULT 0,
  adjusted_value decimal(10,2) NOT NULL DEFAULT 0,
  received_value decimal(10,2) NOT NULL DEFAULT 0,
  received_date date,
  collection_type text NOT NULL,
  title_number text NOT NULL,
  installment integer NOT NULL DEFAULT 1,
  installment_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'overdue', 'received', 'in_negotiation', 'agreed')) DEFAULT 'pending',
  client text NOT NULL,
  document text NOT NULL,
  address text NOT NULL,
  number text NOT NULL,
  neighborhood text NOT NULL,
  complement text,
  zip_code text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  observations text,
  external_code text,
  description text,
  sale_number text NOT NULL,
  agreement text,
  phone text,
  mobile text,
  collector_id uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Criar tabela de tentativas de cobrança
CREATE TABLE IF NOT EXISTS collection_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES collections(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('call', 'visit', 'email', 'whatsapp')),
  result text NOT NULL CHECK (result IN ('no_answer', 'busy', 'not_found', 'promise', 'refusal', 'partial_payment', 'full_payment')),
  notes text,
  next_action text,
  next_action_date date,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

ALTER TABLE collection_attempts ENABLE ROW LEVEL SECURITY;

-- Políticas para usuários
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

CREATE POLICY "Managers can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
  );

CREATE POLICY "Managers can insert users"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
  );

CREATE POLICY "Managers can update users"
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
  );

CREATE POLICY "Managers can delete users"
  ON users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
  );

-- Políticas para cobranças
CREATE POLICY "Users can read collections"
  ON collections
  FOR SELECT
  TO authenticated
  USING (
    -- Gerentes podem ver todas as cobranças
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
    OR
    -- Cobradores podem ver apenas suas cobranças
    collector_id::text = auth.uid()::text
  );

CREATE POLICY "Managers can insert collections"
  ON collections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
  );

CREATE POLICY "Users can update collections"
  ON collections
  FOR UPDATE
  TO authenticated
  USING (
    -- Gerentes podem atualizar todas as cobranças
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
    OR
    -- Cobradores podem atualizar apenas suas cobranças
    collector_id::text = auth.uid()::text
  );

-- Políticas para tentativas de cobrança
CREATE POLICY "Users can read attempts"
  ON collection_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collections c
      JOIN users u ON (
        (u.id::text = auth.uid()::text AND u.type = 'manager')
        OR
        (c.collector_id::text = auth.uid()::text)
      )
      WHERE c.id = collection_attempts.collection_id
    )
  );

CREATE POLICY "Users can insert attempts"
  ON collection_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collections c
      JOIN users u ON (
        (u.id::text = auth.uid()::text AND u.type = 'manager')
        OR
        (c.collector_id::text = auth.uid()::text)
      )
      WHERE c.id = collection_attempts.collection_id
    )
  );

-- Inserir usuários padrão
INSERT INTO users (id, name, login, password, type) VALUES
  ('11111111-1111-1111-1111-111111111111', 'João Silva', 'gerente', '123456', 'manager'),
  ('22222222-2222-2222-2222-222222222222', 'Maria Santos', 'cobrador1', '123456', 'collector'),
  ('33333333-3333-3333-3333-333333333333', 'Pedro Costa', 'cobrador2', '123456', 'collector')
ON CONFLICT (login) DO NOTHING;

-- Inserir dados de exemplo
INSERT INTO collections (
  id, client_id, store_name, launch_date, due_date, original_value, adjusted_value, 
  received_value, collection_type, title_number, installment, installment_id, status,
  client, document, address, number, neighborhood, zip_code, city, state,
  observations, external_code, description, sale_number, phone, mobile, collector_id
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'client-1',
    'Loja Centro',
    '2024-01-15',
    '2024-02-15',
    1500.00,
    1650.00,
    0,
    'Financiamento',
    'FIN-001',
    1,
    'INST-001',
    'overdue',
    'Ana Paula Oliveira',
    '123.456.789-01',
    'Rua das Flores',
    '123',
    'Centro',
    '12345-678',
    'São Paulo',
    'SP',
    'Cliente preferencial',
    'EXT-001',
    'Móveis para sala',
    'VENDA-001',
    '(11) 1234-5678',
    '(11) 98765-4321',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'client-1',
    'Loja Centro',
    '2024-01-15',
    '2024-03-15',
    800.00,
    880.00,
    0,
    'Financiamento',
    'FIN-001',
    2,
    'INST-006',
    'pending',
    'Ana Paula Oliveira',
    '123.456.789-01',
    'Rua das Flores',
    '123',
    'Centro',
    '12345-678',
    'São Paulo',
    'SP',
    'Cliente preferencial - segunda parcela',
    'EXT-001',
    'Móveis para sala - parcela 2',
    'VENDA-001',
    '(11) 1234-5678',
    '(11) 98765-4321',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'client-2',
    'Loja Shopping',
    '2024-01-20',
    '2024-02-20',
    2800.00,
    3080.00,
    3080.00,
    'Cartão de Crédito',
    'CC-002',
    3,
    'INST-002',
    'received',
    'Carlos Eduardo Santos',
    '987.654.321-02',
    'Av. Paulista',
    '456',
    'Bela Vista',
    '01310-100',
    'São Paulo',
    'SP',
    '',
    'EXT-002',
    'Eletrodomésticos',
    'VENDA-002',
    '',
    '(11) 91234-5678',
    '22222222-2222-2222-2222-222222222222'
  )
ON CONFLICT (id) DO NOTHING;

-- Inserir tentativas de exemplo
INSERT INTO collection_attempts (collection_id, date, type, result, notes, next_action, next_action_date) VALUES
  ('11111111-1111-1111-1111-111111111111', '2024-02-20', 'call', 'no_answer', 'Telefone não atende', 'Tentar novamente amanhã', '2024-02-21'),
  ('33333333-3333-3333-3333-333333333333', '2024-02-18', 'visit', 'full_payment', 'Pagamento efetuado em dinheiro', '', null)
ON CONFLICT (id) DO NOTHING;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_collections_collector_id ON collections(collector_id);

CREATE INDEX IF NOT EXISTS idx_collections_client_id ON collections(client_id);

CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status);

CREATE INDEX IF NOT EXISTS idx_collections_due_date ON collections(due_date);

CREATE INDEX IF NOT EXISTS idx_collection_attempts_collection_id ON collection_attempts(collection_id);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();

RETURN NEW;

END;

$$ language 'plpgsql';

-- Trigger para atualizar updated_at na tabela collections
CREATE TRIGGER update_collections_updated_at 
    BEFORE UPDATE ON collections 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
