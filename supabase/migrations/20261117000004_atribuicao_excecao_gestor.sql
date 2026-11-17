-- Pago na loja: exceção do gestor (2026-11-17, decisão do usuário).
--
-- Regra de 16/11 continua o padrão: o cobrador só pede pago na loja se teve
-- conversa EFETIVA com o cliente nos 30 dias antes do pagamento. Exceção: o
-- gestor sabe que a conversa aconteceu mas não ficou registrada como efetiva
-- (WhatsApp, ligação, "não atendeu" e o cliente retornou) e atribui direto ao
-- cobrador, com motivo obrigatório. Fica marcado como exceção no histórico.
--
-- - atribuicoes_pagamento.excecao: true = atribuído pelo gestor sem pedido.
--   ultimo_contato_em pode ficar vazio só na exceção (sem conversa efetiva).
-- - parcelas_para_excecao(doc, cobrador): parcelas pagas pelo ERP nos últimos
--   30 dias, com o bloqueio de cada uma (as mesmas travas do pedido, menos a
--   da conversa) e a última conversa efetiva do cobrador, se houver.
-- - atribuir_pagamento_excecao: grava já aprovado (decidido pelo gestor).
--   Mesmas travas do pedido (atribuicao_bloqueio_parcela, índice único de
--   pedido aberto/aprovado, 30 dias do pagamento).

ALTER TABLE public.atribuicoes_pagamento
  ADD COLUMN IF NOT EXISTS excecao boolean NOT NULL DEFAULT false;

ALTER TABLE public.atribuicoes_pagamento
  ALTER COLUMN ultimo_contato_em DROP NOT NULL;

ALTER TABLE public.atribuicoes_pagamento
  ADD CONSTRAINT atribuicoes_pagamento_contato_ou_excecao
  CHECK (excecao OR ultimo_contato_em IS NOT NULL);

COMMENT ON COLUMN public.atribuicoes_pagamento.excecao IS
  'Atribuído pelo gestor sem pedido do cobrador (sem conversa efetiva registrada), com motivo em observacao. Migration 20261117000004.';

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parcelas_para_excecao(
  p_documento text,
  p_cobrador_id uuid
)
 RETURNS TABLE(id_parcela bigint, venda bigint, parcela bigint, data_vencimento date, valor numeric, data_pagamento date, loja text, ultimo_contato_em timestamp with time zone, pedido_decisao text, pedido_meu boolean, bloqueio text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  RETURN QUERY
  WITH contatos AS (
    SELECT a.created_at,
           (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM public.collection_attempts a
    JOIN public."BANCO_DADOS" b2 ON a.collection_id = b2.id_parcela::text
    WHERE b2.documento = p_documento
      AND a.collector_id = p_cobrador_id
      AND public.atribuicao_contato_conta(a.result)
  ), parcelas AS (
    SELECT b.id_parcela,
           COALESCE(b.numero_titulo, b.venda_n) AS venda,
           b.parcela,
           b.data_vencimento,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS data_pagamento,
           b.nome_da_loja AS loja
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND COALESCE(b.valor_recebido, 0) > 0
      -- Mesmo prazo do pedido: até 30 dias depois do pagamento.
      AND b.data_de_recebimento
          >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 30
  )
  SELECT p.id_parcela, p.venda, p.parcela, p.data_vencimento, p.valor,
         p.data_pagamento, p.loja,
         c.ultimo,
         ped.decisao_txt,
         ped.meu,
         CASE
           WHEN ped.decisao_txt = 'aberto' THEN
             'Já tem pedido do cobrador em análise (decida em Correções).'
           WHEN ped.decisao_txt = 'aprovado' THEN
             CASE WHEN ped.meu THEN 'Já atribuído a este cobrador.'
                  ELSE 'Já atribuído a outro cobrador.' END
           ELSE public.atribuicao_bloqueio_parcela(p.id_parcela)
         END
  FROM parcelas p
  LEFT JOIN LATERAL (
    SELECT max(ct.created_at) AS ultimo
    FROM contatos ct
    WHERE ct.dia BETWEEN p.data_pagamento - 30 AND p.data_pagamento
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN ap.decisao IS NULL THEN 'aberto' ELSE ap.decisao END AS decisao_txt,
           ap.solicitado_por_id = p_cobrador_id AS meu
    FROM public.atribuicoes_pagamento ap
    WHERE ap.id_parcela = p.id_parcela
      AND (ap.decisao IS NULL OR ap.decisao = 'aprovado')
    LIMIT 1
  ) ped ON true
  ORDER BY p.data_pagamento DESC, p.venda, p.parcela, p.id_parcela;
END;
$function$;

REVOKE ALL ON FUNCTION public.parcelas_para_excecao(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcelas_para_excecao(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.atribuir_pagamento_excecao(
  p_documento text,
  p_parcelas bigint[],
  p_cobrador_id uuid,
  p_motivo text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu    uuid := (SELECT app_current_user_id());
  v_lote  uuid := gen_random_uuid();
  v_qtd   integer := 0;
  v_total numeric := 0;
  r       record;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Escreva o motivo da exceção.';
  END IF;
  IF p_parcelas IS NULL OR cardinality(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos uma parcela.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_cobrador_id AND u.type IS DISTINCT FROM 'manager'
  ) THEN
    RAISE EXCEPTION 'Escolha o cobrador que vai receber o crédito.';
  END IF;

  FOR r IN
    SELECT f.*, b.cliente
    FROM public.parcelas_para_excecao(p_documento, p_cobrador_id) f
    JOIN public."BANCO_DADOS" b ON b.id_parcela = f.id_parcela
    WHERE f.id_parcela = ANY (p_parcelas)
  LOOP
    IF r.bloqueio IS NOT NULL THEN
      RAISE EXCEPTION 'Parcela % da venda %: %', r.parcela, r.venda, r.bloqueio;
    END IF;
    INSERT INTO public.atribuicoes_pagamento (
      lote, id_parcela, documento, cliente, venda, parcela, valor,
      data_pagamento, observacao, ultimo_contato_em, solicitado_por_id,
      decisao, valor_aprovado, resposta, decidido_por_id, decidido_em, excecao
    ) VALUES (
      v_lote, r.id_parcela, p_documento, r.cliente, r.venda, r.parcela,
      r.valor, r.data_pagamento, trim(p_motivo), r.ultimo_contato_em,
      p_cobrador_id,
      'aprovado', r.valor, 'Exceção do gestor', v_eu, now(), true
    );
    v_qtd := v_qtd + 1;
    v_total := v_total + r.valor;
  END LOOP;

  IF v_qtd <> (SELECT count(DISTINCT x) FROM unnest(p_parcelas) x) THEN
    RAISE EXCEPTION 'Parcela não encontrada, não paga pelo ERP ou com mais de 30 dias de pago. Atualize a ficha.';
  END IF;

  RETURN jsonb_build_object('lote', v_lote, 'parcelas', v_qtd, 'valor', v_total);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe pedido em análise ou atribuição para esta parcela.';
END;
$function$;

REVOKE ALL ON FUNCTION public.atribuir_pagamento_excecao(text, bigint[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atribuir_pagamento_excecao(text, bigint[], uuid, text) TO authenticated, service_role;
