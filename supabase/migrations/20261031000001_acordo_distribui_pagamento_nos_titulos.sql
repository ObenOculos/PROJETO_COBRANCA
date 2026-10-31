-- Achado testando o acordo (2026-10-31): registrar_pagamento_acordo so grava
-- o fato em acordo_pagamentos (ledger do acordo). O saldo do titulo original em
-- BANCO_DADOS (valor_recebido) nunca muda, entao TUDO que le esse campo direto
-- -- saldo_por_documento/cliente_tem_saldo_aberto no banco, e hasOpenBalance/
-- getClientPending no front (src/filters/clientStatus.ts), usado por toda tela
-- de cobrador (Fila de Atendimento, Desempenho, etc) -- continua mostrando o
-- cliente como devendo o valor cheio depois de ele quitar o acordo inteiro.
-- Reproduzido ao vivo: acordo de R$500 criado, 2 parcelas pagas (status virou
-- "Cumprido"), e a Fila de Atendimento do cobrador seguiu mostrando R$500,00
-- pendente.
--
-- CORRECAO: em vez de ensinar "ciencia de acordo" pra cada tela/view que le
-- saldo (duas fontes calculando a mesma coisa -- exatamente o anti-padrao que
-- a skill arquiteto-cobranca pede pra evitar), o pagamento do acordo passa a
-- se distribuir nos titulos originais consolidados (acordo_titulos), na MESMA
-- mecanica que process_payment ja usa pro pagamento normal (mais antigo
-- primeiro, por data_vencimento): atualiza valor_recebido/status/
-- data_de_recebimento em BANCO_DADOS. Assim o saldo do cliente volta a ter uma
-- unica fonte (BANCO_DADOS.valor_recebido) nos dois canais de pagamento, sem
-- mexer em nenhuma view nem em nenhum filtro do front -- eles ja leem esse
-- campo. Efeito colateral correto: o Desempenho do cobrador ja credita por
-- esse mesmo campo, entao o pagamento via acordo passa a contar pra ele
-- tambem, igual um pagamento normal.
--
-- O ledger acordo_pagamentos continua existindo e intacto (fato historico do
-- acordo em si, usado pelo saldo_acordo_parcela/AcordoDetailModal). Isto so
-- ESPELHA o valor nos titulos de origem, nao substitui o ledger.
--
-- Fora do escopo aqui: estorno de pagamento de acordo (a UI so registra
-- pagamento positivo hoje; a tabela aceita valor_pago negativo pro ledger,
-- mas nao ha fluxo que crie essa linha, entao nao ha o que reverter ainda) e o
-- caso raro de um titulo consolidado ja ter recebido pagamento por fora do
-- acordo entre a criacao e este pagamento (sobra do valor fica sem titulo pra
-- aplicar -- o ledger do acordo continua correto, so o espelho em BANCO_DADOS
-- fica parcial nesse cenario incomum).

CREATE OR REPLACE FUNCTION public.registrar_pagamento_acordo(
  p_acordo_parcela_id uuid,
  p_valor_pago numeric,
  p_data_pagamento date,
  p_notes text DEFAULT NULL
)
RETURNS public.acordo_pagamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      COALESCE(NULLIF(REPLACE(b.valor_original, ',', '.'), '')::numeric, 0) AS valor_original,
      COALESCE(NULLIF(REPLACE(b.valor_recebido, ',', '.'), '')::numeric, 0) AS valor_recebido,
      COALESCE(NULLIF(REPLACE(b.desconto, ',', '.'), '')::numeric, 0) AS desconto
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
      SET valor_recebido = TO_CHAR(v_titulo.valor_recebido + v_to_apply, 'FM999999990.00'),
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
$$;

COMMENT ON FUNCTION public.registrar_pagamento_acordo(uuid, numeric, date, text) IS
  'Registra pagamento (ledger append-only) contra uma parcela de acordo e espelha o valor nos titulos originais consolidados (BANCO_DADOS.valor_recebido, mais antigo primeiro, mesma mecanica de process_payment) para o saldo do cliente ficar correto em todo o resto do sistema. Marca o acordo cumprido automaticamente quando todas as parcelas ficam quitadas. Dono do acordo ou gestor.';
