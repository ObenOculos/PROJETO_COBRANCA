-- Etapa 3 (fase 1/3) da reorganizacao do banco: BANCO_DADOS.documento passa a
-- ter FK de verdade para clientes(documento).
--
-- Integridade ja confirmada em produção antes desta migration (consulta
-- read-only via Management API, 2026-11-02): 16.751 documentos distintos em
-- BANCO_DADOS, todos existentes em clientes, zero orfaos. clientes.documento
-- ja tem UNIQUE (clientes_documento_key).
--
-- NOT VALID + VALIDATE CONSTRAINT em vez de ADD CONSTRAINT direto: a adicao
-- fica instantanea (so passa a checar linhas novas) e a validacao das 163 mil
-- linhas existentes usa lock leve (ShareUpdateExclusiveLock, nao bloqueia
-- leitura/escrita) em vez do ACCESS EXCLUSIVE que uma FK direta pediria por um
-- instante. Nao ha precedente desse padrao no projeto ainda, mas e o correto
-- pra tabela desse tamanho em produção.
--
-- Pre-requisito ja em produção (commit e26f30b): AddTituloModal.tsx e
-- DatabaseUpload.tsx passaram a garantir o cadastro em `clientes` ANTES de
-- inserir o titulo em BANCO_DADOS -- sem isso, esta FK quebraria a entrada de
-- qualquer documento inedito por esses dois caminhos.
--
-- ON DELETE RESTRICT: nao existe hoje nenhum fluxo que apaga `clientes'; travar
-- isso no banco e a postura correta pro dominio financeiro (nunca apagar o
-- lado "de quem" de um titulo). ON UPDATE CASCADE: documento e chave natural e
-- hoje nunca e alterado por codigo, mas mantem o mesmo padrao defensivo que
-- fk_banco_dados_user (FK para users) ja usa.

ALTER TABLE "BANCO_DADOS"
  ADD CONSTRAINT fk_banco_dados_documento
  FOREIGN KEY (documento) REFERENCES clientes(documento)
  ON UPDATE CASCADE ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE "BANCO_DADOS"
  VALIDATE CONSTRAINT fk_banco_dados_documento;
