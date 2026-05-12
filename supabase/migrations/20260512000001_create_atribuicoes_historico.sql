-- Tabela de histórico de atribuições de clientes a cobradores.
-- Registra um evento por cliente (não por parcela) sempre que um gerente
-- executa assignCollectorToClients.

CREATE TABLE public.atribuicoes_historico (
    id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
    documento            text        NOT NULL,
    cliente_nome         text,
    nome_da_loja         text,
    cobrador_novo_id     text        NOT NULL,
    cobrador_anterior_id text,
    gerente_id           text        NOT NULL,
    assigned_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT atribuicoes_historico_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_atrib_cobrador    ON public.atribuicoes_historico(cobrador_novo_id);
CREATE INDEX idx_atrib_assigned_at ON public.atribuicoes_historico(assigned_at);
CREATE INDEX idx_atrib_gerente     ON public.atribuicoes_historico(gerente_id);

COMMENT ON TABLE public.atribuicoes_historico IS
  'Histórico de atribuições de clientes a cobradores. Um registro por cliente por evento de atribuição.';

ALTER TABLE public.atribuicoes_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados podem ver atribuicoes"
  ON public.atribuicoes_historico FOR SELECT TO authenticated USING (true);

CREATE POLICY "autenticados podem inserir atribuicoes"
  ON public.atribuicoes_historico FOR INSERT TO authenticated WITH CHECK (true);