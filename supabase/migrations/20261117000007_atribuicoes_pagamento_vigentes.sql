-- Item 66, etapas 3/4 — fonte única do "quanto desse crédito ainda vale"
-- (2026-11-17).
--
-- Decisão original do item 66 (16/11): o crédito aprovado deve valer
-- LEAST(valor_aprovado, valor_recebido atual) e sumir se o ERP desfizer a
-- baixa. Isso nunca tinha sido implementado -- Caixa Diário, Meu desempenho
-- e Resumo por Cobrador somavam `valor_aprovado` direto. Esta view é a fonte
-- única: todo lugar que soma esse crédito passa a ler dela, nunca a tabela
-- `atribuicoes_pagamento` crua.
--
-- `security_invoker = true`: a RLS de `atribuicoes_pagamento` (gestor vê
-- tudo, cobrador só o que ele pediu) continua valendo através da view --
-- sem isso, por padrão uma view roda com o privilégio de quem a criou
-- (postgres), o que vazaria as atribuições de todos os cobradores pra
-- qualquer um que consultasse a view.

CREATE VIEW public.atribuicoes_pagamento_vigentes
WITH (security_invoker = true) AS
SELECT *
FROM (
  SELECT ap.*,
         LEAST(ap.valor_aprovado, COALESCE(b.valor_recebido, 0)) AS valor_vigente
  FROM public.atribuicoes_pagamento ap
  LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = ap.id_parcela
  WHERE ap.decisao = 'aprovado'
) x
WHERE valor_vigente > 0;

COMMENT ON VIEW public.atribuicoes_pagamento_vigentes IS
  'Atribuições de "pago na loja" aprovadas, com valor_vigente = LEAST(valor_aprovado, valor_recebido atual da parcela). Some da view se o ERP desfizer a baixa. Fonte única para Caixa Diário, Meu desempenho, Resumo por Cobrador e linha do tempo.';

GRANT SELECT ON public.atribuicoes_pagamento_vigentes TO authenticated;
REVOKE ALL ON public.atribuicoes_pagamento_vigentes FROM anon;
