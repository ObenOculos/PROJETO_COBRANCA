-- Permite desativar um usuario (ex.: cobrador demitido) sem apagar, preservando
-- o historico. Login bloqueado quando active = false. Default true para os
-- usuarios existentes continuarem ativos.
alter table "users"
  add column if not exists active boolean not null default true;
