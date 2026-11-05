-- Correcao de seguranca (achada 2026-11-05 investigando o espelho de acordo).
--
-- A Etapa 2b (20261029000001) colocou guard de gestor nas RPCs sensiveis e a
-- 20261103000007/8 trocou "<> 'manager'" por "IS DISTINCT FROM" em parte
-- delas. Depois disso, migrations que recriaram funcoes copiando o corpo de
-- uma migration ANTIGA (nao o de producao) apagaram os guards:
--   - 20261030000005 (acordos) e 20261104000005 (guard de visita ativa):
--     atribuir_clientes_em_lote, remover_cobrador_em_lote e
--     liberar_cliente_da_carteira ficaram SEM guard nenhum;
--   - 20261104000004 (canal da visita): reagendar_visita voltou a "<>".
-- E cancelar_vendas, cancelar_clientes e registrar_ajuste_recebimento nunca
-- foram corrigidas (a 20261103000006 as listou como "fora de escopo").
-- Todas sao SECURITY DEFINER (ignoram RLS) e varias estavam com EXECUTE para
-- anon: sem login, "NULL <> 'manager'" e NULL, o IF nao dispara e a funcao
-- roda como gestor. Ex.: cancelar vendas de qualquer cliente ou lancar
-- ajuste/estorno de recebimento em nome de qualquer usuario.
--
-- Esta migration:
--   1) restaura/corrige o guard (sempre IS DISTINCT FROM) usando o corpo
--      ATUAL de producao (pg_get_functiondef), so mudando o necessario;
--   2) para de confiar no usuario enviado pela tela (p_usuario_id /
--      p_gerente_id): o autor gravado em historico e o da sessao. Os
--      parametros continuam na assinatura so por compatibilidade com o front;
--   3) liberar_cliente_da_carteira: gestor libera qualquer cliente; cobrador
--      so o PROPRIO cliente e so para a situacao de SPC. Desde a 2b o
--      cobrador ficava bloqueado aqui e na trigger trg_protege_atribuicao (o
--      desfecho de SPC falhava em silencio, so console.error); a trigger
--      passa a aceitar a liberacao autorizada pela RPC;
--   4) update_client_address: exige login; cobrador so altera endereco de
--      cliente da propria carteira; ganha search_path fixo;
--   5) revoga EXECUTE de anon (e de PUBLIC) em todas as funcoes do schema
--      public, exceto o caminho de login;
--   6) verificacao final: aborta se sobrar funcao com "<> 'manager'" ou
--      funcao liberada para anon fora da lista permitida.

-- =============================================================================
-- 1) RPCs de gestor
-- =============================================================================

