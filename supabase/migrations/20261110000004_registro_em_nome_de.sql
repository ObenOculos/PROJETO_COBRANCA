-- Gestor faz contato e acordo pelo cobrador (2026-11-10). Em cada registro
-- o gestor escolhe se fica em nome do cobrador da carteira do cliente ou no
-- dele mesmo (decisao do usuario: "um pouco dos dois"); o proximo contato
-- agendado segue a mesma escolha. Fica gravado quem de fato registrou:
--   - collection_attempts.registrado_por_id (coluna nova; NULL nas linhas
--     antigas = o proprio collector_id);
--   - scheduled_visits.scheduled_by_manager_id (ja existia);
--   - acordos.created_by_id (ja existia; antes sempre = collector_id).
-- Registro do gestor conta como "registrado" no lote da Fila do cobrador.
--
-- Corpos copiados de producao (pg_get_functiondef em 2026-11-10); mudam so
-- os trechos de autor/responsavel. Parametro novo p_em_nome_de no fim, com
-- default: chamadas antigas continuam iguais. A assinatura muda, por isso
-- DROP + CREATE e GRANT explicito (o default privileges nao da EXECUTE a
-- authenticated).

ALTER TABLE public.collection_attempts
  ADD COLUMN registrado_por_id uuid REFERENCES public.users(id);
COMMENT ON COLUMN public.collection_attempts.registrado_por_id IS
  'Quem registrou de fato (ex.: gestor em nome do cobrador). NULL = o proprio collector_id.';

DROP FUNCTION public.registrar_contato(text, text, text[], text, text, text, text, text, text, uuid, text, boolean, text, text, text, date, time without time zone, text, text, text);

