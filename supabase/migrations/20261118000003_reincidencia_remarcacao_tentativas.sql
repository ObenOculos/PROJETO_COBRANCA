-- Item 83 (2026-11-18): controle de clientes reincidentes, para todo perfil
-- de cobrador (interno, terceirizado, juridico, presencial). Gestor fica
-- isento das tres regras.
--
--   1. Remarcacao: nova data no maximo 60 dias depois do agendamento (ou de
--      hoje, se o agendamento ja passou -- senao um agendamento vencido ha
--      mais de 60 dias nunca mais poderia ser remarcado).
--   2. Remarcacao: depois da 3a remarcacao seguida do mesmo agendamento
--      (cadeia rescheduled_from_id, mesma definicao de countPriorReschedules
--      em src/config/rescheduleReasons.ts), a proxima vai para autorizacao do
--      gestor, que mantem o cliente (e a remarcacao acontece) ou manda para o
--      SPC (situacao 'Aguardando Jurídico', mesmo destino da contestacao).
--   3. Atendimento: a partir de 5 tentativas sem retorno (cliente nao atende,
--      ocupado, numero errado, mensagem sem resposta) desde o ultimo retorno
--      real, o app avisa o cobrador a cada nova tentativa e ele pode reportar
--      o caso ao gestor (mesma fila e mesma decisao da regra 2).
--
-- Numeros repetidos em src/config/reincidencia.ts (aviso e limites na tela).
-- Mudou aqui, mude la.
--
-- Corpos de reagendar_visita e registrar_contato copiados de producao
-- (pg_get_functiondef em 2026-11-18), so com as mudancas marcadas "item 83".

-- ---------------------------------------------------------------------------
-- 1) reschedule_count passa a acumular na cadeia
-- ---------------------------------------------------------------------------
-- reagendar_visita gravava 0 fixo na visita nova, entao o contador nunca
-- passava de 1 e nao servia para limite nenhum. Backfill das visitas
-- ativas pelo tamanho real da cadeia (em 2026-11-18: 39 com remarcacao, 9
-- delas com 3 ou mais).
WITH RECURSIVE cadeia AS (
  SELECT id AS ativa, rescheduled_from_id AS anterior, 0 AS n
  FROM public.scheduled_visits
  WHERE status = 'agendada'
  UNION ALL
  SELECT c.ativa, v.rescheduled_from_id, c.n + 1
  FROM cadeia c
  JOIN public.scheduled_visits v ON v.id = c.anterior
  WHERE c.n < 200
), tamanho AS (
  SELECT ativa, max(n) AS n FROM cadeia GROUP BY ativa
)
UPDATE public.scheduled_visits s
SET reschedule_count = t.n
FROM tamanho t
WHERE s.id = t.ativa
  AND COALESCE(s.reschedule_count, 0) <> t.n;

-- ---------------------------------------------------------------------------
-- 2) Fila de casos para o gestor
-- ---------------------------------------------------------------------------
-- Um pedido por cliente e motivo enquanto pendente; a decisao fica gravada
-- no proprio registro (quem, quando, o que). Escrita so pelas RPCs abaixo.
CREATE TABLE IF NOT EXISTS public.casos_gestor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento text NOT NULL,
  cliente_nome text,
  collector_id uuid NOT NULL REFERENCES public.users(id),
  motivo text NOT NULL
    CHECK (motivo IN ('limite_remarcacao', 'tentativas_sem_retorno')),
  -- limite_remarcacao: remarcacoes ja feitas; tentativas_sem_retorno:
  -- tentativas sem retorno no momento do pedido.
  quantidade integer NOT NULL,
  -- Remarcacao pedida (so limite_remarcacao): o que o gestor aplica se mantiver.
  visita_id uuid REFERENCES public.scheduled_visits(id),
  nova_data date,
  novo_horario time without time zone,
  motivo_reagendamento text,
  notas_original text,
  notas_nova text,
  observacao text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'mantido', 'spc')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  decidido_por uuid REFERENCES public.users(id),
  decidido_em timestamptz,
  observacao_gestor text
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_caso_gestor_pendente
  ON public.casos_gestor (documento, motivo)
  WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_casos_gestor_status
  ON public.casos_gestor (status, criado_em DESC);

