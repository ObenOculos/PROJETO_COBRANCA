-- Item 55 -- carteira automatica das 7h falhou em 14, 15 e 16/11:
--   "Apenas gestores podem reatribuir o cobrador de um cliente."
-- O pg_cron roda sem usuario logado: app_current_user_type() e NULL e o
-- trigger protege_atribuicao_banco_dados recusa a troca de user_id. Como a
-- transacao inteira voltava, nem o erro ficava em distribuicao_execucoes.
--
-- 1) O trigger aceita tambem a troca feita pela rotina automatica, marcada
--    pela flag local cobranca.distribuicao_automatica. So
--    executar_distribuicao_automatica liga a flag, e ela so pode ser
--    executada por postgres/service_role (sem grant a authenticated/anon).
-- 2) A rotina grava o erro em distribuicao_execucoes em vez de sumir.
-- Corpos copiados de producao (pg_get_functiondef, 2026-11-16).

CREATE OR REPLACE FUNCTION public.protege_atribuicao_banco_dados()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.user_id is distinct from OLD.user_id
     and public.app_current_user_type() IS DISTINCT FROM 'manager'
     -- Excecao 1: liberacao validada em liberar_cliente_da_carteira,
     -- que so tira o cobrador (nunca atribui outro).
     and not (
       NEW.user_id is null
       and coalesce(current_setting('cobranca.liberacao_autorizada', true), '') = 'true'
     )
     -- Excecao 2: carteira automatica (pg_cron, sem usuario logado), ligada
     -- so por executar_distribuicao_automatica.
     and coalesce(current_setting('cobranca.distribuicao_automatica', true), '') <> 'true'
  then
    raise exception 'Apenas gestores podem reatribuir o cobrador de um cliente.';
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.executar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perfis jsonb;
  v_res jsonb;
BEGIN
  SELECT perfis INTO v_perfis FROM public.distribuicao_config WHERE id = 1;
  IF v_perfis IS NULL THEN
    INSERT INTO public.distribuicao_execucoes (erro) VALUES ('sem distribuicao_config');
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM set_config('cobranca.distribuicao_automatica', 'true', true);
    v_res := public._aplicar_distribuicao_carteira(v_perfis, '{}'::uuid[], 'distribuicao_automatica', '');
    PERFORM set_config('cobranca.distribuicao_automatica', '', true);
  EXCEPTION WHEN OTHERS THEN
    -- O bloco volta atras sozinho (nada aplicado pela metade); fica o erro.
    PERFORM set_config('cobranca.distribuicao_automatica', '', true);
    INSERT INTO public.distribuicao_execucoes (erro) VALUES (left(SQLERRM, 500));
    RETURN NULL;
  END;
  INSERT INTO public.distribuicao_execucoes (resultado) VALUES (v_res);
  RETURN v_res;
END;
$function$;
