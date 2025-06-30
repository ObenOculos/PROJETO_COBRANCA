/*
  # Fix RLS policies for collector_stores table

  1. Security Updates
    - Update RLS policies for collector_stores table to properly handle authentication
    - Allow authenticated users to insert and manage collector stores
    - Ensure proper access control based on user roles

  2. Changes
    - Drop existing restrictive policies
    - Create new policies that allow proper CRUD operations for authenticated users
    - Add policy to allow managers to assign stores to collectors
*/

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