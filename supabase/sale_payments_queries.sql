-- Consultas úteis para a tabela sale_payments

-- 1. Relatório diário por cobrador
SELECT 
    sp.collector_name,
    sp.payment_date,
    COUNT(*) as total_pagamentos,
    SUM(sp.payment_amount) as total_recebido,
    AVG(sp.payment_amount) as ticket_medio,
    STRING_AGG(DISTINCT sp.client_name, ', ') as clientes_atendidos
FROM public.sale_payments sp
WHERE sp.payment_date = CURRENT_DATE
GROUP BY sp.collector_id, sp.collector_name, sp.payment_date
ORDER BY total_recebido DESC;

-- 2. Histórico de pagamentos de um cliente específico
SELECT 
    sp.payment_date,
    sp.sale_number,
    sp.payment_amount,
    sp.payment_method,
    sp.collector_name,
    sp.notes,
    sp.created_at
FROM public.sale_payments sp
WHERE sp.client_document = '123.456.789-00'
ORDER BY sp.payment_date DESC, sp.created_at DESC;

-- 3. Performance de cobradores por período
SELECT 
    sp.collector_name,
    DATE_TRUNC('month', sp.payment_date) as mes,
    COUNT(*) as total_pagamentos,
    SUM(sp.payment_amount) as total_recebido,
    COUNT(DISTINCT sp.client_document) as clientes_unicos,
    AVG(sp.payment_amount) as ticket_medio
FROM public.sale_payments sp
WHERE sp.payment_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY sp.collector_id, sp.collector_name, DATE_TRUNC('month', sp.payment_date)
ORDER BY mes DESC, total_recebido DESC;

-- 4. Pagamentos por método de pagamento
SELECT 
    sp.payment_method,
    COUNT(*) as total_transacoes,
    SUM(sp.payment_amount) as total_valor,
    AVG(sp.payment_amount) as valor_medio
FROM public.sale_payments sp
WHERE sp.payment_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY sp.payment_method
ORDER BY total_valor DESC;

-- 5. Relatório de pagamentos por loja
SELECT 
    sp.store_name,
    COUNT(*) as total_pagamentos,
    SUM(sp.payment_amount) as total_recebido,
    COUNT(DISTINCT sp.collector_id) as cobradores_ativos,
    COUNT(DISTINCT sp.client_document) as clientes_unicos
FROM public.sale_payments sp
WHERE sp.payment_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY sp.store_name
ORDER BY total_recebido DESC;

-- 6. Pagamentos recentes (últimas 24 horas)
SELECT 
    sp.payment_date,
    sp.client_name,
    sp.payment_amount,
    sp.collector_name,
    sp.payment_method,
    sp.created_at
FROM public.sale_payments sp
WHERE sp.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY sp.created_at DESC;

-- 7. Análise de vendas específicas
SELECT 
    sp.sale_number,
    sp.client_name,
    COUNT(*) as total_pagamentos,
    SUM(sp.payment_amount) as total_pago,
    MIN(sp.payment_date) as primeiro_pagamento,
    MAX(sp.payment_date) as ultimo_pagamento,
    STRING_AGG(DISTINCT sp.collector_name, ', ') as cobradores
FROM public.sale_payments sp
WHERE sp.sale_number IS NOT NULL
GROUP BY sp.sale_number, sp.client_name
HAVING COUNT(*) > 1  -- Vendas com mais de um pagamento
ORDER BY total_pago DESC;

-- 8. Cobradores mais ativos por dia da semana
SELECT 
    TO_CHAR(sp.payment_date, 'Day') as dia_semana,
    sp.collector_name,
    COUNT(*) as total_pagamentos,
    SUM(sp.payment_amount) as total_recebido
FROM public.sale_payments sp
WHERE sp.payment_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY EXTRACT(DOW FROM sp.payment_date), TO_CHAR(sp.payment_date, 'Day'), sp.collector_name
ORDER BY EXTRACT(DOW FROM sp.payment_date), total_recebido DESC;

-- 9. Distribuição de valores por faixa
SELECT 
    CASE 
        WHEN sp.payment_amount < 100 THEN 'Até R$ 100'
        WHEN sp.payment_amount < 500 THEN 'R$ 100 - R$ 500'
        WHEN sp.payment_amount < 1000 THEN 'R$ 500 - R$ 1.000'
        WHEN sp.payment_amount < 2000 THEN 'R$ 1.000 - R$ 2.000'
        ELSE 'Acima de R$ 2.000'
    END as faixa_valor,
    COUNT(*) as quantidade,
    SUM(sp.payment_amount) as total_valor,
    ROUND(AVG(sp.payment_amount), 2) as valor_medio
FROM public.sale_payments sp
WHERE sp.payment_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY 
    CASE 
        WHEN sp.payment_amount < 100 THEN 'Até R$ 100'
        WHEN sp.payment_amount < 500 THEN 'R$ 100 - R$ 500'
        WHEN sp.payment_amount < 1000 THEN 'R$ 500 - R$ 1.000'
        WHEN sp.payment_amount < 2000 THEN 'R$ 1.000 - R$ 2.000'
        ELSE 'Acima de R$ 2.000'
    END
ORDER BY MIN(sp.payment_amount);

-- 10. Clientes com mais pagamentos
SELECT 
    sp.client_document,
    sp.client_name,
    COUNT(*) as total_pagamentos,
    SUM(sp.payment_amount) as total_pago,
    MIN(sp.payment_date) as primeiro_pagamento,
    MAX(sp.payment_date) as ultimo_pagamento,
    ROUND(AVG(sp.payment_amount), 2) as valor_medio_pagamento
FROM public.sale_payments sp
GROUP BY sp.client_document, sp.client_name
HAVING COUNT(*) >= 3  -- Clientes com 3 ou mais pagamentos
ORDER BY total_pago DESC;

-- View para relatório diário (opcional)
CREATE OR REPLACE VIEW daily_payment_report AS
SELECT 
    sp.payment_date,
    sp.collector_id,
    sp.collector_name,
    COUNT(*) as total_payments,
    SUM(sp.payment_amount) as total_received,
    AVG(sp.payment_amount) as average_payment,
    COUNT(DISTINCT sp.client_document) as unique_clients,
    COUNT(DISTINCT sp.sale_number) as unique_sales,
    MIN(sp.payment_amount) as min_payment,
    MAX(sp.payment_amount) as max_payment
FROM public.sale_payments sp
GROUP BY sp.payment_date, sp.collector_id, sp.collector_name
ORDER BY sp.payment_date DESC, total_received DESC;

COMMENT ON VIEW daily_payment_report IS 'Relatório diário consolidado de pagamentos por cobrador';