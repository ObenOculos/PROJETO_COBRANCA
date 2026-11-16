-- Item 71, etapa 2 -- Cobrador pede desconto ao gestor, gestor autoriza antes.
--
-- Caso (2026-11-16): cliente pagou R$ 224 pelas 2 parcelas mais atrasadas
-- (R$ 230); o gestor autorizou R$ 6 de desconto por fora do sistema. Desde o
-- item 69 so gestor e cobrador externo dao desconto; interno, terceirizado e
-- juridico pediam ao gestor "de boca" e ele registrava pela ficha em nome deles.
--
-- Fluxo (decidido com o usuario, 2026-11-16):
--   1. O cobrador, no Receber pagamento, pede o desconto (parcelas marcadas
--      ou a divida inteira), com o valor que o cliente vai pagar e o motivo.
--   2. O gestor aprova (pode aprovar OUTRO valor) ou recusa (com motivo) na
--      aba Correcoes.
--   3. Aprovado, vale por 3 dias: o cobrador registra o pagamento com o
--      desconto ate o valor autorizado. O process_payment confere a
--      autorizacao e liga o pagamento a ela (sale_payments.pedido_desconto_id).
--
-- O pagamento nunca fica pendente: a autorizacao e um fato separado, e o uso
-- dela e o proprio pagamento que aponta para ela (nada e decrementado; o
-- usado e a soma dos descontos dos pagamentos ligados). Estorno do pagamento
-- nao devolve a autorizacao: o cobrador pede de novo.
--
-- A autorizacao e um TETO de desconto para o cliente, pelo cobrador, ate a
-- data. As parcelas ficam no pedido como contexto para o gestor decidir; o
-- banco confere o valor devido delas na hora do pedido.

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE public.pedidos_desconto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento text NOT NULL,
  cliente text,
  -- 'parcelas' = desconto so nas parcelas marcadas; 'tudo' = quitar a divida
  -- inteira com desconto.
  tipo text NOT NULL CHECK (tipo IN ('parcelas', 'tudo')),
  parcelas bigint[] NOT NULL DEFAULT '{}',
  -- Retrato do pedido: quanto era devido, quanto o cliente paga, a diferenca.
  valor_devido numeric(14, 2) NOT NULL CHECK (valor_devido > 0),
  valor_pago numeric(14, 2) NOT NULL CHECK (valor_pago > 0),
  desconto_pedido numeric(14, 2) NOT NULL CHECK (desconto_pedido > 0),
  motivo text NOT NULL CHECK (length(trim(motivo)) > 0),
  solicitado_por_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Decisao do gestor (uma vez, pela RPC).
  decisao text CHECK (decisao IN ('aprovado', 'recusado')),
  desconto_aprovado numeric(14, 2) CHECK (desconto_aprovado IS NULL OR desconto_aprovado > 0),
  valido_ate date,
  resposta text,
  decidido_por_id uuid REFERENCES public.users(id),
  decidido_em timestamptz,
  CHECK (valor_pago < valor_devido),
  CHECK (desconto_pedido = round(valor_devido - valor_pago, 2)),
  CHECK ((decisao IS NULL) = (decidido_em IS NULL)),
  CHECK ((decisao = 'aprovado') = (desconto_aprovado IS NOT NULL)),
  CHECK ((decisao = 'aprovado') = (valido_ate IS NOT NULL)),
  CHECK (decisao IS DISTINCT FROM 'recusado'
         OR length(trim(coalesce(resposta, ''))) > 0)
);

COMMENT ON TABLE public.pedidos_desconto IS
  'Pedido de desconto do cobrador (interno/terceirizado/juridico) ao gestor, decidido uma vez. Aprovado = teto de desconto para o cliente, pelo cobrador, ate valido_ate; o uso e a soma de sale_payments.discount_amount ligados por pedido_desconto_id (item 71).';

-- Um pedido em analise por cobrador e cliente.
CREATE UNIQUE INDEX pedidos_desconto_aberto_uidx
  ON public.pedidos_desconto (documento, solicitado_por_id)
  WHERE decisao IS NULL;
CREATE INDEX pedidos_desconto_documento_idx
  ON public.pedidos_desconto (documento, created_at);
