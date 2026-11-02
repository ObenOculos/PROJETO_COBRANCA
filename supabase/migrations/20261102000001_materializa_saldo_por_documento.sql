-- Materializa saldo_por_documento (era uma VIEW que recalculava
-- SUM(valor_original - valor_recebido - desconto) GROUP BY documento sobre
-- TODA a BANCO_DADOS a cada leitura -- confirmado com EXPLAIN ANALYZE que
-- isso e ~79% do custo de cada pagina de banco_dados_clientes_ativos/
-- _quitados). A carga do financeiro do Ciclone (+35.632 linhas) deixou esse
-- recalculo caro o bastante pra estourar statement_timeout (57014) em
-- paginas que antes funcionavam.
--
-- Projeto no plano gratuito do Supabase (compute compartilhado, sem
-- pg_cron) -- a correcao tem que ser algoritmica, nao "mais hardware" nem
-- refresh periodico por job agendado.
--
-- NAO e o anti-padrao "saldo decrementado": o gatilho sempre RECALCULA do
-- zero a soma das linhas daquele documento (nunca faz saldo = saldo - pago).
-- So move o recalculo de "a cada leitura, tabela inteira" para "a cada
-- escrita, 1 documento" (indexado por idx_banco_dados_documento).

-- ---------------------------------------------------------------------------
-- 1) Tabela + populacao inicial (mesma formula exata da view antiga)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saldo_por_documento_tbl (
  documento  text PRIMARY KEY,
  saldo      numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO saldo_por_documento_tbl (documento, saldo)
SELECT
  documento,
  SUM(
    COALESCE(NULLIF(REPLACE(valor_original, ',', '.'), '')::numeric, 0)
    - COALESCE(NULLIF(REPLACE(valor_recebido, ',', '.'), '')::numeric, 0)
    - COALESCE(NULLIF(REPLACE(desconto, ',', '.'), '')::numeric, 0)
  )
FROM "BANCO_DADOS"
WHERE lower(trim(COALESCE(status, ''))) <> 'cancelado'
GROUP BY documento
ON CONFLICT (documento) DO UPDATE SET saldo = EXCLUDED.saldo;

-- ---------------------------------------------------------------------------
-- 2) Gatilho: mantem a tabela em dia, so para o documento afetado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_atualiza_saldo_por_documento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc text;
BEGIN
  -- UPDATE que move o documento (nao deveria acontecer na pratica, mas se
  -- acontecer recalcula os dois lados).
  IF TG_OP = 'UPDATE' AND NEW.documento IS DISTINCT FROM OLD.documento
     AND OLD.documento IS NOT NULL THEN
    INSERT INTO saldo_por_documento_tbl (documento, saldo, updated_at)
    VALUES (
      OLD.documento,
      (SELECT COALESCE(SUM(
         COALESCE(NULLIF(REPLACE(b.valor_original, ',', '.'), '')::numeric, 0)
         - COALESCE(NULLIF(REPLACE(b.valor_recebido, ',', '.'), '')::numeric, 0)
         - COALESCE(NULLIF(REPLACE(b.desconto, ',', '.'), '')::numeric, 0)
       ), 0)
       FROM "BANCO_DADOS" b
       WHERE b.documento = OLD.documento
         AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'),
      now()
    )
    ON CONFLICT (documento) DO UPDATE
      SET saldo = EXCLUDED.saldo, updated_at = EXCLUDED.updated_at;
  END IF;

  v_doc := NEW.documento;
  IF v_doc IS NULL THEN
    RETURN NEW;
  END IF;

  -- COALESCE(SUM(...), 0) garante uma linha mesmo quando a ultima parcela do
  -- documento virar 'cancelado': sem isso o saldo ficaria com o valor antigo
  -- (stale) em vez de zerar.
  INSERT INTO saldo_por_documento_tbl (documento, saldo, updated_at)
  VALUES (
    v_doc,
    (SELECT COALESCE(SUM(
       COALESCE(NULLIF(REPLACE(b.valor_original, ',', '.'), '')::numeric, 0)
       - COALESCE(NULLIF(REPLACE(b.valor_recebido, ',', '.'), '')::numeric, 0)
       - COALESCE(NULLIF(REPLACE(b.desconto, ',', '.'), '')::numeric, 0)
     ), 0)
     FROM "BANCO_DADOS" b
     WHERE b.documento = v_doc
       AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'),
    now()
  )
  ON CONFLICT (documento) DO UPDATE
    SET saldo = EXCLUDED.saldo, updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_banco_dados_atualiza_saldo ON "BANCO_DADOS";
CREATE TRIGGER trg_banco_dados_atualiza_saldo
  AFTER INSERT OR UPDATE OF valor_original, valor_recebido, desconto, status, documento
  ON "BANCO_DADOS"
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_atualiza_saldo_por_documento();

-- ---------------------------------------------------------------------------
-- 3) View de compatibilidade: mesmo nome/formato de antes (mesmas 2 colunas,
-- documento/saldo) -- CREATE OR REPLACE preserva as views dependentes
-- (banco_dados_clientes_ativos/_quitados), nao precisa de CASCADE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW saldo_por_documento AS
SELECT documento, saldo FROM saldo_por_documento_tbl;

-- ---------------------------------------------------------------------------
-- 4) cliente_tem_saldo_aberto: mesma fonte unica, agora pela tabela.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cliente_tem_saldo_aberto(p_documento text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT s.saldo > 0.01 FROM saldo_por_documento_tbl s WHERE s.documento = p_documento),
    -- Documento sem linha na tabela (nunca apareceu em BANCO_DADOS): nao ha o
    -- que concluir; trata como "deve" para nunca cancelar visita de um
    -- documento que nao reconhecemos (mesma regra de seguranca de antes).
    true
  );
$$;
