-- Item 89 (2026-11-24): cancelamento de venda no app x ERP.
--
-- Revisão do cancelamento (pedido do usuário) achou:
--   1. O sync do Ciclone grava o status do ERP quando difere do app: venda
--      cancelada no app e ainda aberta no Ciclone voltava para a cobrança na
--      rodada seguinte, sem aviso (vendas_canceladas seguia dizendo cancelada).
--      A importação da SSÓtica já ignora parcela cancelada no app.
--   2. Cliente com acordo ativo: o gatilho trg_protege_titulo_em_acordo
--      recusava a mudança de status com mensagem de pagamento, e no
--      cancelamento em massa um cliente derrubava a operação inteira.
--   3. Pedido de desconto / venda informada como cancelada ficavam pendentes
--      apontando para venda já cancelada.
--
-- Decisão do usuário: cancelar no app continua permitido e VALE até o ERP
-- confirmar; o sync não desfaz e registra o que o ERP mostra, e o gestor vê
-- as divergências (quem cancelou no app, quando, desde quando o ERP segue
-- aberto). Divergência "atrasada" depois de 7 dias (só tela). Começa pelo
-- Ciclone; SSÓtica e outros tipos de divergência depois.
--
-- Fato histórico não se sobrescreve: reabrir é registro novo
-- (vendas_reabertas); o status anterior de cada parcela fica gravado no
-- cancelamento (vendas_canceladas_parcelas) para a reabertura devolver.
-- cancelamento_erp guarda o ÚLTIMO estado visto no ERP (é monitoramento);
-- em_aberto_desde e confirmado_em só são preenchidos uma vez.
--
-- cancelar_vendas: corpo de produção (pg_get_functiondef em 24/11) + guarda
-- de acordo, parcelas e pedidos. cancelar_clientes muda o retorno (integer ->
-- jsonb, pula cliente com acordo), por isso DROP + CREATE.

-- ---------------------------------------------------------------- tabelas
CREATE TABLE IF NOT EXISTS public.vendas_canceladas_parcelas (
  venda_cancelada_id bigint NOT NULL REFERENCES public.vendas_canceladas(id),
  id_parcela         bigint NOT NULL,
  status_anterior    text,
  PRIMARY KEY (venda_cancelada_id, id_parcela)
);
CREATE INDEX IF NOT EXISTS vendas_canceladas_parcelas_parcela_idx
  ON public.vendas_canceladas_parcelas (id_parcela);

CREATE TABLE IF NOT EXISTS public.vendas_reabertas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venda_cancelada_id bigint NOT NULL UNIQUE REFERENCES public.vendas_canceladas(id),
  motivo             text NOT NULL CHECK (length(trim(motivo)) > 0),
  usuario_id         uuid REFERENCES public.users(id),
  reaberta_em        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cancelamento_erp (
  venda_cancelada_id bigint PRIMARY KEY REFERENCES public.vendas_canceladas(id),
  erp                text NOT NULL CHECK (erp IN ('ciclone', 'ssotica')),
  status_erp         text NOT NULL CHECK (status_erp IN ('em_aberto', 'pago', 'cancelado')),
  em_aberto_desde    timestamptz,
  conferido_em       timestamptz NOT NULL,
  confirmado_em      timestamptz
);

ALTER TABLE public.vendas_canceladas_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_reabertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancelamento_erp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendas_canceladas_parcelas, public.vendas_reabertas,
  public.cancelamento_erp FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.vendas_canceladas_parcelas,
  public.vendas_reabertas, public.cancelamento_erp FROM authenticated;
