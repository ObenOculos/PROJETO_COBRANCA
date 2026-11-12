-- =============================================================
-- PARÂMETROS GLOBAIS
-- =============================================================
WITH parametros AS (
    SELECT
        DATE '2026-01-01'  AS p_data_inicio,
        DATE '2026-04-30'  AS p_data_fim,
        '15561,25561'      AS p_operacoes_despesa,
        'C'                AS p_situacao_cancelada
)
SELECT
    TO_CHAR(cp.fnnfd_dataemissao, 'DD/MM/YYYY')                                          AS data_emissao,
    cp.fnnfd_numeronotafiscal                                                            AS numero_nota,
    cp.fnnfd_serienotafiscal                                                             AS serie,
    COALESCE(f.pgfor_nome, 'N/A')                                                        AS fornecedor,
    op.pgopr_descricao                                                                   AS operacao,
    op.pgopr_funcaooperacao                                                              AS codigo_operacao,
    COALESCE(cc.pgccu_descricao, 'N/A')                                                  AS centro_custo,
    cc.pgccu_codigo                                                                      AS codigo_centro_custo,
    COALESCE(td.fntde_descricao, 'N/A')                                                  AS tipo_despesa,
    'R$ ' || TO_CHAR(ROUND(cp.fnnfd_valortotalnota::numeric, 2), 'FM999G999G999D90')     AS valor_total,
    cp.fnnfd_situacao                                                                    AS situacao
FROM fn_cpnotafiscaldespesa cp
CROSS JOIN parametros p
LEFT JOIN pg_fornecedor f
       ON f.pgfor_codigo = cp.pgfor_codigo
LEFT JOIN pg_operacaofiscal op
       ON op.pgopr_codigo = cp.pgopr_codigo
LEFT JOIN fn_cpnotafiscaldespesadetalhe det
       ON det.pgemp_codigo = cp.pgemp_codigo
      AND det.pgfll_codigo = cp.pgfll_codigo
      AND det.fnnfd_sequencianotafiscal = cp.fnnfd_sequencianotafiscal
LEFT JOIN pg_centrocusto cc
       ON cc.pgccu_codigo = det.pgccu_codigo
LEFT JOIN fn_cptipodespesa td
       ON td.fntde_codigo = det.fntde_codigo
WHERE cp.fnnfd_dataemissao BETWEEN p.p_data_inicio AND p.p_data_fim
  AND op.pgopr_codigo = ANY(string_to_array(p.p_operacoes_despesa, ',')::int[])
  AND cp.fnnfd_situacao != p.p_situacao_cancelada
ORDER BY
    cp.fnnfd_dataemissao ASC,
    cp.fnnfd_numeronotafiscal ASC;