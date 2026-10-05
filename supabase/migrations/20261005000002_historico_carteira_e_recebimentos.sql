-- Fundacao do Desempenho por FATO, e nao pela carteira atual.
--
-- PROBLEMA: o Desempenho credita recebimentos a quem tem HOJE o user_id do
-- cliente. Reatribuir, remover ou liberar ("nao encontrado"/SPC) um cliente
-- move junto o historico: em 2026-10-05, 368 de 1.062 pagamentos (R$ 44 mil
-- de R$ 150 mil) estavam com um cobrador diferente do atual. E a remocao nao
-- deixava rastro nenhum.
--
-- O QUE ESTA MIGRATION FAZ (o banco registra; nenhuma tela muda de calculo):
--   1. atribuicoes_historico passa a registrar TODA mudanca de carteira, por
--      gatilho — atribuicao, remocao, liberacao, importacao, qualquer caminho —
--      com motivo e usuario. Vira append-only.
--   2. recebimentos_historico: cada mudanca de valor_recebido/desconto de uma
--      parcela vira um registro (antes/depois, origem, dono da carteira no
--      momento). Append-only. Foto inicial congela o recebido de hoje com o
--      dono atual da carteira (decisao do usuario em 2026-10-05).
--   3. process_payment marca suas gravacoes como origem 'app' e passa a usar a
--      data de Brasilia; deixa de reescrever visitas ja fechadas.
--   4. RPCs remover_cobrador_em_lote e liberar_cliente_da_carteira, para que a
--      remocao e a liberacao registrem quem fez e por que.
--
-- MODELO DE CREDITO (decidido com o usuario):
--   - Merito do cobrador = o que ele registrou no app (sale_payments).
--   - ERP = confirmacao oficial, chega depois e REPETE os pagamentos do app.
--     Fica visivel a parte (recebimentos_historico, origem erp_ou_manual) e
--     nao soma no merito, senao o mesmo dinheiro contaria duas vezes.
--
-- CONTEXTO DA GRAVACAO: as funcoes informam motivo/usuario/origem por
-- set_config(..., true) — vale so ate o fim da transacao. Fora delas (upsert
-- da planilha, edicao manual) os gatilhos usam os valores padrao abaixo.
-- Com conexoes reaproveitadas, um set_config local antigo volta como '' e nao
-- como NULL; por isso todo current_setting passa por NULLIF(..., '').