DROP POLICY IF EXISTS "vendas_canceladas_parcelas_leitura" ON public.vendas_canceladas_parcelas;
CREATE POLICY "vendas_canceladas_parcelas_leitura" ON public.vendas_canceladas_parcelas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vendas_reabertas_leitura" ON public.vendas_reabertas;
CREATE POLICY "vendas_reabertas_leitura" ON public.vendas_reabertas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cancelamento_erp_leitura" ON public.cancelamento_erp;
CREATE POLICY "cancelamento_erp_leitura" ON public.cancelamento_erp
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------- cancelar_vendas
CREATE OR REPLACE FUNCTION public.cancelar_vendas(p_documento text, p_motivo text, p_usuario_id uuid, p_chaves bigint[] DEFAULT NULL::bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_usuario_id uuid := (SELECT app_current_user_id());
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  IF p_chaves IS NOT NULL AND cardinality(p_chaves) = 0 THEN
    RETURN 0;
  END IF;

  -- Item 89: título em acordo ativo não se cancela por aqui (o gatilho
  -- trg_protege_titulo_em_acordo recusaria com mensagem de pagamento).
  IF EXISTS (
    SELECT 1 FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (p_chaves IS NULL
           OR COALESCE(b.numero_titulo, b.venda_n, 0) = ANY (p_chaves))
      AND public.titulo_em_acordo_ativo(b.id_parcela)
  ) THEN
    RAISE EXCEPTION 'Esta venda está num acordo ativo. Cancele o acordo antes de cancelar a venda.'
      USING ERRCODE = 'P0001';
  END IF;

  -- CTEs que modificam dados rodam todas, mesmo sem serem lidas depois.
  WITH alvo AS (
    SELECT
      b.id_parcela,
      b.status,
      COALESCE(b.numero_titulo, b.venda_n, 0) AS chave,
      COALESCE(b.valor_original, 0) AS original,
      COALESCE(b.valor_original, 0)
        - COALESCE(b.valor_recebido, 0)
        - COALESCE(b.desconto, 0) AS saldo
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (p_chaves IS NULL
           OR COALESCE(b.numero_titulo, b.venda_n, 0) = ANY (p_chaves))
  ),
  registro AS (
    INSERT INTO public.vendas_canceladas (
      documento, chave_venda, parcelas, valor_original, valor_em_aberto,
      motivo, usuario_id
    )
    SELECT p_documento, a.chave, count(*), round(sum(a.original), 2),
           round(GREATEST(sum(a.saldo), 0), 2), trim(p_motivo), v_usuario_id
    FROM alvo a
    GROUP BY a.chave
    RETURNING id, chave_venda
  ),
  -- Item 89: status de cada parcela antes do cancelamento (para reabrir).
  registro_parcelas AS (
    INSERT INTO public.vendas_canceladas_parcelas (venda_cancelada_id, id_parcela, status_anterior)
    SELECT r.id, a.id_parcela, a.status
    FROM alvo a
    JOIN registro r ON r.chave_venda = a.chave
  )
  UPDATE public."BANCO_DADOS" b
  SET status = 'Cancelado'
  FROM alvo a
  WHERE b.id_parcela = a.id_parcela;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Sem nenhuma parcela ativa, nao ha mais o que cobrar: cancela as visitas
  -- em aberto. (Se sobrou parcela ativa ja paga, o gatilho de cliente quitado
  -- cuida disso; se sobrou divida, as visitas continuam.)
  IF NOT EXISTS (
    SELECT 1 FROM public."BANCO_DADOS" b
    WHERE b.documento = p_documento
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
  ) THEN
    UPDATE public.scheduled_visits v
    SET status                      = 'cancelada',
        cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
        cancellation_request_reason = COALESCE(
          NULLIF(trim(v.cancellation_request_reason), ''),
          'Cancelada automaticamente: vendas do cliente canceladas'
        ),
        cancellation_approved_by    = 'sistema (vendas canceladas)',
        cancellation_approved_at    = now(),
        updated_at                  = now()
    WHERE v.client_document = p_documento
      AND v.status IN ('agendada', 'cancelamento_solicitado');
  END IF;

  -- Item 89: pedidos pendentes que perderam o objeto.
  -- Desconto pedido sobre parcela agora cancelada: recusado com o motivo.
  UPDATE public.pedidos_desconto d
  SET decisao         = 'recusado',
      resposta        = 'Venda cancelada: ' || trim(p_motivo),
      decidido_por_id = v_usuario_id,
      decidido_em     = now()
  WHERE d.decisao IS NULL
    AND d.documento = p_documento
    AND EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.id_parcela = ANY (d.parcelas)
        AND lower(trim(COALESCE(b.status, ''))) = 'cancelado'
    );
  -- Venda informada como cancelada no atendimento e ainda não conferida:
  -- o gestor acabou de cancelar -> confirmada.
  IF v_usuario_id IS NOT NULL THEN
    UPDATE public.vendas_conferencia c
    SET status         = 'confirmada',
        decidido_por   = v_usuario_id,
        decidido_em    = now(),
        decisao_motivo = 'Venda cancelada pelo gestor: ' || trim(p_motivo)
    WHERE c.status = 'pendente'
      AND c.documento = p_documento
      AND (p_chaves IS NULL OR c.chave_venda = ANY (p_chaves));
  END IF;

  RETURN v_count;
