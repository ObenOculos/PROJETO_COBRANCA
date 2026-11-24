-- Distribuição da carteira (2026-11-24): contagens da tela vindas do banco.
--
-- A tabela "Cobertura por loja" e o resumo novo contavam os clientes sobre
-- as parcelas carregadas no navegador; o gestor não carrega BANCO_DADOS
-- inteiro (item 8), então todas as casas apareciam com 0.
--
-- carteira_mapa(): clientes em aberto agrupados por loja x dias de atraso x
-- cobrador atual. MESMA base de plano_distribuicao_carteira: título com
-- saldo e não cancelado; loja = da parcela aberta mais antiga; cobrador = o
-- primeiro (array_agg ORDER BY user_id); atraso = cliente_max_atraso_dias;
-- fora quem está em condição de cheque e as situações de encerramento da
-- configuração da distribuição. ~1,7 s em produção (24/11).

CREATE OR REPLACE FUNCTION public.carteira_mapa()
 RETURNS TABLE (loja text, atraso integer, cobrador_id uuid, clientes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_encerramento text[] := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(
      (SELECT c.perfis->'encerramento' FROM public.distribuicao_config c WHERE c.id = 1),
      '[]'::jsonb))
  );
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
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
           max(a.situacao) AS situacao_ref
    FROM abertos a
    GROUP BY a.documento
  ), cheque AS (
    SELECT x.documento FROM public.clientes_condicao_cheque() x
  )
  SELECT pc.loja_ref,
         public.cliente_max_atraso_dias(pc.documento),
         pc.dono,
         count(*)::integer
  FROM por_cliente pc
  WHERE pc.loja_ref IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM cheque ch WHERE ch.documento = pc.documento)
    AND NOT (COALESCE(pc.situacao_ref, '') = ANY (v_encerramento))
  GROUP BY 1, 2, 3;
END;
$function$;
REVOKE ALL ON FUNCTION public.carteira_mapa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_mapa() TO authenticated;
