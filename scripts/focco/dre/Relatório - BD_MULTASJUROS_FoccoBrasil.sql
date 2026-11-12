-- =============================================================
-- PARÂMETROS GLOBAIS
-- =============================================================
WITH parametros AS (
    SELECT
        1                 AS p_filial,
        DATE '2026-01-01' AS p_data_inicio,
        DATE '2026-04-30' AS p_data_fim,
        '1,2,20'          AS p_tipos_titulo,     -- tipos de título aceitos
        '100,14'          AS p_formas_excluidas  -- formas de pagamento ignoradas
)
-- =============================================================

SELECT
    TO_CHAR(fncrb.fncrb_databaixa, 'DD/MM/YYYY')                              AS "DATA_BAIXA",
    fncrb.fncrb_numerobaixa                                                    AS "NUM_BAIXA",
    fncrt.fncrt_numerotitulo                                                   AS "TITULO",
    fncrt.fncrt_parcela                                                        AS "PARCELA",
    pgcln.pgcln_codigo                                                         AS "COD_CLIENTE",
    pgcln.pgcln_nomefantasia                                                   AS "NOME_FANTASIA",
    pgcln.pgcln_nome                                                           AS "RAZAO_SOCIAL",
    CASE
        WHEN LENGTH(REGEXP_REPLACE(pgcln.pgcln_cpfcnpj, '\D', '', 'g')) = 11
        THEN REGEXP_REPLACE(
                 REGEXP_REPLACE(pgcln.pgcln_cpfcnpj, '\D', '', 'g'),
                 '(\d{3})(\d{3})(\d{3})(\d{2})',
                 '\1.\2.\3-\4'
             )
        WHEN LENGTH(REGEXP_REPLACE(pgcln.pgcln_cpfcnpj, '\D', '', 'g')) = 14
        THEN REGEXP_REPLACE(
                 REGEXP_REPLACE(pgcln.pgcln_cpfcnpj, '\D', '', 'g'),
                 '(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})',
                 '\1.\2.\3/\4-\5'
             )
        ELSE pgcln.pgcln_cpfcnpj
    END                                                                        AS "CNPJ_CPF",
    TO_CHAR(fncrt.fncrt_datavencimento, 'DD/MM/YYYY')                         AS "DATA_VENC.",
    'R$ ' || TO_CHAR(fncrt.fncrt_valor,                    'FM999G999G990D00') AS "VALOR_TITULO",
    'R$ ' || TO_CHAR(fncrt.fncrt_saldo,                    'FM999G999G990D00') AS "VALOR_SALDO",
    'R$ ' || TO_CHAR(COALESCE(fntbd.fntbd_valorjuro,     0),'FM999G999G990D00') AS "VALOR_JUROS",
    'R$ ' || TO_CHAR(COALESCE(fntbd.fntbd_valormulta,    0),'FM999G999G990D00') AS "VALOR_MULTA",
    'R$ ' || TO_CHAR(COALESCE(fntbd.fntbd_valordesconto, 0),'FM999G999G990D00') AS "VALOR_DESC",
    'R$ ' || TO_CHAR(COALESCE(fntbd.fntbd_valorbaixa,    0),'FM999G999G990D00') AS "VALOR_BAIXA",
    (
        SELECT STRING_AGG(DISTINCT f.fnfpt_descricao, ' / ')
        FROM fn_crbaixaformapagamento bfp
        INNER JOIN fn_formapagamento f ON bfp.fnfpt_codigo = f.fnfpt_codigo
        WHERE bfp.fncrb_numerobaixa = fncrb.fncrb_numerobaixa
          AND f.fnfpt_codigo <> ALL(
                string_to_array((SELECT p_formas_excluidas FROM parametros), ',')::int[]
              )
    )                                                                          AS "FORMA_PAGAMENTO"

FROM fn_crbaixa fncrb
CROSS JOIN parametros p
INNER JOIN fn_crtitulobaixado fntbd
    ON  fntbd.pgemp_codigo        = fncrb.pgemp_codigo
    AND fntbd.pgfll_codigo        = fncrb.pgfll_codigo
    AND fntbd.fncrb_numerobaixa   = fncrb.fncrb_numerobaixa
INNER JOIN fn_crtitulo fncrt
    ON  fncrt.pgemp_codigo          = fntbd.pgemp_codigo
    AND fncrt.pgfll_codigo          = fntbd.pgfll_codigo
    AND fncrt.pgcln_codigo          = fntbd.pgcln_codigo
    AND fncrt.fncrt_sequenciatitulo = fntbd.fncrt_sequenciatitulo
INNER JOIN pg_cliente pgcln
    ON pgcln.pgcln_codigo = fncrt.pgcln_codigo

WHERE
    fncrb.pgfll_codigo        =  p.p_filial
    AND fncrb.fncrb_databaixa BETWEEN p.p_data_inicio AND p.p_data_fim
    AND fncrt.fntti_codigo    =  ANY(string_to_array(p.p_tipos_titulo,    ',')::int[])
    AND EXISTS (
        SELECT 1
        FROM fn_crbaixaformapagamento bfp2
        WHERE bfp2.fncrb_numerobaixa = fncrb.fncrb_numerobaixa
          AND bfp2.fnfpt_codigo <> ALL(
                string_to_array(p.p_formas_excluidas, ',')::int[]
              )
    )

ORDER BY
    fncrb.fncrb_databaixa    ASC,
    fncrt.fncrt_numerotitulo ASC,
    fncrt.fncrt_parcela      ASC;