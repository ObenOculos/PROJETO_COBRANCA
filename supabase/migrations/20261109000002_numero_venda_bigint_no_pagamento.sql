-- Numero da venda do Ciclone nao cabe em integer: "Distribuir Pagamento" falhava com 400.
--
-- PROBLEMA (achado 2026-11-09, cliente real): BANCO_DADOS.numero_titulo e
-- bigint (Ciclone gera numeros como 2603244482; o maior e 23121321703), mas o
-- pagamento usava integer em tres pontos: o parametro p_sale_number de
-- process_payment ("Distribuir Pagamento") e de registrar_ajuste_recebimento
-- ("Editar Pagamentos"), e a coluna sale_payments.sale_number. Acima de
-- 2.147.483.647 o PostgREST recusa a chamada antes de executar (HTTP 400),
-- sem gravar nada. Medido: 4.028 titulos acima do limite, 562 clientes com
-- saldo afetados.
--
-- CORRECAO: os tres viram bigint. Nada mais muda -- corpos das funcoes
-- copiados de PRODUCAO (pg_get_functiondef em 2026-11-09), trocando so o
-- tipo do parametro. Como o tipo do parametro faz parte da assinatura, e
-- DROP + CREATE (CREATE OR REPLACE criaria uma sobrecarga ao lado da antiga).
-- Permissoes recriadas iguais as de producao: EXECUTE para authenticated e
-- service_role; nada para anon/PUBLIC.
--
-- A view daily_payment_report le sale_payments.sale_number e impede o ALTER
-- TYPE: e recriada igual (definicao, comentario e grants de producao; sem
-- reloptions).

DROP VIEW public.daily_payment_report;

ALTER TABLE public.sale_payments
  ALTER COLUMN sale_number TYPE bigint;

CREATE VIEW public.daily_payment_report AS
 SELECT payment_date,
    collector_id,
    collector_name,
    count(*) AS total_payments,
    sum(payment_amount) AS total_received,
    avg(payment_amount) AS average_payment,
    count(DISTINCT client_document) AS unique_clients,
    count(DISTINCT sale_number) AS unique_sales,
    min(payment_amount) AS min_payment,
    max(payment_amount) AS max_payment
   FROM sale_payments sp
  GROUP BY payment_date, collector_id, collector_name
  ORDER BY payment_date DESC, (sum(payment_amount)) DESC;

COMMENT ON VIEW public.daily_payment_report IS 'Relatório diário consolidado de pagamentos por cobrador';
REVOKE ALL ON public.daily_payment_report FROM PUBLIC, anon;
GRANT ALL ON public.daily_payment_report TO authenticated, service_role;

DROP FUNCTION public.process_payment(uuid, text, numeric, numeric, text, text, integer);

CREATE FUNCTION public.process_payment(p_collector_id uuid, p_client_document text, p_payment_amount numeric, p_discount_amount numeric DEFAULT 0, p_payment_method text DEFAULT 'dinheiro'::text, p_notes text DEFAULT ''::text, p_sale_number bigint DEFAULT NULL::bigint)
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
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    -- Get client and collector names
    SELECT cliente INTO v_client_name FROM public."BANCO_DADOS" WHERE documento = p_client_document LIMIT 1;
    SELECT name INTO v_collector_name FROM public.users WHERE id = p_collector_id LIMIT 1;

    -- Sem isto, um cliente cuja divida esteja inteiramente dentro de um
    -- acordo ativo geraria um sale_payments "fantasma" (credita merito ao
    -- cobrador) sem abater nada de verdade em nenhum titulo.
    IF NOT EXISTS (
        SELECT 1
        FROM public."BANCO_DADOS"
        WHERE documento = p_client_document
          AND (
            p_sale_number IS NULL
            OR (
              p_sale_number > 0 AND (
                numero_titulo = p_sale_number
                OR (numero_titulo IS NULL AND venda_n = p_sale_number)
              )
            )
            OR (p_sale_number = 0 AND numero_titulo IS NULL AND venda_n IS NULL)
          )
          AND (COALESCE(valor_recebido, 0) + COALESCE(desconto, 0)) < COALESCE(valor_original, 0)
          AND NOT public.titulo_em_acordo_ativo(id_parcela)
    ) THEN
        RAISE EXCEPTION 'Não há títulos disponíveis para pagamento direto (podem estar vinculados a um acordo ativo). Registre o pagamento pela tela do acordo.';
    END IF;

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
    -- Titulos vinculados a acordo ativo ficam de fora (ver RAISE acima e
    -- migration 20261102000005).
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
          AND NOT public.titulo_em_acordo_ativo(id_parcela)
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
    -- guardam o valor do momento em que aconteceram. Mantem TODOS os titulos
    -- (inclusive os de acordo ativo) -- e "quanto o cliente deve no total",
    -- nao "quanto pode ser pago por aqui".
    SELECT SUM(COALESCE(valor_original, 0) - COALESCE(valor_recebido, 0) - COALESCE(desconto, 0)) INTO v_total_pending_client
    FROM public."BANCO_DADOS"
    WHERE documento = p_client_document;

    UPDATE public.scheduled_visits
    SET total_pending_value = v_total_pending_client
    WHERE client_document = p_client_document
      AND status IN ('agendada', 'cancelamento_solicitado');

END;
$function$;

REVOKE ALL ON FUNCTION public.process_payment(uuid, text, numeric, numeric, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payment(uuid, text, numeric, numeric, text, text, bigint) TO authenticated, service_role;

DROP FUNCTION public.registrar_ajuste_recebimento(text, text, integer, numeric, text, uuid, uuid);

CREATE FUNCTION public.registrar_ajuste_recebimento(p_client_document text, p_client_name text, p_sale_number bigint, p_diferenca numeric, p_motivo text, p_usuario_id uuid, p_pagamento_estornado uuid DEFAULT NULL::uuid)
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

REVOKE ALL ON FUNCTION public.registrar_ajuste_recebimento(text, text, bigint, numeric, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_ajuste_recebimento(text, text, bigint, numeric, text, uuid, uuid) TO authenticated, service_role;
