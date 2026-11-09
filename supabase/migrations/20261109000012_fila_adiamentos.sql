-- Item 39 -- Fila de Cobranca, etapa 2: "Deixar para depois".
--
-- O cobrador tira um cliente da vez na lista "Ligar" com um motivo; o
-- cliente vai para o fim da lista SO no dia do registro. Fato historico:
-- nao se apaga nem se edita (sem policy de UPDATE/DELETE); serve depois para
-- a supervisao (etapa 3) ver quem foi deixado de lado e por que.

CREATE TABLE public.fila_adiamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES public.users(id),
  documento text NOT NULL,
  motivo text NOT NULL
    CHECK (motivo IN ('ligar_mais_tarde', 'sem_telefone', 'outro')),
  observacao text,
  dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (motivo <> 'outro' OR length(trim(coalesce(observacao, ''))) > 0)
);

COMMENT ON TABLE public.fila_adiamentos IS
  'Fila de Cobranca: cliente que o cobrador deixou para depois no dia (vai para o fim da lista Ligar so nesse dia).';

CREATE INDEX fila_adiamentos_collector_dia_idx
  ON public.fila_adiamentos (collector_id, dia);

ALTER TABLE public.fila_adiamentos ENABLE ROW LEVEL SECURITY;

-- Le: o proprio cobrador ou gestor.
CREATE POLICY select_dono_ou_gestor ON public.fila_adiamentos
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR collector_id = (SELECT app_current_user_id())
  );

-- Grava: so o proprio cobrador, para cliente da carteira dele, no dia de hoje.
CREATE POLICY insert_cobrador_da_carteira ON public.fila_adiamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    collector_id = (SELECT app_current_user_id())
    AND dia = ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = fila_adiamentos.documento
        AND b.user_id = (SELECT app_current_user_id())
    )
  );

GRANT SELECT, INSERT ON public.fila_adiamentos TO authenticated;
REVOKE ALL ON public.fila_adiamentos FROM anon;
