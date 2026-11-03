-- Correcao de seguranca urgente, achada testando a Etapa 7 da iniciativa
-- de carteira automatica (nao faz parte dela -- pre-existente).
--
-- PROBLEMA 1 (guard NULL-unsafe): varias funcoes usam
-- "IF app_current_user_type() <> 'manager' THEN RAISE EXCEPTION" pra travar
-- acao de gestor. Pra uma sessao SEM LOGIN (anon), app_current_user_type()
-- retorna NULL -- e em SQL, "NULL <> 'manager'" nao e TRUE nem FALSE, e
-- NULL. Um IF com condicao NULL NAO executa o bloco (mesma regra de
-- NULL AND/OR), entao a excecao nunca dispara e a funcao segue como se
-- fosse um gestor autenticado. Comparacoes com IS NULL (ex: "IF
-- v_collector_id IS NULL") nao tem esse problema -- so o padrao "<>"
-- comparando contra uma string fixa.
--
-- Confirmado por leitura (sem nenhuma mutacao): chamando
-- app_current_user_type() com a chave anon publica, retorna null; essas
-- funcoes tem EXECUTE liberado pra anon por padrao (ninguem revogou
-- explicitamente); elas rodam SECURITY DEFINER com dono "postgres", que
-- tem BYPASSRLS -- a RLS das tabelas nao ajuda aqui, so essa linha de IF.
--
-- PROBLEMA 2 (EXECUTE liberado pra anon sem necessidade): toda funcao nova
-- nasce com EXECUTE pra PUBLIC (inclui anon) a menos que seja revogado
-- explicitamente na propria migration -- v_arios lugares do projeto
-- (inclusive as 3 funcoes que este projeto criou mais cedo hoje,
-- definir_faixa_atraso_cobrador/vincular_cobrador_a_gerente/
-- desvincular_cobrador) nunca revogaram. resolve_auth_email continua
-- liberada pra anon de proposito (unico caminho antes do login).
--
-- Afetadas de fato (anon conseguia chamar E o guard falhava aberto):
--   reagendar_visita, definir_faixa_atraso_cobrador,
--   vincular_cobrador_a_gerente, desvincular_cobrador,
--   protege_atribuicao_banco_dados (trigger -- dispara em QUALQUER UPDATE
--   que mude BANCO_DADOS.user_id, independente de qual RPC chama).
-- Verificadas e NAO vulneraveis (checam "IS NULL" antes de qualquer
-- comparicao com 'manager', pattern seguro): criar_acordo, cancelar_acordo,
-- registrar_pagamento_acordo -- EXECUTE revogado de anon aqui mesmo assim,
-- por reducao de superficie, nao porque estivessem quebradas.
-- Sem guard nenhum hoje (dependiam so de RLS, que BYPASSRLS neutraliza):
-- marcar_acordos_quebrados -- EXECUTE revogado de anon (ninguem alem de um
-- job interno deveria chamar isso de qualquer forma).
-- Helpers so-leitura com EXECUTE solto pra anon (exposicao de dado, sem
-- guard proprio porque nunca precisaram de um): cliente_max_atraso_dias,
-- cliente_tem_acordo_ativo, cobrador_na_data_em_lote, saldo_acordo_parcela,
-- situacao_primaria_do_tipo, titulo_em_acordo_ativo -- EXECUTE revogado de
-- anon, mantido pra authenticated.

-- =============================================================================
-- 1) Corrige o guard NULL-unsafe (<> vira IS DISTINCT FROM) nas 4 funcoes
--    onde o problema e real. Corpo identico ao de producao, so essa linha.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protege_atribuicao_banco_dados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if NEW.user_id is distinct from OLD.user_id
     and public.app_current_user_type() IS DISTINCT FROM 'manager' then
    raise exception 'Apenas gestores podem reatribuir o cobrador de um cliente.';
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reagendar_visita(p_visit_id uuid, p_nova_data date, p_novo_horario time without time zone DEFAULT NULL::time without time zone, p_motivo_chave text DEFAULT NULL::text, p_notas_original text DEFAULT NULL::text, p_notas_nova text DEFAULT NULL::text)
RETURNS SETOF scheduled_visits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager'
     AND v_visita.collector_id IS DISTINCT FROM (SELECT app_current_user_id())::text THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.definir_faixa_atraso_cobrador(
  p_collector_id uuid,
  p_min_dias integer,
  p_max_dias integer
)
RETURNS public.collector_overdue_ranges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_nova public.collector_overdue_ranges;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem definir faixa de atraso.';
  END IF;

  UPDATE public.collector_overdue_ranges
  SET vigente_ate = v_hoje
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;

  INSERT INTO public.collector_overdue_ranges (
    collector_id, min_dias, max_dias, vigente_desde, created_by
  ) VALUES (
    p_collector_id, p_min_dias, p_max_dias, v_hoje, (SELECT app_current_user_id())
  )
  RETURNING * INTO v_nova;

  RETURN v_nova;
END;
$$;

CREATE OR REPLACE FUNCTION public.vincular_cobrador_a_gerente(
  p_manager_id uuid,
  p_collector_id uuid
)
RETURNS public.manager_collector_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_novo public.manager_collector_links;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem alterar vinculos de equipe.';
  END IF;

  UPDATE public.manager_collector_links
  SET vigente_ate = v_hoje
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;

  INSERT INTO public.manager_collector_links (
    manager_id, collector_id, vigente_desde, created_by
  ) VALUES (
    p_manager_id, p_collector_id, v_hoje, (SELECT app_current_user_id())
  )
  RETURNING * INTO v_novo;

  RETURN v_novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.desvincular_cobrador(p_collector_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem alterar vinculos de equipe.';
  END IF;

  UPDATE public.manager_collector_links
  SET vigente_ate = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;
END;
$$;

-- =============================================================================
-- 2) Fecha EXECUTE de anon (so PUBLIC precisa ser revogado -- authenticated
--    ganha de volta explicitamente). resolve_auth_email fica de fora de
--    proposito (unico caminho liberado pra anon, usado antes do login).
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.protege_atribuicao_banco_dados() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reagendar_visita(uuid, date, time, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reagendar_visita(uuid, date, time, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.definir_faixa_atraso_cobrador(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.definir_faixa_atraso_cobrador(uuid, integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.vincular_cobrador_a_gerente(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vincular_cobrador_a_gerente(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.desvincular_cobrador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.desvincular_cobrador(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.marcar_acordos_quebrados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_acordos_quebrados() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.criar_acordo(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_acordo(text, jsonb, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancelar_acordo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_acordo(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_pagamento_acordo(uuid, numeric, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_acordo(uuid, numeric, date, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cliente_max_atraso_dias(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cliente_max_atraso_dias(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cliente_tem_acordo_ativo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cliente_tem_acordo_ativo(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cobrador_na_data_em_lote(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cobrador_na_data_em_lote(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.saldo_acordo_parcela(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.saldo_acordo_parcela(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.situacao_primaria_do_tipo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.situacao_primaria_do_tipo(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.titulo_em_acordo_ativo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.titulo_em_acordo_ativo(bigint) TO authenticated;
