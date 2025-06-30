/*
  # Criar tabela de usuários e controle de lojas

  1. Nova Tabela
    - `users`
      - `id` (uuid, primary key)
      - `name` (text)
      - `login` (text, unique)
      - `password` (text)
      - `type` (text) - 'manager' ou 'collector'
      - `created_at` (timestamp)

  2. Nova Tabela
    - `collector_stores`
      - `id` (uuid, primary key)
      - `collector_id` (uuid, foreign key)
      - `store_name` (text)
      - `created_at` (timestamp)

  3. Segurança
    - Enable RLS em ambas as tabelas
    - Políticas para autenticação
*/

-- Criar tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  login text UNIQUE NOT NULL,
  password text NOT NULL,
  type text NOT NULL CHECK (type IN ('manager', 'collector')),
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de controle de lojas por cobrador
CREATE TABLE IF NOT EXISTS collector_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid REFERENCES users(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(collector_id, store_name)
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_stores ENABLE ROW LEVEL SECURITY;

-- Políticas para users
CREATE POLICY "Users can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only managers can insert users"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND type = 'manager'
    )
  );

CREATE POLICY "Only managers can update users"
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND type = 'manager'
    )
  );

CREATE POLICY "Only managers can delete users"
  ON users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND type = 'manager'
    )
  );

-- Políticas para collector_stores
CREATE POLICY "Users can read collector stores"
  ON collector_stores
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only managers can manage collector stores"
  ON collector_stores
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND type = 'manager'
    )
  );

-- Inserir usuários padrão
INSERT INTO users (name, login, password, type) VALUES
  ('João Silva', 'gerente', '123456', 'manager'),
  ('Maria Santos', 'cobrador1', '123456', 'collector'),
  ('Pedro Costa', 'cobrador2', '123456', 'collector')
ON CONFLICT (login) DO NOTHING;