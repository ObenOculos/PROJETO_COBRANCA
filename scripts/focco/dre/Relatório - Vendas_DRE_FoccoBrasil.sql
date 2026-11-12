-- =============================================================
-- RELATÓRIO DE VENDAS / PEDIDOS
-- Estrutura ajustada para reproduzir as colunas do arquivo CSV.
-- Perfil PostgreSQL disponível: ciclone, ciclone (powerbi)
-- =============================================================
WITH parametros AS (
       SELECT
              DATE '2025-11-01' AS p_data_inicio,
              DATE '2025-11-30' AS p_data_fim
)
SELECT
       COALESCE(i.eqpdg_codigo, i.vdpvp_nomeproduto)                                        AS "CÓDIGO",
       COALESCE(c.eqcor_nome, '')                                                           AS "COR",
       TO_CHAR(n.vdpdv_codigo, 'FM999G999G990')                                             AS "PEDIDO",
       TO_CHAR(n.vdpdv_datahoraemissao::date, 'DD/MM/YYYY')                                 AS "DATA EMISSÃO",
       CASE
              WHEN nf.vdnfs_numeronotafiscal IS NULL THEN ''
              ELSE TO_CHAR(nf.vdnfs_numeronotafiscal, 'FM999G999G990') || '/' || COALESCE(nf.vdnfs_serienotafiscal, '')
       END                                                                                  AS "DOCUMENTO",
       TO_CHAR(
              COALESCE(nf.vdnfs_datamovimento, n.vdpdv_datahorasaidadfe::date, n.vdpdv_datahorasaida::date),
              'DD/MM/YYYY'
       )                                                                                    AS "DATA SAÍDA",
       CASE
              WHEN nf.vdnfs_sequencianotafiscal IS NOT NULL THEN 'GERADO NOTA'
              WHEN n.vdpdv_situacao = 'C' THEN 'CANCELADO'
              WHEN n.vdpdv_situacao = 'F' THEN 'FINALIZADO'
              ELSE 'NORMAL'
       END                                                                                  AS "SITUAÇÃO",
       n.pgopr_codigo::text                                                                 AS "OPERAÇÃO FISCAL",
       TO_CHAR(n.pgcln_codigo, 'FM999G999G990')                                              AS "CÓDIGO CLIENTE",
       COALESCE(cli.pgcln_nomefantasia, cli.pgcln_nome, '')                                  AS "NOME FANTASIA",
       CASE
              WHEN LENGTH(REGEXP_REPLACE(COALESCE(cli.pgcln_cpfcnpj, ''), '\\D', '', 'g')) = 11 THEN
                     REGEXP_REPLACE(
                            REGEXP_REPLACE(COALESCE(cli.pgcln_cpfcnpj, ''), '\\D', '', 'g'),
                            '(\\d{3})(\\d{3})(\\d{3})(\\d{2})',
                            '\\1.\\2.\\3-\\4'
                     )
              WHEN LENGTH(REGEXP_REPLACE(COALESCE(cli.pgcln_cpfcnpj, ''), '\\D', '', 'g')) = 14 THEN
                     REGEXP_REPLACE(
                            REGEXP_REPLACE(COALESCE(cli.pgcln_cpfcnpj, ''), '\\D', '', 'g'),
                            '(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{2})',
                            '\\1.\\2.\\3/\\4-\\5'
                     )
              ELSE ''
       END                                                                                  AS "CPF/CNPJ CLIENTE",
       n.pgfll_codigo::text                                                                 AS "CÓDIGO FILIAL",
       n.pgven_codigo::text                                                                 AS "CÓDIGO VENDEDOR",
       COALESCE(cid.pgcdd_nome, '')                                                         AS "CIDADE",
       COALESCE(cid.pgest_uf, cli.pgest_uf, '')                                             AS "UF",
       TO_CHAR(i.vdpvp_quantidade, 'FM999G999G990D00')                                      AS "QNT",
       COALESCE(i.eqund_codigo, u.eqund_abreviatura, '')                                    AS "UN",
       'R$ ' || TO_CHAR(ROUND(i.vdpvp_valorunitario::numeric, 2), 'FM999G999G990D00')       AS "VALOR UNITÁRIO",
       'R$ ' || TO_CHAR(
              ROUND(
                     COALESCE(nif.vdnfp_valorcusto, i.vdpvp_valorunitarioestoque, i.vdpvp_valorunitariobase)::numeric,
                     2
              ),
              'FM999G999G990D00'
       )                                                                                    AS "VALOR TOTAL CUSTO",
       'R$ ' || TO_CHAR(
              ROUND(
                     COALESCE(nif.vdnfp_valortotal, i.vdpvp_valorliquidoreal, i.vdpvp_valortotalliquido)::numeric,
                     2
              ),
              'FM999G999G990D00'
       )                                                                                    AS "VALOR TOTAL EFETIVO"
FROM vd_pedidovenda n
CROSS JOIN parametros p
INNER JOIN vd_pedidovendaproduto i
       ON i.pgemp_codigo = n.pgemp_codigo
   AND i.pgfll_codigo = n.pgfll_codigo
   AND i.vdpdv_codigo = n.vdpdv_codigo
LEFT JOIN pg_cliente cli
       ON cli.pgcln_codigo = n.pgcln_codigo
LEFT JOIN eq_corespecifica c
       ON c.eqcor_codigo = i.eqcor_codigo
LEFT JOIN pg_cidade cid
       ON cid.pgcdd_codigo = cli.pgcdd_codigo
LEFT JOIN eq_unidademedida u
       ON u.eqund_codigo = i.eqund_codigo
LEFT JOIN vd_notafiscalsaida nf
       ON nf.pgemp_codigo = n.pgemp_codigo
   AND nf.pgfll_codigo = n.pgfll_codigo
   AND nf.vdpdv_codigo = n.vdpdv_codigo
LEFT JOIN vd_notafiscalsaidaproduto nif
       ON nif.pgemp_codigo = nf.pgemp_codigo
   AND nif.pgfll_codigo = nf.pgfll_codigo
   AND nif.vdnfs_sequencianotafiscal = nf.vdnfs_sequencianotafiscal
   AND nif.eqpdg_codigo = i.eqpdg_codigo
   AND nif.eqcor_codigo = i.eqcor_codigo
   AND nif.eqund_codigo = i.eqund_codigo
WHERE n.vdpdv_datahoraemissao::date BETWEEN p.p_data_inicio AND p.p_data_fim
ORDER BY
       n.vdpdv_datahoraemissao ASC,
       n.vdpdv_codigo ASC,
       i.vdpvp_sequencia ASC;
