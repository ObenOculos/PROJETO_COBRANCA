-- Acordo de renegociacao de divida ("negociacao"): parcelamento futuro
-- combinado com o cliente, separado do pagamento imediato que
-- GeneralPaymentModal ja cobre (receber agora, com desconto opcional).
--
-- Decidido com o usuario em 2026-10-30, aplicando os principios do dominio
-- financeiro (skill arquiteto-cobranca):
--   - Termos originais do acordo (valor_negociado, parcelas) sao imutaveis.
--   - Saldo de parcela de acordo e projecao do ledger de pagamentos, NUNCA
--     coluna propria decrementada (mesma licao do item 1c: situacao da
--     divida nao pode virar coluna que uma tela atualiza por conta propria).
--   - Pagamento/estorno sao o mesmo tipo de fato, nunca editado/apagado --
--     acordo_pagamentos espelha exatamente a convencao de sale_payments
--     (estorno = linha nova com valor negativo e estorno_de apontando pro
--     pagamento revertido, nunca UPDATE no original).
--   - Acordo nunca reabre: cancelado/quebrado fica assim; renegociar de novo
--     e sempre um acordo novo (acordo_origem_id encadeia, nao implementado
--     nesta primeira fatia por falta de uso ainda, mas a coluna ja existe).
--   - 1 titulo so pode estar em 1 acordo ATIVO por vez -- mesmo principio ja
--     aplicado a "1 visita ativa por cliente" (migration 20261030000004).
--
-- Regras de negocio combinadas com o usuario:
--   - So os perfis "carteira" (Interno/Terceirizado/Juridico = SPC) criam
--     acordo. Cobrador Externo fica de fora (logica de campo e diferente).
--   - Enquanto o acordo estiver 'ativo', BANCO_DADOS.situacao do cliente
--     fica travada em 'Em acordo': protegida contra a importacao da
--     planilha do ERP (DatabaseUpload.tsx faz UPDATE direto do navegador,
--     entao a trava tem que ser no banco, nao so no front) e contra
--     reatribuicao de carteira (atribuir_clientes_em_lote/
--     remover_cobrador_em_lote/liberar_cliente_da_carteira passam a pular
--     clientes com acordo ativo).
--   - Acordo vira 'quebrado' automaticamente quando alguma parcela passa de
--     15 dias de atraso sem quitar. Sem pg_cron configurado neste projeto
--     ainda -- marcar_acordos_quebrados() e chamada pelo front a cada
--     sessao (CollectionContext), nao e um job de banco agendado. Se isso
--     se mostrar insuficiente (sessao raramente aberta), migrar para
--     pg_cron depois.

-- 1) 'Em acordo' vira situacao valida.
ALTER TABLE public."BANCO_DADOS"
DROP CONSTRAINT IF EXISTS "BANCO_DADOS_situacao_check";

ALTER TABLE public."BANCO_DADOS"
ADD CONSTRAINT "BANCO_DADOS_situacao_check"
CHECK (
  situacao IN (
    'Em mãos',
    'Em tratamento',
    'Cobrança Interna',
    'Aguardando Interno',
    'Cobrança Terceirizada',
    'Aguardando Terceirizado',
    'Cobrança Jurídica',
    'Aguardando Jurídico',
    'Falecido',
    'Em acordo'
  ) OR situacao IS NULL
);

-- 2) Tabelas.
CREATE TABLE public.acordos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_document text NOT NULL,
  client_name text,
  collector_id uuid NOT NULL REFERENCES public.users(id),
  valor_negociado numeric NOT NULL CHECK (valor_negociado > 0),
  numero_parcelas integer NOT NULL CHECK (numero_parcelas > 0),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'cumprido', 'cancelado', 'quebrado')),
  motivo_cancelamento text,
  acordo_origem_id uuid REFERENCES public.acordos(id),
  created_by_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

