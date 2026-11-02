-- Etapa 3 (fase 2/3) da reorganizacao do banco: os 11 campos de dinheiro de
-- BANCO_DADOS passam de text para numeric.
--
-- Confirmado em producao antes desta migration (consulta read-only via
-- Management API, 2026-11-02): 100% dos valores ja sao texto numerico limpo
-- (ou string vazia, tratada como null) nas 163.609 linhas. A unica fonte que
-- poderia gravar algo fora desse formato (AddTituloModal.tsx, inputs de texto
-- com placeholder BR) ja foi corrigida no commit c7dd211 (fase 2 do front,
-- antes desta migration).
--
-- Uma tentativa de ALTER COLUMN TYPE direto falhou: "cannot alter type of a
-- column used by a view or rule" (vw_clientes_cobradores). Levantamento
-- completo (information_schema.view_column_usage + busca em pg_proc.prosrc
-- pelos 11 nomes de coluna) achou 3 views e 9 funcoes dependentes. Decisoes
-- do usuario (2026-11-02):
--   - vw_clientes_cobradores (view) e clientes_do_cobrador/clientes_sem_cobrador/
--     listar_cobradores (RPCs): nenhuma rastreada em migration, nenhuma
--     chamada pelo front (confirmado por busca em src/) -- apagar.
--   - banco_dados_clientes_ativos/_quitados (views do item 8, em uso real):
--     recriar identicas em torno do ALTER TABLE.
--   - 6 funcoes em uso real (trg_atualiza_saldo_por_documento, process_payment,
--     registrar_pagamento_acordo, cancelar_vendas, trg_recebimentos_historico_ins/upd):
--     reescritas abaixo trocando REPLACE(...)/texto_para_valor(...)/TO_CHAR(...)
--     por uso direto da coluna numeric -- nenhuma outra regra de negocio mudou.
--   - Grant orfao do role `anon` em banco_dados_clientes_quitados (achado:
--     pg_default_acl do schema public concede tudo, incluindo anon, a toda
--     view nova -- por isso ela tinha o grant e banco_dados_clientes_ativos,
--     mais antiga e revogada explicitamente na Etapa 2a, nao tinha): removido
--     explicitamente apos recriar as 2 views, para nao reintroduzir o acesso
--     que a Etapa 2a revogou.

-- =============================================================================
-- 1. Objetos orfaos: apagar (decisao do usuario)
-- =============================================================================

DROP FUNCTION IF EXISTS public.clientes_do_cobrador(uuid);
DROP FUNCTION IF EXISTS public.clientes_sem_cobrador();
DROP FUNCTION IF EXISTS public.listar_cobradores();
DROP VIEW IF EXISTS public.vw_clientes_cobradores;

-- =============================================================================
-- 2. Views em uso: dropar pra liberar o ALTER COLUMN TYPE. O trigger abaixo
--    tambem bloqueia o ALTER -- nao pelo corpo da funcao (que ja sera
--    reescrito no passo 4), mas pela clausula "UPDATE OF valor_original,
--    valor_recebido, desconto, ..." da propria definicao do trigger, que
--    registra uma dependencia estrutural na coluna (achado em teste com
--    ROLLBACK: "cannot alter type of a column used in a trigger definition").
-- =============================================================================

DROP VIEW public.banco_dados_clientes_ativos;
DROP VIEW public.banco_dados_clientes_quitados;

DROP TRIGGER trg_banco_dados_atualiza_saldo ON "BANCO_DADOS";

-- =============================================================================
-- 3. Conversao de tipo (11 colunas numa unica ALTER TABLE = uma reescrita so)
-- =============================================================================

ALTER TABLE "BANCO_DADOS"
  ALTER COLUMN valor_original   TYPE numeric USING NULLIF(valor_original, '')::numeric,
  ALTER COLUMN valor_reajustado TYPE numeric USING NULLIF(valor_reajustado, '')::numeric,
  ALTER COLUMN multa            TYPE numeric USING NULLIF(multa, '')::numeric,
  ALTER COLUMN juros_por_dia    TYPE numeric USING NULLIF(juros_por_dia, '')::numeric,
  ALTER COLUMN multa_aplicada   TYPE numeric USING NULLIF(multa_aplicada, '')::numeric,
  ALTER COLUMN juros_aplicado   TYPE numeric USING NULLIF(juros_aplicado, '')::numeric,
  ALTER COLUMN valor_recebido   TYPE numeric USING NULLIF(valor_recebido, '')::numeric,
  ALTER COLUMN desconto         TYPE numeric USING NULLIF(desconto, '')::numeric,
  ALTER COLUMN acrescimo        TYPE numeric USING NULLIF(acrescimo, '')::numeric,
  ALTER COLUMN multa_paga       TYPE numeric USING NULLIF(multa_paga, '')::numeric,
  ALTER COLUMN juros_pago       TYPE numeric USING NULLIF(juros_pago, '')::numeric;

