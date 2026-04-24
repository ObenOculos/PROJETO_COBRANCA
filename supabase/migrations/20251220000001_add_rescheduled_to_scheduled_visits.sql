-- Add rescheduled_to column to scheduled_visits table
ALTER TABLE scheduled_visits ADD COLUMN rescheduled_to TEXT;