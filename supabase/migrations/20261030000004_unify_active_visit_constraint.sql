-- Fecha a lacuna entre a regra real do app ("no maximo 1 visita ativa por
-- cliente, qualquer data, qualquer cobrador" -- VisitScheduler.tsx
-- baseFilteredClients ja esconde o cliente do modal de agendamento nessa
-- granularidade) e o que o banco garantia at agora
-- (uniq_active_visit_per_client_date, migration 20260601000002: so por
-- cobrador+data). A lacuna permite duplicata em datas diferentes (achada ao
-- testar o item 2 em 2026-10-30 -- a checagem de conflito de reagendar_visita
-- so cobria a mesma data) e entre cobradores diferentes quando a carteira e
-- reatribuida com transferVisits=false (BulkAssignmentModal): o agendamento
-- antigo fica com o cobrador anterior, e o cliente aparece "livre" no modal
-- do novo cobrador para agendar de novo.
--
-- Achado em produção ao investigar: 5 clientes ja tinham 2 visitas ativas
-- (mesmo cobrador, datas diferentes, criadas com poucos dias/minutos de
-- intervalo -- padrao compativel com a fila offline reenviando antes de
-- sincronizar o estado atual).

-- 1) Resolver duplicatas existentes: mesma estrategia nao destrutiva da
-- migration 20260601000002 (mantem a mais recente por created_at, marca as
-- demais como 'cancelada' com nota de auditoria), agora particionando so por
-- client_document -- a regra deixou de ser por data ou por cobrador.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_document
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM scheduled_visits
  WHERE status = 'agendada'
)
UPDATE scheduled_visits AS sv
SET
  status = 'cancelada',
  notes = COALESCE(sv.notes || E'\n', '')
    || '• [Sistema] Visita duplicada resolvida automaticamente em '
    || to_char(now(), 'DD/MM/YYYY')
    || ' (mantida apenas uma visita agendada por cliente, independente de data ou cobrador).',
  updated_at = now()
FROM ranked
WHERE sv.id = ranked.id
  AND ranked.rn > 1;

-- 2) Trocar o indice unico: a granularidade certa e so client_document.
DROP INDEX IF EXISTS uniq_active_visit_per_client_date;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_visit_per_client
  ON scheduled_visits (client_document)
  WHERE status = 'agendada';

-- 3) reagendar_visita (migration 20261030000003): a checagem de conflito e
-- uma rede de seguranca que traduz a violacao do indice unico num erro
-- amigavel ANTES do INSERT -- precisa espelhar a mesma granularidade do
-- indice (antes so cobria mesmo cobrador + mesma data).
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
    WHERE client_document = v_visita.client_document
      AND status = 'agendada'
      AND id <> p_visit_id
  ) THEN
    RAISE EXCEPTION 'Este cliente já possui outra visita agendada em aberto. Atualize a lista e tente novamente.';
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
    total_pending_value, overdue_count
  ) VALUES (
    v_visita.collector_id, v_visita.client_document, v_visita.client_name,
    p_nova_data, p_novo_horario, 'agendada', p_notas_nova,
    0, p_visit_id, v_visita.scheduled_by_manager_id,
    v_visita.client_address, v_visita.client_number, v_visita.client_neighborhood, v_visita.client_city,
    v_visita.total_pending_value, v_visita.overdue_count
  )
  RETURNING id INTO v_nova_id;

  UPDATE public.scheduled_visits
  SET rescheduled_to_id = v_nova_id
  WHERE id = p_visit_id;

  RETURN QUERY SELECT * FROM public.scheduled_visits WHERE id = v_nova_id;
END;
$$;

COMMENT ON FUNCTION public.reagendar_visita(uuid, date, time, text, text, text) IS
  'Reagenda uma visita atomicamente: marca a original como reagendada e cria a nova numa unica transacao (substitui a sequencia de UPDATEs/INSERT separados do front). Autorizacao (dono da visita ou gestor) e checada aqui porque SECURITY DEFINER contorna a RLS da tabela. Devolve a nova visita (SELECT *).';
