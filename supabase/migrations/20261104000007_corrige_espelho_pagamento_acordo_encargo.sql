-- Achado testando o fluxo de entrada do acordo (2026-11-04, cliente de
-- teste): registrar_pagamento_acordo espelha o pagamento em
-- BANCO_DADOS.valor_recebido usando so "valor_original - valor_recebido -
-- desconto" como espaco disponivel por titulo (migration 20261031000001,
-- reafirmada em 20261102000004). Isso foi escrito ANTES de existir multa/
-- juros por titulo em acordo_titulos (que so chegou em 20261104000003,
-- item 12) -- ninguem atualizou o espelho pra somar esse espaco extra.
--
-- Resultado: o espaco pra espelhar fica travado no saldo ORIGINAL, menor
-- que o total negociado sempre que ha multa/juros (ou seja, quase sempre
-- que o cliente esta em atraso, que e o caso comum de acordo). Pagamentos
-- que ultrapassam esse espaco nao tem onde ser aplicados em BANCO_DADOS --
-- o titulo vira "Pago" bem antes do acordo estar de fato pago, e o cliente
-- desaparece da carteira (hasOpenBalance le so BANCO_DADOS) mesmo com
-- parcelas do acordo ainda em aberto. O ledger do proprio acordo
-- (acordo_pagamentos, usado por saldo_acordo_parcela/AcordoDetailModal)
-- continua correto -- so o espelho em BANCO_DADOS ficava errado.
--
-- CORRECAO: o espaco por titulo passa a somar o multa_valor/juros_valor/
-- desconto_valor congelados em acordo_titulos (capturados na criacao do
-- acordo, nunca recalculados) ao saldo original ainda nao recebido. O
-- status ("Pago"/"Pago Parcial") passa a comparar contra esse espaco
-- estendido, nao contra valor_original puro -- senao continuaria marcando
-- "Pago" assim que cobrisse so o saldo base, ignorando o encargo.
--
-- Acordos sem encargo (multa_valor/juros_valor/desconto_valor = 0, inclusive
-- os criados antes de 20261104000003) nao mudam de comportamento -- a soma
-- com zero e um no-op.

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

    -- Espaco disponivel = saldo original ainda nao recebido + multa/juros
    -- congelados na negociacao - desconto do acordo congelado. Sem a soma
    -- do encargo, o espelho fica menor que o total negociado sempre que ha
    -- multa/juros (ver comentario no topo da migration).
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

COMMENT ON FUNCTION public.registrar_pagamento_acordo(uuid, numeric, date, text) IS
  'Registra pagamento (ledger append-only) contra uma parcela de acordo e espelha o valor nos titulos originais consolidados (BANCO_DADOS.valor_recebido, mais antigo primeiro, mesma mecanica de process_payment), somando multa/juros/desconto congelados em acordo_titulos ao espaco disponivel por titulo -- sem isso o espelho fica menor que o total negociado sempre que ha encargo. Marca o acordo cumprido automaticamente quando todas as parcelas ficam quitadas. Dono do acordo ou gestor.';
