-- Acordo cancelado: os encargos (juros/multa) ja pagos passam a abater os
-- titulos originais (decisao do usuario 2026-11-10).
--
-- Caso real: OTICA FERNANDA, acordo cancelado 43s depois de criado por erro
-- de lancamento. Entrada de R$ 500: pela imputacao proporcional (migration
-- 20261105000002) R$ 476,49 abateram o titulo e R$ 23,51 ficaram como
-- encargo de um acordo que deixou de valer -- o cliente pagou 500 e a divida
-- caiu 476,49.
--
-- Fato historico nao se apaga: o pagamento do acordo continua como esta. A
-- correcao e um registro NOVO: o abatimento entra nos titulos (mais antigo
-- primeiro, nunca alem do saldo), recebimentos_historico ganha a linha com
-- origem 'acordo_cancelado' e o valor efetivamente abatido fica em
-- acordos.encargos_reimputados (NULL = nada a reimputar / ainda nao rodou).
-- Acordo QUEBRADO nao entra: la a regra do financeiro e "parcelas pagas
-- ficam baixadas" com os encargos cobrados.

ALTER TABLE public.acordos
  ADD COLUMN encargos_reimputados numeric(12,2);
COMMENT ON COLUMN public.acordos.encargos_reimputados IS
  'Acordo cancelado: encargos ja pagos que foram abatidos dos titulos originais no cancelamento.';

ALTER TABLE public.recebimentos_historico
  DROP CONSTRAINT recebimentos_historico_origem_check;
ALTER TABLE public.recebimentos_historico
  ADD CONSTRAINT recebimentos_historico_origem_check
  CHECK (origem = ANY (ARRAY['app'::text, 'erp_ou_manual'::text, 'foto_inicial'::text, 'acordo'::text, 'acordo_cancelado'::text]));

-- Uso interno (chamada por cancelar_acordo e pelo ajuste abaixo); sem
-- EXECUTE para authenticated. Idempotente: so roda em acordo cancelado com
-- encargos_reimputados ainda NULL.
CREATE OR REPLACE FUNCTION public.reimputar_encargos_acordo_cancelado(p_acordo_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acordo public.acordos%ROWTYPE;
  v_encargos numeric;
  v_data date;
  v_remaining numeric;
  v_aplicado numeric := 0;
  v_titulo RECORD;
  v_pending numeric;
  v_to_apply numeric;
BEGIN
  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND OR v_acordo.status <> 'cancelado' OR v_acordo.encargos_reimputados IS NOT NULL THEN
    RETURN 0;
  END IF;

  -- Liquido de estornos (estorno tem valores negativos).
  SELECT COALESCE(SUM(COALESCE(pg.valor_encargos, 0)), 0), MAX(pg.data_pagamento)
    INTO v_encargos, v_data
  FROM public.acordo_pagamentos pg
  JOIN public.acordo_parcelas ap ON ap.id = pg.acordo_parcela_id
  WHERE ap.acordo_id = p_acordo_id;

  IF v_encargos <= 0.009 THEN
    UPDATE public.acordos SET encargos_reimputados = 0 WHERE id = p_acordo_id;
    RETURN 0;
  END IF;

  PERFORM set_config('cobranca.permitir_pagamento_acordo', 'true', true);
  PERFORM set_config('cobranca.origem', 'acordo_cancelado', true);

  v_remaining := v_encargos;
  FOR v_titulo IN
    SELECT
      b.id_parcela,
      COALESCE(b.valor_original, 0) AS valor_original,
      COALESCE(b.valor_recebido, 0) AS valor_recebido,
      COALESCE(b.desconto, 0) AS desconto
    FROM public.acordo_titulos at2
    JOIN public."BANCO_DADOS" b ON b.id_parcela = at2.collection_id
    WHERE at2.acordo_id = p_acordo_id
    ORDER BY b.data_vencimento ASC NULLS LAST, b.id_parcela ASC
    FOR UPDATE OF b
  LOOP
    EXIT WHEN v_remaining <= 0.009;
    v_pending := v_titulo.valor_original - v_titulo.valor_recebido - v_titulo.desconto;
    IF v_pending > 0.009 THEN
      v_to_apply := round(LEAST(v_remaining, v_pending), 2);
      UPDATE public."BANCO_DADOS"
      SET valor_recebido = round(v_titulo.valor_recebido + v_to_apply, 2),
          data_de_recebimento = COALESCE(v_data, data_de_recebimento),
          status = CASE WHEN v_to_apply >= v_pending - 0.01 THEN 'Pago' ELSE 'Pago Parcial' END
      WHERE id_parcela = v_titulo.id_parcela;
      v_remaining := v_remaining - v_to_apply;
      v_aplicado := v_aplicado + v_to_apply;
    END IF;
  END LOOP;

  PERFORM set_config('cobranca.origem', '', true);
  PERFORM set_config('cobranca.permitir_pagamento_acordo', '', true);

  UPDATE public.acordos SET encargos_reimputados = round(v_aplicado, 2) WHERE id = p_acordo_id;
  RETURN round(v_aplicado, 2);
END;
$function$;

REVOKE ALL ON FUNCTION public.reimputar_encargos_acordo_cancelado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reimputar_encargos_acordo_cancelado(uuid) TO service_role;

-- cancelar_acordo: corpo de producao (pg_get_functiondef 2026-11-10) + a
-- chamada acima no fim.
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

  -- Encargos ja pagos deste acordo viram abatimento dos titulos originais
  -- (decisao 2026-11-10; ver reimputar_encargos_acordo_cancelado).
  PERFORM public.reimputar_encargos_acordo_cancelado(p_acordo_id);
  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id;

  RETURN v_acordo;
END;
$function$;

-- Ajuste dos acordos ja cancelados com encargo pago (em 2026-11-10: so o
-- da OTICA FERNANDA, R$ 23,51).
SELECT public.reimputar_encargos_acordo_cancelado(a.id)
FROM public.acordos a
WHERE a.status = 'cancelado' AND a.encargos_reimputados IS NULL;
