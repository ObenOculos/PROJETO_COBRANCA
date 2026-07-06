-- Reintroduz segmentação OPCIONAL por bairro em allowed_visit_dates.
--
-- Contexto: a coluna neighborhood foi removida na migração
-- 20251112000002 ("simplificar para cidade e dia por cobrador"). Cidades grandes
-- precisam de dias diferentes por área, então o bairro volta — porém OPCIONAL:
--   neighborhood NULL  = regra de nível cidade (vale para a cidade inteira);
--   neighborhood != NULL = regra específica daquele bairro.
-- O agendamento usa a regra do bairro do cliente quando existir e cai na regra da
-- cidade (NULL) caso contrário. Assim o bairro é opt-in e não recria o excesso de
-- registros que motivou a remoção anterior.

-- 1. Coluna bairro (nullable). NULL = cidade inteira.
ALTER TABLE public.allowed_visit_dates
ADD COLUMN IF NOT EXISTS neighborhood text;

-- 2. Índice único passa a considerar o bairro. Usa COALESCE(neighborhood,'')
--    porque, por padrão, o Postgres trata NULLs como DISTINTOS num índice único —
--    sem o COALESCE, duas linhas de nível cidade (bairro NULL) para o mesmo
--    cobrador/cidade/dia não seriam bloqueadas como duplicata.
DROP INDEX IF EXISTS idx_allowed_visit_dates_unique_collector_city_day;

CREATE UNIQUE INDEX IF NOT EXISTS idx_allowed_visit_dates_unique_collector_city_hood_day
ON public.allowed_visit_dates (
  collector_id,
  city,
  COALESCE(neighborhood, ''),
  allowed_date
)
WHERE collector_id IS NOT NULL;

-- 3. Índice de apoio para consultas por cobrador+cidade+bairro.
CREATE INDEX IF NOT EXISTS idx_allowed_visit_dates_collector_city_hood
ON public.allowed_visit_dates (collector_id, city, neighborhood) TABLESPACE pg_default;

-- 4. Documentação.
COMMENT ON COLUMN public.allowed_visit_dates.neighborhood IS 'Bairro (opcional). NULL = regra vale para a cidade inteira; preenchido = regra específica do bairro. O agendamento prefere a regra do bairro e cai na da cidade.';
COMMENT ON TABLE public.allowed_visit_dates IS 'Datas de visita permitidas por cobrador, cidade e (opcionalmente) bairro. Define em quais dias do mês cada cobrador pode visitar cada área.';