CREATE OR REPLACE FUNCTION public.atribuir_clientes_em_lote(p_user_id text, p_documentos text[] DEFAULT '{}'::text[], p_clientes text[] DEFAULT '{}'::text[], p_situacao text DEFAULT NULL::text, p_gerente_id text DEFAULT NULL::text, p_manter_situacoes text[] DEFAULT '{}'::text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  PERFORM set_config('cobranca.motivo', 'atribuicao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE((SELECT app_current_user_id())::text, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id::uuid,
      situacao = CASE
        WHEN p_situacao IS NULL THEN b.situacao
        WHEN b.situacao = ANY (COALESCE(p_manter_situacoes, '{}')) THEN b.situacao
        ELSE p_situacao
      END
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND NOT public.cliente_tem_acordo_ativo(b.documento)
    AND NOT public.cliente_tem_visita_agendada_ativa(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remover_cobrador_em_lote(p_documentos text[] DEFAULT '{}'::text[], p_clientes text[] DEFAULT '{}'::text[], p_usuario_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  PERFORM set_config('cobranca.motivo', 'remocao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE((SELECT app_current_user_id())::text, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND b.user_id IS NOT NULL
    AND NOT public.cliente_tem_acordo_ativo(b.documento)
    AND NOT public.cliente_tem_visita_agendada_ativa(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_vendas(p_documento text, p_motivo text, p_usuario_id uuid, p_chaves bigint[] DEFAULT NULL::bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_usuario_id uuid := (SELECT app_current_user_id());
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  IF p_chaves IS NOT NULL AND cardinality(p_chaves) = 0 THEN
    RETURN 0;
  END IF;

  -- CTEs que modificam dados rodam todas, mesmo sem serem lidas depois.
  WITH alvo AS (
    SELECT
      b.id_parcela,
      COALESCE(b.numero_titulo, b.venda_n, 0) AS chave,
      COALESCE(b.valor_original, 0) AS original,
      COALESCE(b.valor_original, 0)
        - COALESCE(b.valor_recebido, 0)
        - COALESCE(b.desconto, 0) AS saldo
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (p_chaves IS NULL
           OR COALESCE(b.numero_titulo, b.venda_n, 0) = ANY (p_chaves))
  ),
  registro AS (
    INSERT INTO public.vendas_canceladas (
      documento, chave_venda, parcelas, valor_original, valor_em_aberto,
      motivo, usuario_id
    )
    SELECT p_documento, a.chave, count(*), round(sum(a.original), 2),
           round(GREATEST(sum(a.saldo), 0), 2), trim(p_motivo), v_usuario_id
    FROM alvo a
    GROUP BY a.chave
  )
  UPDATE public."BANCO_DADOS" b
  SET status = 'Cancelado'
  FROM alvo a
  WHERE b.id_parcela = a.id_parcela;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Sem nenhuma parcela ativa, nao ha mais o que cobrar: cancela as visitas
  -- em aberto. (Se sobrou parcela ativa ja paga, o gatilho de cliente quitado
  -- cuida disso; se sobrou divida, as visitas continuam.)
  IF NOT EXISTS (
    SELECT 1 FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
  ) THEN
    UPDATE public.scheduled_visits v
    SET status                      = 'cancelada',
        cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
        cancellation_request_reason = COALESCE(
          NULLIF(trim(v.cancellation_request_reason), ''),
          'Cancelada automaticamente: vendas do cliente canceladas'
        ),
        cancellation_approved_by    = 'sistema (vendas canceladas)',
        cancellation_approved_at    = now(),
        updated_at                  = now()
    WHERE v.client_document = p_documento
      AND v.status IN ('agendada', 'cancelamento_solicitado');
  END IF;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_clientes(p_documentos text[], p_motivo text, p_usuario_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc   text;
  v_total integer := 0;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  FOREACH v_doc IN ARRAY COALESCE(p_documentos, '{}') LOOP
    v_total := v_total + public.cancelar_vendas(v_doc, p_motivo, NULL, NULL);
  END LOOP;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_ajuste_recebimento(p_client_document text, p_client_name text, p_sale_number integer, p_diferenca numeric, p_motivo text, p_usuario_id uuid, p_pagamento_estornado uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usuario_id   uuid := (SELECT app_current_user_id());
  v_usuario_nome text;
  v_original     public.sale_payments%ROWTYPE;
  v_ja_estornado numeric;
  v_disponivel   numeric;
  v_estorno      numeric := 0;
  v_resto        numeric;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da correção.';
  END IF;
  IF p_diferenca IS NULL OR abs(p_diferenca) < 0.01 THEN
    RETURN;
  END IF;

  SELECT name INTO v_usuario_nome FROM public.users WHERE id = v_usuario_id;

  -- Ajuste positivo: nao e recebimento do cobrador; fica com quem editou.
  IF p_diferenca > 0 THEN
    INSERT INTO public.sale_payments (
      sale_number, client_document, client_name, payment_amount, payment_date,
      payment_method, notes, collector_id, collector_name, motivo,
      registrado_por_id
    ) VALUES (
      p_sale_number, p_client_document, p_client_name, round(p_diferenca, 2),
      v_hoje, 'Ajuste Administrativo', 'Correção manual do valor recebido',
      v_usuario_id, v_usuario_nome, trim(p_motivo), v_usuario_id
    );
    RETURN;
  END IF;

  -- Estorno de um pagamento do app.
  IF p_pagamento_estornado IS NOT NULL THEN
    SELECT * INTO v_original
    FROM public.sale_payments
    WHERE id = p_pagamento_estornado
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pagamento a estornar não encontrado.';
    END IF;
    IF v_original.client_document IS DISTINCT FROM p_client_document THEN
      RAISE EXCEPTION 'O pagamento escolhido é de outro cliente.';
    END IF;
    IF v_original.payment_amount <= 0 OR v_original.estorno_de IS NOT NULL
       OR v_original.payment_method ~* '^(ajuste|estorno)' THEN
      RAISE EXCEPTION 'Só é possível estornar um pagamento registrado no app.';
    END IF;

    SELECT COALESCE(-SUM(payment_amount), 0) INTO v_ja_estornado
    FROM public.sale_payments
    WHERE estorno_de = v_original.id;

    v_disponivel := v_original.payment_amount - v_ja_estornado;
    v_estorno := LEAST(-p_diferenca, GREATEST(v_disponivel, 0));

    IF v_estorno >= 0.01 THEN
      INSERT INTO public.sale_payments (
        sale_number, client_document, client_name, payment_amount,
        payment_date, payment_method, notes, collector_id, collector_name,
        estorno_de, motivo, registrado_por_id
      ) VALUES (
        p_sale_number, p_client_document, p_client_name, -round(v_estorno, 2),
        v_hoje, 'Estorno',
        'Estorno do pagamento de ' || to_char(v_original.payment_date, 'DD/MM/YYYY')
          || COALESCE(' registrado por ' || v_usuario_nome, ''),
        v_original.collector_id, v_original.collector_name,
        v_original.id, trim(p_motivo), v_usuario_id
      );
    ELSE
      v_estorno := 0;
    END IF;
  END IF;

  -- O que nao coube no pagamento escolhido (ou correcao sem pagamento do app):
  -- ajuste administrativo de quem editou.
  v_resto := -p_diferenca - v_estorno;
  IF v_resto >= 0.01 THEN
    INSERT INTO public.sale_payments (
      sale_number, client_document, client_name, payment_amount, payment_date,
      payment_method, notes, collector_id, collector_name, motivo,
      registrado_por_id
    ) VALUES (
      p_sale_number, p_client_document, p_client_name, -round(v_resto, 2),
      v_hoje, 'Estorno/Ajuste Negativo', 'Correção manual do valor recebido',
      v_usuario_id, v_usuario_nome, trim(p_motivo), v_usuario_id
    );
  END IF;
END;
$function$;

-- =============================================================================
-- 2) Liberacao de carteira: gestor ou o proprio cobrador (so SPC)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.liberar_cliente_da_carteira(p_documento text, p_situacao text, p_usuario_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_usuario_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
BEGIN
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF v_user_type IS DISTINCT FROM 'manager' THEN
    -- Cobrador so encerra o caso do proprio cliente, e so pelo desfecho que
    -- o app preve (contestacao/SPC -> SITUACAO_SPC em config/visitOutcomes.ts).
    IF p_situacao IS DISTINCT FROM 'Aguardando Jurídico' THEN
      RAISE EXCEPTION 'Cobrador só pode liberar cliente para "Aguardando Jurídico".';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS"
      WHERE documento = p_documento AND user_id = v_usuario_id
    ) OR EXISTS (
      SELECT 1 FROM public."BANCO_DADOS"
      WHERE documento = p_documento
        AND user_id IS NOT NULL AND user_id <> v_usuario_id
    ) THEN
      RAISE EXCEPTION 'Este cliente não está na sua carteira.';
    END IF;
  END IF;

  PERFORM set_config('cobranca.motivo', 'liberacao: ' || COALESCE(p_situacao, ''), true);
  PERFORM set_config('cobranca.usuario_id', v_usuario_id::text, true);
  -- Autoriza trg_protege_atribuicao a aceitar user_id -> NULL vindo daqui.
  PERFORM set_config('cobranca.liberacao_autorizada', 'true', true);

  UPDATE public."BANCO_DADOS" b
  SET situacao = p_situacao,
      user_id  = NULL
  WHERE b.documento = p_documento
    AND NOT public.cliente_tem_acordo_ativo(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('cobranca.liberacao_autorizada', '', true);
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protege_atribuicao_banco_dados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if NEW.user_id is distinct from OLD.user_id
     and public.app_current_user_type() IS DISTINCT FROM 'manager'
     -- Unica excecao: liberacao validada em liberar_cliente_da_carteira,
     -- que so tira o cobrador (nunca atribui outro).
     and not (
       NEW.user_id is null
       and coalesce(current_setting('cobranca.liberacao_autorizada', true), '') = 'true'
     ) then
    raise exception 'Apenas gestores podem reatribuir o cobrador de um cliente.';
  end if;
  return NEW;
end;
$function$;

-- =============================================================================
-- 3) Reagendamento (guard regrediu na 20261104000004) e acordo
-- =============================================================================

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
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid, p_motivo text)
 RETURNS acordos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_acordo public.acordos%ROWTYPE;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório para cancelar um acordo.';
  END IF;

  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo não encontrado.';
  END IF;

  IF v_user_type IS DISTINCT FROM 'manager' AND v_acordo.collector_id IS DISTINCT FROM v_collector_id THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este acordo.';
  END IF;

  IF v_acordo.status <> 'ativo' THEN
    RAISE EXCEPTION 'Este acordo não está mais ativo (status atual: %).', v_acordo.status;
  END IF;

  UPDATE public.acordos
  SET status = 'cancelado', motivo_cancelamento = p_motivo, resolved_at = now()
  WHERE id = p_acordo_id
  RETURNING * INTO v_acordo;

  UPDATE public."BANCO_DADOS"
  SET situacao = public.situacao_primaria_do_tipo(
    (SELECT type FROM public.users WHERE id = v_acordo.collector_id)
  )
  WHERE documento = v_acordo.client_document AND situacao = 'Em acordo';

  RETURN v_acordo;
END;
$function$;

-- registrar_pagamento_acordo: so a linha do guard muda aqui (corpo identico ao
-- da 20261104000007); a regra do espelho e assunto da proxima migration.
CREATE OR REPLACE FUNCTION public.registrar_pagamento_acordo(p_acordo_parcela_id uuid, p_valor_pago numeric, p_data_pagamento date, p_notes text DEFAULT NULL::text)
 RETURNS acordo_pagamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_acordo public.acordos%ROWTYPE;
  v_saldo numeric;
  v_pagamento public.acordo_pagamentos%ROWTYPE;
  v_remaining numeric;
  v_titulo RECORD;
  v_pending numeric;
  v_to_apply numeric;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser positivo.';
  END IF;

  SELECT a.* INTO v_acordo
  FROM public.acordos a
  JOIN public.acordo_parcelas ap ON ap.acordo_id = a.id
  WHERE ap.id = p_acordo_parcela_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela de acordo não encontrada.';
  END IF;

  IF v_user_type IS DISTINCT FROM 'manager' AND v_acordo.collector_id IS DISTINCT FROM v_collector_id THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento neste acordo.';
  END IF;

  IF v_acordo.status <> 'ativo' THEN
    RAISE EXCEPTION 'Este acordo não está mais ativo (status atual: %).', v_acordo.status;
  END IF;

  v_saldo := public.saldo_acordo_parcela(p_acordo_parcela_id);
  IF p_valor_pago > v_saldo + 0.01 THEN
    RAISE EXCEPTION 'Valor informado (%) é maior que o saldo da parcela (%).', p_valor_pago, v_saldo;
  END IF;

  INSERT INTO public.acordo_pagamentos (
    acordo_parcela_id, valor_pago, data_pagamento, collector_id, notes, registrado_por_id
  ) VALUES (
    p_acordo_parcela_id, p_valor_pago, p_data_pagamento, v_collector_id, p_notes, v_collector_id
  )
  RETURNING * INTO v_pagamento;

  v_remaining := p_valor_pago;

  FOR v_titulo IN
    SELECT
      b.id_parcela,
      COALESCE(b.valor_original, 0) AS valor_original,
      COALESCE(b.valor_recebido, 0) AS valor_recebido,
      COALESCE(b.desconto, 0) AS desconto,
      at2.multa_valor,
      at2.juros_valor,
      at2.desconto_valor
    FROM public.acordo_titulos at2
    JOIN public."BANCO_DADOS" b ON b.id_parcela = at2.collection_id
    WHERE at2.acordo_id = v_acordo.id
    ORDER BY b.data_vencimento ASC NULLS LAST, b.id_parcela ASC
    FOR UPDATE OF b
  LOOP
    EXIT WHEN v_remaining <= 0.01;

    v_pending := (v_titulo.valor_original - v_titulo.valor_recebido - v_titulo.desconto)
               + v_titulo.multa_valor + v_titulo.juros_valor - v_titulo.desconto_valor;
    IF v_pending > 0.01 THEN
      v_to_apply := LEAST(v_remaining, v_pending);

      UPDATE public."BANCO_DADOS"
      SET valor_recebido = round(v_titulo.valor_recebido + v_to_apply, 2),
          data_de_recebimento = p_data_pagamento,
          status = CASE
                     WHEN v_to_apply >= v_pending - 0.01
                     THEN 'Pago'
                     ELSE 'Pago Parcial'
                   END
      WHERE id_parcela = v_titulo.id_parcela;

      v_remaining := v_remaining - v_to_apply;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.acordo_parcelas ap2
    WHERE ap2.acordo_id = v_acordo.id
      AND public.saldo_acordo_parcela(ap2.id) > 0.01
  ) THEN
    UPDATE public.acordos
    SET status = 'cumprido', resolved_at = now()
    WHERE id = v_acordo.id;

    UPDATE public."BANCO_DADOS"
    SET situacao = public.situacao_primaria_do_tipo(
      (SELECT type FROM public.users WHERE id = v_acordo.collector_id)
    )
    WHERE documento = v_acordo.client_document AND situacao = 'Em acordo';
  END IF;

  RETURN v_pagamento;
END;
$function$;

-- =============================================================================
-- 4) Endereco: exige login; cobrador so na propria carteira
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_client_address(p_cliente_documento text, p_logradouro text, p_numero text, p_bairro text, p_cidade text, p_estado text, p_cep text, p_complemento text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_has_history boolean;
    v_original_address record;
    v_usuario_id uuid := (SELECT app_current_user_id());
BEGIN
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;
    IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' AND NOT EXISTS (
        SELECT 1 FROM public."BANCO_DADOS"
        WHERE documento = p_cliente_documento AND user_id = v_usuario_id
    ) THEN
        RAISE EXCEPTION 'Este cliente não está na sua carteira.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.enderecos_historico
        WHERE cliente_documento = p_cliente_documento
    ) INTO v_has_history;

    -- Primeira alteracao: arquiva o endereco original de BANCO_DADOS antes do novo.
    IF NOT v_has_history THEN
        SELECT endereco, numero, bairro, cidade, estado, cep, complemento
        INTO v_original_address
        FROM public."BANCO_DADOS"
        WHERE documento = p_cliente_documento
          AND endereco IS NOT NULL
        ORDER BY data_lancamento DESC, id_parcela DESC
        LIMIT 1;

        IF FOUND THEN
            INSERT INTO public.enderecos_historico (
                cliente_documento, logradouro, numero, bairro, cidade, estado,
                cep, complemento, is_atual, created_at
            ) VALUES (
                p_cliente_documento,
                v_original_address.endereco,
                v_original_address.numero,
                v_original_address.bairro,
                v_original_address.cidade,
                v_original_address.estado,
                v_original_address.cep,
                v_original_address.complemento,
                false,
                NOW() - INTERVAL '1 second'
            );
        END IF;
    ELSE
        UPDATE public.enderecos_historico
        SET is_atual = false
        WHERE cliente_documento = p_cliente_documento AND is_atual = true;
    END IF;

    INSERT INTO public.enderecos_historico (
        cliente_documento, logradouro, numero, bairro, cidade, estado,
        cep, complemento, is_atual
    ) VALUES (
        p_cliente_documento, p_logradouro, p_numero, p_bairro, p_cidade,
        p_estado, p_cep, p_complemento, true
    );
END;
$function$;

-- Sobrecarga antiga de 7 parametros (sem complemento): o front nao usa mais
-- e ela nao tem guard. Fica sem EXECUTE para ninguem alem do dono.
REVOKE EXECUTE ON FUNCTION public.update_client_address(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 5) Nenhuma funcao do schema public executavel por anon, exceto o login.
--    Revogar so de anon nao basta quando o privilegio vem de PUBLIC: por isso
--    o grant explicito a authenticated/service_role e preservado antes.
-- =============================================================================

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('resolve_auth_email', 'app_current_user_id', 'app_current_user_type')
  LOOP
    IF has_function_privilege('authenticated', f.sig, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    IF has_function_privilege('service_role', f.sig, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;

-- A sobrecarga antiga pode ter recebido grant de volta no loop acima.
REVOKE EXECUTE ON FUNCTION public.update_client_address(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.update_client_address(text, text, text, text, text, text, text) SET search_path = public;

-- =============================================================================
-- 6) Verificacao: aborta a migration (rollback) se sobrar algum buraco.
-- =============================================================================

DO $$
DECLARE
  v_lista text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_lista
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') ~ '<>\s*''manager''';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Guard "<> manager" ainda presente em: %', v_lista;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_lista
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('resolve_auth_email', 'app_current_user_id', 'app_current_user_type');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Funções ainda executáveis por anon: %', v_lista;
  END IF;
END $$;