COMMENT ON TABLE public.acordos IS
  'Acordo de renegociacao (parcelamento futuro combinado com o cliente). Termos originais imutaveis; status e o unico campo de ciclo de vida que muda, nunca reaberto depois de cancelado/quebrado -- renegociar e sempre um acordo novo.';

CREATE INDEX idx_acordos_client_document ON public.acordos (client_document);
CREATE INDEX idx_acordos_status ON public.acordos (status);

-- 1 acordo ATIVO por cliente (nao por titulo -- a trava de situacao e por
-- cliente inteiro, decidido com o usuario).
CREATE UNIQUE INDEX uniq_acordo_ativo_por_cliente
  ON public.acordos (client_document) WHERE status = 'ativo';

CREATE TABLE public.acordo_titulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acordo_id uuid NOT NULL REFERENCES public.acordos(id),
  collection_id bigint NOT NULL REFERENCES public."BANCO_DADOS"(id_parcela),
  saldo_no_momento numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (acordo_id, collection_id)
);

COMMENT ON TABLE public.acordo_titulos IS
  'N:N entre acordo e titulos de BANCO_DADOS consolidados nele. saldo_no_momento e fato historico de auditoria (capturado na criacao), nunca recalculado.';

CREATE INDEX idx_acordo_titulos_acordo_id ON public.acordo_titulos (acordo_id);
CREATE INDEX idx_acordo_titulos_collection_id ON public.acordo_titulos (collection_id);

CREATE TABLE public.acordo_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acordo_id uuid NOT NULL REFERENCES public.acordos(id),
  numero integer NOT NULL,
  valor_parcela numeric NOT NULL CHECK (valor_parcela > 0),
  data_vencimento date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (acordo_id, numero)
);

COMMENT ON TABLE public.acordo_parcelas IS
  'Parcelas futuras combinadas no acordo. Imutaveis uma vez criadas. Sem coluna de status "paga/atrasada": e projecao de acordo_pagamentos (ver saldo_acordo_parcela), igual a licao ja aplicada em BANCO_DADOS (item 1c).';

CREATE INDEX idx_acordo_parcelas_acordo_id ON public.acordo_parcelas (acordo_id);

CREATE TABLE public.acordo_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acordo_parcela_id uuid NOT NULL REFERENCES public.acordo_parcelas(id),
  valor_pago numeric NOT NULL,
  data_pagamento date NOT NULL,
  collector_id uuid REFERENCES public.users(id),
  notes text,
  estorno_de uuid REFERENCES public.acordo_pagamentos(id),
  motivo text,
  registrado_por_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (estorno_de IS NULL AND valor_pago > 0) OR
    (estorno_de IS NOT NULL AND valor_pago < 0)
  )
);

COMMENT ON TABLE public.acordo_pagamentos IS
  'Ledger append-only de pagamentos contra parcela de acordo. Espelha a convencao de sale_payments: pagamento normal e positivo, estorno e um registro novo com valor negativo apontando pro original via estorno_de -- nunca UPDATE/DELETE.';

CREATE INDEX idx_acordo_pagamentos_parcela_id ON public.acordo_pagamentos (acordo_parcela_id);

-- 3) RLS: mesmo padrao authenticated_full_access ja usado desde a Etapa 2a
-- (quem loga ve/mexe em tudo; carteira por perfil fica pra depois, igual ao
-- resto do sistema hoje).
ALTER TABLE public.acordos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_titulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_full_access ON public.acordos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.acordo_titulos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.acordo_parcelas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.acordo_pagamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Funcoes auxiliares (internas -- sem GRANT direto ao client, usadas por
-- trigger/RPCs abaixo).

CREATE OR REPLACE FUNCTION public.cliente_tem_acordo_ativo(p_documento text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acordos a
    WHERE a.client_document = p_documento AND a.status = 'ativo'
  );
$$;

COMMENT ON FUNCTION public.cliente_tem_acordo_ativo(text) IS
  'True quando o cliente (por documento) tem acordo de renegociacao ativo. Usada pra travar situacao e reatribuicao enquanto o acordo estiver em curso.';