CREATE INDEX pedidos_desconto_pendentes_idx
  ON public.pedidos_desconto (created_at)
  WHERE decisao IS NULL;

ALTER TABLE public.pedidos_desconto ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_gestor_ou_solicitante ON public.pedidos_desconto
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR solicitado_por_id = (SELECT app_current_user_id())
  );

-- Escrita so pelas RPCs (SECURITY DEFINER).
GRANT SELECT ON public.pedidos_desconto TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pedidos_desconto FROM authenticated;
REVOKE ALL ON public.pedidos_desconto FROM anon;

-- Pagamento que usou a autorizacao (so o process_payment preenche).
ALTER TABLE public.sale_payments
  ADD COLUMN pedido_desconto_id uuid REFERENCES public.pedidos_desconto(id);
CREATE INDEX sale_payments_pedido_desconto_idx
  ON public.sale_payments (pedido_desconto_id)
  WHERE pedido_desconto_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Saldo aberto de um cliente para o pedido: parcelas marcadas (ou todas),
-- fora de acordo ativo, do jeito que o process_payment enxerga.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._saldo_para_desconto(p_documento text, p_parcelas bigint[])
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT round(COALESCE(sum(
           COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)
         ), 0), 2)
  FROM public."BANCO_DADOS" b
  WHERE b.documento = p_documento
    AND (COALESCE(b.valor_recebido, 0) + COALESCE(b.desconto, 0)) < COALESCE(b.valor_original, 0)
    AND NOT public.titulo_em_acordo_ativo(b.id_parcela)
    AND lower(trim(COALESCE(b.status, ''))) NOT IN ('cancelado', 'agrupado', 'renegociado')
    AND (p_parcelas IS NULL OR b.id_parcela = ANY (p_parcelas));
$function$;

