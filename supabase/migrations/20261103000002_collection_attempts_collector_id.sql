-- Etapa 1 da iniciativa de metas/vinculo gerente-cobrador/carteira
-- automatica (ver memoria estado-metas-vinculo-carteira): collection_attempts
-- registrava QUE um contato foi feito, mas nao QUEM fez -- bloqueava
-- qualquer criterio de meta por cobrador baseado em "clientes contatados"
-- (ex: "sem nenhuma acao" precisa saber de quem e a acao).
--
-- Nullable: registros anteriores a esta coluna nao tem como ser
-- reconstituidos com autor, ficam null.
alter table public.collection_attempts
  add column if not exists collector_id uuid references public.users(id);

create index if not exists idx_collection_attempts_collector_id
  on public.collection_attempts (collector_id);

comment on column public.collection_attempts.collector_id is
  'Cobrador (users.id) que registrou o contato. Nulo em registros anteriores a esta coluna.';
