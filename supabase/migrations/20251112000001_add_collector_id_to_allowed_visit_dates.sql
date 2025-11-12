-- Add collector_id column to allowed_visit_dates table
ALTER TABLE public.allowed_visit_dates
ADD COLUMN collector_id uuid;

-- Add foreign key constraint to users table
ALTER TABLE public.allowed_visit_dates
ADD CONSTRAINT fk_allowed_visit_dates_collector_id 
FOREIGN KEY (collector_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Create index on collector_id for better query performance
CREATE INDEX IF NOT EXISTS idx_allowed_visit_dates_collector_id 
ON public.allowed_visit_dates(collector_id) TABLESPACE pg_default;

-- Create a composite index for common queries (collector + city + neighborhood)
CREATE INDEX IF NOT EXISTS idx_allowed_visit_dates_collector_city_neighborhood 
ON public.allowed_visit_dates(collector_id, city, neighborhood) TABLESPACE pg_default;

-- Update existing records if needed (optional - comment out if you want to handle this manually)
-- In this case, we'll leave them NULL so they can be properly assigned to collectors
