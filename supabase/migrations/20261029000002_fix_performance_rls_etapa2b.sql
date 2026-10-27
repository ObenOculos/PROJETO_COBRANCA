-- Corrige um problema de desempenho nas policies criadas na Etapa 2b
-- (20261029000001): chamar app_current_user_id()/app_current_user_type()
-- "soltas" numa condição de RLS faz o Postgres reavaliar a função LINHA A
-- LINHA durante o scan (confirmado com EXPLAIN ANALYZE: 6,6s pra ler uma
-- página de BANCO_DADOS, filtrando 127 mil linhas, cada uma chamando duas
-- funções SECURITY DEFINER). Isso causava "statement timeout" (57014) real
-- no app, visto em produção.
--
-- Correção padrão do Postgres/Supabase para RLS: envolver a chamada em
-- "(select ...)" -- isso faz o planejador tratar o valor como constante da
-- consulta (InitPlan), calculado uma vez, não por linha. Confirmado com
-- EXPLAIN ANALYZE: mesma consulta cai para ~0,1s.
--
-- Mesmas policies da 20261029000001, só trocando a forma da chamada -- a
-- regra de negócio não muda em nada.

-- BANCO_DADOS
drop policy "select_dono_ou_gestor" on public."BANCO_DADOS";
drop policy "update_dono_ou_gestor" on public."BANCO_DADOS";
drop policy "insert_gestor" on public."BANCO_DADOS";
drop policy "delete_gestor" on public."BANCO_DADOS";

create policy "select_dono_ou_gestor" on public."BANCO_DADOS"
  for select to authenticated
  using ((select app_current_user_type()) = 'manager' or user_id = (select app_current_user_id()));

create policy "update_dono_ou_gestor" on public."BANCO_DADOS"
  for update to authenticated
  using ((select app_current_user_type()) = 'manager' or user_id = (select app_current_user_id()))
  with check ((select app_current_user_type()) = 'manager' or user_id = (select app_current_user_id()));

create policy "insert_gestor" on public."BANCO_DADOS"
  for insert to authenticated
  with check ((select app_current_user_type()) = 'manager');

create policy "delete_gestor" on public."BANCO_DADOS"
  for delete to authenticated
  using ((select app_current_user_type()) = 'manager');

-- scheduled_visits, sale_payments
drop policy "dono_ou_gestor" on public.scheduled_visits;
create policy "dono_ou_gestor" on public.scheduled_visits
  for all to authenticated
  using ((select app_current_user_type()) = 'manager' or collector_id = (select app_current_user_id())::text)
  with check ((select app_current_user_type()) = 'manager' or collector_id = (select app_current_user_id())::text);

drop policy "dono_ou_gestor" on public.sale_payments;
create policy "dono_ou_gestor" on public.sale_payments
  for all to authenticated
  using ((select app_current_user_type()) = 'manager' or collector_id = (select app_current_user_id()))
  with check ((select app_current_user_type()) = 'manager' or collector_id = (select app_current_user_id()));

-- clientes
drop policy "select_dono_ou_gestor" on public.clientes;
drop policy "insert_gestor" on public.clientes;
drop policy "update_gestor" on public.clientes;
drop policy "delete_gestor" on public.clientes;

create policy "select_dono_ou_gestor" on public.clientes
  for select to authenticated
  using (
    (select app_current_user_type()) = 'manager'
    or exists (
      select 1 from public."BANCO_DADOS" b
      where b.documento = clientes.documento
        and b.user_id = (select app_current_user_id())
    )
  );

create policy "insert_gestor" on public.clientes
  for insert to authenticated
  with check ((select app_current_user_type()) = 'manager');

create policy "update_gestor" on public.clientes
  for update to authenticated
  using ((select app_current_user_type()) = 'manager')
  with check ((select app_current_user_type()) = 'manager');

create policy "delete_gestor" on public.clientes
  for delete to authenticated
  using ((select app_current_user_type()) = 'manager');

-- collection_attempts
drop policy "dono_ou_gestor" on public.collection_attempts;
create policy "dono_ou_gestor" on public.collection_attempts
  for all to authenticated
  using (
    (select app_current_user_type()) = 'manager'
    or exists (
      select 1 from public."BANCO_DADOS" b
      where b.id_parcela::text = collection_attempts.collection_id
        and b.user_id = (select app_current_user_id())
    )
  )
  with check (
    (select app_current_user_type()) = 'manager'
    or exists (
      select 1 from public."BANCO_DADOS" b
      where b.id_parcela::text = collection_attempts.collection_id
        and b.user_id = (select app_current_user_id())
    )
  );

-- allowed_visit_dates
drop policy "select_dono_ou_gestor" on public.allowed_visit_dates;
drop policy "escrita_gestor" on public.allowed_visit_dates;
drop policy "update_gestor" on public.allowed_visit_dates;
drop policy "delete_gestor" on public.allowed_visit_dates;

create policy "select_dono_ou_gestor" on public.allowed_visit_dates
  for select to authenticated
  using ((select app_current_user_type()) = 'manager' or collector_id = (select app_current_user_id()));
create policy "escrita_gestor" on public.allowed_visit_dates
  for insert to authenticated
  with check ((select app_current_user_type()) = 'manager');
create policy "update_gestor" on public.allowed_visit_dates
  for update to authenticated
  using ((select app_current_user_type()) = 'manager')
  with check ((select app_current_user_type()) = 'manager');
create policy "delete_gestor" on public.allowed_visit_dates
  for delete to authenticated
  using ((select app_current_user_type()) = 'manager');

-- monthly_goals
drop policy "select_dono_ou_gestor" on public.monthly_goals;
drop policy "insert_gestor" on public.monthly_goals;
drop policy "update_gestor" on public.monthly_goals;
drop policy "delete_gestor" on public.monthly_goals;

create policy "select_dono_ou_gestor" on public.monthly_goals
  for select to authenticated
  using ((select app_current_user_type()) = 'manager' or user_id = (select app_current_user_id()));
create policy "insert_gestor" on public.monthly_goals
  for insert to authenticated
  with check ((select app_current_user_type()) = 'manager');
create policy "update_gestor" on public.monthly_goals
  for update to authenticated
  using ((select app_current_user_type()) = 'manager')
  with check ((select app_current_user_type()) = 'manager');
create policy "delete_gestor" on public.monthly_goals
  for delete to authenticated
  using ((select app_current_user_type()) = 'manager');

-- authorization_history
drop policy "select_dono_ou_gestor" on public.authorization_history;
drop policy "insert_dono_ou_gestor" on public.authorization_history;
drop policy "update_gestor" on public.authorization_history;

create policy "select_dono_ou_gestor" on public.authorization_history
  for select to authenticated
  using (
    (select app_current_user_type()) = 'manager'
    or collector_id = (select app_current_user_id())
    or processed_by_id = (select app_current_user_id())
  );

create policy "insert_dono_ou_gestor" on public.authorization_history
  for insert to authenticated
  with check (
    (select app_current_user_type()) = 'manager'
    or collector_id = (select app_current_user_id())
  );

create policy "update_gestor" on public.authorization_history
  for update to authenticated
  using ((select app_current_user_type()) = 'manager')
  with check ((select app_current_user_type()) = 'manager');

notify pgrst, 'reload schema';
