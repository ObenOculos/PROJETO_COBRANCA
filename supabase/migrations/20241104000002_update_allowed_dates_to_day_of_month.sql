-- Migration: Update allowed_visit_dates to store day of month instead of full date
-- This allows recurring monthly visits on the same day

-- Step 1: Add a temporary column to store the day of month
ALTER TABLE public.allowed_visit_dates ADD COLUMN IF NOT EXISTS day_of_month INTEGER;

-- Step 2: Extract the day from existing dates and store in the new column
UPDATE public.allowed_visit_dates
SET day_of_month = EXTRACT(DAY FROM allowed_date);

-- Step 3: Drop the old allowed_date column
ALTER TABLE public.allowed_visit_dates DROP COLUMN allowed_date;

-- Step 4: Rename day_of_month to allowed_date
ALTER TABLE public.allowed_visit_dates RENAME COLUMN day_of_month TO allowed_date;

-- Step 5: Add a constraint to ensure allowed_date is between 1 and 31
ALTER TABLE public.allowed_visit_dates 
ADD CONSTRAINT allowed_date_range CHECK (allowed_date >= 1 AND allowed_date <= 31);

-- Step 6: Add a comment to the column explaining the new format
COMMENT ON COLUMN public.allowed_visit_dates.allowed_date IS 'Day of month (1-31) when visits are allowed for this city/neighborhood combination. This applies to every month.';

-- Note: From now on, allowed_date should only contain values 1-31 (as integers)