CREATE OR REPLACE FUNCTION public.situacao_primaria_do_tipo(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'internal_collector' THEN 'Cobrança Interna'
    WHEN 'third_party_collector' THEN 'Cobrança Terceirizada'
    WHEN 'legal_collector' THEN 'Cobrança Jurídica'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.situacao_primaria_do_tipo(text) IS
  'Espelha PRIMARY_SITUACAO de src/config/profiles.ts (fonte unica no front). Usada pra devolver o cliente a fila normal do cobrador quando um acordo se resolve (cumprido/cancelado/quebrado).';

CREATE OR REPLACE FUNCTION public.saldo_acordo_parcela(p_parcela_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ap.valor_parcela - COALESCE((
    SELECT SUM(pg.valor_pago)
    FROM public.acordo_pagamentos pg
    WHERE pg.acordo_parcela_id = p_parcela_id
  ), 0)
  FROM public.acordo_parcelas ap
  WHERE ap.id = p_parcela_id;
$$;

COMMENT ON FUNCTION public.saldo_acordo_parcela(uuid) IS
  'Saldo em aberto de uma parcela de acordo = valor combinado - soma de acordo_pagamentos (estorno ja entra negativo, se soma naturalmente). Nunca coluna decrementada.';

-- 5) Trava de situacao: BEFORE UPDATE em BANCO_DADOS forca 'Em acordo'
-- sempre que o cliente tiver acordo ativo, nao importa quem mandou o
-- UPDATE (importacao da planilha, RPC de atribuicao, edicao manual). So
-- destrava quando o acordo deixa de estar ativo NA MESMA TRANSACAO antes
-- deste UPDATE rodar (e exatamente como as RPCs de resolucao abaixo
-- funcionam: mudam acordos.status primeiro, BANCO_DADOS.situacao depois).
CREATE OR REPLACE FUNCTION public.trg_protege_situacao_acordo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.situacao IS DISTINCT FROM OLD.situacao
     AND public.cliente_tem_acordo_ativo(NEW.documento)
  THEN
    NEW.situacao := 'Em acordo';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bancodados_protege_situacao_acordo ON public."BANCO_DADOS";
CREATE TRIGGER trg_bancodados_protege_situacao_acordo
BEFORE UPDATE ON public."BANCO_DADOS"
FOR EACH ROW
EXECUTE FUNCTION public.trg_protege_situacao_acordo();

-- 6) RPCs chamadas pelo front.

CREATE OR REPLACE FUNCTION public.criar_acordo(
  p_client_document text,
  p_titulos jsonb,   -- [{"collection_id": 123, "saldo_no_momento": 450.00}, ...]
  p_parcelas jsonb   -- [{"numero": 1, "valor_parcela": 150.00, "data_vencimento": "2026-12-10"}, ...]
)
RETURNS public.acordos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_client_name text;
  v_valor_negociado numeric;
  v_acordo public.acordos%ROWTYPE;
  v_elem jsonb;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF v_user_type NOT IN ('internal_collector', 'third_party_collector', 'legal_collector', 'manager') THEN
    RAISE EXCEPTION 'Perfil sem permissão para criar acordo.';
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

  SELECT cliente INTO v_client_name
  FROM public."BANCO_DADOS"
  WHERE id_parcela = (p_titulos->0->>'collection_id')::bigint;

  SELECT SUM((elem->>'valor_parcela')::numeric) INTO v_valor_negociado
  FROM jsonb_array_elements(p_parcelas) elem;

  INSERT INTO public.acordos (
    client_document, client_name, collector_id, valor_negociado, numero_parcelas, created_by_id
  ) VALUES (
    p_client_document, v_client_name, v_collector_id, v_valor_negociado,
    jsonb_array_length(p_parcelas), v_collector_id
  )
  RETURNING * INTO v_acordo;

  INSERT INTO public.acordo_titulos (acordo_id, collection_id, saldo_no_momento)
  SELECT v_acordo.id, (t->>'collection_id')::bigint, (t->>'saldo_no_momento')::numeric
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
$$;

