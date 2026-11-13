-- Item 61, etapa D -- Conferencia de recebimentos: o gestor marca um cliente
-- do mes como conferido (ou reabre), com observacao.
--
-- Fato historico: so INSERT (sem policy de UPDATE/DELETE). O estado atual de
-- um cliente no mes e a ULTIMA marcacao (created_at, id); reabrir e uma
-- marcacao nova com acao 'reaberto'. A marcacao guarda os valores da linha no
-- momento (base/app) e a visao da tela, para a tela avisar quando os valores
-- mudaram depois da conferencia (baixa ou registro novo no mes).

CREATE TABLE public.conferencia_marcacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes date NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
  -- Mesma grafia de BANCO_DADOS.documento / sale_payments.client_document.
  documento text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('conferido', 'reaberto')),
  observacao text,
  visao text NOT NULL CHECK (visao IN ('todos', 'carteira')),
  base_valor numeric(14, 2) NOT NULL,
  app_valor numeric(14, 2) NOT NULL,
  registrado_por_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Conferir com diferenca (> R$ 1) ou reabrir pede o motivo.
  CHECK (
    length(trim(coalesce(observacao, ''))) > 0
    OR (acao = 'conferido' AND abs(app_valor - base_valor) <= 1)
  )
);

COMMENT ON TABLE public.conferencia_marcacoes IS
  'Conferencia de recebimentos: cliente do mes marcado como conferido/reaberto pelo gestor (historico; vale a ultima marcacao).';

CREATE INDEX conferencia_marcacoes_mes_idx
  ON public.conferencia_marcacoes (mes, documento, created_at);

ALTER TABLE public.conferencia_marcacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_gestor ON public.conferencia_marcacoes
  FOR SELECT TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager');

CREATE POLICY insert_gestor ON public.conferencia_marcacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT app_current_user_type()) = 'manager'
    AND registrado_por_id = (SELECT app_current_user_id())
  );

GRANT SELECT, INSERT ON public.conferencia_marcacoes TO authenticated;
REVOKE ALL ON public.conferencia_marcacoes FROM anon;
