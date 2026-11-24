-- Desconto do acordo acima do maximo: cobrador pede liberacao ao gestor
-- (2026-11-24).
--
-- Antes: o AcordoModal barrava o desconto acima de
-- acordo_configuracao_padrao.desconto_maximo_percentual so na tela ("peca para
-- o gestor liberar") e o criar_acordo nao conferia nada -- nem o maximo, nem
-- se o desconto_valor dos titulos batia com o percentual.
--
-- Fluxo (decidido com o usuario, 2026-11-24):
--   1. Cobrador (interno/terceirizado/juridico) passa do maximo na etapa
--      Encargos -> "Pedir liberacao ao gestor" com motivo. O pedido vai para
--      pedidos_desconto com tipo 'acordo': titulos, percentual pedido, total
--      sem desconto (valor_devido) e total negociado (valor_pago). O modal
--      fecha (sem rascunho).
--   2. O gestor aprova o percentual pedido ou menor, ou recusa com motivo, na
--      mesma tela de pedidos de desconto. Aprovado vale 3 dias.
--   3. O cobrador refaz o acordo do cliente; o maximo dele passa a ser o
--      percentual aprovado. O criar_acordo confere e liga o acordo ao pedido
--      (acordos.pedido_desconto_id, um acordo por liberacao). Acordo
--      cancelado nao devolve a liberacao: pede de novo.
--   O gestor nao tem limite de desconto no acordo, inclusive em nome de.
--
-- Tambem: liberacao de acordo nao vale como desconto no Receber pagamento
-- (process_payment passa a olhar o tipo), e sai o criar_acordo antigo de 3
-- argumentos (sem uso no front, aceitava qualquer desconto).

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------
ALTER TABLE public.pedidos_desconto
  DROP CONSTRAINT pedidos_desconto_tipo_check;
ALTER TABLE public.pedidos_desconto
  ADD CONSTRAINT pedidos_desconto_tipo_check
  CHECK (tipo IN ('parcelas', 'tudo', 'acordo'));

ALTER TABLE public.pedidos_desconto
  ADD COLUMN desconto_percentual_pedido numeric(5, 2),
  ADD COLUMN desconto_percentual_aprovado numeric(5, 2);

ALTER TABLE public.pedidos_desconto
  ADD CONSTRAINT pedidos_desconto_acordo_percentual_check CHECK (
    (tipo = 'acordo') = (desconto_percentual_pedido IS NOT NULL)
    AND (desconto_percentual_pedido IS NULL
         OR (desconto_percentual_pedido > 0 AND desconto_percentual_pedido < 100))
  ),
  ADD CONSTRAINT pedidos_desconto_acordo_aprovado_check CHECK (
    (tipo = 'acordo' AND decisao IS NOT DISTINCT FROM 'aprovado')
      = (desconto_percentual_aprovado IS NOT NULL)
    AND (desconto_percentual_aprovado IS NULL
         OR (desconto_percentual_aprovado > 0
             AND desconto_percentual_aprovado <= desconto_percentual_pedido))
  );

COMMENT ON COLUMN public.pedidos_desconto.desconto_percentual_pedido IS
  'So tipo acordo: percentual de desconto pedido sobre o total (saldo + multa + juros) dos titulos.';
COMMENT ON COLUMN public.pedidos_desconto.desconto_percentual_aprovado IS
  'So tipo acordo aprovado: percentual maximo liberado pelo gestor (o pedido ou menor).';

-- Um pedido em analise por cobrador e cliente -- separado entre acordo e
-- pagamento (um nao bloqueia o outro).
DROP INDEX public.pedidos_desconto_aberto_uidx;
CREATE UNIQUE INDEX pedidos_desconto_aberto_uidx
  ON public.pedidos_desconto (documento, solicitado_por_id, (tipo = 'acordo'))
  WHERE decisao IS NULL;

-- Acordo que usou a liberacao (so o criar_acordo preenche). Uma liberacao,
-- um acordo.
ALTER TABLE public.acordos
  ADD COLUMN pedido_desconto_id uuid REFERENCES public.pedidos_desconto(id);
CREATE UNIQUE INDEX acordos_pedido_desconto_uidx
  ON public.acordos (pedido_desconto_id)
  WHERE pedido_desconto_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Pedido do cobrador. Devolve o id.
-- p_valor_bruto = saldo + multa + juros dos titulos, como a tela calculou
-- (contexto para o gestor; a trava de verdade e o percentual no criar_acordo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedir_desconto_acordo(
  p_documento text,
  p_titulos bigint[],
  p_desconto_percentual numeric,
  p_valor_bruto numeric,
  p_motivo text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      uuid := (SELECT app_current_user_id());
  v_tipo_eu text := (SELECT app_current_user_type());
  v_pct     numeric := round(p_desconto_percentual, 2);
  v_bruto   numeric := round(p_valor_bruto, 2);
  v_saldo   numeric;
  v_max     numeric;
  v_qtd     integer;
  v_id      uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Usuário não identificado. Entre de novo no app.';
  END IF;
  IF v_tipo_eu IS NOT DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'O gestor não tem limite de desconto no acordo.';
  END IF;
  IF v_tipo_eu IS NULL
     OR v_tipo_eu NOT IN ('internal_collector', 'third_party_collector', 'legal_collector') THEN
    RAISE EXCEPTION 'Perfil sem permissão para criar acordo.';
  END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Explique ao gestor por que o desconto.';
  END IF;
  IF v_pct IS NULL OR v_pct <= 0 OR v_pct >= 100 THEN
    RAISE EXCEPTION 'Percentual de desconto inválido.';
  END IF;
  IF p_titulos IS NULL OR cardinality(p_titulos) = 0 THEN
    RAISE EXCEPTION 'Selecione os títulos do acordo.';
  END IF;
  IF public.cliente_tem_acordo_ativo(p_documento) THEN
    RAISE EXCEPTION 'Este cliente já tem um acordo ativo.';
  END IF;

  SELECT COALESCE(max(c.desconto_maximo_percentual), 0) INTO v_max
  FROM public.acordo_configuracao_padrao c
  WHERE c.vigente_ate IS NULL;
  IF v_pct <= v_max + 0.001 THEN
    RAISE EXCEPTION 'Este desconto já está dentro do máximo: não precisa pedir.';
  END IF;

  -- Todos os titulos do cliente e em aberto.
  SELECT count(*) INTO v_qtd
  FROM public."BANCO_DADOS" b
  WHERE b.documento = p_documento
    AND b.id_parcela = ANY (p_titulos)
    AND (COALESCE(b.valor_recebido, 0) + COALESCE(b.desconto, 0)) < COALESCE(b.valor_original, 0)
    AND lower(trim(COALESCE(b.status, ''))) NOT IN ('cancelado', 'agrupado', 'renegociado');
  IF v_qtd <> (SELECT count(DISTINCT x) FROM unnest(p_titulos) x) THEN
    RAISE EXCEPTION 'Algum título selecionado não está mais em aberto. Atualize a ficha.';
  END IF;

  v_saldo := public._saldo_para_desconto(p_documento, p_titulos);
  IF v_bruto IS NULL OR v_bruto < v_saldo - 0.01 THEN
    RAISE EXCEPTION 'Total dos títulos inválido.';
  END IF;

  INSERT INTO public.pedidos_desconto (
    documento, cliente, tipo, parcelas, valor_devido, valor_pago,
    desconto_pedido, desconto_percentual_pedido, motivo, solicitado_por_id
  ) VALUES (
    p_documento,
    (SELECT b.cliente FROM public."BANCO_DADOS" b WHERE b.documento = p_documento LIMIT 1),
    'acordo',
    p_titulos,
    v_bruto,
    round(v_bruto * (1 - v_pct / 100), 2),
    v_bruto - round(v_bruto * (1 - v_pct / 100), 2),
    v_pct,
    trim(p_motivo),
    v_eu
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Você já tem um pedido de desconto de acordo em análise para este cliente.';
END;
$function$;

REVOKE ALL ON FUNCTION public.pedir_desconto_acordo(text, bigint[], numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_desconto_acordo(text, bigint[], numeric, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Situacao da liberacao para o AcordoModal: do usuario logado, para o
-- cliente. Prioriza a aprovada, valida e nao usada; senao a mais recente.
-- NULL = nunca pediu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_desconto_acordo_atual(p_documento text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH p AS (
    SELECT d.*,
           EXISTS (SELECT 1 FROM public.acordos a WHERE a.pedido_desconto_id = d.id) AS usado
    FROM public.pedidos_desconto d
    WHERE d.tipo = 'acordo'
      AND d.documento = p_documento
      AND d.solicitado_por_id = (SELECT app_current_user_id())
  )
  SELECT jsonb_build_object(
           'id', p.id,
           'decisao', p.decisao,
           'percentual_pedido', p.desconto_percentual_pedido,
           'percentual_aprovado', p.desconto_percentual_aprovado,
           'valido_ate', p.valido_ate,
           'resposta', p.resposta,
           'usado', p.usado,
           'created_at', p.created_at)
  FROM p
  ORDER BY (p.decisao = 'aprovado'
            AND p.valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
            AND NOT p.usado) DESC NULLS LAST,
           p.created_at DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.pedido_desconto_acordo_atual(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_desconto_acordo_atual(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- decidir_pedido_desconto: corpo copiado de producao (pg_get_functiondef,
-- 2026-11-24) + parametro p_percentual_aprovado e ramo do acordo. A
-- assinatura muda, entao a antiga sai (o front chama por nome).
-- ---------------------------------------------------------------------------
DROP FUNCTION public.decidir_pedido_desconto(uuid, boolean, numeric, text);

CREATE OR REPLACE FUNCTION public.decidir_pedido_desconto(p_id uuid, p_aprovar boolean, p_desconto_aprovado numeric DEFAULT NULL::numeric, p_resposta text DEFAULT NULL::text, p_percentual_aprovado numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu    uuid := (SELECT app_current_user_id());
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ped   public.pedidos_desconto%ROWTYPE;
  v_valor numeric;
  v_pct   numeric;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  SELECT * INTO v_ped FROM public.pedidos_desconto WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_ped.decisao IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido já foi decidido.';
  END IF;

  IF NOT p_aprovar THEN
    IF NULLIF(trim(p_resposta), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o motivo da recusa.';
    END IF;
    UPDATE public.pedidos_desconto
    SET decisao = 'recusado', resposta = trim(p_resposta),
        decidido_por_id = v_eu, decidido_em = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('decisao', 'recusado');
  END IF;

  -- Acordo (2026-11-24): o gestor aprova um PERCENTUAL (o pedido ou menor);
  -- o valor em R$ fica como retrato sobre o total do pedido.
  IF v_ped.tipo = 'acordo' THEN
    v_pct := round(COALESCE(p_percentual_aprovado, v_ped.desconto_percentual_pedido), 2);
    IF v_pct <= 0 THEN
      RAISE EXCEPTION 'O desconto aprovado precisa ser maior que zero.';
    END IF;
    IF v_pct > v_ped.desconto_percentual_pedido + 0.001 THEN
      RAISE EXCEPTION 'O percentual aprovado não pode passar do pedido pelo cobrador.';
    END IF;
    v_valor := round(v_ped.valor_devido * v_pct / 100, 2);
    IF v_valor <= 0 THEN
      RAISE EXCEPTION 'O desconto aprovado precisa ser maior que zero.';
    END IF;

    UPDATE public.pedidos_desconto
    SET decisao = 'aprovado', desconto_aprovado = v_valor,
        desconto_percentual_aprovado = v_pct,
        valido_ate = v_hoje + 3,
        resposta = NULLIF(trim(p_resposta), ''),
        decidido_por_id = v_eu, decidido_em = now()
    WHERE id = p_id;

    RETURN jsonb_build_object('decisao', 'aprovado', 'desconto', v_valor,
                              'percentual', v_pct, 'valido_ate', v_hoje + 3);
  END IF;

  v_valor := round(COALESCE(p_desconto_aprovado, v_ped.desconto_pedido), 2);
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'O desconto aprovado precisa ser maior que zero.';
  END IF;
  IF v_valor >= v_ped.valor_devido THEN
    RAISE EXCEPTION 'O desconto aprovado não pode ser o valor devido inteiro.';
  END IF;

  UPDATE public.pedidos_desconto
  SET decisao = 'aprovado', desconto_aprovado = v_valor,
      valido_ate = v_hoje + 3,
      resposta = NULLIF(trim(p_resposta), ''),
      decidido_por_id = v_eu, decidido_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('decisao', 'aprovado', 'desconto', v_valor,
                            'valido_ate', v_hoje + 3);
END;
$function$;

REVOKE ALL ON FUNCTION public.decidir_pedido_desconto(uuid, boolean, numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_pedido_desconto(uuid, boolean, numeric, text, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- criar_acordo (12 args): corpo copiado de producao (pg_get_functiondef,
-- 2026-11-24). Muda so a conferencia do desconto e o pedido_desconto_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_acordo(p_client_document text, p_titulos jsonb, p_parcelas jsonb, p_multa_percentual_aplicado numeric DEFAULT 0, p_juros_percentual_am_aplicado numeric DEFAULT 0, p_desconto_percentual_aplicado numeric DEFAULT 0, p_forma_pagamento_parcelas text DEFAULT NULL::text, p_testemunha1_nome text DEFAULT NULL::text, p_testemunha1_cpf text DEFAULT NULL::text, p_testemunha2_nome text DEFAULT NULL::text, p_testemunha2_cpf text DEFAULT NULL::text, p_em_nome_de uuid DEFAULT NULL::uuid)
 RETURNS acordos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Quem fez (autor -> created_by_id) e em nome de quem fica (responsavel
  -- -> collector_id: acompanha e recebe o credito). So o gestor escolhe.
  v_autor uuid := (SELECT app_current_user_id());
  v_collector_id uuid := v_autor;
  v_user_type text := (SELECT app_current_user_type());
  v_client_name text;
  v_valor_negociado numeric;
  v_acordo public.acordos%ROWTYPE;
  v_elem jsonb;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_pct numeric := round(COALESCE(p_desconto_percentual_aplicado, 0), 2);
  v_max numeric;
  v_pedido_id uuid;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF v_user_type NOT IN ('internal_collector', 'third_party_collector', 'legal_collector', 'manager') THEN
    RAISE EXCEPTION 'Perfil sem permissão para criar acordo.';
  END IF;

  IF p_em_nome_de IS NOT NULL AND p_em_nome_de IS DISTINCT FROM v_autor THEN
    IF v_user_type IS DISTINCT FROM 'manager' THEN
      RAISE EXCEPTION 'Só o gestor pode fazer acordo em nome de outro usuário.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = p_client_document AND b.user_id = p_em_nome_de
    ) THEN
      RAISE EXCEPTION 'Este cliente não está na carteira do cobrador escolhido.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = p_em_nome_de
        AND u.type IN ('internal_collector', 'third_party_collector', 'legal_collector')
    ) THEN
      RAISE EXCEPTION 'O cobrador escolhido não trabalha com acordos (perfil de visita).';
    END IF;
    v_collector_id := p_em_nome_de;
  END IF;

  IF p_client_document IS NULL OR btrim(p_client_document) = '' THEN
    RAISE EXCEPTION 'Cliente não informado.';
  END IF;

  IF p_titulos IS NULL OR jsonb_array_length(p_titulos) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um título.';
  END IF;

  IF p_parcelas IS NULL OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma parcela.';
  END IF;

  IF public.cliente_tem_acordo_ativo(p_client_document) THEN
    RAISE EXCEPTION 'Este cliente já tem um acordo ativo. Resolva (cumprido/cancelado) antes de criar outro.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_titulos) t
    WHERE NOT EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.id_parcela = (t->>'collection_id')::bigint
        AND b.documento = p_client_document
    )
  ) THEN
    RAISE EXCEPTION 'Um ou mais títulos informados não pertencem a este cliente.';
  END IF;

  -- Desconto do acordo (2026-11-24). Antes so a tela conferia o maximo;
  -- agora o banco confere: o desconto de cada titulo bate com o percentual,
  -- as parcelas cobrem o total negociado e o percentual respeita o maximo
  -- da configuracao -- ou uma liberacao do gestor aprovada, dentro da
  -- validade e ainda nao usada (pedidos_desconto tipo 'acordo'). O gestor
  -- nao tem limite (decisao do usuario, 2026-11-24), inclusive em nome de.
  IF v_pct < 0 OR v_pct >= 100 THEN
    RAISE EXCEPTION 'Percentual de desconto inválido.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_titulos) t
    WHERE COALESCE((t->>'desconto_valor')::numeric, 0) < 0
       OR COALESCE((t->>'multa_valor')::numeric, 0) < 0
       OR COALESCE((t->>'juros_valor')::numeric, 0) < 0
       OR COALESCE((t->>'desconto_valor')::numeric, 0) >
          round((COALESCE((t->>'saldo_no_momento')::numeric, 0)
                 + COALESCE((t->>'multa_valor')::numeric, 0)
                 + COALESCE((t->>'juros_valor')::numeric, 0)) * v_pct / 100, 2) + 0.01
  ) THEN
    RAISE EXCEPTION 'O desconto dos títulos não bate com o percentual informado.';
  END IF;

  IF (SELECT COALESCE(sum((e->>'valor_parcela')::numeric), 0)
      FROM jsonb_array_elements(p_parcelas) e)
     < (SELECT COALESCE(sum(COALESCE((t->>'saldo_no_momento')::numeric, 0)
                            + COALESCE((t->>'multa_valor')::numeric, 0)
                            + COALESCE((t->>'juros_valor')::numeric, 0)
                            - COALESCE((t->>'desconto_valor')::numeric, 0)), 0)
        FROM jsonb_array_elements(p_titulos) t) - 0.05 THEN
    RAISE EXCEPTION 'A soma das parcelas é menor que o total negociado.';
  END IF;

  IF v_user_type IS DISTINCT FROM 'manager' AND v_pct > 0 THEN
    SELECT COALESCE(max(c.desconto_maximo_percentual), 0) INTO v_max
    FROM public.acordo_configuracao_padrao c
    WHERE c.vigente_ate IS NULL;

    IF v_pct > v_max + 0.001 THEN
      SELECT d.id INTO v_pedido_id
      FROM public.pedidos_desconto d
      WHERE d.tipo = 'acordo'
        AND d.documento = p_client_document
        AND d.solicitado_por_id = v_autor
        AND d.decisao = 'aprovado'
        AND d.valido_ate >= v_hoje
        AND d.desconto_percentual_aprovado >= v_pct - 0.001
        AND NOT EXISTS (
          SELECT 1 FROM public.acordos a WHERE a.pedido_desconto_id = d.id
        )
      ORDER BY d.decidido_em DESC
      LIMIT 1
      FOR UPDATE OF d;

      IF v_pedido_id IS NULL THEN
        RAISE EXCEPTION '%', format(
          'O desconto (%s%%) passa do máximo permitido (%s%%) e não há liberação do gestor válida para este cliente. Peça a liberação no acordo.',
          v_pct, v_max);
      END IF;
    END IF;
  END IF;

  SELECT cliente INTO v_client_name
  FROM public."BANCO_DADOS"
  WHERE id_parcela = (p_titulos->0->>'collection_id')::bigint;

  SELECT SUM((elem->>'valor_parcela')::numeric) INTO v_valor_negociado
  FROM jsonb_array_elements(p_parcelas) elem;

  INSERT INTO public.acordos (
    client_document, client_name, collector_id, valor_negociado, numero_parcelas, created_by_id,
    multa_percentual_aplicado, juros_percentual_am_aplicado, desconto_percentual_aplicado,
    forma_pagamento_parcelas, testemunha1_nome, testemunha1_cpf, testemunha2_nome, testemunha2_cpf,
    pedido_desconto_id
  ) VALUES (
    p_client_document, v_client_name, v_collector_id, v_valor_negociado,
    jsonb_array_length(p_parcelas), v_autor,
    COALESCE(p_multa_percentual_aplicado, 0), COALESCE(p_juros_percentual_am_aplicado, 0),
    COALESCE(p_desconto_percentual_aplicado, 0),
    p_forma_pagamento_parcelas, p_testemunha1_nome, p_testemunha1_cpf, p_testemunha2_nome, p_testemunha2_cpf,
    v_pedido_id
  )
  RETURNING * INTO v_acordo;

  INSERT INTO public.acordo_titulos (
    acordo_id, collection_id, saldo_no_momento,
    dias_atraso_no_momento, multa_valor, juros_valor, desconto_valor
  )
  SELECT
    v_acordo.id,
    (t->>'collection_id')::bigint,
    (t->>'saldo_no_momento')::numeric,
    COALESCE((t->>'dias_atraso_no_momento')::integer, 0),
    COALESCE((t->>'multa_valor')::numeric, 0),
    COALESCE((t->>'juros_valor')::numeric, 0),
    COALESCE((t->>'desconto_valor')::numeric, 0)
  FROM jsonb_array_elements(p_titulos) t;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    INSERT INTO public.acordo_parcelas (acordo_id, numero, valor_parcela, data_vencimento)
    VALUES (
      v_acordo.id,
      (v_elem->>'numero')::integer,
      (v_elem->>'valor_parcela')::numeric,
      (v_elem->>'data_vencimento')::date
    );
  END LOOP;

  -- O trigger acima ja forcaria 'Em acordo' de qualquer forma (o acordo foi
  -- inserido 'ativo' logo acima), mas deixamos explicito por clareza.
  UPDATE public."BANCO_DADOS"
  SET situacao = 'Em acordo'
  WHERE documento = p_client_document;

  RETURN v_acordo;
END;
$function$;

-- ---------------------------------------------------------------------------
-- process_payment: corpo copiado de producao (pg_get_functiondef,
-- 2026-11-24). Muda so o filtro do tipo do pedido de desconto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment(p_collector_id uuid, p_client_document text, p_payment_amount numeric, p_discount_amount numeric DEFAULT 0, p_payment_method text DEFAULT 'dinheiro'::text, p_notes text DEFAULT ''::text, p_sale_number bigint DEFAULT NULL::bigint, p_juros_amount numeric DEFAULT 0, p_payment_date date DEFAULT NULL::date, p_parcelas bigint[] DEFAULT NULL::bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_payment_id uuid;
    v_remaining_payment numeric;
    v_remaining_discount numeric;
    v_total_pending_client numeric;
    v_installments_to_update record;
    v_client_name text;
    v_collector_name text;
    v_current_pending numeric;
    v_payment_to_apply numeric;
    v_discount_to_apply numeric;
    v_current_received numeric;
    v_current_discount numeric;
    v_current_original numeric;
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    -- Data em que o cliente PAGOU (informada por quem registra); o momento do
    -- registro continua em sale_payments.created_at.
    v_data date := COALESCE(p_payment_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    -- Item 71: autorizacao do gestor usada neste pagamento (NULL = sem desconto,
    -- ou desconto de quem pode dar direto).
    v_pedido_desconto uuid := NULL;
    -- Boleto pago fora de ordem (17/11): saldo das parcelas escolhidas.
    v_saldo_escolhidas numeric;
BEGIN
    IF v_data > v_hoje THEN
        RAISE EXCEPTION 'A data do pagamento não pode ser no futuro.';
    END IF;
    IF v_data < v_hoje - 30 THEN
        RAISE EXCEPTION 'A data do pagamento não pode ser anterior a 30 dias. Fale com o gestor.';
    END IF;

    -- Juros/multa cobrados do cliente: ficam so no registro do pagamento, NAO
    -- abatem parcela (o principal e p_payment_amount). Migration 20261109000008.
    IF COALESCE(p_juros_amount, 0) < 0 THEN
        RAISE EXCEPTION 'Juros/multa não pode ser negativo.';
    END IF;

    -- Item 69: desconto direto so do gestor ou do cobrador externo, que
    -- negocia na rua (decisao do usuario, 2026-11-16).
    -- Item 71: interno, terceirizado e juridico precisam de autorizacao do
    -- gestor aprovada, dentro da validade, pedida por quem registra, para este
    -- cliente e com saldo (aprovado - ja usado) que cubra o desconto. Sessao
    -- sem login (NULL) e barrada (nao tem usuario para casar o pedido).
    IF COALESCE(p_discount_amount, 0) > 0
       AND COALESCE((SELECT app_current_user_type()), '') NOT IN ('manager', 'collector') THEN
        -- Dois pagamentos simultaneos nao gastam a mesma autorizacao duas
        -- vezes. Trava por cliente ate o fim da transacao (process_payment
        -- roda com a permissao de quem chama, sem UPDATE na tabela -- por
        -- isso nao da para usar SELECT ... FOR UPDATE).
        PERFORM pg_advisory_xact_lock(hashtext('pedido_desconto:' || p_client_document));
        SELECT d.id INTO v_pedido_desconto
        FROM public.pedidos_desconto d
        WHERE d.documento = p_client_document
          -- Liberacao de desconto de ACORDO nao vale no Receber pagamento.
          AND d.tipo IN ('parcelas', 'tudo')
          AND d.solicitado_por_id = (SELECT app_current_user_id())
          AND d.decisao = 'aprovado'
          AND d.valido_ate >= v_hoje
          AND d.desconto_aprovado - COALESCE((
                -- discount_amount e real (float): converte antes de somar.
                SELECT round(sum(sp.discount_amount::numeric), 2)
                FROM public.sale_payments sp
                WHERE sp.pedido_desconto_id = d.id
              ), 0) >= round(p_discount_amount, 2) - 0.009
        ORDER BY d.decidido_em DESC
        LIMIT 1;

        IF v_pedido_desconto IS NULL THEN
            RAISE EXCEPTION 'Desconto sem autorização do gestor (ou maior que o autorizado, ou vencida). Peça o desconto ao gestor no Receber pagamento.';
        END IF;
    END IF;

    -- Boleto pago fora de ordem (2026-11-17): p_parcelas aponta as parcelas
    -- que o cliente pagou; so elas sao abatidas (as mais antigas em aberto
    -- continuam abertas). Todas precisam ser deste cliente/venda, estar em
    -- aberto e fora de acordo ativo, e o valor nao pode passar do saldo delas
    -- (senao sobraria dinheiro registrado sem abater nada).
    IF p_parcelas IS NOT NULL THEN
        IF cardinality(p_parcelas) = 0 THEN
            RAISE EXCEPTION 'Escolha a parcela que o cliente pagou.';
        END IF;
        IF (
            SELECT count(*)
            FROM public."BANCO_DADOS"
            WHERE id_parcela = ANY (p_parcelas)
              AND documento = p_client_document
              AND (
                p_sale_number IS NULL
                OR (
                  p_sale_number > 0 AND (
                    numero_titulo = p_sale_number
                    OR (numero_titulo IS NULL AND venda_n = p_sale_number)
                  )
                )
                OR (p_sale_number = 0 AND numero_titulo IS NULL AND venda_n IS NULL)
              )
              AND (COALESCE(valor_recebido, 0) + COALESCE(desconto, 0)) < COALESCE(valor_original, 0)
              AND NOT public.titulo_em_acordo_ativo(id_parcela)
        ) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_parcelas))) THEN
            RAISE EXCEPTION 'Parcela escolhida não está em aberto para este cliente (ou está em acordo ativo).';
        END IF;
        SELECT SUM(COALESCE(valor_original, 0) - COALESCE(valor_recebido, 0) - COALESCE(desconto, 0))
          INTO v_saldo_escolhidas
        FROM public."BANCO_DADOS"
        WHERE id_parcela = ANY (p_parcelas);
        IF COALESCE(p_payment_amount, 0) + COALESCE(p_discount_amount, 0) > v_saldo_escolhidas + 0.01 THEN
            RAISE EXCEPTION 'O valor passa do saldo da parcela escolhida.';
        END IF;
    END IF;

    -- Get client and collector names
    SELECT cliente INTO v_client_name FROM public."BANCO_DADOS" WHERE documento = p_client_document LIMIT 1;
    SELECT name INTO v_collector_name FROM public.users WHERE id = p_collector_id LIMIT 1;

    -- Sem isto, um cliente cuja divida esteja inteiramente dentro de um
    -- acordo ativo geraria um sale_payments "fantasma" (credita merito ao
    -- cobrador) sem abater nada de verdade em nenhum titulo.
    IF NOT EXISTS (
        SELECT 1
        FROM public."BANCO_DADOS"
        WHERE documento = p_client_document
          AND (
            p_sale_number IS NULL
            OR (
              p_sale_number > 0 AND (
                numero_titulo = p_sale_number
                OR (numero_titulo IS NULL AND venda_n = p_sale_number)
              )
            )
            OR (p_sale_number = 0 AND numero_titulo IS NULL AND venda_n IS NULL)
          )
          AND (COALESCE(valor_recebido, 0) + COALESCE(desconto, 0)) < COALESCE(valor_original, 0)
          AND NOT public.titulo_em_acordo_ativo(id_parcela)
    ) THEN
        RAISE EXCEPTION 'Não há títulos disponíveis para pagamento direto (podem estar vinculados a um acordo ativo). Registre o pagamento pela tela do acordo.';
    END IF;

    -- Insert into sale_payments
    INSERT INTO public.sale_payments (
        collector_id,
        client_document,
        payment_amount,
        discount_amount,
        payment_method,
        notes,
        sale_number,
        client_name,
        collector_name,
        juros_amount,
        payment_date,
        pedido_desconto_id
    ) VALUES (
        p_collector_id,
        p_client_document,
        p_payment_amount,
        p_discount_amount,
        p_payment_method,
        p_notes,
        p_sale_number,
        v_client_name,
        v_collector_name,
        round(COALESCE(p_juros_amount, 0), 2),
        v_data,
        v_pedido_desconto
    )
    RETURNING id INTO v_payment_id;

    -- As mudancas de parcela abaixo sao registradas em recebimentos_historico
    -- como origem 'app', ligadas a este pagamento.
    PERFORM set_config('cobranca.origem', 'app', true);
    PERFORM set_config('cobranca.sale_payment_id', v_payment_id::text, true);

    v_remaining_payment := p_payment_amount;
    v_remaining_discount := p_discount_amount;

    -- Loop through pending installments for the client.
    -- Seleção da venda por numero_titulo (fallback venda_n); 0 = avulsa.
    -- Titulos vinculados a acordo ativo ficam de fora (ver RAISE acima e
    -- migration 20261102000005).
    FOR v_installments_to_update IN
        SELECT id_parcela, valor_original, valor_recebido, desconto, venda_n
        FROM public."BANCO_DADOS"
        WHERE documento = p_client_document
          AND (
            p_sale_number IS NULL -- General payment (todas as parcelas)
            OR (
              p_sale_number > 0 AND (
                numero_titulo = p_sale_number
                OR (numero_titulo IS NULL AND venda_n = p_sale_number) -- fallback
              )
            )
            OR (p_sale_number = 0 AND numero_titulo IS NULL AND venda_n IS NULL) -- avulsa
          )
          AND (COALESCE(valor_recebido, 0) + COALESCE(desconto, 0)) < COALESCE(valor_original, 0)
          AND NOT public.titulo_em_acordo_ativo(id_parcela)
          AND (p_parcelas IS NULL OR id_parcela = ANY (p_parcelas))
        ORDER BY data_vencimento ASC, id_parcela ASC
    LOOP
        -- Colunas ja sao numeric (migration 20261102000004) -- sem parsing de texto.
        v_current_original := COALESCE(v_installments_to_update.valor_original, 0);
        v_current_received := COALESCE(v_installments_to_update.valor_recebido, 0);
        v_current_discount := COALESCE(v_installments_to_update.desconto, 0);

        v_current_pending := v_current_original - v_current_received - v_current_discount;

        -- Apply discount first
        IF v_remaining_discount > 0 AND v_current_pending > 0 THEN
            v_discount_to_apply := LEAST(v_remaining_discount, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET desconto = round(v_current_discount + v_discount_to_apply, 2)
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_discount := v_remaining_discount - v_discount_to_apply;
            v_current_pending := v_current_pending - v_discount_to_apply;
            v_current_discount := v_current_discount + v_discount_to_apply;
        END IF;

        -- Apply payment
        IF v_remaining_payment > 0 AND v_current_pending > 0 THEN
            v_payment_to_apply := LEAST(v_remaining_payment, v_current_pending);

            UPDATE public."BANCO_DADOS"
            SET valor_recebido = round(v_current_received + v_payment_to_apply, 2),
                data_de_recebimento = v_data
            WHERE id_parcela = v_installments_to_update.id_parcela;

            v_remaining_payment := v_remaining_payment - v_payment_to_apply;
            v_current_pending := v_current_pending - v_payment_to_apply;
            v_current_received := v_current_received + v_payment_to_apply;
        END IF;

        -- Update status based on the final state of the installment
        UPDATE public."BANCO_DADOS"
        SET status = CASE
                        WHEN v_current_pending <= 0.01 THEN 'Pago'
                        WHEN (v_current_received + v_current_discount) > 0 THEN 'Pago Parcial'
                        ELSE 'Em atraso'
                     END
        WHERE id_parcela = v_installments_to_update.id_parcela;

        -- Exit loop if payment and discount are fully distributed
        IF v_remaining_payment <= 0 AND v_remaining_discount <= 0 THEN
            EXIT;
        END IF;
    END LOOP;

    -- Valor em aberto do cliente nas visitas AINDA EM ABERTO. Visitas fechadas
    -- guardam o valor do momento em que aconteceram. Mantem TODOS os titulos
    -- (inclusive os de acordo ativo) -- e "quanto o cliente deve no total",
    -- nao "quanto pode ser pago por aqui".
    SELECT SUM(COALESCE(valor_original, 0) - COALESCE(valor_recebido, 0) - COALESCE(desconto, 0)) INTO v_total_pending_client
    FROM public."BANCO_DADOS"
    WHERE documento = p_client_document;

    UPDATE public.scheduled_visits
    SET total_pending_value = v_total_pending_client
    WHERE client_document = p_client_document
      AND status IN ('agendada', 'cancelamento_solicitado');

END;
$function$;

-- ---------------------------------------------------------------------------
-- criar_acordo antigo (3 argumentos, de antes dos encargos): o front so usa o
-- de 12; este aceitava desconto_valor livre nos titulos.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.criar_acordo(text, jsonb, jsonb);
