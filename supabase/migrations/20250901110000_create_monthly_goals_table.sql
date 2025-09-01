-- supabase/migrations/20250901110000_create_monthly_goals_table.sql

CREATE TABLE public.monthly_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    visits_goal INTEGER NOT NULL,
    payments_goal NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_goal_per_user_month UNIQUE (user_id, month)
);

COMMENT ON TABLE public.monthly_goals IS 'Stores monthly performance goals for each user.';
COMMENT ON COLUMN public.monthly_goals.month IS 'The first day of the month for which the goal is set (e.g., 2025-10-01).';
COMMENT ON COLUMN public.monthly_goals.visits_goal IS 'The total number of visits targeted for the month.';
COMMENT ON COLUMN public.monthly_goals.payments_goal IS 'The total payment amount targeted for the month.';

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.monthly_goals
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
