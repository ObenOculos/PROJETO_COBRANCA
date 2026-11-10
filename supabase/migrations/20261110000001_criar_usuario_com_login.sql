-- Criar usuario ja com login: a tela Usuarios (gestor) passa a criar o perfil
-- em public.users E a conta no Supabase Auth (auth.users + auth.identities)
-- numa transacao so. Antes a tela criava so o perfil e o login era
-- provisionado a mao no SQL Editor (mesmo formato usado aqui, copiado da conta
-- de jose_focco em producao).
--
-- E-mail sintetico: slug do login + @collectors.internal (mesma regra de
-- scripts/migrate-users-to-auth.mjs), com sufixo -2, -3... se ja existir.
-- A senha nunca e gravada em public; vai so como hash bcrypt em auth.users.
CREATE OR REPLACE FUNCTION public.criar_usuario_com_login(
  p_name text,
  p_login text,
  p_type text,
  p_senha text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := trim(coalesce(p_name, ''));
  v_login text := trim(coalesce(p_login, ''));
  v_base text;
  v_email text;
  v_sufixo integer := 2;
  v_user_id uuid := gen_random_uuid();
  v_auth_id uuid := gen_random_uuid();
BEGIN
  IF public.app_current_user_type() IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem criar usuários.'
      USING ERRCODE = '42501';
  END IF;

  IF v_name = '' OR v_login = '' THEN
    RAISE EXCEPTION 'Informe nome e login.';
  END IF;
  IF p_type IS NULL OR p_type NOT IN
     ('manager', 'collector', 'internal_collector', 'third_party_collector', 'legal_collector') THEN
    RAISE EXCEPTION 'Perfil inválido.';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 6 caracteres.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(login) = lower(v_login)) THEN
    RAISE EXCEPTION 'Já existe um usuário com o login "%".', v_login;
  END IF;

  -- slug: sem acento, minusculo, so [a-z0-9._-]
  v_base := lower(translate(v_login,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
  v_base := regexp_replace(v_base, '[^a-z0-9._-]+', '-', 'g');
  v_base := regexp_replace(v_base, '-+', '-', 'g');
  v_base := regexp_replace(v_base, '^-|-$', '', 'g');
  IF v_base = '' THEN
    v_base := 'usuario';
  END IF;
  v_email := v_base || '@collectors.internal';
  WHILE EXISTS (SELECT 1 FROM auth.users WHERE email = v_email)
     OR EXISTS (SELECT 1 FROM public.users WHERE auth_email = v_email) LOOP
    v_email := v_base || '-' || v_sufixo || '@collectors.internal';
    v_sufixo := v_sufixo + 1;
  END LOOP;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated',
    'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('email_verified', true, 'legacy_login', v_login,
                       'legacy_user_id', v_user_id),
    now(), now(), false, false,
    '', '', '', '', '', '', '', ''
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, created_at, updated_at
  ) VALUES (
    v_auth_id::text, v_auth_id,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email,
                       'email_verified', false, 'phone_verified', false),
    'email', now(), now()
  );

  INSERT INTO public.users (id, name, login, type, auth_user_id, auth_email)
  VALUES (v_user_id, v_name, v_login, p_type, v_auth_id, v_email);

  RETURN v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_usuario_com_login(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_usuario_com_login(text, text, text, text) TO authenticated, service_role;
