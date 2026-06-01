-- Reconstituída do baseline remoto (migração 20250617180221 'still_canyon').
-- Gerada a partir de supabase_migrations.schema_migrations para alinhar repo <-> banco.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  login text UNIQUE NOT NULL,
  password text NOT NULL,
  type text NOT NULL CHECK (type IN ('manager', 'collector')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política para usuários lerem seus próprios dados
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

-- Política para gerentes lerem todos os dados
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

-- Política para gerentes gerenciarem usuários
CREATE POLICY "Managers can manage users"
  ON users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND type = 'manager'
    )
  );

-- Inserir usuários padrão
INSERT INTO users (name, login, password, type) VALUES
  ('João Silva', 'gerente', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'manager'),
  ('Maria Santos', 'cobrador1', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'collector'),
  ('Pedro Costa', 'cobrador2', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'collector');
