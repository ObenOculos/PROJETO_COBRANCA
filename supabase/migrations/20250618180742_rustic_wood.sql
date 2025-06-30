/*
  # Create collector_stores table

  1. New Tables
    - `collector_stores`
      - `id` (uuid, primary key)
      - `collector_id` (uuid, foreign key to users)
      - `store_name` (text, not null)
      - `created_at` (timestamp with time zone)

  2. Security
    - Enable RLS on `collector_stores` table
    - Add policies for authenticated users to read and manage

  3. Constraints
    - Unique constraint on (collector_id, store_name) to prevent duplicates
*/

-- Create the collector_stores table
CREATE TABLE IF NOT EXISTS public.collector_stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collector_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    store_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Add unique constraint using DO block to handle IF NOT EXISTS logic
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'collector_stores_collector_id_store_name_key'
        AND table_name = 'collector_stores'
    ) THEN
        ALTER TABLE public.collector_stores 
        ADD CONSTRAINT collector_stores_collector_id_store_name_key 
        UNIQUE (collector_id, store_name);
    END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.collector_stores ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and create new ones
DO $$
BEGIN
    DROP POLICY IF EXISTS "Authenticated users can read collector stores" ON public.collector_stores;
    DROP POLICY IF EXISTS "Authenticated users can manage collector stores" ON public.collector_stores;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Create RLS policies for authenticated users
CREATE POLICY "Authenticated users can read collector stores"
  ON public.collector_stores
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage collector stores"
  ON public.collector_stores
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);