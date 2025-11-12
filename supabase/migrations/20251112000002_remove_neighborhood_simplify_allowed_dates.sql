-- Remove neighborhood column from allowed_visit_dates table
-- This simplifies the table to track only city and day of month per collector

-- Drop the existing composite index that includes neighborhood
DROP INDEX IF EXISTS idx_allowed_visit_dates_city_neighborhood;
DROP INDEX IF EXISTS idx_allowed_visit_dates_collector_city_neighborhood;

-- Drop the constraint that was validating day range
ALTER TABLE public.allowed_visit_dates
DROP CONSTRAINT IF EXISTS allowed_date_range;

-- Drop the neighborhood column
ALTER TABLE public.allowed_visit_dates
DROP COLUMN IF EXISTS neighborhood;

-- Add back the constraint
ALTER TABLE public.allowed_visit_dates
ADD CONSTRAINT allowed_date_range CHECK (
  (allowed_date >= 1) AND (allowed_date <= 31)
);

-- Create new simplified indices
CREATE INDEX IF NOT EXISTS idx_allowed_visit_dates_collector_city 
ON public.allowed_visit_dates(collector_id, city) TABLESPACE pg_default;

-- Ensure unique constraint: only one entry per collector + city + day
CREATE UNIQUE INDEX IF NOT EXISTS idx_allowed_visit_dates_unique_collector_city_day
ON public.allowed_visit_dates(collector_id, city, allowed_date)
WHERE collector_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE public.allowed_visit_dates IS 'Allowed visit dates per collector and city. Tracks which days of the month each collector can visit specific cities.';
COMMENT ON COLUMN public.allowed_visit_dates.collector_id IS 'Reference to the collector (user) - allows multi-tenancy per collector';
COMMENT ON COLUMN public.allowed_visit_dates.city IS 'City name - simplified to avoid excessive records per neighborhood';
COMMENT ON COLUMN public.allowed_visit_dates.allowed_date IS 'Day of month (1-31) when visits are allowed';
