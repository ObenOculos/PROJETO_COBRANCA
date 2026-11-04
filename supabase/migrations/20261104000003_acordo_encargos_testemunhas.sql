-- Etapa 3b da iniciativa "Termo de Acordo automatico" (ver docs/PROGRESSO.md,
-- item 12): criar_acordo passa a registrar multa/juros/desconto POR TITULO,
-- congelados no momento da negociacao -- sao fato historico (o Termo de
-- Acordo gerado depois, inclusive muito depois, tem que mostrar exatamente o
-- que foi negociado naquele dia, nao um recalculo com os dias de atraso de
-- hoje). Mesma logica em acordos: percentuais efetivamente aplicados
-- (podem ter sido editados pelo cobrador em cima do padrao do gestor,
-- ver acordo_configuracao_padrao) e forma de pagamento/testemunhas, tudo
-- fato do acordo, nunca recalculado depois.

ALTER TABLE public.acordo_titulos
  ADD COLUMN dias_atraso_no_momento integer NOT NULL DEFAULT 0,
  ADD COLUMN multa_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN juros_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN desconto_valor numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.acordo_titulos.dias_atraso_no_momento IS
  'Dias de atraso do titulo no momento em que o acordo foi criado -- congelado, nunca recalculado (o titulo original fica "parado" na data pre-acordo, ver migration 20261104000001).';
COMMENT ON COLUMN public.acordo_titulos.multa_valor IS 'Multa aplicada sobre saldo_no_momento, congelada no momento da negociacao.';
COMMENT ON COLUMN public.acordo_titulos.juros_valor IS 'Juros simples (saldo x taxa_am x dias/30) aplicados sobre saldo_no_momento, congelados no momento da negociacao.';
COMMENT ON COLUMN public.acordo_titulos.desconto_valor IS 'Desconto aplicado sobre (saldo_no_momento + multa_valor + juros_valor), congelado no momento da negociacao.';

ALTER TABLE public.acordos
  ADD COLUMN forma_pagamento_parcelas text,
  ADD COLUMN testemunha1_nome text,
  ADD COLUMN testemunha1_cpf text,
  ADD COLUMN testemunha2_nome text,
  ADD COLUMN testemunha2_cpf text,
  ADD COLUMN multa_percentual_aplicado numeric NOT NULL DEFAULT 0,
  ADD COLUMN juros_percentual_am_aplicado numeric NOT NULL DEFAULT 0,
  ADD COLUMN desconto_percentual_aplicado numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.acordos.forma_pagamento_parcelas IS 'Forma de pagamento combinada para as parcelas 2+ (a 1a parcela e sempre a entrada via Pix). Texto livre (ex.: "boleto").';
COMMENT ON COLUMN public.acordos.multa_percentual_aplicado IS 'Percentual de multa efetivamente usado nesta negociacao (pode ter sido editado pelo cobrador em cima do padrao do gestor) -- congelado.';
COMMENT ON COLUMN public.acordos.juros_percentual_am_aplicado IS 'Percentual de juros a.m. efetivamente usado nesta negociacao -- congelado.';
COMMENT ON COLUMN public.acordos.desconto_percentual_aplicado IS 'Percentual de desconto efetivamente usado nesta negociacao -- congelado.';

