-- Etapa 1 do agendamento de contato para cobrador interno/terceirizado/
-- juridico (WALLET_COLLECTOR_TYPES, src/config/profiles.ts): generaliza
-- scheduled_visits para tambem representar ligacao/whatsapp, em vez de criar
-- uma tabela paralela -- reaproveita a RPC de reagendamento, o indice unico
-- de visita ativa por cliente e os indicadores ja existentes em
-- VisitTracking/EnhancedPerformanceChart/CollectorsSummary.
--
-- DEFAULT 'presencial' cobre todo INSERT existente (VisitScheduler, fila
-- offline, scripts) sem precisar tocar nesse codigo -- so quem agendar
-- contato por ligacao/whatsapp vai informar o canal explicitamente.
ALTER TABLE public.scheduled_visits
  ADD COLUMN channel text NOT NULL DEFAULT 'presencial'
    CHECK (channel IN ('presencial', 'ligacao', 'whatsapp'));

COMMENT ON COLUMN public.scheduled_visits.channel IS
  'Canal do agendamento: presencial (cobrador externo/campo) ou ligacao/whatsapp (cobrador de carteira). Endereco (client_address/city/neighborhood/number) so se aplica a presencial.';

-- reagendar_visita (20261030000003): SELECT * ja traz a coluna nova
-- automaticamente (v_visita%ROWTYPE), so falta propaga-la para a visita nova
-- no INSERT -- sem isso, reagendar um contato por ligacao/whatsapp criaria a
-- nova visita como 'presencial' (o DEFAULT), perdendo o canal original.
CREATE OR REPLACE FUNCTION public.reagendar_visita(
  p_visit_id        uuid,
  p_nova_data       date,
  p_novo_horario    time DEFAULT NULL,
  p_motivo_chave    text DEFAULT NULL,
  p_notas_original  text DEFAULT NULL,
  p_notas_nova      text DEFAULT NULL
)
RETURNS SETOF public.scheduled_visits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visita public.scheduled_visits%ROWTYPE;
  v_nova_id uuid;
  v_novo_count integer;
BEGIN
  SELECT * INTO v_visita
  FROM public.scheduled_visits
  WHERE id = p_visit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita não encontrada.';
  END IF;

  IF (SELECT app_current_user_type()) <> 'manager'
     AND v_visita.collector_id <> (SELECT app_current_user_id())::text THEN
    RAISE EXCEPTION 'Sem permissão para reagendar esta visita.';
  END IF;

  IF v_visita.status <> 'agendada' THEN
    RAISE EXCEPTION
      'Esta visita não pode ser reagendada (status atual: %). Atualize a lista e tente novamente.',
      v_visita.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.scheduled_visits
    WHERE collector_id = v_visita.collector_id
      AND client_document = v_visita.client_document
      AND scheduled_date = p_nova_data
      AND status = 'agendada'
      AND id <> p_visit_id
  ) THEN
    RAISE EXCEPTION 'Este cliente já possui uma visita agendada nessa data. Escolha outra data.';
  END IF;

  v_novo_count := COALESCE(v_visita.reschedule_count, 0) + 1;

  UPDATE public.scheduled_visits
  SET status = 'reagendada',
      rescheduled_to = p_nova_data::text,
      notes = COALESCE(p_notas_original, notes),
      reschedule_count = v_novo_count,
      reschedule_reason = p_motivo_chave,
      updated_at = now()
  WHERE id = p_visit_id;

  INSERT INTO public.scheduled_visits (
    collector_id, client_document, client_name,
    scheduled_date, scheduled_time, status, notes,
    reschedule_count, rescheduled_from_id, scheduled_by_manager_id,
    client_address, client_number, client_neighborhood, client_city,
    total_pending_value, overdue_count, channel
  ) VALUES (
    v_visita.collector_id, v_visita.client_document, v_visita.client_name,
    p_nova_data, p_novo_horario, 'agendada', p_notas_nova,
    0, p_visit_id, v_visita.scheduled_by_manager_id,
    v_visita.client_address, v_visita.client_number, v_visita.client_neighborhood, v_visita.client_city,
    v_visita.total_pending_value, v_visita.overdue_count, v_visita.channel
  )
  RETURNING id INTO v_nova_id;

  UPDATE public.scheduled_visits
  SET rescheduled_to_id = v_nova_id
  WHERE id = p_visit_id;

  RETURN QUERY SELECT * FROM public.scheduled_visits WHERE id = v_nova_id;
END;
$$;

COMMENT ON FUNCTION public.reagendar_visita(uuid, date, time, text, text, text) IS
  'Reagenda uma visita/contato atomicamente: marca a original como reagendada e cria a nova numa unica transacao, propagando o canal (presencial/ligacao/whatsapp). Autorizacao (dono da visita ou gestor) e checada aqui porque SECURITY DEFINER contorna a RLS da tabela. Devolve a nova visita (SELECT *).';

GRANT EXECUTE ON FUNCTION public.reagendar_visita(uuid, date, time, text, text, text)
  TO authenticated;
