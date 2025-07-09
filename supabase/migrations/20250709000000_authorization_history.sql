-- Migration: Create authorization_history table
-- Description: Creates a table to track authorization requests for payment editing
-- This table will replace localStorage with persistent database storage

-- Create the authorization_history table
CREATE TABLE authorization_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL,
    collector_id uuid REFERENCES users(id),
    collector_name text NOT NULL,
    client_name text NOT NULL,
    client_document text NOT NULL,
    requested_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    processed_at timestamptz,
    processed_by_id uuid REFERENCES users(id),
    processed_by_name text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_authorization_history_token ON authorization_history(token);
CREATE INDEX idx_authorization_history_collector_id ON authorization_history(collector_id);
CREATE INDEX idx_authorization_history_status ON authorization_history(status);
CREATE INDEX idx_authorization_history_requested_at ON authorization_history(requested_at);
CREATE INDEX idx_authorization_history_processed_at ON authorization_history(processed_at);
CREATE INDEX idx_authorization_history_client_document ON authorization_history(client_document);

-- Add trigger to update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_authorization_history_updated_at
    BEFORE UPDATE ON authorization_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE authorization_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON authorization_history;
DROP POLICY IF EXISTS "Enable insert access for all users" ON authorization_history;
DROP POLICY IF EXISTS "Enable update access for all users" ON authorization_history;
DROP POLICY IF EXISTS "Enable delete access for all users" ON authorization_history;

-- Create RLS policies for authorization_history table
-- All authenticated users can read authorization history
CREATE POLICY "Enable read access for all users"
ON authorization_history FOR SELECT
TO authenticated
USING (true);

-- All authenticated users can insert authorization requests
CREATE POLICY "Enable insert access for all users"
ON authorization_history FOR INSERT
TO authenticated
WITH CHECK (true);

-- All authenticated users can update authorization requests
CREATE POLICY "Enable update access for all users"
ON authorization_history FOR UPDATE
TO authenticated
USING (true);

-- Only managers can delete authorization history (for data cleanup)
CREATE POLICY "Enable delete access for managers"
ON authorization_history FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.type = 'manager'
    )
);

-- Add comments to document the table structure
COMMENT ON TABLE authorization_history IS 'Stores authorization requests for payment editing with complete audit trail';
COMMENT ON COLUMN authorization_history.id IS 'Primary key - unique identifier for each authorization request';
COMMENT ON COLUMN authorization_history.token IS 'Six-digit token generated for the authorization request';
COMMENT ON COLUMN authorization_history.collector_id IS 'Foreign key to users table - collector who made the request';
COMMENT ON COLUMN authorization_history.collector_name IS 'Name of the collector (cached for performance)';
COMMENT ON COLUMN authorization_history.client_name IS 'Name of the client for which payment editing was requested';
COMMENT ON COLUMN authorization_history.client_document IS 'Document number of the client';
COMMENT ON COLUMN authorization_history.requested_at IS 'Timestamp when the authorization was requested';
COMMENT ON COLUMN authorization_history.expires_at IS 'Timestamp when the authorization expires (5 minutes after approval)';
COMMENT ON COLUMN authorization_history.status IS 'Current status: pending, approved, rejected, or expired';
COMMENT ON COLUMN authorization_history.processed_at IS 'Timestamp when the request was approved/rejected';
COMMENT ON COLUMN authorization_history.processed_by_id IS 'Foreign key to users table - manager who processed the request';
COMMENT ON COLUMN authorization_history.processed_by_name IS 'Name of the manager who processed the request (cached for performance)';
COMMENT ON COLUMN authorization_history.notes IS 'Optional notes about the authorization request';
COMMENT ON COLUMN authorization_history.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN authorization_history.updated_at IS 'Timestamp when the record was last updated';