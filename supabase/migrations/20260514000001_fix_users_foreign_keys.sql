-- Migration to fix foreign key constraints that prevent deleting users.
-- We change them to ON DELETE SET NULL or ON DELETE CASCADE where appropriate.

-- 1. BANCO_DADOS (Assignments)
ALTER TABLE public."BANCO_DADOS" 
DROP CONSTRAINT IF EXISTS fk_banco_dados_user;

ALTER TABLE public."BANCO_DADOS"
ADD CONSTRAINT fk_banco_dados_user 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. sale_payments
ALTER TABLE public.sale_payments 
DROP CONSTRAINT IF EXISTS fk_collector_id;

ALTER TABLE public.sale_payments
ADD CONSTRAINT fk_collector_id 
FOREIGN KEY (collector_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. authorization_history (collector)
ALTER TABLE public.authorization_history 
DROP CONSTRAINT IF EXISTS authorization_history_collector_id_fkey;

ALTER TABLE public.authorization_history
ADD CONSTRAINT authorization_history_collector_id_fkey 
FOREIGN KEY (collector_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 4. authorization_history (processed_by)
ALTER TABLE public.authorization_history 
DROP CONSTRAINT IF EXISTS authorization_history_processed_by_id_fkey;

ALTER TABLE public.authorization_history
ADD CONSTRAINT authorization_history_processed_by_id_fkey 
FOREIGN KEY (processed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 5. monthly_goals
ALTER TABLE public.monthly_goals 
DROP CONSTRAINT IF EXISTS monthly_goals_user_id_fkey;

ALTER TABLE public.monthly_goals
ADD CONSTRAINT monthly_goals_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 6. scheduled_visits (collector_id)
-- Note: Checking if constraint exists before adding. Name is usually automatic if not specified.
ALTER TABLE public.scheduled_visits
DROP CONSTRAINT IF EXISTS scheduled_visits_collector_id_fkey;

ALTER TABLE public.scheduled_visits
ADD CONSTRAINT scheduled_visits_collector_id_fkey
FOREIGN KEY (collector_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 7. scheduled_visits (scheduled_by_manager_id)
ALTER TABLE public.scheduled_visits
DROP CONSTRAINT IF EXISTS scheduled_visits_scheduled_by_manager_id_fkey;

ALTER TABLE public.scheduled_visits
ADD CONSTRAINT scheduled_visits_scheduled_by_manager_id_fkey
FOREIGN KEY (scheduled_by_manager_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 8. allowed_visit_dates
ALTER TABLE public.allowed_visit_dates
DROP CONSTRAINT IF EXISTS fk_allowed_visit_dates_collector_id;

ALTER TABLE public.allowed_visit_dates
ADD CONSTRAINT fk_allowed_visit_dates_collector_id
FOREIGN KEY (collector_id) REFERENCES public.users(id) ON DELETE CASCADE;
