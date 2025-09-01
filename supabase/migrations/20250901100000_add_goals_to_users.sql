
ALTER TABLE public.users
ADD COLUMN daily_visits_goal INTEGER DEFAULT 10,
ADD COLUMN weekly_visits_goal INTEGER DEFAULT 50,
ADD COLUMN monthly_visits_goal INTEGER DEFAULT 200;

-- Adicionar metas de pagamentos também, para consistência
ALTER TABLE public.users
ADD COLUMN daily_payments_goal NUMERIC DEFAULT 5000,
ADD COLUMN weekly_payments_goal NUMERIC DEFAULT 25000,
ADD COLUMN monthly_payments_goal NUMERIC DEFAULT 100000;

-- Atualizar os usuários existentes com os valores padrão
UPDATE public.users
SET
    daily_visits_goal = 10,
    weekly_visits_goal = 50,
    monthly_visits_goal = 200,
    daily_payments_goal = 5000,
    weekly_payments_goal = 25000,
    monthly_payments_goal = 100000
WHERE
    daily_visits_goal IS NULL;
