-- Importação do contas a receber da SSÓtica num lugar só (item 52).
--
-- ANTES (até 2026-11-11): 11 scripts Selenium + Renomear/Organizar_Colunas +
-- Juntar_Excel_Vencidos_E_Pagos + Formatar_Para_Banco_de_Dados + dois cards
-- da tela Upload ("Novas parcelas" e "Atualizar status"), cada passo com uma
-- parte das regras. Agora o script scripts/ssotica/contas_receber_ssotica.py
-- baixa e trata, e esta função aplica — as regras de negócio ficam AQUI, e a
-- tela de upload passa a chamar a mesma função.
--
-- p_linhas: array de parcelas como vêm da SSÓtica, já tipadas pelo cliente
-- (datas 'YYYY-MM-DD', valores numéricos, ids inteiros). Chaves = colunas de
-- BANCO_DADOS + contatos do cliente (apelido, telefone, celular, celular1,
-- celular2, email). Obrigatórios: id_parcela, status.
--
-- Regras (vinham do Juntar_Excel_Vencidos_E_Pagos.py):
--   - status aceito: Pago, Pago Parcial, Em atraso, A vencer, Renegociado
--     (outro -> ignora);
--   - Pago: valor_recebido = valor_original (o que passou é juros/multa);
--   - Pago Parcial: desconto = valor_original - valor_recebido (a SSÓtica
--     joga o resto numa parcela nova; aqui ele não fica "em aberto");
--   - valor_reajustado, multa, juros_por_dia, multa_aplicada, juros_aplicado:
--     sempre vazios.
--
-- Renegociado (situação RE da SSÓtica; o script baixa à parte, não vai para o
-- Power BI): a SSÓtica marca a PRÓPRIA parcela antiga e cria parcelas novas
-- ("Renegociação de Parcelas", sem número de venda), que chegam como novas.
-- Casamento pelo id_parcela -- exato, sem depender de venda/observação. Mesma
-- convenção do Ciclone (src/types/status.ts isRenegociado): status
-- 'Renegociado' e desconto = saldo, recebido intacto -> sai da carteira, do
-- atraso e da distribuição (todas usam o saldo) sem inventar recebimento.
--   - só parcela EM ABERTO no app; paga/cancelada/já renegociada: nada;
--   - não existe no app: não entra (renegociada antes de chegar ao app);
--   - com pagamento do app (cobrador/acordo): "pago_no_app" para conferência.
-- (2026-11-12: 342 parcelas, R$ 44 mil, cobradas em dobro com as novas.)
--
-- Parcela nova: cria o cadastro do cliente (com contatos) antes, por causa da
-- FK, e o 1º endereço em enderecos_historico; o cobrador vem do gatilho
-- parcela_herda_cobrador.
--
-- Parcela existente: só os campos que mudaram (rodar de novo = 0 updates).
-- data_vencimento/data_de_recebimento/valor_original vazios não apagam o que
-- há. Não mexe em (devolve em "ignoradas"):
--   - cancelado_no_app: o app cancelou (cancelados_ssotica.py ou gestor);
--   - acordo_ativo: o gatilho barraria; quem mexe é o acordo;
--   - pago_no_app: a última mudança de recebido veio do app (cobrador/acordo)
--     e a SSÓtica tiraria o pagamento (recebido menor ou pago -> em aberto).
--     É a loja que ainda não deu baixa; quando der, a próxima rodada alinha.
--
-- Quem chama: o script (service_role) ou um gestor (tela de upload).
--
-- recebimentos_historico ganha a origem 'ssotica' (antes caía em
-- 'erp_ou_manual'); lojas_ultima_baixa_externa já conta tudo que não é 'app'.

ALTER TABLE public.recebimentos_historico
  DROP CONSTRAINT recebimentos_historico_origem_check;
ALTER TABLE public.recebimentos_historico
  ADD CONSTRAINT recebimentos_historico_origem_check
  CHECK (origem = ANY (ARRAY['app'::text, 'erp_ou_manual'::text, 'foto_inicial'::text, 'acordo'::text,
                             'acordo_cancelado'::text, 'ssotica'::text]));

