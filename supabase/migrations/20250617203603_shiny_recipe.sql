/*
  # Fix RLS Policies for Authentication

  1. Security Updates
    - Drop and recreate policies safely for all tables
    - Enable RLS where needed
    - Create permissive policies for authenticated users

  2. Tables Updated
    - `users` - Allow authenticated users to read and manage
    - `BANCO_DADOS_COBRANÇA` - Allow authenticated users to read and update
    - `collector_stores` - Allow authenticated users to read and manage
    - `collection_attempts` - Allow authenticated users to manage
*/

-- Function to safely drop and create policies
DO $$ 
BEGIN
  -- Drop existing policies for users table
  DROP POLICY IF EXISTS "Users can read all users" ON users;
  DROP POLICY IF EXISTS "Only managers can insert users" ON users;
  DROP POLICY IF EXISTS "Only managers can update users" ON users;
  DROP POLICY IF EXISTS "Only managers can delete users" ON users;
  DROP POLICY IF EXISTS "Authenticated users can read users" ON users;
  DROP POLICY IF EXISTS "Authenticated users can manage users" ON users;
  
  -- Drop existing policies for BANCO_DADOS_COBRANÇA
  DROP POLICY IF EXISTS "Authenticated users can read collections" ON "BANCO_DADOS_COBRANÇA";
  DROP POLICY IF EXISTS "Authenticated users can update collections" ON "BANCO_DADOS_COBRANÇA";
  
  -- Drop existing policies for collector_stores
  DROP POLICY IF EXISTS "Users can read collector stores" ON collector_stores;
  DROP POLICY IF EXISTS "Only managers can manage collector stores" ON collector_stores;
  DROP POLICY IF EXISTS "Authenticated users can read collector stores" ON collector_stores;
  DROP POLICY IF EXISTS "Authenticated users can manage collector stores" ON collector_stores;
  
  -- Drop existing policies for collection_attempts
  DROP POLICY IF EXISTS "Authenticated users can manage collection attempts" ON collection_attempts;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BANCO_DADOS_COBRANÇA" ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_attempts ENABLE ROW LEVEL SECURITY;

-- Create new policies for users table
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

-- Create new policies for BANCO_DADOS_COBRANÇA
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

-- Create new policies for collector_stores
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

-- Create new policies for collection_attempts
CREATE POLICY "Authenticated users can manage collection attempts"
  ON collection_attempts
  FOR ALL
  TO authenticated
  USING (true);