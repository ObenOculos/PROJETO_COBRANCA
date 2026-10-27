-- Etapa 1 da reorganização (auth): vínculo entre public.users e auth.users.
--
-- Não substitui users.id (já é uuid e é referenciado como texto/uuid por
-- scheduled_visits.collector_id, BANCO_DADOS.user_id etc. em todo o app) —
-- só adiciona a ponte para o login passar a usar o Supabase Auth.
-- auth_email guarda o e-mail sintético gerado na migração (login não é
-- e-mail), para o login não precisar recalcular a mesma regra de slugify.
alter table public.users
  add column auth_user_id uuid references auth.users(id),
  add column auth_email text;

-- A partir da Etapa 1 o app para de gravar senha (login passa pelo Supabase
-- Auth); criar usuário novo não envia mais esse campo. NOT NULL deixaria o
-- insert quebrado para linhas novas.
alter table public.users
  alter column password drop not null;

create unique index if not exists users_auth_user_id_key
  on public.users (auth_user_id);

create unique index if not exists users_auth_email_key
  on public.users (auth_email);

comment on column public.users.auth_user_id is
  'Vínculo com auth.users.id (Supabase Auth). NULL até a migração do script scripts/migrate-users-to-auth.ts rodar para esta linha.';
comment on column public.users.auth_email is
  'E-mail sintético usado no Supabase Auth (login não é e-mail). Gerado por scripts/migrate-users-to-auth.ts.';
comment on column public.users.password is
  'Obsoleta a partir da Etapa 1 (login via Supabase Auth). Mantida temporariamente só para rollback; remover numa migration de limpeza futura.';
