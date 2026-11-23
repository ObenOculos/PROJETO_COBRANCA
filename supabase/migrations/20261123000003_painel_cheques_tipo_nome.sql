-- Item 87 (2026-11-23): correcao de painel_cheques (migration 20261123000002).
-- Falhava ao executar: clientes.nome e varchar e a coluna "cliente" do
-- RETURNS TABLE e text ("structure of query does not match function result
-- type", coluna 2). Unica mudanca: cl.nome::text. Tipos das 19 colunas
-- conferidos com a consulta solta (pg_typeof) antes desta migration.

CREATE OR REPLACE FUNCTION public.painel_cheques(
  p_dias_conferir integer DEFAULT 30,
  p_meses_sugestao integer DEFAULT 24
)
RETURNS TABLE (
  documento text,
  cliente text,
  codigo_cliente_erp text,
  loja text,
  grupo text,
  paga_em_cheque boolean,
  marcado_em timestamptz,
  marcado_por uuid,
  motivo text,
  cheques_qtd integer,
  cheques_valor numeric,
  cheque_venc_mais_antigo date,
  dias_cheque_vencido integer,
  vencido numeric,
  a_vencer numeric,
  ultima_baixa_cheque date,
  saiu_de uuid,
  saiu_em timestamptz,
  cobrador_atual uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Só o gestor vê o painel de cheques.';
  END IF;

  RETURN QUERY
  WITH cond AS (
    SELECT * FROM public.clientes_condicao_cheque(NULL)
  ),
  ult_marca AS (
    SELECT DISTINCT ON (m.documento) m.documento, m.criado_em, m.usuario_id, m.motivo
    FROM public.cheque_marcacoes m
    ORDER BY m.documento, m.criado_em DESC, m.id DESC
  ),
  saldos AS (
    SELECT b.documento,
      sum(CASE WHEN b.data_vencimento < v_hoje THEN s.saldo ELSE 0 END) AS vencido,
      sum(CASE WHEN b.data_vencimento >= v_hoje OR b.data_vencimento IS NULL THEN s.saldo ELSE 0 END) AS a_vencer,
      (array_agg(b.cliente ORDER BY b.id_parcela DESC))[1] AS cliente,
      (array_agg(b.nome_da_loja ORDER BY b.data_vencimento NULLS LAST, b.id_parcela))[1] AS loja,
      min(b.user_id::text)::uuid AS cobrador_atual
    FROM public."BANCO_DADOS" b
    CROSS JOIN LATERAL (
      SELECT COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0) AS saldo
    ) s
    WHERE b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND s.saldo > 0.01
      AND b.tipo_titulo_erp IS DISTINCT FROM 2
      AND b.tipo_titulo_erp IS DISTINCT FROM 3
      AND b.tipo_titulo_erp IS DISTINCT FROM 5
    GROUP BY b.documento
  ),
  saida AS (
    SELECT DISTINCT ON (h.documento) h.documento, h.cobrador_anterior_id, h.assigned_at
    FROM public.atribuicoes_historico h
    WHERE h.motivo = 'condicao_cheque'
    ORDER BY h.documento, h.assigned_at DESC
  ),
  linhas AS (
    SELECT c.documento,
      CASE
        WHEN c.cheques_qtd > 0 AND c.cheque_venc_mais_antigo < v_hoje - p_dias_conferir THEN 'cheque_conferir'
        WHEN c.cheques_qtd > 0 THEN 'cheque_carteira'
        ELSE 'paga_em_cheque'
      END AS grupo,
      c.paga_em_cheque, c.cheques_qtd, c.cheques_valor, c.cheque_venc_mais_antigo
    FROM cond c
    UNION ALL
    SELECT s.documento, 'sugestao', false, 0, 0::numeric, NULL::date
    FROM saldos s
    JOIN public.clientes cl ON cl.documento = s.documento
    WHERE cl.ultima_baixa_cheque_erp >= (v_hoje - make_interval(months => p_meses_sugestao))::date
      AND NOT EXISTS (SELECT 1 FROM cond c WHERE c.documento = s.documento)
  )
  SELECT l.documento,
    COALESCE(cl.nome::text, s.cliente, l.documento),
    cl.codigo_cliente_erp,
    COALESCE(s.loja, (SELECT b.nome_da_loja FROM public."BANCO_DADOS" b WHERE b.documento = l.documento LIMIT 1)),
    l.grupo,
    l.paga_em_cheque,
    CASE WHEN l.paga_em_cheque THEN um.criado_em END,
    CASE WHEN l.paga_em_cheque THEN um.usuario_id END,
    CASE WHEN l.paga_em_cheque THEN um.motivo END,
    l.cheques_qtd,
    l.cheques_valor,
    l.cheque_venc_mais_antigo,
    CASE WHEN l.cheque_venc_mais_antigo < v_hoje THEN (v_hoje - l.cheque_venc_mais_antigo) END,
    COALESCE(s.vencido, 0),
    COALESCE(s.a_vencer, 0),
    cl.ultima_baixa_cheque_erp,
    sa.cobrador_anterior_id::uuid,
    sa.assigned_at,
    s.cobrador_atual
  FROM linhas l
  LEFT JOIN public.clientes cl ON cl.documento = l.documento
  LEFT JOIN saldos s ON s.documento = l.documento
  LEFT JOIN ult_marca um ON um.documento = l.documento
  LEFT JOIN saida sa ON sa.documento = l.documento
  ORDER BY l.grupo, COALESCE(s.vencido, 0) + l.cheques_valor DESC, l.documento;
END;
$function$;

REVOKE ALL ON FUNCTION public.painel_cheques(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_cheques(integer, integer) TO authenticated;
