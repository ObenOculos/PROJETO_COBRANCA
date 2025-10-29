ALTER TABLE public.scheduled_visits
ADD COLUMN scheduled_by_manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.scheduled_visits.scheduled_by_manager_id IS 'ID of the manager who scheduled the visit, if any.';
