-- Etapa 2 da integracao acordo x Ciclone (2026-11-06): o estado vindo do ERP
-- passa pela trava de titulo em acordo ativo.
--
-- Problema (o mesmo do Cedrus, sistema antigo): trg_protege_titulo_em_acordo
-- (20261102000005) bloqueia status/valor_recebido/desconto de titulo em acordo
-- ativo para evitar pagamento "por fora" registrado NO APP. Mas ele nao
-- distingue o app do sync do ERP. Quando o financeiro agrupa os titulos no
-- Ciclone (cancela a fatura antiga -> 'C'; refatura as origens -> 'F'), o
-- sync tenta gravar esse estado e o gatilho recusa:
--   - o titulo original fica preso com o status antigo em vez de cancelado/
--     agrupado (exatamente o que acontecia no Cedrus);
--   - sync_financeiro.py aborta no primeiro lote recusado (RuntimeError), e a
--     rodada inteira para dali em diante -- todo o resto fica desatualizado.
--
-- Regra: para titulo que VEM do Ciclone (tem linha em ciclone_titulo_map),
-- o ERP e a fonte da verdade do estado do titulo -- a escrita do sync sempre
-- passa. A trava continua valendo para tudo que nao e o sync (pagamento
-- manual, Distribuir Pagamento, upload de planilha, outras lojas).
--
-- Identificacao do sync: role 'service_role' no JWT da requisicao PostgREST
-- (request.jwt.claims). Nao da para usar current_user: a funcao e SECURITY
-- DEFINER, entao current_user e o dono dela. O claim vem de JWT assinado, nao
-- e forjavel pelo navegador (anon/authenticated). Unico usuario de
-- service_role neste projeto: sync_financeiro.py (e o script one-off
-- scripts/migrate-users-to-auth.mjs, que nao toca BANCO_DADOS).
--
-- Historico preservado: cada mudanca continua gerando linha em
-- recebimentos_historico (gatilho recebimentos_historico_upd), entao o que o
-- ERP mudou num titulo em acordo fica rastreavel (join com acordo_titulos).
--
-- Corpo parte de pg_get_functiondef de producao em 2026-11-06.

CREATE OR REPLACE FUNCTION public.trg_protege_titulo_em_acordo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.valor_recebido IS DISTINCT FROM OLD.valor_recebido
      OR NEW.desconto IS DISTINCT FROM OLD.desconto)
     AND COALESCE(current_setting('cobranca.permitir_pagamento_acordo', true), '') <> 'true'
     AND NOT (
       -- Sync do ERP Ciclone gravando titulo que veio do Ciclone: o ERP vence.
       COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
       AND EXISTS (
         SELECT 1 FROM public.ciclone_titulo_map m WHERE m.id_parcela = NEW.id_parcela
       )
     )
     AND public.titulo_em_acordo_ativo(NEW.id_parcela)
  THEN
    RAISE EXCEPTION 'Este título está vinculado a um acordo ativo. Registre o pagamento pela tela do acordo.';
  END IF;
  RETURN NEW;
END;
$function$;
