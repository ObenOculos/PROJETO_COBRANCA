-- 26/11: duas consultas de tela mais leves para o banco (pedido do usuario:
-- otimizar Atribuicao e Correcoes). Corpos copiados de PRODUCAO
-- (pg_get_functiondef) e alterados so no trecho indicado; resultado conferido
-- identico por md5 antes e depois.
--
-- 1) carteira_mapa (Atribuicao > Automatica): o atraso de cada cliente vinha
--    de cliente_max_atraso_dias(documento), que volta a BANCO_DADOS cliente
--    por cliente (~6 mil). Agora sai da mesma leitura dos titulos em aberto;
--    a funcao so e chamada para quem tem acordo ativo (la a regra e outra).
--    0,7 s -> 0,35-0,4 s.
-- 2) atribuicoes_painel_gestor (Correcoes > Pagos na loja): contatos de cada
--    cliente buscados uma vez so, em vez de parcela paga x parcelas do
--    cliente. 0,45 s -> 0,34 s.
--
-- Nao muda permissao nem assinatura (CREATE OR REPLACE com o mesmo retorno);
-- os guards de gestor ficam como em producao (IS DISTINCT FROM 'manager').

CREATE OR REPLACE FUNCTION public.carteira_mapa()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_encerramento text[] := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(
      (SELECT c.perfis->'encerramento' FROM public.distribuicao_config c WHERE c.id = 1),
      '[]'::jsonb))
  );
  v_resultado jsonb;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores.' USING ERRCODE = '42501';
  END IF;
  WITH abertos AS (
    SELECT b.documento, b.user_id, b.situacao, b.nome_da_loja, b.data_vencimento
    FROM public."BANCO_DADOS" b
    WHERE b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
  ), por_cliente AS (
    SELECT a.documento,
           (array_agg(a.nome_da_loja ORDER BY a.data_vencimento ASC NULLS LAST, a.nome_da_loja))[1] AS loja_ref,
           (array_agg(a.user_id ORDER BY a.user_id NULLS LAST))[1] AS dono,
           max(a.situacao) AS situacao_ref,
           -- Atraso pelos titulos em aberto: o mesmo que
           -- cliente_max_atraso_dias faz para quem nao tem acordo ativo,
           -- sem voltar a BANCO_DADOS cliente por cliente (26/11).
           COALESCE(max(GREATEST(0, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - a.data_vencimento))), 0)::integer AS atraso_titulos
    FROM abertos a
    GROUP BY a.documento
  ), com_acordo AS (
    SELECT DISTINCT ac.client_document AS documento
    FROM public.acordos ac
    WHERE ac.status = 'ativo'
  ), cheque AS (
    SELECT x.documento FROM public.clientes_condicao_cheque() x
  ), grupos AS (
    SELECT pc.loja_ref AS loja,
           CASE WHEN EXISTS (SELECT 1 FROM com_acordo ca WHERE ca.documento = pc.documento)
                THEN public.cliente_max_atraso_dias(pc.documento)
                ELSE pc.atraso_titulos
           END AS atraso,
           pc.dono AS cobrador_id,
           CASE WHEN pc.situacao_ref LIKE 'Aguardando %' THEN pc.situacao_ref END AS aguardando,
           count(*)::integer AS clientes
    FROM por_cliente pc
    WHERE pc.loja_ref IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM cheque ch WHERE ch.documento = pc.documento)
      AND NOT (COALESCE(pc.situacao_ref, '') = ANY (v_encerramento))
    GROUP BY 1, 2, 3, 4
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO v_resultado FROM grupos g;
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atribuicoes_painel_gestor()
 RETURNS TABLE(id_parcela bigint, documento text, cliente text, venda bigint, parcela bigint, valor numeric, data_pagamento date, loja text, cobrador_id uuid, contatos integer, ultimo_contato_em timestamp with time zone, ultimo_resultado text, pedido_lote uuid, pedido_decisao text, pedido_cobrador_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta aÃ§Ã£o.';
  END IF;

  RETURN QUERY
  WITH parc AS MATERIALIZED (
    SELECT b.id_parcela, b.documento, b.cliente,
           COALESCE(b.numero_titulo, b.venda_n) AS venda, b.parcela,
           round(b.valor_recebido, 2) AS valor,
           b.data_de_recebimento AS d, b.nome_da_loja AS loja
    FROM public."BANCO_DADOS" b
    WHERE COALESCE(b.valor_recebido, 0) > 0
      AND b.documento IS NOT NULL
      AND (b.data_de_recebimento
             >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 30
           OR EXISTS (SELECT 1 FROM public.atribuicoes_pagamento ap
                      WHERE ap.id_parcela = b.id_parcela AND ap.decisao IS NULL))
  ), validas AS MATERIALIZED (
    SELECT p.* FROM parc p
    WHERE public.atribuicao_bloqueio_parcela(p.id_parcela) IS NULL
  ), docs AS (
    SELECT v.documento, min(v.d) - 30 AS desde, max(v.d) AS ate
    FROM validas v
    GROUP BY v.documento
  ), att AS MATERIALIZED (
    -- Contatos de cada cliente uma vez so (antes: cada parcela paga x cada
    -- parcela do cliente x contatos -- 34 mil pares). Mesmo resultado
    -- (conferido por md5 em 26/11).
    SELECT DISTINCT x.documento, a.collector_id, a.created_at, a.result,
           (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM docs x
    JOIN public."BANCO_DADOS" b2 ON b2.documento = x.documento
    JOIN public.collection_attempts a ON a.collection_id = b2.id_parcela::text
    WHERE a.collector_id IS NOT NULL
      AND public.atribuicao_contato_conta(a.result)
      AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN x.desde AND x.ate
  ), cont AS (
    SELECT v.id_parcela, t.collector_id,
           count(DISTINCT t.created_at)::integer AS n,
           max(t.created_at) AS ultimo,
           (array_agg(t.result ORDER BY t.created_at DESC))[1] AS ultimo_res
    FROM validas v
    JOIN att t ON t.documento = v.documento
              AND t.dia BETWEEN v.d - 30 AND v.d
    GROUP BY v.id_parcela, t.collector_id
  )
  SELECT v.id_parcela, v.documento, v.cliente, v.venda, v.parcela, v.valor,
         v.d, v.loja, c.collector_id, c.n, c.ultimo, c.ultimo_res,
         ped.lote,
         CASE WHEN ped.lote IS NULL THEN NULL
              WHEN ped.decisao IS NULL THEN 'aberto' ELSE ped.decisao END,
         ped.solicitado_por_id
  FROM validas v
  JOIN cont c ON c.id_parcela = v.id_parcela
  LEFT JOIN LATERAL (
    SELECT ap.lote, ap.decisao, ap.solicitado_por_id
    FROM public.atribuicoes_pagamento ap
    WHERE ap.id_parcela = v.id_parcela
      AND (ap.decisao IS NULL OR ap.decisao = 'aprovado')
    LIMIT 1
  ) ped ON true
  ORDER BY v.d DESC, v.documento, v.id_parcela, c.collector_id;
END;
$function$;