-- =============================================================================
-- 4. Funcoes em uso: trocar o parsing de texto por uso direto da coluna numeric
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_atualiza_saldo_por_documento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc text;
BEGIN
  -- UPDATE que move o documento (nao deveria acontecer na pratica, mas se
  -- acontecer recalcula os dois lados).
  IF TG_OP = 'UPDATE' AND NEW.documento IS DISTINCT FROM OLD.documento
     AND OLD.documento IS NOT NULL THEN
    INSERT INTO saldo_por_documento_tbl (documento, saldo, updated_at)
    VALUES (
      OLD.documento,
      (SELECT COALESCE(SUM(
         COALESCE(b.valor_original, 0)
         - COALESCE(b.valor_recebido, 0)
         - COALESCE(b.desconto, 0)
       ), 0)
       FROM "BANCO_DADOS" b
       WHERE b.documento = OLD.documento
         AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'),
      now()
    )
    ON CONFLICT (documento) DO UPDATE
      SET saldo = EXCLUDED.saldo, updated_at = EXCLUDED.updated_at;
  END IF;

  v_doc := NEW.documento;
  IF v_doc IS NULL THEN
    RETURN NEW;
  END IF;

  -- COALESCE(SUM(...), 0) garante uma linha mesmo quando a ultima parcela do
  -- documento virar 'cancelado': sem isso o saldo ficaria com o valor antigo
  -- (stale) em vez de zerar.
  INSERT INTO saldo_por_documento_tbl (documento, saldo, updated_at)
  VALUES (
    v_doc,
    (SELECT COALESCE(SUM(
       COALESCE(b.valor_original, 0)
       - COALESCE(b.valor_recebido, 0)
       - COALESCE(b.desconto, 0)
     ), 0)
     FROM "BANCO_DADOS" b
     WHERE b.documento = v_doc
       AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'),
    now()
  )
  ON CONFLICT (documento) DO UPDATE
    SET saldo = EXCLUDED.saldo, updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_payment(p_collector_id uuid, p_client_document text, p_payment_amount numeric, p_discount_amount numeric DEFAULT 0, p_payment_method text DEFAULT 'dinheiro'::text, p_notes text DEFAULT ''::text, p_sale_number integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_payment_id uuid;
    v_remaining_payment numeric;
    v_remaining_discount numeric;
    v_total_pending_client numeric;
    v_installments_to_update record;
    v_client_name text;
    v_collector_name text;
    v_current_pending numeric;
    v_payment_to_apply numeric;
    v_discount_to_apply numeric;
    v_current_received numeric;
    v_current_discount numeric;
    v_current_original numeric;
    v_hoje text := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
BEGIN
    -- Get client and collector names
    SELECT cliente INTO v_client_name FROM public."BANCO_DADOS" WHERE documento = p_client_document LIMIT 1;
    SELECT name INTO v_collector_name FROM public.users WHERE id = p_collector_id LIMIT 1;

    -- Insert into sale_payments
    INSERT INTO public.sale_payments (
        collector_id,
        client_document,
        payment_amount,
        discount_amount,
        payment_method,
        notes,
        sale_number,
        client_name,
        collector_name
    ) VALUES (
        p_collector_id,
        p_client_document,
        p_payment_amount,
        p_discount_amount,
        p_payment_method,
        p_notes,
        p_sale_number,
        v_client_name,
        v_collector_name
    )
    RETURNING id INTO v_payment_id;

    -- As mudancas de parcela abaixo sao registradas em recebimentos_historico
    -- como origem 'app', ligadas a este pagamento.
    PERFORM set_config('cobranca.origem', 'app', true);
    PERFORM set_config('cobranca.sale_payment_id', v_payment_id::text, true);

    v_remaining_payment := p_payment_amount;
    v_remaining_discount := p_discount_amount;

    -- Loop through pending installments for the client.
    -- Seleção da venda por numero_titulo (fallback venda_n); 0 = avulsa.
    FOR v_installments_to_update IN
        SELECT id_parcela, valor_original, valor_recebido, desconto, venda_n
        FROM public."BANCO_DADOS"
        WHERE documento = p_client_document
          AND (
            p_sale_number IS NULL -- General payment (todas as parcelas)
            OR (
              p_sale_number > 0 AND (
                numero_titulo = p_sale_number
                OR (numero_titulo IS NULL AND venda_n = p_sale_number) -- fallback
              )
            )
            OR (p_sale_number = 0 AND numero_titulo IS NULL AND venda_n IS NULL) -- avulsa
          )
          AND (COALESCE(valor_recebido, 0) + COALESCE(desconto, 0)) < COALESCE(valor_original, 0)
        ORDER BY data_vencimento ASC, id_parcela ASC
    LOOP
        -- Colunas ja sao numeric (migration 20261102000004) -- sem parsing de texto.
        v_current_original := COALESCE(v_installments_to_update.valor_original, 0);
        v_current_received := COALESCE(v_installments_to_update.valor_recebido, 0);
        v_current_discount := COALESCE(v_installments_to_update.desconto, 0);

        v_current_pending := v_current_original - v_current_received - v_current_discount;

        -- Apply discount first
        IF v_remaining_discount > 0 AND v_current_pending > 0 THEN
            v_discount_to_apply := LEAST(v_remaining_discount, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET desconto = round(v_current_discount + v_discount_to_apply, 2)
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_discount := v_remaining_discount - v_discount_to_apply;
            v_current_pending := v_current_pending - v_discount_to_apply;
            v_current_discount := v_current_discount + v_discount_to_apply;
        END IF;

        -- Apply payment
        IF v_remaining_payment > 0 AND v_current_pending > 0 THEN
            v_payment_to_apply := LEAST(v_remaining_payment, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET valor_recebido = round(v_current_received + v_payment_to_apply, 2),
                data_de_recebimento = v_hoje
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_payment := v_remaining_payment - v_payment_to_apply;
            v_current_pending := v_current_pending - v_payment_to_apply;
            v_current_received := v_current_received + v_payment_to_apply;
        END IF;

        -- Update status based on the final state of the installment
        UPDATE public."BANCO_DADOS"
        SET status = CASE
                        WHEN v_current_pending <= 0.01 THEN 'Pago'
                        WHEN (v_current_received + v_current_discount) > 0 THEN 'Pago Parcial'
                        ELSE 'Em atraso'
                     END
        WHERE id_parcela = v_installments_to_update.id_parcela;

        -- Exit loop if payment and discount are fully distributed
        IF v_remaining_payment <= 0 AND v_remaining_discount <= 0 THEN
            EXIT;
        END IF;
    END LOOP;

    -- Valor em aberto do cliente nas visitas AINDA EM ABERTO. Visitas fechadas
    -- guardam o valor do momento em que aconteceram.
    SELECT SUM(COALESCE(valor_original, 0) - COALESCE(valor_recebido, 0) - COALESCE(desconto, 0)) INTO v_total_pending_client
    FROM public."BANCO_DADOS"
    WHERE documento = p_client_document;

    UPDATE public.scheduled_visits
    SET total_pending_value = v_total_pending_client
    WHERE client_document = p_client_document
      AND status IN ('agendada', 'cancelamento_solicitado');

END;
$function$;

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

  IF v_user_type <> 'manager' AND v_acordo.collector_id <> v_collector_id THEN
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

  -- Espelha o pagamento nos titulos originais consolidados (mais antigo
  -- primeiro), mesma mecanica de process_payment: sem isto o saldo do cliente
  -- em todo o resto do sistema (telas de cobranca, Desempenho, views do
  -- escopo "active"/"quitados") nao sabe que o acordo foi pago.
  v_remaining := p_valor_pago;

  FOR v_titulo IN
    SELECT
      b.id_parcela,
      COALESCE(b.valor_original, 0) AS valor_original,
      COALESCE(b.valor_recebido, 0) AS valor_recebido,
      COALESCE(b.desconto, 0) AS desconto
    FROM public.acordo_titulos at2
    JOIN public."BANCO_DADOS" b ON b.id_parcela = at2.collection_id
    WHERE at2.acordo_id = v_acordo.id
    ORDER BY b.data_vencimento ASC NULLS LAST, b.id_parcela ASC
    FOR UPDATE OF b
  LOOP
    EXIT WHEN v_remaining <= 0.01;

    v_pending := v_titulo.valor_original - v_titulo.valor_recebido - v_titulo.desconto;
    IF v_pending > 0.01 THEN
      v_to_apply := LEAST(v_remaining, v_pending);

      UPDATE public."BANCO_DADOS"
      SET valor_recebido = round(v_titulo.valor_recebido + v_to_apply, 2),
          data_de_recebimento = p_data_pagamento,
          status = CASE
                     WHEN (v_titulo.valor_recebido + v_to_apply + v_titulo.desconto)
                          >= v_titulo.valor_original - 0.01
                     THEN 'Pago'
                     ELSE 'Pago Parcial'
                   END
      WHERE id_parcela = v_titulo.id_parcela;

      v_remaining := v_remaining - v_to_apply;
    END IF;
  END LOOP;

  -- Todas as parcelas quitadas? Acordo cumprido, cliente volta pra fila
  -- normal do perfil do cobrador.
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

CREATE OR REPLACE FUNCTION public.cancelar_vendas(p_documento text, p_motivo text, p_usuario_id uuid, p_chaves bigint[] DEFAULT NULL::bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF public.app_current_user_type() <> 'manager' THEN
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
           round(GREATEST(sum(a.saldo), 0), 2), trim(p_motivo), p_usuario_id
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

CREATE OR REPLACE FUNCTION public.trg_recebimentos_historico_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.recebimentos_historico (
    id_parcela, documento, chave_venda,
    recebido_antes, recebido_depois, desconto_antes, desconto_depois,
    data_de_recebimento, origem, sale_payment_id, cobrador_carteira_id
  )
  SELECT
    n.id_parcela,
    n.documento,
    COALESCE(n.numero_titulo, n.venda_n, 0),
    0,
    n.valor_recebido,
    0,
    n.desconto,
    n.data_de_recebimento,
    COALESCE(NULLIF(current_setting('cobranca.origem', true), ''), 'erp_ou_manual'),
    NULLIF(current_setting('cobranca.sale_payment_id', true), '')::uuid,
    n.user_id
  FROM novas n
  WHERE COALESCE(n.valor_recebido, 0) <> 0
     OR COALESCE(n.desconto, 0) <> 0;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recebimentos_historico_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.recebimentos_historico (
    id_parcela, documento, chave_venda,
    recebido_antes, recebido_depois, desconto_antes, desconto_depois,
    data_de_recebimento, origem, sale_payment_id, cobrador_carteira_id
  )
  SELECT
    n.id_parcela,
    n.documento,
    COALESCE(n.numero_titulo, n.venda_n, 0),
    o.valor_recebido,
    n.valor_recebido,
    o.desconto,
    n.desconto,
    n.data_de_recebimento,
    COALESCE(NULLIF(current_setting('cobranca.origem', true), ''), 'erp_ou_manual'),
    NULLIF(current_setting('cobranca.sale_payment_id', true), '')::uuid,
    n.user_id
  FROM novas n
  JOIN antigas o ON o.id_parcela = n.id_parcela
  WHERE COALESCE(o.valor_recebido, 0)
          IS DISTINCT FROM COALESCE(n.valor_recebido, 0)
     OR COALESCE(o.desconto, 0)
          IS DISTINCT FROM COALESCE(n.desconto, 0);

  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_banco_dados_atualiza_saldo
  AFTER INSERT OR UPDATE OF valor_original, valor_recebido, desconto, status, documento
  ON "BANCO_DADOS"
  FOR EACH ROW EXECUTE FUNCTION trg_atualiza_saldo_por_documento();

-- =============================================================================
-- 5. Recriar as 2 views em uso (mesma definicao; so o tipo das colunas
--    subjacentes mudou) e remover o grant do anon que o default ACL do
--    schema reintroduziria.
-- =============================================================================

CREATE VIEW public.banco_dados_clientes_ativos
WITH (security_invoker = on) AS
SELECT b.nome_da_loja, b.data_lancamento, b.data_vencimento, b.valor_original,
       b.valor_reajustado, b.multa, b.juros_por_dia, b.multa_aplicada,
       b.juros_aplicado, b.valor_recebido, b.data_de_recebimento,
       b.dias_em_atraso, b.dias_carencia, b.desconto, b.acrescimo,
       b.multa_paga, b.juros_pago, b.tipo_de_cobranca, b.numero_titulo,
       b.parcela, b.id_parcela, b.status, b.cliente, b.documento,
       b.endereco, b.numero, b.bairro, b.complemento, b.cep, b.cidade,
       b.estado, b.obs, b.codigo_externo, b.descricao, b.venda_n,
       b.convenio, b.user_id, b.situacao
FROM "BANCO_DADOS" b
LEFT JOIN saldo_por_documento s ON s.documento = b.documento
WHERE COALESCE(s.saldo > 0.01, true);

REVOKE ALL ON public.banco_dados_clientes_ativos FROM anon;

CREATE VIEW public.banco_dados_clientes_quitados
WITH (security_invoker = on) AS
SELECT b.nome_da_loja, b.data_lancamento, b.data_vencimento, b.valor_original,
       b.valor_reajustado, b.multa, b.juros_por_dia, b.multa_aplicada,
       b.juros_aplicado, b.valor_recebido, b.data_de_recebimento,
       b.dias_em_atraso, b.dias_carencia, b.desconto, b.acrescimo,
       b.multa_paga, b.juros_pago, b.tipo_de_cobranca, b.numero_titulo,
       b.parcela, b.id_parcela, b.status, b.cliente, b.documento,
       b.endereco, b.numero, b.bairro, b.complemento, b.cep, b.cidade,
       b.estado, b.obs, b.codigo_externo, b.descricao, b.venda_n,
       b.convenio, b.user_id, b.situacao
FROM "BANCO_DADOS" b
JOIN saldo_por_documento s ON s.documento = b.documento
WHERE s.saldo <= 0.01;

REVOKE ALL ON public.banco_dados_clientes_quitados FROM anon;
