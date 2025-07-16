-- Criação da tabela sale_payments para armazenar histórico de pagamentos
-- Esta tabela manterá um registro completo de todos os pagamentos recebidos pelos cobradores

CREATE TABLE IF NOT EXISTS public.sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação do pagamento
    sale_number INTEGER,
    client_document TEXT NOT NULL,
    client_name TEXT,
    
    -- Valores do pagamento
    payment_amount NUMERIC(10,2) NOT NULL CHECK (payment_amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'dinheiro',
    
    -- Observações e detalhes
    notes TEXT,
    
    -- Identificação do cobrador
    collector_id UUID NOT NULL,
    collector_name TEXT,
    
    -- Detalhes da distribuição do pagamento entre parcelas
    distribution_details JSONB,
    
    -- Localização (opcional)
    store_name TEXT,
    
    -- Controle temporal
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para melhor performance
    CONSTRAINT fk_collector_id 
        FOREIGN KEY (collector_id) 
        REFERENCES users(id) 
        ON DELETE SET NULL
);

-- Criar índices para melhorar performance das consultas
CREATE INDEX IF NOT EXISTS idx_sale_payments_payment_date 
    ON public.sale_payments (payment_date);

CREATE INDEX IF NOT EXISTS idx_sale_payments_collector_id 
    ON public.sale_payments (collector_id);

CREATE INDEX IF NOT EXISTS idx_sale_payments_client_document 
    ON public.sale_payments (client_document);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_number 
    ON public.sale_payments (sale_number);

CREATE INDEX IF NOT EXISTS idx_sale_payments_created_at 
    ON public.sale_payments (created_at);

-- Índice composto para consultas do relatório (cobrador + data)
CREATE INDEX IF NOT EXISTS idx_sale_payments_collector_date 
    ON public.sale_payments (collector_id, payment_date);

-- Índice composto para consultas por cliente (documento + data)
CREATE INDEX IF NOT EXISTS idx_sale_payments_client_date 
    ON public.sale_payments (client_document, payment_date);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sale_payments_updated_at 
    BEFORE UPDATE ON public.sale_payments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS (Row Level Security) se necessário
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

-- Política de segurança: permitir acesso total para usuários autenticados
CREATE POLICY "Authenticated users full access" ON public.sale_payments
    FOR ALL USING (auth.role() = 'authenticated');

-- Comentários para documentação
COMMENT ON TABLE public.sale_payments IS 'Histórico completo de pagamentos recebidos pelos cobradores';
COMMENT ON COLUMN public.sale_payments.id IS 'ID único do pagamento';
COMMENT ON COLUMN public.sale_payments.sale_number IS 'Número da venda (pode ser NULL para pagamentos gerais)';
COMMENT ON COLUMN public.sale_payments.client_document IS 'Documento (CPF/CNPJ) do cliente';
COMMENT ON COLUMN public.sale_payments.client_name IS 'Nome do cliente';
COMMENT ON COLUMN public.sale_payments.payment_amount IS 'Valor total recebido pelo cobrador';
COMMENT ON COLUMN public.sale_payments.payment_date IS 'Data em que o pagamento foi recebido';
COMMENT ON COLUMN public.sale_payments.payment_method IS 'Método de pagamento (dinheiro, pix, cartão, etc.)';
COMMENT ON COLUMN public.sale_payments.notes IS 'Observações sobre o pagamento';
COMMENT ON COLUMN public.sale_payments.collector_id IS 'ID do cobrador que recebeu o pagamento';
COMMENT ON COLUMN public.sale_payments.collector_name IS 'Nome do cobrador (desnormalizado para performance)';
COMMENT ON COLUMN public.sale_payments.distribution_details IS 'Detalhes JSON de como o pagamento foi distribuído entre as parcelas';
COMMENT ON COLUMN public.sale_payments.store_name IS 'Nome da loja (se aplicável)';
COMMENT ON COLUMN public.sale_payments.created_at IS 'Data/hora de criação do registro';
COMMENT ON COLUMN public.sale_payments.updated_at IS 'Data/hora da última atualização';

-- Exemplo de uso da tabela:
/*
INSERT INTO public.sale_payments (
    sale_number,
    client_document,
    client_name,
    payment_amount,
    payment_date,
    payment_method,
    notes,
    collector_id,
    collector_name,
    distribution_details,
    store_name
) VALUES (
    12345,
    '123.456.789-00',
    'João Silva',
    500.00,
    '2025-01-11',
    'dinheiro',
    'Pagamento recebido em visita domiciliar',
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'Maria Cobradora',
    '{"parcelas": [{"id": 1, "valor": 300}, {"id": 2, "valor": 200}]}',
    'Loja Centro'
);
*/