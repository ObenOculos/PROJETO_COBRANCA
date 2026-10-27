-- Etapa 2a da reorganização (RLS/privilégios): fecha o acesso de `anon`
-- (a chave pública do bundle do front) a tabelas e funções, e liga RLS em
-- toda tabela que ainda não tinha. Política deliberadamente larga para quem
-- já autenticou (FOR ALL ... USING (true)) — zero mudança de comportamento
-- para usuário logado; só fecha o acesso de quem não logou. Escopo por
-- perfil (cobrador só vê a própria carteira) e validação de auth.uid() nas
-- RPCs ficam para a Etapa 2b.

-- 1. Funções-ponte: identidade de negócio a partir da sessão do Supabase
-- Auth. users.id continua estável (Etapa 1) — auth_user_id é só o vínculo.
create or replace function public.app_current_user_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.users where auth_user_id = auth.uid();
$$;

create or replace function public.app_current_user_type()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select type from public.users where auth_user_id = auth.uid();
$$;

comment on function public.app_current_user_id() is
  'Identidade de negocio (users.id) da sessao Supabase Auth atual. Usada pelas policies de RLS da Etapa 2b.';
comment on function public.app_current_user_type() is
  'Perfil (users.type) da sessao Supabase Auth atual. Usada pelas policies de RLS da Etapa 2b.';

-- 2. RPC de login pre-autenticacao: unica coisa que anon continua podendo
-- chamar. Substitui a leitura direta de users (feita como anon) em
-- AuthContext.tsx antes do signInWithPassword.
create or replace function public.resolve_auth_email(p_login text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth_email from public.users where login = p_login;
$$;

comment on function public.resolve_auth_email(text) is
  'Resolve login -> e-mail sintetico do Supabase Auth. Chamada por anon antes do login (nao revela mais nada da linha de users).';

-- 3. Fecha anon: nenhuma funcao, nenhuma tabela, exceto a RPC de login.
revoke execute on all functions in schema public from anon;
grant execute on function public.resolve_auth_email(text) to anon;

revoke all on all tables in schema public from anon;

-- 4. Liga RLS em toda tabela que ainda nao tinha (apelidos_temporario ja
-- estava ligada, fora do escopo desta etapa).
alter table public."BANCO_DADOS" enable row level security;
alter table public.clientes enable row level security;
alter table public.users enable row level security;
alter table public.scheduled_visits enable row level security;
alter table public.sale_payments enable row level security;
alter table public.allowed_visit_dates enable row level security;
alter table public.monthly_goals enable row level security;
alter table public.collection_attempts enable row level security;
alter table public.enderecos_historico enable row level security;
alter table public.authorization_history enable row level security;
alter table public.atribuicoes_historico enable row level security;
alter table public.recebimentos_historico enable row level security;
alter table public.vendas_canceladas enable row level security;

-- 5. Policies orfas (escritas assumindo users.id = auth.uid() direto, ou
-- auth.jwt()->>'role'='admin' -- nenhum dos dois existe no nosso modelo).
-- Removidas e substituidas por um unico padrao consistente abaixo.
drop policy if exists "Allow authenticated users to view allowed_visit_dates" on public.allowed_visit_dates;
drop policy if exists "Allow managers full access on allowed_visit_dates" on public.allowed_visit_dates;
drop policy if exists "Collectors can view allowed visit dates" on public.allowed_visit_dates;
drop policy if exists "Managers can manage allowed visit dates" on public.allowed_visit_dates;

drop policy if exists "Administrators have full access to authorization history" on public.authorization_history;
drop policy if exists "Collectors can view their own authorization history" on public.authorization_history;
drop policy if exists "Only administrators can delete authorization history" on public.authorization_history;
drop policy if exists "Processors can update authorization history" on public.authorization_history;
drop policy if exists "Processors can view records they've processed" on public.authorization_history;
drop policy if exists "Users can create authorization requests" on public.authorization_history;

drop policy if exists "Allow authenticated user to insert new addresses" on public.enderecos_historico;
drop policy if exists "Allow authenticated user to update addresses" on public.enderecos_historico;
drop policy if exists "Allow authenticated user to view addresses" on public.enderecos_historico;

drop policy if exists "Authenticated users full access" on public.sale_payments;

drop policy if exists "Enable read access for all users" on public.users;

-- 6. Padrao unico: qualquer usuario autenticado ve/faz o que ja via/fazia
-- hoje (nenhuma restricao por perfil ainda -- Etapa 2b).
create policy "authenticated_full_access" on public."BANCO_DADOS"
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.clientes
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.users
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.scheduled_visits
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.sale_payments
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.allowed_visit_dates
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.monthly_goals
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.collection_attempts
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.enderecos_historico
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.authorization_history
  for all to authenticated using (true) with check (true);

-- 7. Tabelas de historico: mantem o desenho ja correto (escrita so por
-- trigger/RPC SECURITY DEFINER, nunca direto) -- so SELECT para authenticated.
create policy "authenticated_read_only" on public.atribuicoes_historico
  for select to authenticated using (true);
create policy "authenticated_read_only" on public.recebimentos_historico
  for select to authenticated using (true);
create policy "authenticated_read_only" on public.vendas_canceladas
  for select to authenticated using (true);
