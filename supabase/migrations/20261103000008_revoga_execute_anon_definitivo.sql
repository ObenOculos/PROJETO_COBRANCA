-- Continuacao da correcao de seguranca da migration anterior
-- (20261103000007): o REVOKE EXECUTE ... FROM PUBLIC daquela migration
-- NAO bastou. Confirmado por leitura (sem mutacao) depois do push: `anon`
-- continuava com EXECUTE em toda funcao nova, inclusive as que acabaram de
-- ser corrigidas.
--
-- Causa raiz: este projeto Supabase tem ALTER DEFAULT PRIVILEGES configurado
-- no schema public concedendo EXECUTE em funcao nova (e privilegios
-- completos em tabela nova) diretamente aos papeis anon/authenticated/
-- service_role -- nao via PUBLIC. "REVOKE ... FROM PUBLIC" so tira o
-- privilegio implicito do pseudo-papel PUBLIC; o grant explicito que cada
-- papel recebe na criacao fica intacto. Por isso toda funcao nova (as
-- minhas de hoje inclusive) nascia liberada pra anon sem ninguem ter
-- pedido isso -- e por isso varias funcoes antigas deste projeto tambem
-- ficaram assim (GRANT ... TO authenticated sem o REVOKE correspondente
-- de anon, que parecia redundante mas nao era).
--
-- Duas partes:
--   1) REVOKE EXECUTE ... FROM anon explicito em cada funcao afetada
--      (as da migration anterior + as 3 novas desta sessao que so tinham
--      sido reovogadas de PUBLIC: clientes_fora_da_faixa,
--      executar_saida_carteira_fora_da_faixa,
--      cliente_tem_visita_agendada_ativa).
--   2) ALTER DEFAULT PRIVILEGES fechando o padrao pra frente -- funcao
--      nova a partir de agora nao nasce mais liberada pra anon. Nao muda
--      nada pra tabela (fora de escopo aqui; tabela nova continua
--      precisando de RLS "TO authenticated" explicita, like ja e o padrao
--      deste projeto desde a Etapa 2a/2b).

REVOKE EXECUTE ON FUNCTION public.reagendar_visita(uuid, date, time, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.definir_faixa_atraso_cobrador(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vincular_cobrador_a_gerente(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.desvincular_cobrador(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.marcar_acordos_quebrados() FROM anon;
REVOKE EXECUTE ON FUNCTION public.criar_acordo(text, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_acordo(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pagamento_acordo(uuid, numeric, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cliente_max_atraso_dias(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cliente_tem_acordo_ativo(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cobrador_na_data_em_lote(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saldo_acordo_parcela(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.situacao_primaria_do_tipo(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.titulo_em_acordo_ativo(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.protege_atribuicao_banco_dados() FROM anon;

REVOKE EXECUTE ON FUNCTION public.clientes_fora_da_faixa() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cliente_tem_visita_agendada_ativa(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.executar_saida_carteira_fora_da_faixa() FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
