-- Remover a faixa de atraso de um cobrador (pedido do usuario em
-- 2026-11-06: "nao consigo limpar as faixas depois"). Ate aqui so existia
-- definir_faixa_atraso_cobrador, que sempre abre uma faixa nova -- nao
-- havia como deixar o cobrador SEM faixa.
--
-- Mesma regra de vigencia da tabela (fato nao se sobrescreve, nada de
-- DELETE): encerra a faixa vigente com vigente_ate = hoje e nao abre outra.
-- Sem faixa vigente, nao faz nada (idempotente).
CREATE OR REPLACE FUNCTION public.encerrar_faixa_atraso_cobrador(p_collector_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem remover faixa de atraso.';
  END IF;

  UPDATE public.collector_overdue_ranges
  SET vigente_ate = v_hoje
  WHERE collector_id = p_collector_id
    AND vigente_ate IS NULL;
END;
$function$;

COMMENT ON FUNCTION public.encerrar_faixa_atraso_cobrador(uuid) IS
  'Encerra a faixa de atraso vigente do cobrador (vigente_ate = hoje) sem abrir outra -- cobrador fica sem faixa.';

REVOKE EXECUTE ON FUNCTION public.encerrar_faixa_atraso_cobrador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_faixa_atraso_cobrador(uuid) TO authenticated;