REVOKE ALL ON FUNCTION public._saldo_para_desconto(text, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._saldo_para_desconto(text, bigint[]) TO service_role;

-- ---------------------------------------------------------------------------
-- Pedido do cobrador. Devolve o id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedir_desconto(
  p_documento text,
  p_tipo text,
  p_parcelas bigint[],
  p_valor_pago numeric,
  p_motivo text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      uuid := (SELECT app_current_user_id());
  v_tipo_eu text := (SELECT app_current_user_type());
  v_devido  numeric;
  v_qtd     integer;
  v_id      uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Usuário não identificado. Entre de novo no app.';
  END IF;
  -- Gestor e externo dao o desconto direto (item 69).
  IF v_tipo_eu IS NOT DISTINCT FROM 'manager' OR v_tipo_eu IS NOT DISTINCT FROM 'collector' THEN
    RAISE EXCEPTION 'Você já pode dar o desconto direto no Receber pagamento.';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('parcelas', 'tudo') THEN
    RAISE EXCEPTION 'Tipo de desconto inválido.';
  END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Explique ao gestor por que o desconto.';
  END IF;
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'Informe quanto o cliente vai pagar.';
  END IF;

  IF p_tipo = 'parcelas' THEN
    IF p_parcelas IS NULL OR cardinality(p_parcelas) = 0 THEN
      RAISE EXCEPTION 'Marque as parcelas que o cliente está pagando.';
    END IF;
    -- Todas as marcadas precisam ser do cliente e estar em aberto.
    SELECT count(*) INTO v_qtd
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND b.id_parcela = ANY (p_parcelas)
      AND (COALESCE(b.valor_recebido, 0) + COALESCE(b.desconto, 0)) < COALESCE(b.valor_original, 0)
      AND NOT public.titulo_em_acordo_ativo(b.id_parcela)
      AND lower(trim(COALESCE(b.status, ''))) NOT IN ('cancelado', 'agrupado', 'renegociado');
    IF v_qtd <> (SELECT count(DISTINCT x) FROM unnest(p_parcelas) x) THEN
      RAISE EXCEPTION 'Alguma parcela marcada não está mais em aberto. Atualize a ficha.';
    END IF;
    v_devido := public._saldo_para_desconto(p_documento, p_parcelas);
  ELSE
    v_devido := public._saldo_para_desconto(p_documento, NULL);
  END IF;

  IF v_devido <= 0 THEN
    RAISE EXCEPTION 'O cliente não tem saldo em aberto para desconto.';
  END IF;
  IF round(p_valor_pago, 2) >= v_devido THEN
    RAISE EXCEPTION 'O valor pago já cobre o devido (%): não há desconto a pedir.', v_devido;
  END IF;

  INSERT INTO public.pedidos_desconto (
    documento, cliente, tipo, parcelas, valor_devido, valor_pago,
    desconto_pedido, motivo, solicitado_por_id
  ) VALUES (
    p_documento,
    (SELECT b.cliente FROM public."BANCO_DADOS" b WHERE b.documento = p_documento LIMIT 1),
    p_tipo,
    CASE WHEN p_tipo = 'parcelas' THEN p_parcelas ELSE '{}'::bigint[] END,
    v_devido,
    round(p_valor_pago, 2),
    round(v_devido - round(p_valor_pago, 2), 2),
    trim(p_motivo),
    v_eu
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Você já tem um pedido de desconto em análise para este cliente.';
END;
$function$;

REVOKE ALL ON FUNCTION public.pedir_desconto(text, text, bigint[], numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_desconto(text, text, bigint[], numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decisao do gestor. Aprovar: desconto aprovado (padrao = o pedido; pode ser
-- outro valor), vale ate hoje + 3 dias. Recusar exige resposta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decidir_pedido_desconto(
  p_id uuid,
  p_aprovar boolean,
  p_desconto_aprovado numeric DEFAULT NULL,
  p_resposta text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu    uuid := (SELECT app_current_user_id());
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ped   public.pedidos_desconto%ROWTYPE;
  v_valor numeric;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  SELECT * INTO v_ped FROM public.pedidos_desconto WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_ped.decisao IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido já foi decidido.';
  END IF;

  IF NOT p_aprovar THEN
    IF NULLIF(trim(p_resposta), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o motivo da recusa.';
    END IF;
    UPDATE public.pedidos_desconto
    SET decisao = 'recusado', resposta = trim(p_resposta),
        decidido_por_id = v_eu, decidido_em = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('decisao', 'recusado');
  END IF;

  v_valor := round(COALESCE(p_desconto_aprovado, v_ped.desconto_pedido), 2);
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'O desconto aprovado precisa ser maior que zero.';
  END IF;
  IF v_valor >= v_ped.valor_devido THEN
    RAISE EXCEPTION 'O desconto aprovado não pode ser o valor devido inteiro.';
  END IF;

  UPDATE public.pedidos_desconto
  SET decisao = 'aprovado', desconto_aprovado = v_valor,
      valido_ate = v_hoje + 3,
      resposta = NULLIF(trim(p_resposta), ''),
      decidido_por_id = v_eu, decidido_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('decisao', 'aprovado', 'desconto', v_valor,
                            'valido_ate', v_hoje + 3);
END;
$function$;

REVOKE ALL ON FUNCTION public.decidir_pedido_desconto(uuid, boolean, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_pedido_desconto(uuid, boolean, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pedidos de um cliente com o quanto ja foi usado (para o Receber pagamento
-- e a ficha). Cobrador ve os dele; gestor ve todos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedidos_desconto_do_cliente(p_documento text)
 RETURNS TABLE(
   id uuid,
   tipo text,
   parcelas bigint[],
   valor_devido numeric,
   valor_pago numeric,
   desconto_pedido numeric,
   motivo text,
   solicitado_por_id uuid,
   created_at timestamptz,
   decisao text,
   desconto_aprovado numeric,
   valido_ate date,
   resposta text,
   decidido_por_id uuid,
   decidido_em timestamptz,
   desconto_usado numeric
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.tipo, d.parcelas, d.valor_devido, d.valor_pago,
         d.desconto_pedido, d.motivo, d.solicitado_por_id, d.created_at,
         d.decisao, d.desconto_aprovado, d.valido_ate, d.resposta,
         d.decidido_por_id, d.decidido_em,
         COALESCE((
           SELECT round(sum(sp.discount_amount), 2)
           FROM public.sale_payments sp
           WHERE sp.pedido_desconto_id = d.id
         ), 0) AS desconto_usado
  FROM public.pedidos_desconto d
  WHERE d.documento = p_documento
    AND (
      (SELECT app_current_user_type()) = 'manager'
      OR d.solicitado_por_id = (SELECT app_current_user_id())
    )
  ORDER BY d.created_at DESC, d.id;
$function$;

REVOKE ALL ON FUNCTION public.pedidos_desconto_do_cliente(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_desconto_do_cliente(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- process_payment: corpo copiado de producao (pg_get_functiondef, 2026-11-16,
-- igual a migration 20261116000005). Muda so a trava do desconto (interno/
-- terceirizado/juridico com autorizacao aprovada e valida) e o INSERT, que
-- grava pedido_desconto_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment(p_collector_id uuid, p_client_document text, p_payment_amount numeric, p_discount_amount numeric DEFAULT 0, p_payment_method text DEFAULT 'dinheiro'::text, p_notes text DEFAULT ''::text, p_sale_number bigint DEFAULT NULL::bigint, p_juros_amount numeric DEFAULT 0, p_payment_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
    -- Data em que o cliente PAGOU (informada por quem registra); o momento do
    -- registro continua em sale_payments.created_at.
    v_data date := COALESCE(p_payment_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    -- Item 71: autorizacao do gestor usada neste pagamento (NULL = sem desconto,
    -- ou desconto de quem pode dar direto).
    v_pedido_desconto uuid := NULL;
BEGIN
    IF v_data > v_hoje THEN
        RAISE EXCEPTION 'A data do pagamento não pode ser no futuro.';
    END IF;
    IF v_data < v_hoje - 30 THEN
        RAISE EXCEPTION 'A data do pagamento não pode ser anterior a 30 dias. Fale com o gestor.';
    END IF;

    -- Juros/multa cobrados do cliente: ficam so no registro do pagamento, NAO
    -- abatem parcela (o principal e p_payment_amount). Migration 20261109000008.
    IF COALESCE(p_juros_amount, 0) < 0 THEN
        RAISE EXCEPTION 'Juros/multa não pode ser negativo.';
    END IF;

    -- Item 69: desconto direto so do gestor ou do cobrador externo, que
    -- negocia na rua (decisao do usuario, 2026-11-16).
    -- Item 71: interno, terceirizado e juridico precisam de autorizacao do
    -- gestor aprovada, dentro da validade, pedida por quem registra, para este
    -- cliente e com saldo (aprovado - ja usado) que cubra o desconto. Sessao
    -- sem login (NULL) e barrada (nao tem usuario para casar o pedido).
    IF COALESCE(p_discount_amount, 0) > 0
       AND COALESCE((SELECT app_current_user_type()), '') NOT IN ('manager', 'collector') THEN
        -- Dois pagamentos simultaneos nao gastam a mesma autorizacao duas
        -- vezes. Trava por cliente ate o fim da transacao (process_payment
        -- roda com a permissao de quem chama, sem UPDATE na tabela -- por
        -- isso nao da para usar SELECT ... FOR UPDATE).
        PERFORM pg_advisory_xact_lock(hashtext('pedido_desconto:' || p_client_document));
        SELECT d.id INTO v_pedido_desconto
        FROM public.pedidos_desconto d
        WHERE d.documento = p_client_document
          AND d.solicitado_por_id = (SELECT app_current_user_id())
          AND d.decisao = 'aprovado'
          AND d.valido_ate >= v_hoje
          AND d.desconto_aprovado - COALESCE((
                SELECT sum(sp.discount_amount)
                FROM public.sale_payments sp
                WHERE sp.pedido_desconto_id = d.id
              ), 0) >= round(p_discount_amount, 2) - 0.009
        ORDER BY d.decidido_em DESC
        LIMIT 1;

        IF v_pedido_desconto IS NULL THEN
            RAISE EXCEPTION 'Desconto sem autorização do gestor (ou maior que o autorizado, ou vencida). Peça o desconto ao gestor no Receber pagamento.';
        END IF;
    END IF;

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
        collector_name,
        juros_amount,
        payment_date,
        pedido_desconto_id
    ) VALUES (
        p_collector_id,
        p_client_document,
        p_payment_amount,
        p_discount_amount,
        p_payment_method,
        p_notes,
        p_sale_number,
        v_client_name,
        v_collector_name,
        round(COALESCE(p_juros_amount, 0), 2),
        v_data,
        v_pedido_desconto
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
                data_de_recebimento = v_data
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