END;
$function$;

-- -------------------------------------------------------- cancelar_clientes
-- Retorno muda para jsonb: {"parcelas": n, "pulados": [documentos com acordo]}.
DROP FUNCTION IF EXISTS public.cancelar_clientes(text[], text, uuid);
CREATE FUNCTION public.cancelar_clientes(p_documentos text[], p_motivo text, p_usuario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc     text;
  v_total   integer := 0;
  v_pulados text[] := '{}';
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  FOREACH v_doc IN ARRAY COALESCE(p_documentos, '{}') LOOP
    -- Item 89: cliente com acordo ativo é pulado (antes derrubava todos).
    IF EXISTS (
      SELECT 1 FROM public."BANCO_DADOS" b
      WHERE b.documento = v_doc
        AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
        AND public.titulo_em_acordo_ativo(b.id_parcela)
    ) THEN
      v_pulados := v_pulados || v_doc;
      CONTINUE;
    END IF;
    v_total := v_total + public.cancelar_vendas(v_doc, p_motivo, NULL, NULL);
  END LOOP;
  RETURN jsonb_build_object('parcelas', v_total, 'pulados', to_jsonb(v_pulados));
END;
$function$;
REVOKE ALL ON FUNCTION public.cancelar_clientes(text[], text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_clientes(text[], text, uuid) TO authenticated, service_role;

-- ------------------------------------------------- reabrir_venda_cancelada
CREATE OR REPLACE FUNCTION public.reabrir_venda_cancelada(p_venda_cancelada_id bigint, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id uuid := (SELECT app_current_user_id());
  v_vc public.vendas_canceladas%ROWTYPE;
  v_count integer;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem reabrir vendas.';
  END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da reabertura.';
  END IF;

  SELECT * INTO v_vc FROM public.vendas_canceladas WHERE id = p_venda_cancelada_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancelamento não encontrado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vendas_reabertas r WHERE r.venda_cancelada_id = v_vc.id) THEN
    RAISE EXCEPTION 'Esta venda já foi reaberta.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cancelamento_erp e
             WHERE e.venda_cancelada_id = v_vc.id AND e.confirmado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'O ERP já confirmou o cancelamento desta venda. Reabra no ERP.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendas_canceladas_parcelas p WHERE p.venda_cancelada_id = v_vc.id) THEN
    RAISE EXCEPTION 'Cancelamento anterior ao registro das parcelas: reabra pela correção manual.';
  END IF;

  INSERT INTO public.vendas_reabertas (venda_cancelada_id, motivo, usuario_id)
  VALUES (v_vc.id, trim(p_motivo), v_usuario_id);

  -- Devolve o status de antes só onde a parcela segue cancelada.
  UPDATE public."BANCO_DADOS" b
  SET status = p.status_anterior
  FROM public.vendas_canceladas_parcelas p
  WHERE p.venda_cancelada_id = v_vc.id
    AND b.id_parcela = p.id_parcela
    AND lower(trim(COALESCE(b.status, ''))) = 'cancelado';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.reabrir_venda_cancelada(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_venda_cancelada(bigint, text) TO authenticated;

-- ------------------------------------------------------- para o sync do ERP
-- Parcelas canceladas no app (por gestor: usuario_id preenchido), não
-- reabertas e ainda sem confirmação do ERP: o sync não desfaz o status delas.
CREATE OR REPLACE FUNCTION public.parcelas_canceladas_no_app()
 RETURNS TABLE (id_parcela bigint, venda_cancelada_id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id_parcela, p.venda_cancelada_id
  FROM public.vendas_canceladas_parcelas p
  JOIN public.vendas_canceladas vc ON vc.id = p.venda_cancelada_id
  WHERE vc.usuario_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.vendas_reabertas r WHERE r.venda_cancelada_id = vc.id)
    AND NOT EXISTS (SELECT 1 FROM public.cancelamento_erp e
                    WHERE e.venda_cancelada_id = vc.id AND e.confirmado_em IS NOT NULL);
$function$;
REVOKE ALL ON FUNCTION public.parcelas_canceladas_no_app() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parcelas_canceladas_no_app() TO service_role;

-- O sync informa o que o ERP mostra para essas parcelas:
-- p_itens = [{"id_parcela": 1, "status_erp": "em_aberto"|"pago"|"cancelado"}, ...]
-- Por venda: confirmada se todas as parcelas vistas estão canceladas no ERP;
-- senão "em_aberto" (alguma aberta) ou "pago".
CREATE OR REPLACE FUNCTION public.registrar_conferencia_cancelamento(p_erp text, p_itens jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF p_erp NOT IN ('ciclone', 'ssotica') THEN
    RAISE EXCEPTION 'ERP inválido: %', p_erp;
  END IF;

  WITH itens AS (
    SELECT (e->>'id_parcela')::bigint AS id_parcela, e->>'status_erp' AS status_erp
    FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) e
  ),
  por_venda AS (
    SELECT p.venda_cancelada_id,
           CASE
             WHEN bool_and(i.status_erp = 'cancelado') THEN 'cancelado'
             WHEN bool_or(i.status_erp = 'em_aberto') THEN 'em_aberto'
             ELSE 'pago'
           END AS status_erp
    FROM itens i
    JOIN public.vendas_canceladas_parcelas p ON p.id_parcela = i.id_parcela
    JOIN public.vendas_canceladas vc ON vc.id = p.venda_cancelada_id
    WHERE vc.usuario_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.vendas_reabertas r WHERE r.venda_cancelada_id = vc.id)
    GROUP BY p.venda_cancelada_id
  )
  INSERT INTO public.cancelamento_erp AS c
    (venda_cancelada_id, erp, status_erp, em_aberto_desde, conferido_em, confirmado_em)
  SELECT v.venda_cancelada_id, p_erp, v.status_erp,
         CASE WHEN v.status_erp <> 'cancelado' THEN now() END,
         now(),
         CASE WHEN v.status_erp = 'cancelado' THEN now() END
  FROM por_venda v
  ON CONFLICT (venda_cancelada_id) DO UPDATE
  SET status_erp      = EXCLUDED.status_erp,
      conferido_em    = EXCLUDED.conferido_em,
      em_aberto_desde = COALESCE(c.em_aberto_desde, EXCLUDED.em_aberto_desde),
      confirmado_em   = COALESCE(c.confirmado_em, EXCLUDED.confirmado_em)
  WHERE c.confirmado_em IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_conferencia_cancelamento(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_cancelamento(text, jsonb) TO service_role;

-- ------------------------------------------------------ painel do gestor
CREATE OR REPLACE FUNCTION public.divergencias_cancelamento()
 RETURNS TABLE (
   venda_cancelada_id bigint,
   documento          text,
   cliente            text,
   chave_venda        bigint,
   parcelas           integer,
   valor_em_aberto    numeric,
   motivo             text,
   cancelado_em       timestamptz,
   cancelado_por      text,
   erp                text,
   status_erp         text,
   em_aberto_desde    timestamptz,
   conferido_em       timestamptz,
   confirmado_em      timestamptz,
   reaberta_em        timestamptz,
   reaberta_por       text,
   reaberta_motivo    text,
   pode_reabrir       boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT vc.id,
         vc.documento,
         (SELECT cl.nome::text FROM public.clientes cl WHERE cl.documento = vc.documento LIMIT 1),
         vc.chave_venda,
         vc.parcelas,
         vc.valor_em_aberto,
         vc.motivo,
         vc.cancelado_em,
         (SELECT u.name::text FROM public.users u WHERE u.id = vc.usuario_id),
         e.erp,
         e.status_erp,
         e.em_aberto_desde,
         e.conferido_em,
         e.confirmado_em,
         r.reaberta_em,
         (SELECT u.name::text FROM public.users u WHERE u.id = r.usuario_id),
         r.motivo,
         (r.id IS NULL AND e.confirmado_em IS NULL
          AND EXISTS (SELECT 1 FROM public.vendas_canceladas_parcelas p WHERE p.venda_cancelada_id = vc.id))
  FROM public.vendas_canceladas vc
  LEFT JOIN public.cancelamento_erp e ON e.venda_cancelada_id = vc.id
  LEFT JOIN public.vendas_reabertas r ON r.venda_cancelada_id = vc.id
  WHERE vc.usuario_id IS NOT NULL
  ORDER BY vc.cancelado_em DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.divergencias_cancelamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.divergencias_cancelamento() TO authenticated;
