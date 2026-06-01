-- Reconstituída do baseline remoto (migração 20250618185325 'cold_cliff').
-- Gerada a partir de supabase_migrations.schema_migrations para alinhar repo <-> banco.

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can manage collector stores" ON collector_stores;

DROP POLICY IF EXISTS "Authenticated users can read collector stores" ON collector_stores;

-- Create new policies for collector_stores table
CREATE POLICY "Enable read access for authenticated users"
  ON collector_stores
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert for authenticated users"
  ON collector_stores
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users"
  ON collector_stores
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users"
  ON collector_stores
  FOR DELETE
  TO authenticated
  USING (true);
