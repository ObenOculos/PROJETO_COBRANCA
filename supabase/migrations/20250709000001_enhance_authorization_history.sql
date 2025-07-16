-- Migration: Enhance authorization_history table with client and sales context
-- Description: Add additional fields to provide managers with better context for authorization decisions

-- Add new columns to authorization_history table
ALTER TABLE authorization_history 
ADD COLUMN client_phone text,
ADD COLUMN client_mobile text,
ADD COLUMN client_address text,
ADD COLUMN client_neighborhood text,
ADD COLUMN client_city text,
ADD COLUMN total_sales_count integer DEFAULT 0,
ADD COLUMN total_sales_value numeric(10,2) DEFAULT 0,
ADD COLUMN total_pending_value numeric(10,2) DEFAULT 0,
ADD COLUMN total_received_value numeric(10,2) DEFAULT 0,
ADD COLUMN last_payment_date timestamptz,
ADD COLUMN last_payment_amount numeric(10,2),
ADD COLUMN overdue_installments_count integer DEFAULT 0,
ADD COLUMN collector_performance_score numeric(3,2) DEFAULT 0; -- 0-100 scale

-- Add comments for new columns
COMMENT ON COLUMN authorization_history.client_phone IS 'Client phone number for manager context';
COMMENT ON COLUMN authorization_history.client_mobile IS 'Client mobile number for manager context';
COMMENT ON COLUMN authorization_history.client_address IS 'Client address for manager context';
COMMENT ON COLUMN authorization_history.client_neighborhood IS 'Client neighborhood for manager context';
COMMENT ON COLUMN authorization_history.client_city IS 'Client city for manager context';
COMMENT ON COLUMN authorization_history.total_sales_count IS 'Total number of sales for this client';
COMMENT ON COLUMN authorization_history.total_sales_value IS 'Total value of all sales for this client';
COMMENT ON COLUMN authorization_history.total_pending_value IS 'Total pending amount for this client';
COMMENT ON COLUMN authorization_history.total_received_value IS 'Total amount already received from this client';
COMMENT ON COLUMN authorization_history.last_payment_date IS 'Date of last payment received from this client';
COMMENT ON COLUMN authorization_history.last_payment_amount IS 'Amount of last payment received from this client';
COMMENT ON COLUMN authorization_history.overdue_installments_count IS 'Number of overdue installments for this client';
COMMENT ON COLUMN authorization_history.collector_performance_score IS 'Collector performance score (0-100) for context';

-- Create index for better performance on new columns
CREATE INDEX idx_authorization_history_client_city ON authorization_history(client_city);
CREATE INDEX idx_authorization_history_total_pending_value ON authorization_history(total_pending_value);
CREATE INDEX idx_authorization_history_overdue_installments_count ON authorization_history(overdue_installments_count);