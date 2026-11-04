-- Etapa 3a da iniciativa "Termo de Acordo automatico" (ver docs/PROGRESSO.md,
-- pendencia 12): configuracao padrao de acordo, definida pelo gestor no
-- painel, usada como ponto de partida (editavel pelo cobrador na negociacao,
-- decisao do usuario em 2026-11-04 -- "vou deixar um padrao, mas editavel
-- pelo cobrador quando necessario") pro calculo de multa/juros/desconto e
-- pros dados da empresa impressos no Termo de Acordo.
--
-- Vigencia em vez de UPDATE destrutivo, mesmo principio de
-- collector_overdue_ranges: mudar a configuracao nao pode reescrever as
-- condicoes sob as quais um acordo ja criado foi negociado (o acordo em si
-- ja guarda seus proprios valores finais em acordo_parcelas -- esta tabela
-- so alimenta o formulario de um acordo NOVO, nunca e lida depois disso).

CREATE TABLE public.acordo_configuracao_padrao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  multa_percentual numeric NOT NULL DEFAULT 0,
  juros_percentual_am numeric NOT NULL DEFAULT 0,
  desconto_padrao_percentual numeric NOT NULL DEFAULT 0,
  desconto_maximo_percentual numeric NOT NULL DEFAULT 0,
  dias_entre_parcelas integer NOT NULL DEFAULT 30,
  empresa_nome text,
  empresa_cnpj text,
  empresa_endereco text,
  empresa_chave_pix text,
  vigente_desde date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  vigente_ate date,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acordo_config_multa_valida CHECK (multa_percentual >= 0),
  CONSTRAINT acordo_config_juros_valido CHECK (juros_percentual_am >= 0),
  CONSTRAINT acordo_config_desconto_padrao_valido CHECK (desconto_padrao_percentual >= 0),
  CONSTRAINT acordo_config_desconto_maximo_valido CHECK (
    desconto_maximo_percentual >= 0
    AND desconto_maximo_percentual >= desconto_padrao_percentual
  ),
  CONSTRAINT acordo_config_dias_entre_parcelas_valido CHECK (dias_entre_parcelas > 0),
  CONSTRAINT acordo_config_vigencia_valida CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_desde)
);

-- No maximo 1 configuracao ATIVA por vez (vigente_ate NULL = vigente agora).
CREATE UNIQUE INDEX uniq_acordo_configuracao_padrao_ativa
  ON public.acordo_configuracao_padrao ((true))
  WHERE vigente_ate IS NULL;

COMMENT ON TABLE public.acordo_configuracao_padrao IS
  'Configuracao padrao (multa/juros/desconto/dados da empresa) usada como ponto de partida ao negociar um acordo novo, com vigencia -- trocar fecha a vigente (vigente_ate) e abre uma nova, nunca sobrescreve. Nao e lida por acordos ja criados.';

ALTER TABLE public.acordo_configuracao_padrao ENABLE ROW LEVEL SECURITY;

-- Select para todo autenticado: o cobrador precisa ler o padrao vigente pra
-- abrir o AcordoModal com os valores sugeridos.
CREATE POLICY "select_todos" ON public.acordo_configuracao_padrao
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "insert_gestor" ON public.acordo_configuracao_padrao
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_current_user_type()) = 'manager');
CREATE POLICY "update_gestor" ON public.acordo_configuracao_padrao
  FOR UPDATE TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager')
  WITH CHECK ((SELECT app_current_user_type()) = 'manager');
CREATE POLICY "delete_gestor" ON public.acordo_configuracao_padrao
  FOR DELETE TO authenticated
  USING ((SELECT app_current_user_type()) = 'manager');

-- Troca a configuracao: fecha a vigente (se houver) e abre uma nova
-- atomicamente -- mesmo padrao de definir_faixa_atraso_cobrador.
CREATE OR REPLACE FUNCTION public.definir_configuracao_padrao_acordo(
  p_multa_percentual numeric,
  p_juros_percentual_am numeric,
  p_desconto_padrao_percentual numeric,
  p_desconto_maximo_percentual numeric,
  p_dias_entre_parcelas integer,
  p_empresa_nome text,
  p_empresa_cnpj text,
  p_empresa_endereco text,
  p_empresa_chave_pix text
)
RETURNS public.acordo_configuracao_padrao
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_nova public.acordo_configuracao_padrao;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir a configuração padrão de acordo.';
  END IF;

  UPDATE public.acordo_configuracao_padrao
  SET vigente_ate = v_hoje
  WHERE vigente_ate IS NULL;

  INSERT INTO public.acordo_configuracao_padrao (
    multa_percentual, juros_percentual_am, desconto_padrao_percentual,
    desconto_maximo_percentual, dias_entre_parcelas,
    empresa_nome, empresa_cnpj, empresa_endereco, empresa_chave_pix,
    vigente_desde, created_by
  ) VALUES (
    p_multa_percentual, p_juros_percentual_am, p_desconto_padrao_percentual,
    p_desconto_maximo_percentual, p_dias_entre_parcelas,
    p_empresa_nome, p_empresa_cnpj, p_empresa_endereco, p_empresa_chave_pix,
    v_hoje, (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$$;

COMMENT ON FUNCTION public.definir_configuracao_padrao_acordo(numeric, numeric, numeric, numeric, integer, text, text, text, text) IS
  'Fecha a configuracao padrao de acordo vigente (se houver) e abre uma nova, atomicamente. Unico caminho esperado para mudar a configuracao -- preserva a vigencia anterior. Apenas gestor.';

-- Sem REVOKE/GRANT manual de anon aqui: ALTER DEFAULT PRIVILEGES (migration
-- 20261103000008) ja fecha EXECUTE de anon por padrao pra funcao nova.
