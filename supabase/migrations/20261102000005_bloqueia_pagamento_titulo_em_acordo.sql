-- Impede que um titulo consolidado num acordo ATIVO seja pago/alterado por
-- fora do fluxo do acordo (process_payment, updateCollection via CollectionModal,
-- upload em massa de status). Hoje nenhum desses caminhos sabia da existencia
-- de acordos: o titulo virava "Pago" em BANCO_DADOS mas o acordo continuava
-- "ativo" para sempre (o saldo dele e calculado so a partir de
-- acordo_parcelas/acordo_pagamentos, nunca olha pra BANCO_DADOS) -- dois
-- "livros" diferentes que podiam divergir, pagando o mesmo titulo duas vezes
-- de jeitos que nao se enxergam.
--
-- Guarda de banco (nao so no front): um gatilho BEFORE UPDATE bloqueia
-- qualquer alteracao de status/valor_recebido/desconto num titulo vinculado
-- a acordo ativo, A MENOS que a propria RPC do acordo
-- (registrar_pagamento_acordo) tenha avisado via set_config que e ela quem
-- esta escrevendo. Isso cobre de uma vez so todo caminho que escreve direto
-- na tabela, presente ou futuro.

CREATE OR REPLACE FUNCTION public.titulo_em_acordo_ativo(p_id_parcela bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.acordo_titulos at
    JOIN public.acordos a ON a.id = at.acordo_id
    WHERE at.collection_id = p_id_parcela AND a.status = 'ativo'
  );
$function$;

CREATE OR REPLACE FUNCTION public.trg_protege_titulo_em_acordo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.valor_recebido IS DISTINCT FROM OLD.valor_recebido
      OR NEW.desconto IS DISTINCT FROM OLD.desconto)
     AND COALESCE(current_setting('cobranca.permitir_pagamento_acordo', true), '') <> 'true'
     AND public.titulo_em_acordo_ativo(NEW.id_parcela)
  THEN
    RAISE EXCEPTION 'Este título está vinculado a um acordo ativo. Registre o pagamento pela tela do acordo.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_bancodados_protege_titulo_em_acordo
  BEFORE UPDATE ON "BANCO_DADOS"
  FOR EACH ROW EXECUTE FUNCTION public.trg_protege_titulo_em_acordo();

-- registrar_pagamento_acordo passa a avisar o gatilho acima (via set_config,
-- mesmo mecanismo ja usado por process_payment para cobranca.origem) antes de
-- escrever em BANCO_DADOS, senao bloquearia a si mesma.
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

  -- Avisa o gatilho trg_bancodados_protege_titulo_em_acordo que e a propria
  -- RPC do acordo escrevendo -- senao ela bloquearia a si mesma.
  PERFORM set_config('cobranca.permitir_pagamento_acordo', 'true', true);

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

-- process_payment: exclui titulos trancados por acordo ativo da selecao de
-- parcelas pagaveis, e recusa de forma explicita (antes de gravar qualquer
-- coisa em sale_payments) quando nao sobra nenhum titulo pagavel -- sem isto
-- o cobrador ganharia "merito" (sale_payments) por um pagamento que nao
-- abateu nada de verdade.
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
