-- Item 61/62: conferencia_marcacoes e pedidos_correcao_pagamento sao
-- historico (so INSERT; a decisao do pedido e gravada pela RPC
-- decidir_pedido_correcao, SECURITY DEFINER). A RLS ja nao tem policy de
-- UPDATE/DELETE, mas o authenticated herdava o grant do padrao do schema:
-- fecha tambem no privilegio (defesa em profundidade).
REVOKE UPDATE, DELETE, TRUNCATE ON public.conferencia_marcacoes FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.pedidos_correcao_pagamento FROM authenticated;
