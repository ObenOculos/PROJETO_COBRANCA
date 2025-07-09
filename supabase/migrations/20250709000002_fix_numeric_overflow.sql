-- Migration: Fix numeric field overflow in authorization_history table
-- Description: Increase precision of numeric fields to handle larger values

-- Increase precision of numeric fields to handle larger values
ALTER TABLE authorization_history 
ALTER COLUMN total_sales_value TYPE numeric(15,2),
ALTER COLUMN total_pending_value TYPE numeric(15,2),
ALTER COLUMN total_received_value TYPE numeric(15,2),
ALTER COLUMN last_payment_amount TYPE numeric(15,2);

-- Add check constraints to prevent extremely large values
ALTER TABLE authorization_history
ADD CONSTRAINT chk_total_sales_value CHECK (total_sales_value >= 0 AND total_sales_value < 1000000000),
ADD CONSTRAINT chk_total_pending_value CHECK (total_pending_value >= 0 AND total_pending_value < 1000000000),
ADD CONSTRAINT chk_total_received_value CHECK (total_received_value >= 0 AND total_received_value < 1000000000),
ADD CONSTRAINT chk_last_payment_amount CHECK (last_payment_amount >= 0 AND last_payment_amount < 1000000000);

-- Update comments to reflect new limits
COMMENT ON COLUMN authorization_history.total_sales_value IS 'Total value of all sales for this client (max 1B)';
COMMENT ON COLUMN authorization_history.total_pending_value IS 'Total pending amount for this client (max 1B)';
COMMENT ON COLUMN authorization_history.total_received_value IS 'Total amount already received from this client (max 1B)';
COMMENT ON COLUMN authorization_history.last_payment_amount IS 'Amount of last payment received from this client (max 1B)';