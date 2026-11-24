-- carteira_mapa: separa quem está em "Aguardando …" (ex.: Aguardando
-- Jurídico). Esses clientes saíram da carteira de propósito (liberação para o
-- jurídico) e a distribuição não os devolve a cobrador comum; na tela
-- apareciam como "sem cobrador", parecendo esquecidos (dúvida do usuário,
-- 24/11). Novo campo "aguardando": a situação quando começa com
-- "Aguardando ", senão null. Resto igual à 20261124000003.

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
           max(a.situacao) AS situacao_ref
    FROM abertos a
    GROUP BY a.documento
  ), cheque AS (
    SELECT x.documento FROM public.clientes_condicao_cheque() x
  ), grupos AS (
    SELECT pc.loja_ref AS loja,
           public.cliente_max_atraso_dias(pc.documento) AS atraso,
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
