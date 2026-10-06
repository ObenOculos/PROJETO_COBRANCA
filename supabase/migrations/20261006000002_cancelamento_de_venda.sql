-- "Excluir venda" vira CANCELAR venda.
--
-- PROBLEMA: deleteSalesFromClient / bulkDeleteClients davam DELETE em
-- BANCO_DADOS, sale_payments, scheduled_visits e authorization_history. Apagar
-- sale_payments tirava do cobrador o merito do que ele recebeu, em todos os
-- periodos, e nao sobrava rastro de que a venda existiu.
--
-- O caso real (confirmado com o usuario em 2026-10-06) e venda cancelada no
-- ERP. Cancelar e um FATO novo: as parcelas ficam com status 'Cancelado' (o app
-- ja tira esse status de toda a cobranca ativa: isCancelado em types/status),
-- e o cancelamento e registrado com motivo e autor. Pagamentos, visitas
-- realizadas e historicos ficam como estao.

CREATE TABLE IF NOT EXISTS public.vendas_canceladas (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento        text        NOT NULL,
  -- Chave da venda do front (resolveSaleKey): numero_titulo, senao venda_n,
  -- senao 0 (avulsa).
  chave_venda      bigint      NOT NULL,
  parcelas         integer     NOT NULL,
  valor_original   numeric     NOT NULL,
  -- Saldo (original - recebido - desconto) no momento do cancelamento.
  valor_em_aberto  numeric     NOT NULL,
  motivo           text        NOT NULL,
  usuario_id       uuid,
  cancelado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_canceladas_documento
  ON public.vendas_canceladas (documento, cancelado_em);

COMMENT ON TABLE public.vendas_canceladas IS
  'Cancelamentos de venda (cancelada no ERP): quem, quando, por que e o valor em aberto no momento. Append-only.';

REVOKE ALL ON public.vendas_canceladas FROM anon, authenticated;
GRANT SELECT ON public.vendas_canceladas TO anon, authenticated;

-- p_chaves NULL = todas as vendas ativas do cliente.
CREATE OR REPLACE FUNCTION public.cancelar_vendas(
  p_documento   text,
  p_motivo      text,
  p_usuario_id  uuid,
  p_chaves      bigint[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
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
      COALESCE(public.texto_para_valor(b.valor_original), 0) AS original,
      COALESCE(public.texto_para_valor(b.valor_original), 0)
        - COALESCE(public.texto_para_valor(b.valor_recebido), 0)
        - COALESCE(public.texto_para_valor(b.desconto), 0) AS saldo
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
$$;

CREATE OR REPLACE FUNCTION public.cancelar_clientes(
  p_documentos  text[],
  p_motivo      text,
  p_usuario_id  uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc   text;
  v_total integer := 0;
BEGIN
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  FOREACH v_doc IN ARRAY COALESCE(p_documentos, '{}') LOOP
    v_total := v_total + public.cancelar_vendas(v_doc, p_motivo, p_usuario_id, NULL);
  END LOOP;
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_vendas(text, text, uuid, bigint[])
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_clientes(text[], text, uuid)
  TO anon, authenticated;
