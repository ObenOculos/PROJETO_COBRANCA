-- Estorno ligado ao pagamento original.
--
-- PROBLEMA: a edicao de recebidos (GeneralPaymentEditModal) gravava a diferenca
-- em sale_payments com collector_id = QUEM EDITOU. Um estorno feito pelo gestor
-- ficava no nome do gestor e nao saia do credito do cobrador que tinha
-- registrado o pagamento. Em 2026-10-06: 7 estornos (R$ 1.859), nenhum ligado
-- ao pagamento que corrigiam.
--
-- AGORA (decidido com o usuario): quem corrige escolhe o pagamento do app que
-- esta estornando. O estorno e um registro NOVO (o original nao muda), com
-- collector_id do cobrador original, estorno_de = pagamento original, motivo
-- obrigatorio e quem registrou. Nunca estorna mais do que resta do original.
-- Correcao que nao e de pagamento do app (ex.: valor vindo do ERP) vira ajuste
-- administrativo de quem editou, como antes, mas com motivo.

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS estorno_de uuid REFERENCES public.sale_payments (id),
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS registrado_por_id uuid;

CREATE INDEX IF NOT EXISTS idx_sale_payments_estorno_de
  ON public.sale_payments (estorno_de)
  WHERE estorno_de IS NOT NULL;

COMMENT ON COLUMN public.sale_payments.estorno_de IS
  'Pagamento que este registro estorna (valor negativo). O credito sai do cobrador do pagamento original.';
COMMENT ON COLUMN public.sale_payments.motivo IS
  'Motivo obrigatorio de estorno/ajuste.';
COMMENT ON COLUMN public.sale_payments.registrado_por_id IS
  'Quem registrou o estorno/ajuste (pode ser diferente do cobrador creditado).';

-- p_diferenca: novo recebido - recebido anterior da venda (negativo = estorno).
CREATE OR REPLACE FUNCTION public.registrar_ajuste_recebimento(
  p_client_document      text,
  p_client_name          text,
  p_sale_number          integer,
  p_diferenca            numeric,
  p_motivo               text,
  p_usuario_id           uuid,
  p_pagamento_estornado  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usuario_nome text;
  v_original     public.sale_payments%ROWTYPE;
  v_ja_estornado numeric;
  v_disponivel   numeric;
  v_estorno      numeric := 0;
  v_resto        numeric;
BEGIN
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da correção.';
  END IF;
  IF p_diferenca IS NULL OR abs(p_diferenca) < 0.01 THEN
    RETURN;
  END IF;

  SELECT name INTO v_usuario_nome FROM public.users WHERE id = p_usuario_id;

  -- Ajuste positivo: nao e recebimento do cobrador; fica com quem editou.
  IF p_diferenca > 0 THEN
    INSERT INTO public.sale_payments (
      sale_number, client_document, client_name, payment_amount, payment_date,
      payment_method, notes, collector_id, collector_name, motivo,
      registrado_por_id
    ) VALUES (
      p_sale_number, p_client_document, p_client_name, round(p_diferenca, 2),
      v_hoje, 'Ajuste Administrativo', 'Correção manual do valor recebido',
      p_usuario_id, v_usuario_nome, trim(p_motivo), p_usuario_id
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
        v_original.id, trim(p_motivo), p_usuario_id
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
      p_usuario_id, v_usuario_nome, trim(p_motivo), p_usuario_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_ajuste_recebimento(
  text, text, integer, numeric, text, uuid, uuid
) TO anon, authenticated;