COMMENT ON FUNCTION public.criar_acordo(text, jsonb, jsonb) IS
  'Cria acordo de renegociacao: acordo + titulos consolidados + parcelas futuras, numa transacao so. Trava o cliente em situacao "Em acordo" (ver trg_protege_situacao_acordo). So perfis carteira (Interno/Terceirizado/Juridico) ou gestor podem chamar.';

GRANT EXECUTE ON FUNCTION public.criar_acordo(text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_acordo(
  p_acordo_parcela_id uuid,
  p_valor_pago numeric,
  p_data_pagamento date,
  p_notes text DEFAULT NULL
)
RETURNS public.acordo_pagamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_acordo public.acordos%ROWTYPE;
  v_saldo numeric;
  v_pagamento public.acordo_pagamentos%ROWTYPE;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser positivo.';
  END IF;

  SELECT a.* INTO v_acordo
  FROM public.acordos a
  JOIN public.acordo_parcelas ap ON ap.acordo_id = a.id
  WHERE ap.id = p_acordo_parcela_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela de acordo não encontrada.';
  END IF;

  IF v_user_type <> 'manager' AND v_acordo.collector_id <> v_collector_id THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento neste acordo.';
  END IF;

  IF v_acordo.status <> 'ativo' THEN
    RAISE EXCEPTION 'Este acordo não está mais ativo (status atual: %).', v_acordo.status;
  END IF;

  v_saldo := public.saldo_acordo_parcela(p_acordo_parcela_id);
  IF p_valor_pago > v_saldo + 0.01 THEN
    RAISE EXCEPTION 'Valor informado (%) é maior que o saldo da parcela (%).', p_valor_pago, v_saldo;
  END IF;

  INSERT INTO public.acordo_pagamentos (
    acordo_parcela_id, valor_pago, data_pagamento, collector_id, notes, registrado_por_id
  ) VALUES (
    p_acordo_parcela_id, p_valor_pago, p_data_pagamento, v_collector_id, p_notes, v_collector_id
  )
  RETURNING * INTO v_pagamento;

  -- Todas as parcelas quitadas? Acordo cumprido, cliente volta pra fila
  -- normal do perfil do cobrador.
  IF NOT EXISTS (
    SELECT 1 FROM public.acordo_parcelas ap2
    WHERE ap2.acordo_id = v_acordo.id
      AND public.saldo_acordo_parcela(ap2.id) > 0.01
  ) THEN
    UPDATE public.acordos
    SET status = 'cumprido', resolved_at = now()
    WHERE id = v_acordo.id;

    UPDATE public."BANCO_DADOS"
    SET situacao = public.situacao_primaria_do_tipo(
      (SELECT type FROM public.users WHERE id = v_acordo.collector_id)
    )
    WHERE documento = v_acordo.client_document AND situacao = 'Em acordo';
  END IF;

  RETURN v_pagamento;
END;
$$;

COMMENT ON FUNCTION public.registrar_pagamento_acordo(uuid, numeric, date, text) IS
  'Registra pagamento (ledger append-only) contra uma parcela de acordo. Marca o acordo cumprido automaticamente quando todas as parcelas ficam quitadas. Dono do acordo ou gestor.';

GRANT EXECUTE ON FUNCTION public.registrar_pagamento_acordo(uuid, numeric, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_acordo(
  p_acordo_id uuid,
  p_motivo text
)
RETURNS public.acordos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collector_id uuid := (SELECT app_current_user_id());
  v_user_type text := (SELECT app_current_user_type());
  v_acordo public.acordos%ROWTYPE;
BEGIN
  IF v_collector_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório para cancelar um acordo.';
  END IF;

  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo não encontrado.';
  END IF;

  IF v_user_type <> 'manager' AND v_acordo.collector_id <> v_collector_id THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este acordo.';
  END IF;

  IF v_acordo.status <> 'ativo' THEN
    RAISE EXCEPTION 'Este acordo não está mais ativo (status atual: %).', v_acordo.status;
  END IF;

  UPDATE public.acordos
  SET status = 'cancelado', motivo_cancelamento = p_motivo, resolved_at = now()
  WHERE id = p_acordo_id
  RETURNING * INTO v_acordo;

  UPDATE public."BANCO_DADOS"
  SET situacao = public.situacao_primaria_do_tipo(
    (SELECT type FROM public.users WHERE id = v_acordo.collector_id)
  )
  WHERE documento = v_acordo.client_document AND situacao = 'Em acordo';

  RETURN v_acordo;
END;
$$;

COMMENT ON FUNCTION public.cancelar_acordo(uuid, text) IS
  'Cancela um acordo ativo com motivo obrigatório (fato, nunca reaberto depois). Dono do acordo ou gestor.';

GRANT EXECUTE ON FUNCTION public.cancelar_acordo(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_acordos_quebrados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_acordo record;
BEGIN
  FOR v_acordo IN
    SELECT DISTINCT a.id, a.client_document, a.collector_id
    FROM public.acordos a
    JOIN public.acordo_parcelas ap ON ap.acordo_id = a.id
    WHERE a.status = 'ativo'
      AND ap.data_vencimento < (current_date - 15)
      AND public.saldo_acordo_parcela(ap.id) > 0.01
  LOOP
    UPDATE public.acordos
    SET status = 'quebrado',
        motivo_cancelamento = 'Quebrado automaticamente: parcela com mais de 15 dias de atraso.',
        resolved_at = now()
    WHERE id = v_acordo.id;

    UPDATE public."BANCO_DADOS"
    SET situacao = public.situacao_primaria_do_tipo(
      (SELECT type FROM public.users WHERE id = v_acordo.collector_id)
    )
    WHERE documento = v_acordo.client_document AND situacao = 'Em acordo';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.marcar_acordos_quebrados() IS
  'Varre acordos ativos com parcela vencida há mais de 15 dias sem quitar e marca como quebrado, devolvendo o cliente pra fila normal do cobrador. Chamada pelo front a cada sessão (sem pg_cron configurado neste projeto ainda) -- ver CollectionContext.';

GRANT EXECUTE ON FUNCTION public.marcar_acordos_quebrados() TO authenticated;

-- 7) Trava de reatribuicao: as 3 RPCs que movem cliente entre
-- cobradores/situacao passam a pular quem tem acordo ativo.

CREATE OR REPLACE FUNCTION public.atribuir_clientes_em_lote(
  p_user_id           text,
  p_documentos        text[] DEFAULT '{}',
  p_clientes          text[] DEFAULT '{}',
  p_situacao          text   DEFAULT NULL,
  p_gerente_id        text   DEFAULT NULL,
  p_manter_situacoes  text[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'atribuicao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_gerente_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id::uuid,
      situacao = CASE
        WHEN p_situacao IS NULL THEN b.situacao
        WHEN b.situacao = ANY (COALESCE(p_manter_situacoes, '{}')) THEN b.situacao
        ELSE p_situacao
      END
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND NOT public.cliente_tem_acordo_ativo(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_cobrador_em_lote(
  p_documentos  text[] DEFAULT '{}',
  p_clientes    text[] DEFAULT '{}',
  p_usuario_id  text   DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'remocao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND b.user_id IS NOT NULL
    AND NOT public.cliente_tem_acordo_ativo(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_cliente_da_carteira(
  p_documento   text,
  p_situacao    text,
  p_usuario_id  text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('cobranca.motivo', 'liberacao: ' || COALESCE(p_situacao, ''), true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET situacao = p_situacao,
      user_id  = NULL
  WHERE b.documento = p_documento
    AND NOT public.cliente_tem_acordo_ativo(b.documento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
