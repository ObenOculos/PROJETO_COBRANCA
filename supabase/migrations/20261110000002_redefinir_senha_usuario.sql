-- Gestor redefine a senha de login de um usuario pela tela Usuarios
-- (substitui scripts/sql/trocar-senha-usuario.sql no dia a dia). So troca o
-- hash em auth.users; a senha nunca e gravada em public.
CREATE OR REPLACE FUNCTION public.redefinir_senha_usuario(
  p_user_id uuid,
  p_senha text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id uuid;
BEGIN
  IF public.app_current_user_type() IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem redefinir senhas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 6 caracteres.';
  END IF;

  SELECT auth_user_id INTO v_auth_id
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Este usuário não tem conta de login.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_auth_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de login deste usuário não encontrada.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.redefinir_senha_usuario(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redefinir_senha_usuario(uuid, text) TO authenticated, service_role;
