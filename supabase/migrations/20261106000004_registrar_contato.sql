-- Registrar contato do cobrador de carteira (ligacao/whatsapp) numa unica
-- transacao: tentativa + desfecho do agendamento ativo + proximo contato +
-- liberacao da carteira (SPC).
--
-- Antes eram dois botoes desconectados: "Registrar Interacao" gravava a
-- tentativa e marcava o agendamento como "realizada" (mesmo em "nao
-- atendeu", sem criar o proximo contato); "Reagendar" criava o proximo e
-- mantinha a cadeia, mas nao gravava tentativa nem observacao. Ver item
-- "Registrar contato unificado" em docs/PROGRESSO.md.
--
-- A DECISAO (efetivo -> realizada, nao efetivo -> reagendada, motivo, rotulo)
-- fica no front, em src/config/collectionAttempts.ts (fonte unica); aqui so
-- se aplica, atomicamente.
--
-- SECURITY INVOKER: RLS de collection_attempts (dono do titulo ou gestor) e
-- de scheduled_visits (collector_id = usuario ou gestor) valem direto, sem
-- guard manual pra esquecer. reagendar_visita e liberar_cliente_da_carteira
-- sao DEFINER e mantem os proprios guards.

CREATE OR REPLACE FUNCTION public.registrar_contato(
  p_documento text,
  p_nome_cliente text,
  p_titulos text[],
  p_data text,
  p_tipo text,
  p_resultado text,
  p_notas text,
  p_proxima_acao text DEFAULT NULL,
  p_data_promessa text DEFAULT NULL,
  -- Agendamento ativo que o front viu (null = nenhum). Divergiu do banco ->
  -- erro, em vez de concluir/reagendar o agendamento errado.
  p_visita_id uuid DEFAULT NULL,
  p_rotulo_resultado text DEFAULT NULL,
  p_reagendar boolean DEFAULT false,
  p_motivo_reagendamento text DEFAULT NULL,
  p_notas_reagendamento_original text DEFAULT NULL,
  p_notas_reagendamento_nova text DEFAULT NULL,
  p_proxima_data date DEFAULT NULL,
  p_proximo_horario time DEFAULT NULL,
  p_proximo_canal text DEFAULT NULL,
  p_notas_proximo text DEFAULT NULL,
  p_situacao_liberacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id uuid := (SELECT app_current_user_id());
  v_visita public.scheduled_visits%ROWTYPE;
  v_achou boolean;
  v_minha boolean := false;
  v_desfecho text := NULL;
  v_nova_id uuid := NULL;
BEGIN
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
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
    next_action, next_action_date, collector_id
  )
  SELECT t, p_data, p_tipo, p_resultado, p_notas,
         p_proxima_acao, p_data_promessa, v_usuario_id
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
        reschedule_count, channel
      ) VALUES (
        v_usuario_id::text, p_documento, p_nome_cliente,
        p_proxima_data, p_proximo_horario, 'agendada', p_notas_proximo,
        0, COALESCE(p_proximo_canal, 'ligacao')
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

REVOKE EXECUTE ON FUNCTION public.registrar_contato(
  text, text, text[], text, text, text, text, text, text, uuid, text,
  boolean, text, text, text, date, time, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_contato(
  text, text, text[], text, text, text, text, text, text, uuid, text,
  boolean, text, text, text, date, time, text, text, text
) TO authenticated;