CREATE OR REPLACE FUNCTION public.registrar_contato(p_documento text, p_nome_cliente text, p_titulos text[], p_data text, p_tipo text, p_resultado text, p_notas text, p_proxima_acao text DEFAULT NULL::text, p_data_promessa text DEFAULT NULL::text, p_visita_id uuid DEFAULT NULL::uuid, p_rotulo_resultado text DEFAULT NULL::text, p_reagendar boolean DEFAULT false, p_motivo_reagendamento text DEFAULT NULL::text, p_notas_reagendamento_original text DEFAULT NULL::text, p_notas_reagendamento_nova text DEFAULT NULL::text, p_proxima_data date DEFAULT NULL::date, p_proximo_horario time without time zone DEFAULT NULL::time without time zone, p_proximo_canal text DEFAULT NULL::text, p_notas_proximo text DEFAULT NULL::text, p_situacao_liberacao text DEFAULT NULL::text, p_em_nome_de uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Quem registrou (autor) e em nome de quem fica (responsavel). So o
  -- gestor escolhe outro responsavel: o cobrador da carteira do cliente.
  v_autor uuid := (SELECT app_current_user_id());
  v_usuario_id uuid := v_autor;
  v_visita public.scheduled_visits%ROWTYPE;
  v_achou boolean;
  v_minha boolean := false;
  v_desfecho text := NULL;
  v_nova_id uuid := NULL;
BEGIN
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_em_nome_de IS NOT NULL AND p_em_nome_de IS DISTINCT FROM v_autor THEN
    IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
      RAISE EXCEPTION 'Só o gestor pode registrar em nome de outro usuário.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = p_documento AND b.user_id = p_em_nome_de
    ) THEN
      RAISE EXCEPTION 'Este cliente não está na carteira do cobrador escolhido.';
    END IF;
    v_usuario_id := p_em_nome_de;
  END IF;

  IF p_titulos IS NULL OR cardinality(p_titulos) = 0 THEN
    RAISE EXCEPTION 'Este cliente não tem título em aberto para registrar o contato.';
  END IF;

  IF p_proxima_data IS NOT NULL AND p_proxima_data < p_data::date THEN
    RAISE EXCEPTION 'O próximo contato não pode ser em data passada.';
  END IF;

  -- No maximo um agendamento ativo por cliente (uniq_active_visit_per_client).
  SELECT * INTO v_visita
  FROM public.scheduled_visits
  WHERE client_document = p_documento
    AND status = 'agendada'
  FOR UPDATE;
  v_achou := FOUND;

  v_minha := v_achou
    AND v_visita.collector_id = v_usuario_id::text
    AND v_visita.channel <> 'presencial';

  IF (v_minha AND p_visita_id IS DISTINCT FROM v_visita.id)
     OR (NOT v_minha AND p_visita_id IS NOT NULL) THEN
    RAISE EXCEPTION 'O agendamento deste cliente mudou desde que a tela foi aberta. Atualize a lista e tente novamente.';
  END IF;

  -- 1. Tentativa: uma linha por titulo em aberto (mesma convencao de antes).
  INSERT INTO public.collection_attempts (
    collection_id, date, type, result, notes,
    next_action, next_action_date, collector_id, registrado_por_id
  )
  SELECT t, p_data, p_tipo, p_resultado, p_notas,
         p_proxima_acao, p_data_promessa, v_usuario_id, v_autor
  FROM unnest(p_titulos) AS t;

  -- 2. Desfecho do agendamento ativo do proprio cobrador.
  IF v_minha THEN
    IF p_reagendar AND p_proxima_data IS NOT NULL AND p_situacao_liberacao IS NULL THEN
      SELECT id INTO v_nova_id
      FROM public.reagendar_visita(
        v_visita.id, p_proxima_data, p_proximo_horario,
        p_motivo_reagendamento,
        p_notas_reagendamento_original, p_notas_reagendamento_nova
      );
      IF p_proximo_canal IS NOT NULL THEN
        UPDATE public.scheduled_visits
        SET channel = p_proximo_canal
        WHERE id = v_nova_id;
      END IF;
      v_desfecho := 'reagendada';
    ELSE
      UPDATE public.scheduled_visits
      SET status = 'realizada',
          notes = COALESCE(p_rotulo_resultado, notes),
          data_visita_realizada = p_data::date,
          updated_at = now()
      WHERE id = v_visita.id;
      v_desfecho := 'realizada';
    END IF;
  END IF;

  -- 3. Proximo contato como acompanhamento (nao e remarcacao).
  IF v_nova_id IS NULL AND p_proxima_data IS NOT NULL AND p_situacao_liberacao IS NULL THEN
    IF v_achou AND NOT v_minha THEN
      RAISE EXCEPTION 'Este cliente já tem um agendamento ativo (de outro cobrador ou visita presencial). O contato não foi registrado.';
    END IF;

    -- Agendamento de OUTRO cobrador nao aparece no SELECT acima (RLS de
    -- scheduled_visits); quem barra e o indice unico -- traduz a mensagem.
    BEGIN
      INSERT INTO public.scheduled_visits (
        collector_id, client_document, client_name,
        scheduled_date, scheduled_time, status, notes,
        reschedule_count, channel, scheduled_by_manager_id
      ) VALUES (
        v_usuario_id::text, p_documento, p_nome_cliente,
        p_proxima_data, p_proximo_horario, 'agendada', p_notas_proximo,
        0, COALESCE(p_proximo_canal, 'ligacao'),
        CASE WHEN v_autor IS DISTINCT FROM v_usuario_id THEN v_autor END
      )
      RETURNING id INTO v_nova_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Este cliente já tem um agendamento ativo (de outro cobrador ou visita presencial). O contato não foi registrado.';
    END;
  END IF;

  -- 4. Desfecho que encerra o caso (hoje: contestacao -> SPC).
  IF p_situacao_liberacao IS NOT NULL THEN
    PERFORM public.liberar_cliente_da_carteira(p_documento, p_situacao_liberacao, NULL);
  END IF;

  RETURN jsonb_build_object(
    'visita_id', CASE WHEN v_minha THEN v_visita.id END,
    'desfecho', v_desfecho,
    'nova_visita_id', v_nova_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_contato(text, text, text[], text, text, text, text, text, text, uuid, text, boolean, text, text, text, date, time without time zone, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_contato(text, text, text[], text, text, text, text, text, text, uuid, text, boolean, text, text, text, date, time without time zone, text, text, text, uuid) TO authenticated, service_role;

DROP FUNCTION public.criar_acordo(text, jsonb, jsonb, numeric, numeric, numeric, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.criar_acordo(p_client_document text, p_titulos jsonb, p_parcelas jsonb, p_multa_percentual_aplicado numeric DEFAULT 0, p_juros_percentual_am_aplicado numeric DEFAULT 0, p_desconto_percentual_aplicado numeric DEFAULT 0, p_forma_pagamento_parcelas text DEFAULT NULL::text, p_testemunha1_nome text DEFAULT NULL::text, p_testemunha1_cpf text DEFAULT NULL::text, p_testemunha2_nome text DEFAULT NULL::text, p_testemunha2_cpf text DEFAULT NULL::text, p_em_nome_de uuid DEFAULT NULL::uuid)
 RETURNS acordos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Quem fez (autor -> created_by_id) e em nome de quem fica (responsavel
  -- -> collector_id: acompanha e recebe o credito). So o gestor escolhe.
  v_autor uuid := (SELECT app_current_user_id());
  v_collector_id uuid := v_autor;
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

  IF p_em_nome_de IS NOT NULL AND p_em_nome_de IS DISTINCT FROM v_autor THEN
    IF v_user_type IS DISTINCT FROM 'manager' THEN
      RAISE EXCEPTION 'Só o gestor pode fazer acordo em nome de outro usuário.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = p_client_document AND b.user_id = p_em_nome_de
    ) THEN
      RAISE EXCEPTION 'Este cliente não está na carteira do cobrador escolhido.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = p_em_nome_de
        AND u.type IN ('internal_collector', 'third_party_collector', 'legal_collector')
    ) THEN
      RAISE EXCEPTION 'O cobrador escolhido não trabalha com acordos (perfil de visita).';
    END IF;
    v_collector_id := p_em_nome_de;
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
    jsonb_array_length(p_parcelas), v_autor,
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
$function$;

REVOKE ALL ON FUNCTION public.criar_acordo(text, jsonb, jsonb, numeric, numeric, numeric, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_acordo(text, jsonb, jsonb, numeric, numeric, numeric, text, text, text, text, text, uuid) TO authenticated, service_role;

-- Fila: qualquer registro no cliente desde que o lote abriu conta (do
-- cobrador ou do gestor, em nome de qualquer um), e acordo criado tambem.
-- Corpo de 20261110000003 (aplicada hoje); saem so os filtros por autor.
CREATE OR REPLACE FUNCTION public.fila_item_finalizado(
  p_collector uuid,
  p_documento text,
  p_desde timestamptz
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    -- contato registrado (Atender), inclusive tentativa sem sucesso, por
    -- qualquer um (cobrador ou gestor)
    EXISTS (
      SELECT 1
      FROM public."BANCO_DADOS" b
      JOIN public.collection_attempts a ON a.collection_id = b.id_parcela::text
      WHERE b.documento = p_documento
        AND a.created_at >= p_desde
    )
    -- "Deixar para depois" (so o proprio cobrador usa)
    OR EXISTS (
      SELECT 1 FROM public.fila_adiamentos f
      WHERE f.documento = p_documento
        AND f.collector_id = p_collector
        AND f.created_at >= p_desde
    )
    -- pagamento registrado
    OR EXISTS (
      SELECT 1 FROM public.sale_payments p
      WHERE p.client_document = p_documento
        AND p.created_at >= p_desde
    )
    -- acordo feito
    OR EXISTS (
      SELECT 1 FROM public.acordos ac
      WHERE ac.client_document = p_documento
        AND ac.created_at >= p_desde
    )
    -- saiu da carteira dele
    OR NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = p_documento AND b.user_id = p_collector
    )
    -- quitou
    OR NOT public.cliente_tem_saldo_aberto(p_documento);
$function$;
