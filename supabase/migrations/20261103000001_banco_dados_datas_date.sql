-- Etapa 3 (fase 3/3) da reorganizacao do banco: as 3 colunas de data de
-- BANCO_DADOS passam de text para date. Ultima fase do plano (FK -> dinheiro
-- -> datas); front normalizado antes desta migration (commit 6ff4e9e):
-- DatabaseUpload.tsx comparava data_de_recebimento como string crua no
-- fluxo de upload de status, e CollectionContext.tsx.updateCollection
-- repassava o valor recebido sem normalizar -- os dois unicos pontos de
-- escrita desse campo que ainda nao passavam por um parser de data.
--
-- Confirmado em producao antes desta migration (consultas read-only via
-- Management API, 2026-11-03): nos 163.609 registros, data_lancamento e
-- data_vencimento tem 0 linha fora de ISO (YYYY-MM-DD) ou BR (DD/MM/YYYY);
-- data_de_recebimento idem (37.645 vazias = null, nenhuma fora dos 2
-- formatos). Nenhuma linha BR tem dia/mes fora do intervalo valido (checado
-- por split_part antes de aplicar).
--
-- Levantamento do raio de impacto no banco (information_schema.view_column_usage
-- + busca em pg_proc.prosrc pelos 3 nomes de coluna + pg_trigger + pg_policy +
-- pg_indexes + pg_constraint, mesmo processo da fase 2):
--   - 2 views dependem das colunas (banco_dados_clientes_ativos/_quitados, o
--     mesmo par do item 8/fase 2) -- recriadas identicas em torno do ALTER.
--     Nenhuma view orfa depende desta vez (vw_clientes_cobradores, apagada
--     na fase 2, nao usava data).
--   - Nenhum trigger lista estas colunas em "UPDATE OF" (diferente da fase 2,
--     onde trg_banco_dados_atualiza_saldo precisou ser dropado/recriado) --
--     nenhum trigger bloqueia o ALTER por esse caminho.
--   - Nenhuma policy de RLS, constraint ou indice referencia estas colunas.
--   - 7 funcoes continham o nome de alguma das 3 colunas no corpo, mas so
--     process_payment precisa mudar: declarava "v_hoje text :=
--     to_char(...)" e gravava em data_de_recebimento (texto -> date nao tem
--     cast implicito nem de atribuicao em Postgres -- confirmado em teste
--     direto -- quebraria no primeiro pagamento manual). Corrigido para
--     "v_hoje date" direto, sem o to_char. registrar_pagamento_acordo ja
--     recebe p_data_pagamento como "date" (sem mudanca). criar_acordo e
--     marcar_acordos_quebrados batem no nome "data_vencimento" mas de
--     acordo_parcelas, uma tabela diferente (falso positivo da busca por
--     texto). trg_recebimentos_historico_ins/upd gravam
--     n.data_de_recebimento (sera date) em recebimentos_historico.data_de_recebimento
--     (text) -- essa direcao (date -> text) tem cast automatico de
--     atribuicao em Postgres (confirmado em teste direto), sem mudanca
--     necessaria. update_client_address so usa data_lancamento em ORDER BY,
--     sem comparacao de tipo.
--
-- Efeito colateral esperado (nao e bug): UpdateAddressModal.tsx ordena por
-- data_lancamento DESC no Postgres -- hoje isso ordena como texto (mistura
-- ISO/BR), depois da migration passa a ordenar cronologicamente de verdade.
-- Pode mudar qual endereco aparece como "mais recente" para clientes de
-- lojas legadas (Oticas Luana *, as unicas com BR nessas 2 colunas) -- avisar
-- o usuario para validar, nao tratar como regressao.

-- =============================================================================
-- 1. Views em uso: dropar pra liberar o ALTER COLUMN TYPE.
-- =============================================================================

DROP VIEW public.banco_dados_clientes_ativos;
DROP VIEW public.banco_dados_clientes_quitados;

-- =============================================================================
-- 2. Conversao de tipo (3 colunas numa unica ALTER TABLE = uma reescrita so).
--    CASE sem ELSE: os 2 formatos (ISO/BR) cobrem 100% das linhas nao vazias
--    hoje; uma linha fora disso faria a migration falhar alto (nao silenciar
--    um formato desconhecido como null).
-- =============================================================================

ALTER TABLE "BANCO_DADOS"
  ALTER COLUMN data_lancamento TYPE date USING (
    CASE
      WHEN data_lancamento IS NULL OR data_lancamento = '' THEN NULL
      WHEN data_lancamento ~ '^\d{4}-\d{2}-\d{2}' THEN substring(data_lancamento from 1 for 10)::date
      WHEN data_lancamento ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(data_lancamento, 'DD/MM/YYYY')
    END
  ),
  ALTER COLUMN data_vencimento TYPE date USING (
    CASE
      WHEN data_vencimento IS NULL OR data_vencimento = '' THEN NULL
      WHEN data_vencimento ~ '^\d{4}-\d{2}-\d{2}' THEN substring(data_vencimento from 1 for 10)::date
      WHEN data_vencimento ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(data_vencimento, 'DD/MM/YYYY')
    END
  ),
  ALTER COLUMN data_de_recebimento TYPE date USING (
    CASE
      WHEN data_de_recebimento IS NULL OR data_de_recebimento = '' THEN NULL
      WHEN data_de_recebimento ~ '^\d{4}-\d{2}-\d{2}' THEN substring(data_de_recebimento from 1 for 10)::date
      WHEN data_de_recebimento ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(data_de_recebimento, 'DD/MM/YYYY')
    END
  );

-- =============================================================================
-- 3. process_payment: v_hoje passa de text (to_char) para date direto --
--    unica funcao que precisa mudar (ver levantamento acima). Mesmo corpo de
--    hoje em producao (inclui o guard de acordo ativo da migration
--    20261102000005), so essa linha.
-- =============================================================================

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

-- =============================================================================
-- 4. Recriar as 2 views em uso (mesma definicao; so o tipo das colunas
--    subjacentes mudou).
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
