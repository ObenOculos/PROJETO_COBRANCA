-- Cobrador inativado: toda a carteira dele fica sem cobrador e sem situacao.
--
-- PEDIDO (2026-11-09): "quando o usuario fica inativo, todos os seus clientes
-- devem ficar 'sem cobrador' e 'vazio'". Achado: 3 cobradores inativos (que
-- nao trabalham mais na empresa) ainda seguravam 1.828 clientes -- Beatriz
-- 811, Samila 766, Luis 251 (situacao "Cobranca Interna" 1.302, "Em maos"
-- 526). Nenhum com acordo ou agendamento ativo em 2026-11-09.
--
-- O QUE FAZ:
--   1. Gatilho em users: quando `active` vira false, BANCO_DADOS daquele
--      cobrador recebe user_id = NULL e situacao = NULL. Vale para qualquer
--      caminho que inative (tela Usuarios, SQL).
--   2. Uma vez, agora: o mesmo para quem JA esta inativo.
--
-- Historico: atribuicoes_historico registra cada cliente com motivo
-- 'cobrador_inativado' (gatilho trg_historico_carteira_upd le
-- cobranca.motivo). Fato historico preservado: so a atribuicao atual muda.
--
-- protege_atribuicao_banco_dados so deixa gestor mexer em user_id, com uma
-- excecao para "so tirar o cobrador" (cobranca.liberacao_autorizada) -- usada
-- aqui, entao funciona tambem pelo SQL Editor / db push.
--
-- Fora do escopo (decidir depois): acordos e agendamentos ativos do
-- cobrador inativado nao sao tocados.

CREATE OR REPLACE FUNCTION public.liberar_carteira_cobrador_inativo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('cobranca.motivo', 'cobrador_inativado', true);
  PERFORM set_config(
    'cobranca.usuario_id',
    COALESCE((SELECT app_current_user_id())::text, ''),
    true
  );
  PERFORM set_config('cobranca.liberacao_autorizada', 'true', true);

  UPDATE public."BANCO_DADOS"
  SET user_id = NULL,
      situacao = NULL
  WHERE user_id = NEW.id;

  -- Nao deixa a autorizacao valendo para o resto da transacao.
  PERFORM set_config('cobranca.liberacao_autorizada', '', true);
  PERFORM set_config('cobranca.motivo', '', true);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.liberar_carteira_cobrador_inativo() IS
  'Gatilho de users: ao inativar (active -> false), tira o cobrador e a situacao de todos os clientes dele (motivo cobrador_inativado no historico).';

-- Funcao de gatilho: ninguem chama direto.
REVOKE ALL ON FUNCTION public.liberar_carteira_cobrador_inativo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_users_libera_carteira_ao_inativar ON public.users;
CREATE TRIGGER trg_users_libera_carteira_ao_inativar
  AFTER UPDATE OF active ON public.users
  FOR EACH ROW
  WHEN (OLD.active IS DISTINCT FROM false AND NEW.active = false)
  EXECUTE FUNCTION public.liberar_carteira_cobrador_inativo();

-- Uma vez: carteiras de quem ja esta inativo.
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'cobrador_inativado', true);
  PERFORM set_config('cobranca.liberacao_autorizada', 'true', true);

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL,
      situacao = NULL
  WHERE b.user_id IN (SELECT u.id FROM public.users u WHERE u.active = false);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Parcelas liberadas de cobradores inativos: %', v_n;

  PERFORM set_config('cobranca.liberacao_autorizada', '', true);
  PERFORM set_config('cobranca.motivo', '', true);
END;
$$;
