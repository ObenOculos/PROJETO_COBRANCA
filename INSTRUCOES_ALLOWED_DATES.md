# Instruções - Sistema de Datas Permitidas

## O que mudou?

O sistema de **Datas de Visita Permitidas** agora funciona com **dias do mês recorrentes**.

### Antes:

- Você selecionava uma data específica (ex: 2024-11-01)
- A visita só seria permitida naquela data específica

### Agora:

- Você seleciona o **dia do mês** (1 a 31)
- A visita será permitida **nesse dia em TODOS os meses**
- Exemplo: Se você selecionar "Dia 5" para uma cidade/bairro, as visitas serão permitidas todo dia 5 de cada mês

## Como usar:

1. Selecione a **Cidade**
2. Selecione o **Bairro**
3. Selecione o **Dia do Mês** (1 a 31)
4. Clique em **Adicionar Data**

## Exemplo prático:

Se você configurar:

- Cidade: São Paulo
- Bairro: Centro
- Dia: 15

Isso significa que visitas ao bairro Centro de São Paulo serão permitidas:

- 15 de janeiro
- 15 de fevereiro
- 15 de março
- ... e assim por diante

## SQL para executar no Supabase:

Execute este SQL no SQL Editor do Supabase para converter datas antigas:

```sql
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
```

## Validação no código:

O componente agora:

- ✅ Mostra um select com dias de 1 a 31
- ✅ Salva apenas o número do dia
- ✅ Exibe como "Dia X de cada mês" na tabela
- ✅ Ordena por cidade, bairro e dia
- ✅ Limpa o formulário após adicionar
- ✅ Mostra mensagem quando não há datas cadastradas
