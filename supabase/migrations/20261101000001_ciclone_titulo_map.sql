-- Mapa estavel de id_parcela para titulos importados do ERP Ciclone (loja
-- "FOCCO BRASIL"). id_parcela em BANCO_DADOS e bigint NOT NULL sem identity:
-- quem importa precisa atribuir um valor, e para a sincronizacao recorrente
-- esse valor precisa ser o MESMO a cada rodada (senao duplica a cada sync).
--
-- A sequence comeca bem acima do maior id_parcela hoje (71.701.702 em
-- 2026-11-01, planilhas Cedrus) para nao colidir com nenhuma loja existente.
--
-- fncrt_uuid (chave natural de cada parcela de titulo no Ciclone) e a chave
-- de entrada: 1a vez que o sync ve o titulo, grava aqui e ganha um
-- id_parcela novo; da em diante reusa sempre o mesmo.

CREATE SEQUENCE IF NOT EXISTS ciclone_id_parcela_seq
  START WITH 100000000
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS ciclone_titulo_map (
  fncrt_uuid uuid PRIMARY KEY,
  id_parcela bigint NOT NULL UNIQUE DEFAULT nextval('ciclone_id_parcela_seq'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE ciclone_id_parcela_seq OWNED BY ciclone_titulo_map.id_parcela;

-- RLS: so a sincronizacao (service_role) le/escreve aqui; nenhum perfil do
-- app precisa desta tabela (e so uma tabela tecnica de apoio ao import).
ALTER TABLE ciclone_titulo_map ENABLE ROW LEVEL SECURITY;