COMMENT ON TABLE public.casos_gestor IS
  'Item 83: clientes reincidentes levados ao gestor (limite de remarcacao ou tentativas sem retorno). Gestor mantem na carteira ou manda para o SPC. Escrita so por pedir_autorizacao_remarcacao, reportar_tentativas_gestor e decidir_caso_gestor.';

ALTER TABLE public.casos_gestor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.casos_gestor FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.casos_gestor FROM authenticated;

DROP POLICY IF EXISTS "casos_gestor_leitura" ON public.casos_gestor;
CREATE POLICY "casos_gestor_leitura" ON public.casos_gestor
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR collector_id = (SELECT app_current_user_id())
  );

-- ---------------------------------------------------------------------------
-- 3) Tentativas sem retorno desde o ultimo retorno real
-- ---------------------------------------------------------------------------
-- Uma tentativa = um registro (registrar_contato grava uma linha por titulo,
-- todas com o mesmo created_at). "Sem retorno": nao atendeu, ocupado,
-- numero errado/nao encontrado e mensagem enviada -- mensagem continua
-- contando como atendimento nas metricas (item 81), mas aqui o que importa e
-- se o cliente respondeu. Retorno real: qualquer resultado com conversa
-- (lista de EFFECTIVE_ATTEMPT_RESULTS sem message_sent), pagamento
-- registrado ou acordo. Outros resultados (contact_no_result, do Cedrus) nao
-- contam nem zeram.
-- SECURITY DEFINER: o cobrador precisa ver pagamento/acordo de qualquer
-- origem para achar o ultimo retorno (RLS esconderia parte). Quem nao e
-- gestor nem dono do cliente recebe 0.
CREATE OR REPLACE FUNCTION public.tentativas_sem_retorno(p_documento text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH acesso AS (
    SELECT (SELECT app_current_user_type()) = 'manager'
        OR EXISTS (
          SELECT 1 FROM public."BANCO_DADOS" b
          WHERE b.documento = p_documento
            AND b.user_id = (SELECT app_current_user_id())
        ) AS ok
  ), tent AS (
    SELECT a.created_at, a.result
    FROM public.collection_attempts a
    JOIN public."BANCO_DADOS" b ON b.id_parcela::text = a.collection_id
    WHERE b.documento = p_documento
  ), ultimo_retorno AS (
    SELECT GREATEST(
      (SELECT max(t.created_at) FROM tent t
       WHERE t.result IN ('promise', 'refusal', 'partial_payment',
                          'full_payment', 'contact_made', 'agreement',
                          'disputed', 'claims_paid', 'sale_cancel_reported')),
      (SELECT max(p.created_at) FROM public.sale_payments p
       WHERE p.client_document = p_documento),
      (SELECT max(ac.created_at) FROM public.acordos ac
       WHERE ac.client_document = p_documento)
    ) AS em
  )
  SELECT CASE WHEN (SELECT ok FROM acesso) IS TRUE THEN (
    SELECT count(DISTINCT t.created_at)::integer
    FROM tent t, ultimo_retorno u
    WHERE t.result IN ('no_answer', 'busy', 'not_found', 'message_sent')
      AND (u.em IS NULL OR t.created_at > u.em)
  ) ELSE 0 END;
$$;

COMMENT ON FUNCTION public.tentativas_sem_retorno(text) IS
  'Item 83: tentativas de contato sem retorno do cliente desde o ultimo retorno real (conversa, pagamento ou acordo). Limite do aviso em src/config/reincidencia.ts.';

GRANT EXECUTE ON FUNCTION public.tentativas_sem_retorno(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Pedido de autorizacao de remarcacao (regra 2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedir_autorizacao_remarcacao(
  p_visit_id uuid,
  p_nova_data date,
  p_novo_horario time without time zone DEFAULT NULL,
  p_motivo_chave text DEFAULT NULL,
  p_notas_original text DEFAULT NULL,
  p_notas_nova text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT app_current_user_id());
  v_visita public.scheduled_visits%ROWTYPE;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limite date;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  SELECT * INTO v_visita
  FROM public.scheduled_visits
  WHERE id = p_visit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita não encontrada.';
  END IF;

  IF v_visita.collector_id IS DISTINCT FROM v_uid::text THEN
    RAISE EXCEPTION 'Sem permissão para este agendamento.';
  END IF;
  IF v_visita.status <> 'agendada' THEN
    RAISE EXCEPTION 'Este agendamento não está mais em aberto. Atualize a lista.';
  END IF;
  IF COALESCE(v_visita.reschedule_count, 0) < 3 THEN
    RAISE EXCEPTION 'Este agendamento ainda pode ser remarcado sem autorização.';
  END IF;
  IF p_nova_data IS NULL OR p_nova_data < v_hoje THEN
    RAISE EXCEPTION 'Escolha uma data a partir de hoje.';
  END IF;
  v_limite := GREATEST(v_visita.scheduled_date, v_hoje) + 60;
  IF p_nova_data > v_limite THEN
    RAISE EXCEPTION 'A nova data passa do limite de 60 dias a partir do agendamento (até %).',
      to_char(v_limite, 'DD/MM/YYYY')
      USING HINT = 'prazo_remarcacao';
  END IF;

  INSERT INTO public.casos_gestor AS c (
    documento, cliente_nome, collector_id, motivo, quantidade,
    visita_id, nova_data, novo_horario, motivo_reagendamento,
    notas_original, notas_nova, observacao
  ) VALUES (
    v_visita.client_document, v_visita.client_name, v_uid,
    'limite_remarcacao', COALESCE(v_visita.reschedule_count, 0),
    v_visita.id, p_nova_data, p_novo_horario, p_motivo_chave,
    p_notas_original, p_notas_nova, p_observacao
  )
  ON CONFLICT (documento, motivo) WHERE status = 'pendente'
  DO UPDATE SET
    quantidade = EXCLUDED.quantidade,
    visita_id = EXCLUDED.visita_id,
    nova_data = EXCLUDED.nova_data,
    novo_horario = EXCLUDED.novo_horario,
    motivo_reagendamento = EXCLUDED.motivo_reagendamento,
    notas_original = EXCLUDED.notas_original,
    notas_nova = EXCLUDED.notas_nova,
    observacao = COALESCE(EXCLUDED.observacao, c.observacao),
    atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pedir_autorizacao_remarcacao(uuid, date, time without time zone, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Reportar tentativas sem retorno ao gestor (regra 3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reportar_tentativas_gestor(
  p_documento text,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT app_current_user_id());
  v_qtd integer;
  v_nome text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  SELECT b.cliente INTO v_nome
  FROM public."BANCO_DADOS" b
  WHERE b.documento = p_documento AND b.user_id = v_uid
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este cliente não está na sua carteira.';
  END IF;

  IF NOT public.cliente_tem_saldo_aberto(p_documento) THEN
    RAISE EXCEPTION 'Este cliente não tem pendência em aberto.';
  END IF;

  v_qtd := public.tentativas_sem_retorno(p_documento);
  IF v_qtd < 5 THEN
    RAISE EXCEPTION 'Este cliente ainda não chegou a 5 tentativas sem retorno.';
  END IF;

  INSERT INTO public.casos_gestor AS c (
    documento, cliente_nome, collector_id, motivo, quantidade, observacao
  ) VALUES (
    p_documento, v_nome, v_uid, 'tentativas_sem_retorno', v_qtd, p_observacao
  )
  ON CONFLICT (documento, motivo) WHERE status = 'pendente'
  DO UPDATE SET
    quantidade = EXCLUDED.quantidade,
    observacao = COALESCE(EXCLUDED.observacao, c.observacao),
    atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reportar_tentativas_gestor(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Decisao do gestor
-- ---------------------------------------------------------------------------
-- 'manter': o cliente fica; no limite de remarcacao, a remarcacao pedida e
-- aplicada agora (como gestor, sem os limites). 'spc': libera o cliente
-- para 'Aguardando Jurídico' (liberar_cliente_da_carteira; o gatilho
-- agendamento_segue_carteira_upd cuida do agendamento) e fecha todos os
-- casos pendentes dele.
CREATE OR REPLACE FUNCTION public.decidir_caso_gestor(
  p_caso_id uuid,
  p_decisao text,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT app_current_user_id());
  v_caso public.casos_gestor%ROWTYPE;
  v_visita_status text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_remarcou boolean := false;
  v_liberadas integer;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem decidir estes casos.';
  END IF;
  IF p_decisao NOT IN ('manter', 'spc') THEN
    RAISE EXCEPTION 'Decisão inválida.';
  END IF;

  SELECT * INTO v_caso FROM public.casos_gestor WHERE id = p_caso_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caso não encontrado.';
  END IF;
  IF v_caso.status <> 'pendente' THEN
    RAISE EXCEPTION 'Este caso já foi decidido.';
  END IF;

  IF p_decisao = 'spc' THEN
    v_liberadas := public.liberar_cliente_da_carteira(
      v_caso.documento, 'Aguardando Jurídico', NULL
    );
    IF COALESCE(v_liberadas, 0) = 0 THEN
      RAISE EXCEPTION 'Não foi possível mandar para o SPC: o cliente tem acordo ativo ou já saiu da carteira.';
    END IF;
    UPDATE public.casos_gestor
    SET status = 'spc', decidido_por = v_uid, decidido_em = now(),
        observacao_gestor = p_observacao, atualizado_em = now()
    WHERE documento = v_caso.documento AND status = 'pendente';
  ELSE
    IF v_caso.motivo = 'limite_remarcacao' AND v_caso.visita_id IS NOT NULL
       AND v_caso.nova_data IS NOT NULL AND v_caso.nova_data >= v_hoje THEN
      SELECT status INTO v_visita_status
      FROM public.scheduled_visits WHERE id = v_caso.visita_id;
      IF v_visita_status = 'agendada' THEN
        PERFORM public.reagendar_visita(
          v_caso.visita_id, v_caso.nova_data, v_caso.novo_horario,
          v_caso.motivo_reagendamento, v_caso.notas_original, v_caso.notas_nova
        );
        v_remarcou := true;
      END IF;
    END IF;
    UPDATE public.casos_gestor
    SET status = 'mantido', decidido_por = v_uid, decidido_em = now(),
        observacao_gestor = p_observacao, atualizado_em = now()
    WHERE id = v_caso.id;
  END IF;

  RETURN jsonb_build_object('decisao', p_decisao, 'remarcou', v_remarcou);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.decidir_caso_gestor(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) reagendar_visita: limites (regras 1 e 2) e contador acumulado
-- ---------------------------------------------------------------------------
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
  v_limite date;
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

  -- item 83: limites do cobrador (gestor isento).
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    v_limite := GREATEST(
      v_visita.scheduled_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ) + 60;
    IF p_nova_data > v_limite THEN
      RAISE EXCEPTION 'A nova data passa do limite de 60 dias a partir do agendamento (até %).',
        to_char(v_limite, 'DD/MM/YYYY')
        USING HINT = 'prazo_remarcacao';
    END IF;
    IF COALESCE(v_visita.reschedule_count, 0) >= 3 THEN
      RAISE EXCEPTION 'Este agendamento já foi remarcado % vezes. A próxima remarcação precisa de autorização do gestor.',
        v_visita.reschedule_count
        USING HINT = 'limite_remarcacao';
    END IF;
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
    -- item 83: a visita nova herda o contador (antes 0 fixo).
    v_novo_count, p_visit_id, v_visita.scheduled_by_manager_id,
    v_visita.client_address, v_visita.client_number, v_visita.client_neighborhood, v_visita.client_city,
    v_visita.total_pending_value, v_visita.overdue_count, v_visita.channel
  )
  RETURNING id INTO v_nova_id;

  UPDATE public.scheduled_visits
  SET rescheduled_to_id = v_nova_id
  WHERE id = p_visit_id;

  RETURN QUERY SELECT * FROM public.scheduled_visits WHERE id = v_nova_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8) registrar_contato: no limite, registra a tentativa e pede autorizacao
-- ---------------------------------------------------------------------------
-- Sem isto o "nao atendeu" de um cliente no limite falharia inteiro (o
-- reagendar_visita interno recusa) e a tentativa se perderia.
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
  v_caso_id uuid := NULL;
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
      IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager'
         AND COALESCE(v_visita.reschedule_count, 0) >= 3 THEN
        -- item 83: agendamento ja remarcado 3 vezes -- fica como esta e a
        -- nova data vai para o gestor decidir.
        v_caso_id := public.pedir_autorizacao_remarcacao(
          v_visita.id, p_proxima_data, p_proximo_horario,
          p_motivo_reagendamento,
          p_notas_reagendamento_original, p_notas_reagendamento_nova, NULL
        );
        v_desfecho := 'aguardando_gestor';
      ELSE
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
      END IF;
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
  IF v_nova_id IS NULL AND p_proxima_data IS NOT NULL AND p_situacao_liberacao IS NULL
     AND v_desfecho IS DISTINCT FROM 'aguardando_gestor' THEN
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
    'nova_visita_id', v_nova_id,
    'caso_id', v_caso_id
  );
END;
$function$;