-- criar_acordo passa a receber multa_valor/juros_valor/desconto_valor/
-- dias_atraso_no_momento por titulo (calculados no front a partir da
-- configuracao padrao, editavel) e os dados de pagamento/testemunhas do
-- acordo. valor_negociado continua sendo a soma das parcelas (que agora ja
-- incluem os encargos) -- nao muda.
CREATE OR REPLACE FUNCTION public.criar_acordo(
  p_client_document text,
  p_titulos jsonb,   -- [{"collection_id", "saldo_no_momento", "dias_atraso_no_momento", "multa_valor", "juros_valor", "desconto_valor"}, ...]
  p_parcelas jsonb,  -- [{"numero", "valor_parcela", "data_vencimento"}, ...]
  p_multa_percentual_aplicado numeric DEFAULT 0,
  p_juros_percentual_am_aplicado numeric DEFAULT 0,
  p_desconto_percentual_aplicado numeric DEFAULT 0,
  p_forma_pagamento_parcelas text DEFAULT NULL,
  p_testemunha1_nome text DEFAULT NULL,
  p_testemunha1_cpf text DEFAULT NULL,
  p_testemunha2_nome text DEFAULT NULL,
  p_testemunha2_cpf text DEFAULT NULL
)
RETURNS public.acordos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_client_name text;
  v_valor_negociado numeric;
  v_acordo public.acordos%ROWTYPE;
  v_elem jsonb;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF v_user_type NOT IN ('internal_collector', 'third_party_collector', 'legal_collector', 'manager') THEN
    RAISE EXCEPTION 'Perfil sem permissão para criar acordo.';
  END IF;

  IF p_client_document IS NULL OR btrim(p_client_document) = '' THEN
    RAISE EXCEPTION 'Cliente não informado.';
  END IF;

  IF p_titulos IS NULL OR jsonb_array_length(p_titulos) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um título.';
  END IF;

  IF p_parcelas IS NULL OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma parcela.';
  END IF;

  IF public.cliente_tem_acordo_ativo(p_client_document) THEN
    RAISE EXCEPTION 'Este cliente já tem um acordo ativo. Resolva (cumprido/cancelado) antes de criar outro.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_titulos) t
    WHERE NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.id_parcela = (t->>'collection_id')::bigint
        AND b.documento = p_client_document
    )
  ) THEN
    RAISE EXCEPTION 'Um ou mais títulos informados não pertencem a este cliente.';
  END IF;

  SELECT cliente INTO v_client_name
  FROM public."BANCO_DADOS"
  WHERE id_parcela = (p_titulos->0->>'collection_id')::bigint;

  SELECT SUM((elem->>'valor_parcela')::numeric) INTO v_valor_negociado
  FROM jsonb_array_elements(p_parcelas) elem;

  INSERT INTO public.acordos (
    client_document, client_name, collector_id, valor_negociado, numero_parcelas, created_by_id,
    multa_percentual_aplicado, juros_percentual_am_aplicado, desconto_percentual_aplicado,
    forma_pagamento_parcelas, testemunha1_nome, testemunha1_cpf, testemunha2_nome, testemunha2_cpf
  ) VALUES (
    p_client_document, v_client_name, v_collector_id, v_valor_negociado,
    jsonb_array_length(p_parcelas), v_collector_id,
    COALESCE(p_multa_percentual_aplicado, 0), COALESCE(p_juros_percentual_am_aplicado, 0),
    COALESCE(p_desconto_percentual_aplicado, 0),
    p_forma_pagamento_parcelas, p_testemunha1_nome, p_testemunha1_cpf, p_testemunha2_nome, p_testemunha2_cpf
  )
  RETURNING * INTO v_acordo;

  INSERT INTO public.acordo_titulos (
    acordo_id, collection_id, saldo_no_momento,
    dias_atraso_no_momento, multa_valor, juros_valor, desconto_valor
  )
  SELECT
    v_acordo.id,
    (t->>'collection_id')::bigint,
    (t->>'saldo_no_momento')::numeric,
    COALESCE((t->>'dias_atraso_no_momento')::integer, 0),
    COALESCE((t->>'multa_valor')::numeric, 0),
    COALESCE((t->>'juros_valor')::numeric, 0),
    COALESCE((t->>'desconto_valor')::numeric, 0)
  FROM jsonb_array_elements(p_titulos) t;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    INSERT INTO public.acordo_parcelas (acordo_id, numero, valor_parcela, data_vencimento)
    VALUES (
      v_acordo.id,
      (v_elem->>'numero')::integer,
      (v_elem->>'valor_parcela')::numeric,
      (v_elem->>'data_vencimento')::date
    );
  END LOOP;

  -- O trigger acima ja forcaria 'Em acordo' de qualquer forma (o acordo foi
  -- inserido 'ativo' logo acima), mas deixamos explicito por clareza.
  UPDATE public."BANCO_DADOS"
  SET situacao = 'Em acordo'
  WHERE documento = p_client_document;

  RETURN v_acordo;
END;
$$;

COMMENT ON FUNCTION public.criar_acordo(text, jsonb, jsonb, numeric, numeric, numeric, text, text, text, text, text) IS
  'Cria acordo + titulos consolidados (com multa/juros/desconto por titulo, congelados) + parcelas. Percentuais aplicados e testemunhas/forma de pagamento sao fato do acordo, nunca recalculados depois.';
