-- Vendas canceladas na SSÓtica -> parcelas canceladas no app.
--
-- PROBLEMA (2026-11-11): a SSÓtica não tem API e o contas a receber que é
-- importado à mão não traz o cancelamento. Nenhuma parcela das lojas SSÓtica
-- estava como 'Cancelado' no app; a 1ª leitura (scripts/ssotica/
-- cancelados_ssotica.py) achou 959 parcelas de 173 vendas canceladas na loja
-- e ainda em cobrança no app (R$ 118 mil em aberto).
--
-- Diferente de cancelar_vendas (gestor, cancela TODAS as parcelas da venda):
-- aqui só as parcelas que a própria SSÓtica marcou como Cancelado. Parcela
-- paga antes do cancelamento continua 'Pago' (é fato; decisão do usuário em
-- 2026-11-11). Quem decide o que cancelar é o script, que casa loja + venda +
-- parcela + vencimento/valor; a função só valida e grava.
--
-- Chamada só pelo script, com a service_role (sem usuário logado). Não há
-- guard de papel: o EXECUTE é só da service_role.
--
-- p_itens: [{"id_parcela": 123, "motivo": "SSÓtica: venda cancelada em ..."}]
-- (o motivo vem por parcela, mas é o mesmo para todas da venda).
--
-- Pula, e devolve em "ignoradas", parcela que:
--   - não existe;
--   - já está Pago ou Cancelado (rodar de novo não faz nada: idempotente);
--   - está em acordo ativo (o gatilho trg_protege_titulo_em_acordo barraria
--     o lote inteiro; cancelar o acordo é decisão do gestor).

CREATE OR REPLACE FUNCTION public.cancelar_parcelas_ssotica(p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_parcelas integer := 0;
  v_vendas   integer := 0;
  v_visitas  integer := 0;
  v_ignoradas jsonb;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'p_itens deve ser um array JSON.';
  END IF;

  CREATE TEMP TABLE _ss_itens ON COMMIT DROP AS
  SELECT DISTINCT ON ((e->>'id_parcela')::bigint)
         (e->>'id_parcela')::bigint AS id_parcela,
         NULLIF(trim(e->>'motivo'), '') AS motivo
  FROM jsonb_array_elements(p_itens) e
  WHERE e ? 'id_parcela';

  IF EXISTS (SELECT 1 FROM _ss_itens WHERE motivo IS NULL) THEN
    RAISE EXCEPTION 'Todo item precisa de motivo.';
  END IF;

  CREATE TEMP TABLE _ss_alvo ON COMMIT DROP AS
  SELECT b.id_parcela,
         b.documento,
         COALESCE(b.numero_titulo, b.venda_n, 0) AS chave,
         COALESCE(b.valor_original, 0) AS original,
         COALESCE(b.valor_original, 0)
           - COALESCE(b.valor_recebido, 0)
           - COALESCE(b.desconto, 0) AS saldo,
         i.motivo
  FROM _ss_itens i
  JOIN public."BANCO_DADOS" b ON b.id_parcela = i.id_parcela
  WHERE lower(trim(COALESCE(b.status, ''))) NOT IN ('pago', 'cancelado')
    AND NOT public.titulo_em_acordo_ativo(b.id_parcela);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id_parcela', i.id_parcela,
           'motivo', CASE
             WHEN b.id_parcela IS NULL THEN 'nao_existe'
             WHEN lower(trim(COALESCE(b.status, ''))) = 'cancelado' THEN 'ja_cancelada'
             WHEN lower(trim(COALESCE(b.status, ''))) = 'pago' THEN 'paga'
             ELSE 'acordo_ativo'
           END)), '[]'::jsonb)
  INTO v_ignoradas
  FROM _ss_itens i
  LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = i.id_parcela
  WHERE NOT EXISTS (SELECT 1 FROM _ss_alvo a WHERE a.id_parcela = i.id_parcela);

  IF NOT EXISTS (SELECT 1 FROM _ss_alvo) THEN
    RETURN jsonb_build_object('parcelas', 0, 'vendas', 0, 'visitas', 0, 'ignoradas', v_ignoradas);
  END IF;

  -- Registro do cancelamento (append-only), uma linha por venda.
  INSERT INTO public.vendas_canceladas (
    documento, chave_venda, parcelas, valor_original, valor_em_aberto,
    motivo, usuario_id
  )
  SELECT a.documento, a.chave, count(*), round(sum(a.original), 2),
         round(GREATEST(sum(a.saldo), 0), 2), min(a.motivo), NULL
  FROM _ss_alvo a
  WHERE a.documento IS NOT NULL
  GROUP BY a.documento, a.chave;
  GET DIAGNOSTICS v_vendas = ROW_COUNT;

  -- Visitas de quem fica sem nada em aberto: cancela ANTES do UPDATE, com o
  -- motivo certo (depois, o gatilho de cliente quitado cancelaria dizendo
  -- "cliente quitou").
  UPDATE public.scheduled_visits v
  SET status                      = 'cancelada',
      cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
      cancellation_request_reason = COALESCE(
        NULLIF(trim(v.cancellation_request_reason), ''),
        'Cancelada automaticamente: venda cancelada na SSÓtica'
      ),
      cancellation_approved_by    = 'sistema (venda cancelada na SSÓtica)',
      cancellation_approved_at    = now(),
      updated_at                  = now()
  WHERE v.status IN ('agendada', 'cancelamento_solicitado')
    AND v.client_document IN (SELECT DISTINCT documento FROM _ss_alvo)
    AND NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = v.client_document
        AND lower(trim(COALESCE(b.status, ''))) NOT IN ('pago', 'cancelado')
        AND b.id_parcela NOT IN (SELECT id_parcela FROM _ss_alvo)
    );
  GET DIAGNOSTICS v_visitas = ROW_COUNT;

  UPDATE public."BANCO_DADOS" b
  SET status = 'Cancelado'
  FROM _ss_alvo a
  WHERE b.id_parcela = a.id_parcela;
  GET DIAGNOSTICS v_parcelas = ROW_COUNT;

  RETURN jsonb_build_object(
    'parcelas', v_parcelas,
    'vendas', v_vendas,
    'visitas', v_visitas,
    'ignoradas', v_ignoradas
  );
END;
$$;

COMMENT ON FUNCTION public.cancelar_parcelas_ssotica(jsonb) IS
  'Cancela as parcelas que a SSÓtica marcou como Cancelado (script scripts/ssotica/cancelados_ssotica.py, service_role). Não mexe em parcela paga nem em acordo ativo; registra em vendas_canceladas.';

REVOKE ALL ON FUNCTION public.cancelar_parcelas_ssotica(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_parcelas_ssotica(jsonb) TO service_role;