CREATE OR REPLACE FUNCTION public.importar_parcelas_ssotica(p_linhas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_inseridas integer := 0;
  v_atualizadas integer := 0;
  v_clientes integer := 0;
  v_enderecos integer := 0;
  v_recebidas integer := 0;
  v_reneg_fora integer := 0;
  v_renegociadas integer := 0;
  v_ignoradas jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     AND (SELECT public.app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem importar o contas a receber.';
  END IF;

  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'p_linhas deve ser um array JSON.';
  END IF;

  -- Recebimentos gravados aqui ficam com origem própria no histórico.
  PERFORM set_config('cobranca.origem', 'ssotica', true);

  CREATE TEMP TABLE _imp ON COMMIT DROP AS
  WITH bruto AS (
    SELECT DISTINCT ON ((e->>'id_parcela')::bigint)
           (e->>'id_parcela')::bigint                       AS id_parcela,
           NULLIF(trim(e->>'status'), '')                   AS status,
           NULLIF(trim(e->>'nome_da_loja'), '')             AS nome_da_loja,
           NULLIF(e->>'data_lancamento', '')::date          AS data_lancamento,
           NULLIF(e->>'data_vencimento', '')::date          AS data_vencimento,
           NULLIF(e->>'data_de_recebimento', '')::date      AS data_de_recebimento,
           round(NULLIF(e->>'valor_original', '')::numeric, 2) AS valor_original,
           round(NULLIF(e->>'valor_recebido', '')::numeric, 2) AS valor_recebido_ss,
           NULLIF(trim(e->>'tipo_de_cobranca'), '')         AS tipo_de_cobranca,
           NULLIF(e->>'numero_titulo', '')::bigint          AS numero_titulo,
           NULLIF(e->>'parcela', '')::bigint                AS parcela,
           NULLIF(trim(e->>'cliente'), '')                  AS cliente,
           NULLIF(trim(e->>'documento'), '')                AS documento,
           NULLIF(trim(e->>'endereco'), '')                 AS endereco,
           NULLIF(trim(e->>'numero'), '')                   AS numero,
           NULLIF(trim(e->>'bairro'), '')                   AS bairro,
           NULLIF(trim(e->>'complemento'), '')              AS complemento,
           NULLIF(trim(e->>'cep'), '')                      AS cep,
           NULLIF(trim(e->>'cidade'), '')                   AS cidade,
           NULLIF(trim(e->>'estado'), '')                   AS estado,
           NULLIF(trim(e->>'obs'), '')                      AS obs,
           NULLIF(trim(e->>'codigo_externo'), '')           AS codigo_externo,
           NULLIF(trim(e->>'descricao'), '')                AS descricao,
           NULLIF(e->>'venda_n', '')::bigint                AS venda_n,
           NULLIF(trim(e->>'convenio'), '')                 AS convenio,
           NULLIF(trim(e->>'apelido'), '')                  AS apelido,
           NULLIF(trim(e->>'telefone'), '')                 AS telefone,
           NULLIF(trim(e->>'celular'), '')                  AS celular,
           NULLIF(trim(e->>'celular1'), '')                 AS celular1,
           NULLIF(trim(e->>'celular2'), '')                 AS celular2,
           NULLIF(trim(e->>'email'), '')                    AS email
    FROM jsonb_array_elements(p_linhas) e
    WHERE NULLIF(e->>'id_parcela', '') IS NOT NULL
    ORDER BY (e->>'id_parcela')::bigint
  )
  SELECT b.*,
         CASE WHEN b.status = 'Pago' THEN b.valor_original
              ELSE b.valor_recebido_ss END                  AS valor_recebido,
         CASE WHEN b.status = 'Pago Parcial'
              THEN round(b.valor_original - COALESCE(b.valor_recebido_ss, 0), 2)
         END                                                AS desconto,
         x.id_parcela IS NOT NULL                           AS existe
  FROM bruto b
  LEFT JOIN public."BANCO_DADOS" x ON x.id_parcela = b.id_parcela;

  CREATE TEMP TABLE _ign (id_parcela bigint, motivo text) ON COMMIT DROP;

  INSERT INTO _ign
  SELECT id_parcela, 'status_desconhecido'
  FROM _imp
  WHERE status IS NULL OR status NOT IN ('Pago', 'Pago Parcial', 'Em atraso', 'A vencer', 'Renegociado');
  DELETE FROM _imp WHERE id_parcela IN (SELECT id_parcela FROM _ign);

  -- Renegociada que nunca entrou no app (ou já fora de cobrança lá): não é
  -- assunto do app. Só conta.
  SELECT count(*) INTO v_reneg_fora
  FROM _imp i
  LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = i.id_parcela
  WHERE i.status = 'Renegociado'
    AND (b.id_parcela IS NULL
         OR lower(trim(COALESCE(b.status, ''))) IN ('pago', 'pago parcial', 'cancelado', 'renegociado'));
  DELETE FROM _imp i
  WHERE i.status = 'Renegociado'
    AND (NOT i.existe
         OR EXISTS (SELECT 1 FROM public."BANCO_DADOS" b
                    WHERE b.id_parcela = i.id_parcela
                      AND lower(trim(COALESCE(b.status, ''))) IN ('pago', 'pago parcial', 'cancelado', 'renegociado')));

  -- ------------------------------------------------------------------ novas
  -- Cadastro antes da parcela (FK fk_banco_dados_documento). Primeira linha
  -- de cada documento vence. Cliente já cadastrado não é tocado.
  INSERT INTO public.clientes (nome, documento, apelido, telefone, celular, celular1, celular2, email)
  SELECT DISTINCT ON (i.documento)
         COALESCE(i.cliente, 'Cliente sem nome'), i.documento,
         i.apelido, i.telefone, i.celular, i.celular1, i.celular2, i.email
  FROM _imp i
  WHERE NOT i.existe
    AND i.documento IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.documento = i.documento)
  ORDER BY i.documento, i.id_parcela;
  GET DIAGNOSTICS v_clientes = ROW_COUNT;

  INSERT INTO public."BANCO_DADOS" (
    id_parcela, nome_da_loja, data_lancamento, data_vencimento, valor_original,
    valor_recebido, data_de_recebimento, desconto, tipo_de_cobranca,
    numero_titulo, parcela, status, cliente, documento, endereco, numero,
    bairro, complemento, cep, cidade, estado, obs, codigo_externo, descricao,
    venda_n, convenio
  )
  SELECT id_parcela, nome_da_loja, data_lancamento, data_vencimento, valor_original,
         valor_recebido, data_de_recebimento, desconto, tipo_de_cobranca,
         numero_titulo, parcela, status, cliente, documento, endereco, numero,
         bairro, complemento, cep, cidade, estado, obs, codigo_externo, descricao,
         venda_n, convenio
  FROM _imp
  WHERE NOT existe
  ORDER BY id_parcela
  ON CONFLICT (id_parcela) DO NOTHING;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;

  -- 1º endereço de quem ainda não tem histórico.
  INSERT INTO public.enderecos_historico (cliente_documento, logradouro, numero, bairro, cep, cidade, estado, complemento)
  SELECT DISTINCT ON (i.documento)
         i.documento, i.endereco, i.numero, i.bairro, i.cep, i.cidade, i.estado, i.complemento
  FROM _imp i
  WHERE NOT i.existe
    AND i.documento IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.enderecos_historico h WHERE h.cliente_documento = i.documento)
  ORDER BY i.documento, i.id_parcela;
  GET DIAGNOSTICS v_enderecos = ROW_COUNT;

  -- ------------------------------------------------------------- existentes
  -- Novo valor de cada campo (vazio da SSÓtica não apaga data/valor original).
  CREATE TEMP TABLE _upd ON COMMIT DROP AS
  SELECT b.id_parcela,
         b.status                                         AS status_app,
         b.valor_recebido                                 AS recebido_app,
         i.status,
         CASE WHEN i.status = 'Renegociado' THEN b.valor_original
              ELSE COALESCE(i.valor_original, b.valor_original) END AS valor_original,
         CASE WHEN i.status = 'Renegociado' THEN b.valor_recebido
              ELSE i.valor_recebido END                   AS valor_recebido,
         CASE WHEN i.status = 'Renegociado'
              THEN round(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0), 2)
              ELSE i.desconto END                         AS desconto,
         COALESCE(i.data_vencimento, b.data_vencimento)   AS data_vencimento,
         COALESCE(i.data_de_recebimento, b.data_de_recebimento) AS data_de_recebimento
  FROM _imp i
  JOIN public."BANCO_DADOS" b ON b.id_parcela = i.id_parcela
  WHERE i.existe
    AND (   b.status              IS DISTINCT FROM i.status
         OR (i.status <> 'Renegociado' AND (
                b.valor_original  IS DISTINCT FROM COALESCE(i.valor_original, b.valor_original)
             OR b.valor_recebido  IS DISTINCT FROM i.valor_recebido
             OR b.desconto        IS DISTINCT FROM i.desconto))
         OR b.data_vencimento     IS DISTINCT FROM COALESCE(i.data_vencimento, b.data_vencimento)
         OR b.data_de_recebimento IS DISTINCT FROM COALESCE(i.data_de_recebimento, b.data_de_recebimento)
         OR b.valor_reajustado IS NOT NULL OR b.multa IS NOT NULL OR b.juros_por_dia IS NOT NULL
         OR b.multa_aplicada IS NOT NULL OR b.juros_aplicado IS NOT NULL);

  INSERT INTO _ign
  SELECT u.id_parcela, 'cancelado_no_app'
  FROM _upd u
  WHERE lower(trim(COALESCE(u.status_app, ''))) = 'cancelado';

  INSERT INTO _ign
  SELECT u.id_parcela, 'acordo_ativo'
  FROM _upd u
  WHERE u.id_parcela NOT IN (SELECT id_parcela FROM _ign)
    AND public.titulo_em_acordo_ativo(u.id_parcela);

  INSERT INTO _ign
  SELECT u.id_parcela, 'pago_no_app'
  FROM _upd u
  WHERE u.id_parcela NOT IN (SELECT id_parcela FROM _ign)
    AND (   COALESCE(u.valor_recebido, 0) < COALESCE(u.recebido_app, 0)
         OR (u.status_app IN ('Pago', 'Pago Parcial') AND u.status IN ('Em atraso', 'A vencer'))
         OR (u.status = 'Renegociado' AND COALESCE(u.recebido_app, 0) > 0))
    AND (SELECT h.origem
         FROM public.recebimentos_historico h
         WHERE h.id_parcela = u.id_parcela
         ORDER BY h.registrado_em DESC, h.id DESC
         LIMIT 1) IN ('app', 'acordo');

  UPDATE public."BANCO_DADOS" b
  SET status              = u.status,
      valor_original      = u.valor_original,
      valor_recebido      = u.valor_recebido,
      desconto            = u.desconto,
      data_vencimento     = u.data_vencimento,
      data_de_recebimento = u.data_de_recebimento,
      valor_reajustado    = NULL,
      multa               = NULL,
      juros_por_dia       = NULL,
      multa_aplicada      = NULL,
      juros_aplicado      = NULL
  FROM _upd u
  WHERE b.id_parcela = u.id_parcela
    AND u.id_parcela NOT IN (SELECT id_parcela FROM _ign);
  GET DIAGNOSTICS v_atualizadas = ROW_COUNT;

  SELECT count(*) FILTER (WHERE u.status IN ('Pago', 'Pago Parcial')),
         count(*) FILTER (WHERE u.status = 'Renegociado')
  INTO v_recebidas, v_renegociadas
  FROM _upd u
  WHERE u.id_parcela NOT IN (SELECT id_parcela FROM _ign)
    AND u.status_app IS DISTINCT FROM u.status;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id_parcela', id_parcela, 'motivo', motivo) ORDER BY motivo, id_parcela), '[]'::jsonb)
  INTO v_ignoradas
  FROM _ign;

  RETURN jsonb_build_object(
    'recebidas', (SELECT count(*) FROM _imp) + v_reneg_fora
                 + (SELECT count(*) FROM _ign WHERE motivo = 'status_desconhecido'),
    'inseridas', v_inseridas,
    'atualizadas', v_atualizadas,
    'quitadas', v_recebidas,
    'renegociadas', v_renegociadas,
    'renegociadas_fora_do_app', v_reneg_fora,
    'clientes_novos', v_clientes,
    'enderecos_novos', v_enderecos,
    'ignoradas', v_ignoradas
  );
END;
$$;

COMMENT ON FUNCTION public.importar_parcelas_ssotica(jsonb) IS
  'Aplica o contas a receber da SSÓtica em BANCO_DADOS (script scripts/ssotica/contas_receber_ssotica.py ou tela de upload do gestor): insere novas com cadastro/endereço, atualiza só o que mudou, tira da cobrança a parcela renegociada na SSÓtica (status Renegociado, desconto = saldo); não mexe em Cancelado, acordo ativo nem pagamento do app ainda sem baixa na SSÓtica.';

REVOKE ALL ON FUNCTION public.importar_parcelas_ssotica(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_parcelas_ssotica(jsonb) TO authenticated, service_role;
