/*
  # Create collection_attempts table

  1. New Tables
    - `collection_attempts`
      - `id` (uuid, primary key)
      - `collection_id` (text, references collection data)
      - `date` (text, not null)
      - `type` (text, not null)
      - `result` (text, not null)
      - `notes` (text, nullable)
      - `next_action` (text, nullable)
      - `next_action_date` (text, nullable)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `collection_attempts` table
    - Add policies for managing collection attempts
*/

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