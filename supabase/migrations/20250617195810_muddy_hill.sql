-- Reconstituída do baseline remoto (migração 20250617195810 'muddy_hill').
-- Gerada a partir de supabase_migrations.schema_migrations para alinhar repo <-> banco.

CREATE TABLE IF NOT EXISTS collection_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id text,
  date text NOT NULL,
  type text NOT NULL,
  result text NOT NULL,
  notes text,
  next_action text,
  next_action_date text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE collection_attempts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage collection attempts
CREATE POLICY "Authenticated users can manage collection attempts"
  ON collection_attempts
  FOR ALL
  TO authenticated
  USING (true);
