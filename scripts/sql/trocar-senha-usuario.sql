-- Trocar a senha de login de um usuário do app (cobrador ou gestor).
--
-- Não há tela de troca de senha no app; rode isto no SQL Editor do Supabase
-- (projeto Cobradores). NÃO commite este arquivo com uma senha preenchida.
--
-- Como usar:
--   1. Troque 'NOVA_SENHA' pela senha desejada.
--   2. Troque 'NOME DO LOGIN' pelo login da pessoa (coluna users.login,
--      o mesmo texto que ela digita para entrar, ex.: 'Monalisa Silva').
--   3. Rode a consulta de conferência (passo A) e veja se volta 1 linha.
--   4. Rode o UPDATE (passo B). Deve dar "1 row affected".
--      Se der 0: a pessoa não tem conta de login (auth_user_id vazio) —
--      ver "Provisionar login de usuário novo" em docs/PROGRESSO.md.

-- A) Conferência: quem vai ter a senha trocada
select u.name, u.login, u.type, u.auth_email,
       a.id is not null as tem_conta_login,
       a.last_sign_in_at as ultimo_login
from public.users u
left join auth.users a on a.id = u.auth_user_id
where u.login = 'NOME DO LOGIN';

-- B) Troca da senha
update auth.users
set encrypted_password = extensions.crypt('NOVA_SENHA', extensions.gen_salt('bf')),
    updated_at = now()
where id = (
  select auth_user_id from public.users
  where login = 'NOME DO LOGIN'
);
