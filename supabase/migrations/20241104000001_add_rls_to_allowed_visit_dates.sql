-- Enable Row Level Security on allowed_visit_dates
ALTER TABLE public.allowed_visit_dates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow managers full access on allowed_visit_dates" ON public.allowed_visit_dates;
DROP POLICY IF EXISTS "Allow authenticated users to view allowed_visit_dates" ON public.allowed_visit_dates;

-- Allow managers to perform all operations on allowed_visit_dates
CREATE POLICY "Allow managers full access on allowed_visit_dates"
ON public.allowed_visit_dates
FOR ALL
TO authenticated
USING (
  (SELECT type FROM public.users WHERE id = auth.uid()) = 'manager'
)
WITH CHECK (
  (SELECT type FROM public.users WHERE id = auth.uid()) = 'manager'
);

-- Allow all authenticated users to view allowed_visit_dates
CREATE POLICY "Allow authenticated users to view allowed_visit_dates"
ON public.allowed_visit_dates
FOR SELECT
TO authenticated
USING (true);