-- ---------------------------------------------------------------------------
-- 0) Conversao segura de texto monetario. BANCO_DADOS guarda valores como
--    texto ("10,50"/"10.5"). Valor ilegivel vira NULL em vez de abortar o
--    UPDATE — um gatilho nunca pode derrubar a importacao da planilha.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.texto_para_valor(p text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(trim(p), '') IS NULL THEN NULL
    WHEN replace(trim(p), ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN replace(trim(p), ',', '.')::numeric
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Historico de carteira
-- ---------------------------------------------------------------------------

-- Remocao/liberacao tem "novo cobrador" vazio.
ALTER TABLE public.atribuicoes_historico
  ALTER COLUMN cobrador_novo_id DROP NOT NULL;

-- Por que a carteira mudou: atribuicao, remocao, liberacao: <situacao>,
-- importacao, alteracao_sem_registro / remocao_sem_registro (caminho que nao
-- informou motivo — sinal de codigo a migrar para uma das RPCs).
ALTER TABLE public.atribuicoes_historico
  ADD COLUMN IF NOT EXISTS motivo text;

-- Linhas antigas vieram todas da atribuicao (RPC ou fluxo anterior a ela).
-- Completa uma informacao que faltava; nenhum valor existente e alterado.
UPDATE public.atribuicoes_historico
SET motivo = 'atribuicao'
WHERE motivo IS NULL;

CREATE INDEX IF NOT EXISTS idx_atrib_documento_data
  ON public.atribuicoes_historico (documento, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_atrib_anterior
  ON public.atribuicoes_historico (cobrador_anterior_id);

COMMENT ON TABLE public.atribuicoes_historico IS
  'Toda mudanca de carteira (user_id em BANCO_DADOS), um registro por cliente por evento. Gravado por gatilho; append-only. cobrador_novo_id NULL = saiu da carteira.';

-- Append-only: so os gatilhos/funcoes (SECURITY DEFINER) escrevem.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.atribuicoes_historico FROM anon, authenticated;

-- 1a) UPDATE: compara antes/depois de cada parcela. Um registro por cliente.
CREATE OR REPLACE FUNCTION public.trg_historico_carteira_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.atribuicoes_historico (
    documento, cliente_nome, nome_da_loja,
    cobrador_anterior_id, cobrador_novo_id, gerente_id, motivo
  )
  SELECT DISTINCT ON (n.documento)
    n.documento,
    n.cliente,
    n.nome_da_loja,
    o.user_id::text,
    n.user_id::text,
    COALESCE(NULLIF(current_setting('cobranca.usuario_id', true), ''), ''),
    COALESCE(
      NULLIF(current_setting('cobranca.motivo', true), ''),
      CASE WHEN n.user_id IS NULL
        THEN 'remocao_sem_registro'
        ELSE 'alteracao_sem_registro'
      END
    )
  FROM novas n
  JOIN antigas o ON o.id_parcela = n.id_parcela
  WHERE n.documento IS NOT NULL
    AND o.user_id IS DISTINCT FROM n.user_id
  ORDER BY n.documento, n.id_parcela;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS historico_carteira_upd ON public."BANCO_DADOS";
CREATE TRIGGER historico_carteira_upd
  AFTER UPDATE ON public."BANCO_DADOS"
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_historico_carteira_upd();

-- 1b) INSERT: parcela nova ja chega com cobrador. Na importacao ela herda o
--     cobrador atual do cliente — isso NAO e mudanca de carteira, e o ultimo
--     registro do historico ja e esse cobrador. So registra quando difere.
CREATE OR REPLACE FUNCTION public.trg_historico_carteira_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.atribuicoes_historico (
    documento, cliente_nome, nome_da_loja,
    cobrador_anterior_id, cobrador_novo_id, gerente_id, motivo
  )
  SELECT DISTINCT ON (n.documento)
    n.documento,
    n.cliente,
    n.nome_da_loja,
    ult.cobrador_novo_id,
    n.user_id::text,
    COALESCE(NULLIF(current_setting('cobranca.usuario_id', true), ''), ''),
    COALESCE(NULLIF(current_setting('cobranca.motivo', true), ''), 'importacao')
  FROM novas n
  LEFT JOIN LATERAL (
    SELECT h.cobrador_novo_id
    FROM public.atribuicoes_historico h
    WHERE h.documento = n.documento
    ORDER BY h.assigned_at DESC, h.id DESC
    LIMIT 1
  ) ult ON true
  WHERE n.documento IS NOT NULL
    AND n.user_id IS NOT NULL
    AND ult.cobrador_novo_id IS DISTINCT FROM n.user_id::text
  ORDER BY n.documento, n.id_parcela;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS historico_carteira_ins ON public."BANCO_DADOS";
CREATE TRIGGER historico_carteira_ins
  AFTER INSERT ON public."BANCO_DADOS"
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_historico_carteira_ins();

-- 1c) Atribuicao em lote: o historico agora vem do gatilho. A funcao so
--     informa motivo e gerente. Diferenca de comportamento: reatribuir ao
--     MESMO cobrador nao gera mais registro (nada mudou).
CREATE OR REPLACE FUNCTION public.atribuir_clientes_em_lote(
  p_user_id           text,
  p_documentos        text[] DEFAULT '{}',
  p_clientes          text[] DEFAULT '{}',
  p_situacao          text   DEFAULT NULL,
  p_gerente_id        text   DEFAULT NULL,
  p_manter_situacoes  text[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'atribuicao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_gerente_id, ''), true);

  -- NULL = ANY(...) resulta em NULL (nao TRUE), entao situacao vazia cai no
  -- ELSE e recebe a confirmacao — que e o desejado.
  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id::uuid,
      situacao = CASE
        WHEN p_situacao IS NULL THEN b.situacao
        WHEN b.situacao = ANY (COALESCE(p_manter_situacoes, '{}')) THEN b.situacao
        ELSE p_situacao
      END
  WHERE b.documento = ANY (p_documentos)
     OR b.cliente   = ANY (p_clientes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 1d) Remocao manual (tela de Atribuicao).
CREATE OR REPLACE FUNCTION public.remover_cobrador_em_lote(
  p_documentos  text[] DEFAULT '{}',
  p_clientes    text[] DEFAULT '{}',
  p_usuario_id  text   DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'remocao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND b.user_id IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 1e) Liberacao por desfecho de visita ("nao encontrado", SPC, falecido):
--     grava a situacao da proxima fila e tira da carteira.
CREATE OR REPLACE FUNCTION public.liberar_cliente_da_carteira(
  p_documento   text,
  p_situacao    text,
  p_usuario_id  text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'liberacao: ' || COALESCE(p_situacao, ''), true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET situacao = p_situacao,
      user_id  = NULL
  WHERE b.documento = p_documento;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atribuir_clientes_em_lote(
  text, text[], text[], text, text, text[]
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remover_cobrador_em_lote(text[], text[], text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_cliente_da_carteira(text, text, text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Historico de recebimentos por parcela
-- ---------------------------------------------------------------------------
-- Nao e o ledger financeiro "de verdade" (o valor oficial vem do ERP e chega
-- pronto em BANCO_DADOS); e o REGISTRO de cada mudanca observada, para saber
-- quando o recebido mudou, por qual caminho, e de quem era a carteira naquele
-- momento. Sem FK para BANCO_DADOS de proposito: o registro sobrevive a
-- exclusao da parcela.
CREATE TABLE IF NOT EXISTS public.recebimentos_historico (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_parcela            bigint      NOT NULL,
  documento             text,
  -- Mesma chave de venda do front (resolveSaleKey): numero_titulo, senao
  -- venda_n, senao 0 (avulsa).
  chave_venda           bigint      NOT NULL,
  recebido_antes        numeric,
  recebido_depois       numeric,
  desconto_antes        numeric,
  desconto_depois       numeric,
  -- Como esta na parcela (texto; formato do ERP ou do app).
  data_de_recebimento   text,
  -- app            -> process_payment (pagamento registrado pelo cobrador)
  -- erp_ou_manual  -> importacao da planilha ou edicao direta na parcela
  -- foto_inicial   -> estado congelado na criacao desta tabela
  origem                text        NOT NULL
    CHECK (origem IN ('app', 'erp_ou_manual', 'foto_inicial')),
  sale_payment_id       uuid,
  -- Dono da carteira no momento da mudanca (user_id da parcela).
  cobrador_carteira_id  uuid,
  registrado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receb_hist_registrado
  ON public.recebimentos_historico (registrado_em);
CREATE INDEX IF NOT EXISTS idx_receb_hist_documento
  ON public.recebimentos_historico (documento, registrado_em);
CREATE INDEX IF NOT EXISTS idx_receb_hist_cobrador
  ON public.recebimentos_historico (cobrador_carteira_id, registrado_em);

COMMENT ON TABLE public.recebimentos_historico IS
  'Cada mudanca de valor_recebido/desconto de uma parcela de BANCO_DADOS: antes, depois, origem e dono da carteira no momento. Gravado por gatilho; append-only. Merito do cobrador continua sendo sale_payments.';

REVOKE ALL ON public.recebimentos_historico FROM anon, authenticated;
GRANT SELECT ON public.recebimentos_historico TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_recebimentos_historico_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    public.texto_para_valor(o.valor_recebido),
    public.texto_para_valor(n.valor_recebido),
    public.texto_para_valor(o.desconto),
    public.texto_para_valor(n.desconto),
    n.data_de_recebimento,
    COALESCE(NULLIF(current_setting('cobranca.origem', true), ''), 'erp_ou_manual'),
    NULLIF(current_setting('cobranca.sale_payment_id', true), '')::uuid,
    n.user_id
  FROM novas n
  JOIN antigas o ON o.id_parcela = n.id_parcela
  WHERE COALESCE(public.texto_para_valor(o.valor_recebido), 0)
          IS DISTINCT FROM COALESCE(public.texto_para_valor(n.valor_recebido), 0)
     OR COALESCE(public.texto_para_valor(o.desconto), 0)
          IS DISTINCT FROM COALESCE(public.texto_para_valor(n.desconto), 0);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS recebimentos_historico_upd ON public."BANCO_DADOS";
CREATE TRIGGER recebimentos_historico_upd
  AFTER UPDATE ON public."BANCO_DADOS"
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recebimentos_historico_upd();

-- Parcela que ja nasce com recebido/desconto (importacao de titulo ja pago).
CREATE OR REPLACE FUNCTION public.trg_recebimentos_historico_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    public.texto_para_valor(n.valor_recebido),
    0,
    public.texto_para_valor(n.desconto),
    n.data_de_recebimento,
    COALESCE(NULLIF(current_setting('cobranca.origem', true), ''), 'erp_ou_manual'),
    NULLIF(current_setting('cobranca.sale_payment_id', true), '')::uuid,
    n.user_id
  FROM novas n
  WHERE COALESCE(public.texto_para_valor(n.valor_recebido), 0) <> 0
     OR COALESCE(public.texto_para_valor(n.desconto), 0) <> 0;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS recebimentos_historico_ins ON public."BANCO_DADOS";
CREATE TRIGGER recebimentos_historico_ins
  AFTER INSERT ON public."BANCO_DADOS"
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recebimentos_historico_ins();

-- Foto inicial: congela o recebido de hoje com o dono atual da carteira.
-- So roda uma vez (se a tabela ja tem foto, nao duplica).
INSERT INTO public.recebimentos_historico (
  id_parcela, documento, chave_venda,
  recebido_antes, recebido_depois, desconto_antes, desconto_depois,
  data_de_recebimento, origem, cobrador_carteira_id
)
SELECT
  b.id_parcela,
  b.documento,
  COALESCE(b.numero_titulo, b.venda_n, 0),
  0,
  public.texto_para_valor(b.valor_recebido),
  0,
  public.texto_para_valor(b.desconto),
  b.data_de_recebimento,
  'foto_inicial',
  b.user_id
FROM public."BANCO_DADOS" b
WHERE (COALESCE(public.texto_para_valor(b.valor_recebido), 0) <> 0
    OR COALESCE(public.texto_para_valor(b.desconto), 0) <> 0)
  AND NOT EXISTS (
    SELECT 1 FROM public.recebimentos_historico h WHERE h.origem = 'foto_inicial'
  );

-- ---------------------------------------------------------------------------
-- 2b) Visita cancelada por quitacao guarda o pendente do momento: zero.
--     (20261005000001 cancelava no meio do process_payment, antes do ultimo
--     ajuste de total_pending_value, e a visita ficava com o valor anterior.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_visitas_de_clientes_quitados(
  p_documentos text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.scheduled_visits v
  SET status                      = 'cancelada',
      total_pending_value         = 0,
      cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
      cancellation_request_reason = COALESCE(
        NULLIF(trim(v.cancellation_request_reason), ''),
        'Cancelada automaticamente: cliente quitou todas as dívidas'
      ),
      cancellation_approved_by    = 'sistema (cliente quitado)',
      cancellation_approved_at    = now(),
      updated_at                  = now()
  WHERE v.status IN ('agendada', 'cancelamento_solicitado')
    AND v.client_document = ANY (p_documentos)
    AND NOT public.cliente_tem_saldo_aberto(v.client_document);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) process_payment
-- ---------------------------------------------------------------------------
-- Mudancas em relacao a 20260706000002 (o resto e identico):
--   - marca origem 'app' + id do pagamento para recebimentos_historico;
--   - data_de_recebimento no dia de Brasilia (o banco esta em UTC: depois das
--     21h o CURRENT_DATE ja e o dia seguinte);
--   - total_pending_value so e atualizado em visitas EM ABERTO. Antes reescrevia
--     tambem visitas realizadas/canceladas, apagando o valor do momento da visita.
CREATE OR REPLACE FUNCTION public.process_payment(
    p_collector_id uuid,
    p_client_document text,
    p_payment_amount numeric,
    p_discount_amount numeric DEFAULT 0,
    p_payment_method text DEFAULT 'dinheiro',
    p_notes text DEFAULT '',
    p_sale_number integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
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
          AND (COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) + COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) < COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0)
        ORDER BY data_vencimento ASC, id_parcela ASC
    LOOP
        -- Safely convert text values to numeric for calculation
        v_current_original := COALESCE(REPLACE(v_installments_to_update.valor_original, ',', '.')::numeric, 0);
        v_current_received := COALESCE(REPLACE(v_installments_to_update.valor_recebido, ',', '.')::numeric, 0);
        v_current_discount := COALESCE(REPLACE(v_installments_to_update.desconto, ',', '.')::numeric, 0);

        v_current_pending := v_current_original - v_current_received - v_current_discount;

        -- Apply discount first
        IF v_remaining_discount > 0 AND v_current_pending > 0 THEN
            v_discount_to_apply := LEAST(v_remaining_discount, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET desconto = TO_CHAR(v_current_discount + v_discount_to_apply, 'FM999999990.00')
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_discount := v_remaining_discount - v_discount_to_apply;
            v_current_pending := v_current_pending - v_discount_to_apply;
            v_current_discount := v_current_discount + v_discount_to_apply;
        END IF;

        -- Apply payment
        IF v_remaining_payment > 0 AND v_current_pending > 0 THEN
            v_payment_to_apply := LEAST(v_remaining_payment, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET valor_recebido = TO_CHAR(v_current_received + v_payment_to_apply, 'FM999999990.00'),
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
    SELECT SUM(COALESCE(REPLACE(valor_original, ',', '.')::numeric, 0) - COALESCE(REPLACE(valor_recebido, ',', '.')::numeric, 0) - COALESCE(REPLACE(desconto, ',', '.')::numeric, 0)) INTO v_total_pending_client
    FROM public."BANCO_DADOS"
    WHERE documento = p_client_document;

    UPDATE public.scheduled_visits
    SET total_pending_value = v_total_pending_client
    WHERE client_document = p_client_document
      AND status IN ('agendada', 'cancelamento_solicitado');

END;
$$;
