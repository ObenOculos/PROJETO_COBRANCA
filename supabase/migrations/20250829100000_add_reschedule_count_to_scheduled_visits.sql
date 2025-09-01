ALTER TABLE public.scheduled_visits
ADD COLUMN reschedule_count INT DEFAULT 0;