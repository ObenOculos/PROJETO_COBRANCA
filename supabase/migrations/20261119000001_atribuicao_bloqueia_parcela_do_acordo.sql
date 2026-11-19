-- Pagamento de acordo no Desempenho sem duplicidade (2026-11-19).
--
-- O Resumo por Cobrador passa a somar acordo_pagamentos no recebido (como ja
-- faziam Meu desempenho e a Recuperacao do Mes). O acordo feito no app e
-- depois lancado no ERP: na SSOtica vira "Renegociacao de Parcelas", no
-- Ciclone vira baixa de RENEGOCIACAO (forma 100) com titulos novos. O cliente
-- paga a parcela no ERP e o mesmo dinheiro aparece duas vezes:
--   - em acordo_pagamentos (registrado no app, ou espelhado pela importacao
--     da SSOtica via registrar_pagamento_acordo_interno), que ja conta;
--   - como titulo pago em BANCO_DADOS, que o cobrador podia pedir como
--     "pago na loja" (atribuicoes_pagamento) e contar DE NOVO.
-- Enquanto o acordo esta ativo o cliente fica com situacao 'Em acordo' e a
-- regra ja barrava. O buraco: acordo CUMPRIDO (situacao sai de 'Em acordo')
-- com os titulos da renegociacao pagos no ERP -- caso real: acordo cumprido
-- de 31/10 com R$ 200 em acordo_pagamentos e as 2 parcelas da renegociacao
-- da SSOtica "Pago" em BANCO_DADOS, pedido possivel ate 30/11.
--
-- Regra nova, pelo ATRELAMENTO (nunca por texto de descricao -- a SSOtica tem
-- milhares de renegociacoes que nao sao acordo do app e continuam valendo):
--   (1) titulo atrelado ao acordo (acordo_titulos);
--   (2) titulo GERADO por renegociacao do Ciclone cujos titulos de ORIGEM
--       estao atrelados ao acordo e que foi feita no dia do acordo ou depois
--       (e o acordo do app lancado no ERP).
-- ...pago a partir do dia do acordo e enquanto ele valeu: ativo/cumprido, ou
-- ate o dia em que foi cancelado/quebrado (depois disso o titulo volta a ser
-- cobranca normal e o pagamento e dinheiro novo).
-- Parcelas da renegociacao da SSOtica lancadas desde 12/11 nem entram em
-- BANCO_DADOS (ficam em ssotica_acordo_parcelas, migration 20261112000003).
--
-- Corpo copiado de producao (pg_get_functiondef, 2026-11-19); unica mudanca:
-- o WHEN do acordo, antes do ELSE. Mesmos grants (REVOKE da 20261116000004 e
-- default privileges da 20261106000003 continuam valendo no REPLACE).

CREATE OR REPLACE FUNCTION public.atribuicao_bloqueio_parcela(p_id_parcela bigint)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN b.id_parcela IS NULL OR COALESCE(b.valor_recebido, 0) <= 0
         OR b.data_de_recebimento IS NULL THEN
      'Parcela não está paga no ERP.'
    WHEN lower(trim(COALESCE(b.status, ''))) IN ('cancelado', 'agrupado', 'renegociado') THEN
      'Parcela cancelada ou renegociada.'
    WHEN b.situacao = 'Em acordo' THEN 'Parcela em acordo.'
    WHEN EXISTS (
      SELECT 1 FROM public.recebimentos_historico h
      WHERE h.id_parcela = p_id_parcela
        AND h.origem IN ('app', 'acordo', 'estorno')
    ) THEN 'Tem pagamento lançado no app.'
    WHEN EXISTS (
      SELECT 1
      FROM public.acordos a
      WHERE b.data_de_recebimento
              >= (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
        AND (a.status IN ('ativo', 'cumprido')
             OR b.data_de_recebimento
                  <= (a.resolved_at AT TIME ZONE 'America/Sao_Paulo')::date)
        AND (
          -- (1) titulo atrelado ao acordo
          EXISTS (
            SELECT 1 FROM public.acordo_titulos at
            WHERE at.acordo_id = a.id AND at.collection_id = p_id_parcela
          )
          -- (2) parcela gerada pela renegociacao do Ciclone desse acordo
          OR EXISTS (
            SELECT 1
            FROM public.ciclone_renegociacao_titulos g
            JOIN public.ciclone_renegociacoes r ON r.baixa_uuid = g.baixa_uuid
            JOIN public.ciclone_renegociacao_titulos o
              ON o.baixa_uuid = g.baixa_uuid AND o.papel = 'origem'
            JOIN public.acordo_titulos at
              ON at.collection_id = o.id_parcela AND at.acordo_id = a.id
            WHERE g.id_parcela = p_id_parcela
              AND g.papel = 'gerado'
              AND r.data_baixa
                    >= (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
          )
        )
    ) THEN 'Parcela do acordo — o pagamento já conta pelo acordo.'
    ELSE NULL
  END
  FROM (SELECT 1) x
  LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = p_id_parcela;
$function$;
