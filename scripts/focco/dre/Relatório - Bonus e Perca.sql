-- =============================================================
-- PARÂMETROS GLOBAIS
-- =============================================================
WITH parametros AS (
  SELECT 
    DATE '2026-01-01' AS p_data_inicio, 
    DATE '2026-04-30' AS p_data_fim, 
    '51021,61021,51022,61022,61025,69102' AS p_operacoes, 
    'C' AS p_situacao_cancelada
) -- =============================================================
SELECT 
  n.vdnfs_numeronotafiscal || ' / ' || n.vdnfs_serienotafiscal AS Numero_Serie, 
  op.pgopr_codigo :: text || ' ' || op.pgopr_naturezasequencia :: text AS Operacao_Fiscal, 
  TO_CHAR(
    n.vdnfs_dataemissao, 'DD/MM/YYYY'
  ) AS Data_Emissao, 
  TO_CHAR(
    n.vdnfs_datamovimento, 'DD/MM/YYYY'
  ) AS Data_Movimento, 
  CASE WHEN cli.pgcln_codigo IS NULL THEN COALESCE(cli.pgcln_nome, 'N/A') ELSE cli.pgcln_codigo :: text || ' - ' || COALESCE(cli.pgcln_nome, '') END AS Cliente, 
  'R$ ' || TO_CHAR(
    ROUND(
      n.vdnfs_valortotalliquidonota :: numeric, 
      2
    ), 
    'FM999G999G990D00'
  ) AS Valor_Documento, 
  CASE WHEN n.vdnfs_gerafinanceiro = 'N' 
  OR n.pgpgt_codigo IS NULL THEN 'NÃO GERA FINANCEIRO' ELSE COALESCE(
    cp.pgpgt_descricao, 'NÃO GERA FINANCEIRO'
  ) END AS Condicao_Pagamento, 
  n.vdnfs_situacao AS Situacao 
FROM 
  vd_notafiscalsaida n CROSS 
  JOIN parametros p 
  LEFT JOIN pg_cliente cli ON cli.pgcln_codigo = n.pgcln_codigo 
  LEFT JOIN pg_operacaofiscal op ON op.pgopr_codigo = n.pgopr_codigo 
  LEFT JOIN pg_condicaopagamento cp ON cp.pgpgt_codigo = n.pgpgt_codigo 
WHERE 
  n.vdnfs_datamovimento BETWEEN p.p_data_inicio 
  AND p.p_data_fim 
  AND n.pgopr_codigo = ANY(
    string_to_array(p.p_operacoes, ','):: int[]
  ) 
  AND n.vdnfs_situacao != p.p_situacao_cancelada 
ORDER BY 
  n.vdnfs_datamovimento ASC, 
  n.vdnfs_numeronotafiscal ASC;
