-- Item 87 (2026-11-23): cliente em CONDICAO DE CHEQUE nao fica com cobrador.
--
-- Pedido do usuario: cliente que paga com cheque continua no app, mas nunca
-- cai na carteira de um cobrador -- so o gestor trata, num painel proprio.
-- Duas origens (regra unica em clientes_condicao_cheque):
--   1. AUTOMATICA -- tem titulo do Ciclone em aberto do tipo "cheque em
--      carteira" (fn_tipotitulo 2; tambem 3 custodia e 5 deposito: cheque
--      que a empresa ja tem em maos). "Cheque devolvido" (4) e perdido (6)
--      NAO entram: aí o cliente deve e volta a cobranca normal sozinho.
--      O tipo chega por BANCO_DADOS.tipo_titulo_erp (sync_financeiro.py).
--   2. MANUAL -- gestor marcou "Paga em cheque" (cheque_marcacoes, so
--      INSERT: vale a ultima marcacao do documento; desmarcar e registro
--      novo, nada se apaga).
--
-- Portas fechadas (todas no banco, nao so na tela):
--   * protege_atribuicao_banco_dados: ninguem (nem gestor) poe cobrador em
--     cliente em condicao de cheque -- so um usuario gestor pode ficar com ele.
--     Cobre atribuir_cobrador*, atribuir_*_em_lote, transferir_clientes,
--     criar_acordo, distribuicao manual e automatica.
--   * trg_parcela_herda_cobrador: parcela nova nao herda cobrador.
--   * plano_distribuicao_carteira: cliente em condicao de cheque nem aparece.
--   * scheduled_visits: agendamento novo para cobrador e recusado.
--   * retirar_clientes_cheque_da_carteira: tira quem ja esta com cobrador
--     (marcacao do gestor = na hora; cheque novo do Ciclone = fim do sync e
--     rotina das 7h) e cancela os agendamentos ativos de cobrador.
--
-- Corpos de protege_atribuicao_banco_dados, trg_parcela_herda_cobrador,
-- plano_distribuicao_carteira e executar_distribuicao_automatica copiados de
-- PRODUCAO (pg_get_functiondef, 2026-11-23); so os trechos "Item 87" mudam.

-- ---------------------------------------------------------------------------
-- 1. Tipo do titulo no Ciclone
-- ---------------------------------------------------------------------------
ALTER TABLE public."BANCO_DADOS"
  ADD COLUMN IF NOT EXISTS tipo_titulo_erp smallint;

COMMENT ON COLUMN public."BANCO_DADOS".tipo_titulo_erp IS
  'Tipo do titulo no Ciclone (fn_tipotitulo.fntti_codigo): 1 contas a receber, 2 cheque em carteira, 3 cheque em custodia, 4 cheque devolvido, 5 cheque em deposito, 20 renegociacao... NULL = fora do Ciclone (SSOtica). Gravado pelo sync_financeiro.py.';

CREATE INDEX IF NOT EXISTS banco_dados_cheque_em_maos_idx
  ON public."BANCO_DADOS" (documento)
  WHERE tipo_titulo_erp IN (2, 3, 5);

-- Ultima baixa paga em CHEQUE no Ciclone (forma 2) -- base das sugestoes do
-- painel; o gestor decide se marca. Gravado pelo sync (CAMPOS_ERP).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ultima_baixa_cheque_erp date;

COMMENT ON COLUMN public.clientes.ultima_baixa_cheque_erp IS
  'Data da ultima baixa ativa paga em CHEQUE no Ciclone (fn_formapagamento 2). Espelho do ERP, gravado pelo sync_financeiro.py. Item 87.';

-- ---------------------------------------------------------------------------
-- 2. Marcacao manual "Paga em cheque" (so gestor, so INSERT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cheque_marcacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento   text NOT NULL,
  marcado     boolean NOT NULL,
  motivo      text NOT NULL CHECK (length(trim(motivo)) >= 3),
  usuario_id  uuid NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cheque_marcacoes_documento_idx
  ON public.cheque_marcacoes (documento, criado_em DESC, id DESC);

COMMENT ON TABLE public.cheque_marcacoes IS
  'Item 87: marcacao "Paga em cheque" do gestor. So INSERT -- vale a ultima linha do documento (marcado true/false). Escrita so por marcar_paga_em_cheque.';

ALTER TABLE public.cheque_marcacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cheque_marcacoes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cheque_marcacoes FROM authenticated;

DROP POLICY IF EXISTS "cheque_marcacoes_leitura" ON public.cheque_marcacoes;
CREATE POLICY "cheque_marcacoes_leitura" ON public.cheque_marcacoes
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 3. Regra unica
-- ---------------------------------------------------------------------------
-- Uma linha por cliente em condicao de cheque. p_documento NULL = todos.
-- Interna (sem EXECUTE para ninguem alem do dono): usada pelos gatilhos e
-- pelas funcoes SECURITY DEFINER abaixo.
CREATE OR REPLACE FUNCTION public.clientes_condicao_cheque(p_documento text DEFAULT NULL)
RETURNS TABLE (
  documento text,
  paga_em_cheque boolean,
  cheques_qtd integer,
  cheques_valor numeric,
  cheque_venc_mais_antigo date
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH marcacoes AS (
    SELECT DISTINCT ON (m.documento) m.documento, m.marcado
    FROM public.cheque_marcacoes m
    WHERE p_documento IS NULL OR m.documento = p_documento
    ORDER BY m.documento, m.criado_em DESC, m.id DESC
  ),
  cheques AS (
    SELECT b.documento,
           count(*)::integer AS qtd,
           sum(COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) AS valor,
           min(b.data_vencimento) AS venc
    FROM public."BANCO_DADOS" b
    WHERE b.tipo_titulo_erp IN (2, 3, 5)
      AND (p_documento IS NULL OR b.documento = p_documento)
      AND b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
    GROUP BY b.documento
  )
  SELECT COALESCE(m.documento, c.documento),
         COALESCE(m.marcado, false),
         COALESCE(c.qtd, 0),
         COALESCE(c.valor, 0),
         c.venc
  FROM (SELECT * FROM marcacoes WHERE marcado) m
  FULL JOIN cheques c ON c.documento = m.documento
$function$;

REVOKE ALL ON FUNCTION public.clientes_condicao_cheque(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cliente_em_condicao_cheque(p_documento text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(trim(p_documento), '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clientes_condicao_cheque(p_documento))
$function$;

REVOKE ALL ON FUNCTION public.cliente_em_condicao_cheque(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Retirar da carteira (e cancelar agendamento de cobrador)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retirar_clientes_cheque_da_carteira(p_documento text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_docs text[];
  v_retirados integer := 0;
BEGIN
  SELECT array_agg(DISTINCT b.documento) INTO v_docs
  FROM public."BANCO_DADOS" b
  JOIN public.clientes_condicao_cheque(p_documento) x ON x.documento = b.documento
  LEFT JOIN public.users u ON u.id = b.user_id
  WHERE b.user_id IS NOT NULL
    AND u.type IS DISTINCT FROM 'manager';

  IF v_docs IS NOT NULL THEN
    PERFORM set_config('cobranca.motivo', 'condicao_cheque', true);
    PERFORM set_config('cobranca.usuario_id',
      COALESCE((SELECT app_current_user_id())::text, ''), true);
    -- trg_protege_atribuicao aceita user_id -> NULL com esta autorizacao
    -- (o sync e o pg_cron rodam sem gestor logado).
    PERFORM set_config('cobranca.liberacao_autorizada', 'true', true);

    UPDATE public."BANCO_DADOS" b
    SET user_id = NULL
    WHERE b.documento = ANY (v_docs)
      AND b.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = b.user_id AND u.type = 'manager'
      );

    PERFORM set_config('cobranca.liberacao_autorizada', '', true);
    v_retirados := cardinality(v_docs);
  END IF;

  -- Agendamento ativo de cobrador para cliente em condicao de cheque (inclusive
  -- o que nao estava na carteira -- ex.: visita do externo).
  UPDATE public.scheduled_visits v
  SET status                      = 'cancelada',
      cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
      cancellation_request_reason = COALESCE(
        NULLIF(trim(v.cancellation_request_reason), ''),
        'Cancelada automaticamente: cliente em condição de cheque (fica com o gestor)'
      ),
      cancellation_approved_by    = 'sistema (condição de cheque)',
      cancellation_approved_at    = now(),
      updated_at                  = now()
  FROM public.clientes_condicao_cheque(p_documento) x
  WHERE v.client_document = x.documento
    AND v.status IN ('agendada', 'cancelamento_solicitado')
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = v.collector_id AND u.type = 'manager'
    );

  RETURN v_retirados;
END;
$function$;

REVOKE ALL ON FUNCTION public.retirar_clientes_cheque_da_carteira(text) FROM PUBLIC, anon, authenticated;
-- O sync do Ciclone chama no fim de cada rodada (cheque novo sai na hora).
GRANT EXECUTE ON FUNCTION public.retirar_clientes_cheque_da_carteira(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Portas de entrada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protege_atribuicao_banco_dados()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Item 87: cliente em condicao de cheque nunca vai para cobrador (vale
  -- para o gestor tambem). So um usuario gestor pode ficar com ele.
  if NEW.user_id is not null
     and NEW.user_id is distinct from OLD.user_id
     and not exists (
       select 1 from public.users u
       where u.id = NEW.user_id and u.type = 'manager'
     )
     and public.cliente_em_condicao_cheque(NEW.documento)
  then
    raise exception 'O cliente % está em condição de cheque e fica só com o gestor.',
      coalesce(NEW.cliente, NEW.documento)
      using hint = 'Veja em Pedidos > Cheques. Para voltar à cobrança, desmarque "Paga em cheque" lá (cheque em carteira sai sozinho quando o financeiro baixa ou devolve no Ciclone).';
  end if;

  if NEW.user_id is distinct from OLD.user_id
     and public.app_current_user_type() IS DISTINCT FROM 'manager'
     -- Excecao 1: liberacao validada em liberar_cliente_da_carteira,
     -- que so tira o cobrador (nunca atribui outro).
     and not (
       NEW.user_id is null
       and coalesce(current_setting('cobranca.liberacao_autorizada', true), '') = 'true'
     )
     -- Excecao 2: carteira automatica (pg_cron, sem usuario logado), ligada
     -- so por executar_distribuicao_automatica.
     and coalesce(current_setting('cobranca.distribuicao_automatica', true), '') <> 'true'
  then
    raise exception 'Apenas gestores podem reatribuir o cobrador de um cliente.';
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_parcela_herda_cobrador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_situacao  text;
BEGIN
  IF NEW.user_id IS NOT NULL OR NULLIF(trim(NEW.documento), '') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Item 87: cheque em maos (titulo novo) ou cliente ja em condicao de
  -- cheque nao herda cobrador; retirar_clientes_cheque_da_carteira (fim do
  -- sync) tira o resto das parcelas.
  IF NEW.tipo_titulo_erp IN (2, 3, 5)
     OR public.cliente_em_condicao_cheque(NEW.documento) THEN
    RETURN NEW;
  END IF;

  -- Um unico cobrador entre as parcelas do cliente; senao nao herda.
  SELECT min(b.user_id::text)::uuid
  INTO v_user_id
  FROM public."BANCO_DADOS" b
  WHERE b.documento = NEW.documento
    AND b.user_id IS NOT NULL
  HAVING count(DISTINCT b.user_id) = 1;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.situacao
  INTO v_situacao
  FROM public."BANCO_DADOS" b
  WHERE b.documento = NEW.documento
    AND b.user_id = v_user_id
  ORDER BY b.id_parcela DESC
  LIMIT 1;

  NEW.user_id  := v_user_id;
  NEW.situacao := COALESCE(v_situacao, NEW.situacao);
  RETURN NEW;
END;
$function$;

-- Agendamento novo para cobrador (nao gestor) e recusado.
CREATE OR REPLACE FUNCTION public.trg_agendamento_bloqueia_cheque()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'agendada'
     AND (TG_OP = 'INSERT' OR NEW.collector_id IS DISTINCT FROM OLD.collector_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.users u
       WHERE u.id::text = NEW.collector_id AND u.type = 'manager'
     )
     AND public.cliente_em_condicao_cheque(NEW.client_document)
  THEN
    RAISE EXCEPTION 'O cliente % está em condição de cheque e fica só com o gestor.',
      coalesce(NEW.client_name, NEW.client_document)
      USING hint = 'Veja em Pedidos > Cheques.';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_agendamento_bloqueia_cheque() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agendamento_bloqueia_cheque ON public.scheduled_visits;
CREATE TRIGGER agendamento_bloqueia_cheque
  BEFORE INSERT OR UPDATE OF collector_id, status ON public.scheduled_visits
  FOR EACH ROW EXECUTE FUNCTION public.trg_agendamento_bloqueia_cheque();

CREATE OR REPLACE FUNCTION public.plano_distribuicao_carteira(p_perfis jsonb, p_retirar_de uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(documento text, cliente text, loja text, atraso integer, situacao text, cobrador_atual uuid, cobrador_destino uuid, acao text, bloqueado_por text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_carga jsonb;
  v_encerramento text[] := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(p_perfis->'encerramento', '[]'::jsonb))
  );
  c record;
  v_dest uuid;
  v_bloq text;
  v_ativo boolean;
  -- Selecao de cobradores (2026-11-19): p_perfis->'cobradores' = lista de
  -- ids. Ausente = todos (rotina automatica e chamadas antigas).
  v_sel uuid[] := CASE
    WHEN jsonb_typeof(p_perfis->'cobradores') = 'array' THEN ARRAY(
      SELECT jsonb_array_elements_text(p_perfis->'cobradores')::uuid
    )
  END;
BEGIN
  SELECT COALESCE(jsonb_object_agg(x.user_id::text, x.n), '{}'::jsonb) INTO v_carga
  FROM (
    SELECT b.user_id, count(DISTINCT b.documento) AS n
    FROM public."BANCO_DADOS" b
    WHERE b.user_id IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
    GROUP BY b.user_id
  ) x;

  FOR c IN
    WITH abertos AS (
      SELECT b.documento, b.cliente, b.user_id, b.situacao, b.nome_da_loja, b.data_vencimento
      FROM public."BANCO_DADOS" b
      WHERE b.documento IS NOT NULL
        AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
        AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
    ), por_cliente AS (
      SELECT
        a.documento,
        (array_agg(a.cliente ORDER BY a.data_vencimento ASC NULLS LAST, a.nome_da_loja))[1] AS cliente,
        (array_agg(a.nome_da_loja ORDER BY a.data_vencimento ASC NULLS LAST, a.nome_da_loja))[1] AS loja,
        (array_agg(a.user_id ORDER BY a.user_id NULLS LAST))[1] AS user_id,
        max(a.situacao) AS situacao
      FROM abertos a
      GROUP BY a.documento
    ), cheque AS (
      -- Item 87: condicao de cheque fica fora da distribuicao (quem ainda
      -- estiver com cobrador sai por retirar_clientes_cheque_da_carteira).
      SELECT x.documento FROM public.clientes_condicao_cheque() x
    )
    SELECT pc.*, public.cliente_max_atraso_dias(pc.documento) AS atraso
    FROM por_cliente pc
    WHERE NOT EXISTS (SELECT 1 FROM cheque ch WHERE ch.documento = pc.documento)
    -- 6 = atraso: por ordinal porque "atraso" sem prefixo colide com o
    -- parametro OUT de mesmo nome (plpgsql recusa referencia ambigua).
    ORDER BY 6 DESC, pc.documento
  LOOP
    IF c.situacao = ANY (v_encerramento) THEN
      CONTINUE;
    END IF;

    -- Dono da regra ativa que cobre o cliente (menor carga primeiro).
    SELECT r.collector_id INTO v_dest
    FROM public.collector_overdue_ranges r
    JOIN public.users u ON u.id = r.collector_id
    WHERE r.vigente_ate IS NULL AND r.ativa
      AND u.active IS DISTINCT FROM false
      AND (p_perfis->'perfis') ? u.type
      AND r.collector_id IS DISTINCT FROM c.user_id
      AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, c.atraso, c.loja)
      AND (
        c.situacao IS NULL
        OR c.situacao NOT LIKE 'Aguardando %'
        OR c.situacao IN (
          SELECT jsonb_array_elements_text(p_perfis->'perfis'->u.type->'manter')
        )
      )
    ORDER BY COALESCE((v_carga->>r.collector_id::text)::integer, 0), r.collector_id
    LIMIT 1;

    IF c.user_id IS NOT NULL THEN
      SELECT u.active IS DISTINCT FROM false INTO v_ativo
      FROM public.users u WHERE u.id = c.user_id;
      v_ativo := COALESCE(v_ativo, false);

      -- Cobrador ATIVO sem regra = carteira manual: a distribuicao nao tira
      -- dele por conta propria (2026-11-09, substitui a "regra mestre" do
      -- 20261109000003). Cliente que nenhuma regra cobre fica; cliente que
      -- uma regra cobre so vai para o dono dela se o GESTOR marcou este
      -- cobrador em p_retirar_de -- senao volta como 'retido' (aviso com
      -- checkbox na tela), sem mexer.
      IF v_ativo AND NOT EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id AND r.vigente_ate IS NULL
      ) THEN
        IF v_dest IS NULL THEN
          CONTINUE;
        END IF;
        IF NOT (c.user_id = ANY (COALESCE(p_retirar_de, '{}'::uuid[]))) THEN
          IF v_sel IS NOT NULL
             AND NOT (COALESCE(c.user_id = ANY (v_sel), false)
                      OR COALESCE(v_dest = ANY (v_sel), false)) THEN
            CONTINUE;
          END IF;
          v_bloq := CASE
            WHEN public.cliente_tem_acordo_ativo(c.documento) THEN 'acordo_ativo'
            WHEN public.cliente_tem_visita_agendada_ativa(c.documento) THEN 'agendamento_ativo'
            ELSE NULL
          END;
          documento := c.documento; cliente := c.cliente; loja := c.loja;
          atraso := c.atraso; situacao := c.situacao; cobrador_atual := c.user_id;
          cobrador_destino := v_dest; acao := 'retido'; bloqueado_por := v_bloq;
          RETURN NEXT;
          CONTINUE;
        END IF;
      -- Cobrador ativo COM regra: fica com o que alguma regra dele cobre
      -- (ativa ou pausada) e com quem esta abaixo da 1a faixa dele na loja.
      -- Inativo nao segura nada.
      ELSIF v_ativo AND (EXISTS (
        SELECT 1 FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL
          AND public.faixa_cobre_cliente(r.min_dias, r.max_dias, r.lojas, c.atraso, c.loja)
      ) OR c.atraso < (
        SELECT min(r.min_dias) FROM public.collector_overdue_ranges r
        WHERE r.collector_id = c.user_id
          AND r.vigente_ate IS NULL
          AND (r.lojas IS NULL OR c.loja = ANY (r.lojas))
      )
      -- Saiu da faixa, mas o cobrador AGIU sobre o cliente (desde que ele
      -- entrou na carteira, nos ultimos 30 dias): fica com ele, como no
      -- Cedrus (item 55, 2026-11-13). Sem acao, segue para troca/saida --
      -- e _aplicar_distribuicao_carteira registra 'fora_da_faixa_sem_acao'.
      OR public.cobrador_teve_acao_recente(c.documento, c.user_id)) THEN
        CONTINUE;
      END IF;
    END IF;

    IF c.user_id IS NULL AND v_dest IS NULL THEN
      IF v_sel IS NOT NULL THEN
        CONTINUE;
      END IF;
      documento := c.documento; cliente := c.cliente; loja := c.loja;
      atraso := c.atraso; situacao := c.situacao; cobrador_atual := NULL;
      cobrador_destino := NULL; acao := 'sem_regra'; bloqueado_por := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_sel IS NOT NULL
       AND NOT (COALESCE(c.user_id = ANY (v_sel), false)
                      OR COALESCE(v_dest = ANY (v_sel), false)) THEN
      CONTINUE;
    END IF;

    v_bloq := CASE
      WHEN public.cliente_tem_acordo_ativo(c.documento) THEN 'acordo_ativo'
      WHEN public.cliente_tem_visita_agendada_ativa(c.documento) THEN 'agendamento_ativo'
      ELSE NULL
    END;

    documento := c.documento; cliente := c.cliente; loja := c.loja;
    atraso := c.atraso; situacao := c.situacao; cobrador_atual := c.user_id;
    cobrador_destino := v_dest; bloqueado_por := v_bloq;
    acao := CASE
      WHEN c.user_id IS NULL THEN 'entra'
      WHEN v_dest IS NOT NULL THEN 'troca'
      ELSE 'sai'
    END;
    RETURN NEXT;

    IF v_bloq IS NULL THEN
      IF v_dest IS NOT NULL THEN
        v_carga := jsonb_set(v_carga, ARRAY[v_dest::text],
          to_jsonb(COALESCE((v_carga->>v_dest::text)::integer, 0) + 1));
      END IF;
      IF c.user_id IS NOT NULL THEN
        v_carga := jsonb_set(v_carga, ARRAY[c.user_id::text],
          to_jsonb(COALESCE((v_carga->>c.user_id::text)::integer, 0) - 1));
      END IF;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.executar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perfis jsonb;
  v_res jsonb;
  v_cheque integer;
BEGIN
  SELECT perfis INTO v_perfis FROM public.distribuicao_config WHERE id = 1;
  IF v_perfis IS NULL THEN
    INSERT INTO public.distribuicao_execucoes (erro) VALUES ('sem distribuicao_config');
    RETURN NULL;
  END IF;
  BEGIN
    -- Item 87: antes de distribuir, tira de cobrador quem entrou em
    -- condicao de cheque (rede de seguranca do fim do sync).
    v_cheque := public.retirar_clientes_cheque_da_carteira(NULL);
    PERFORM set_config('cobranca.distribuicao_automatica', 'true', true);
    v_res := public._aplicar_distribuicao_carteira(v_perfis, '{}'::uuid[], 'distribuicao_automatica', '');
    PERFORM set_config('cobranca.distribuicao_automatica', '', true);
    v_res := v_res || jsonb_build_object('retirados_condicao_cheque', v_cheque);
  EXCEPTION WHEN OTHERS THEN
    -- O bloco volta atras sozinho (nada aplicado pela metade); fica o erro.
    PERFORM set_config('cobranca.distribuicao_automatica', '', true);
    INSERT INTO public.distribuicao_execucoes (erro) VALUES (left(SQLERRM, 500));
    RETURN NULL;
  END;
  INSERT INTO public.distribuicao_execucoes (resultado) VALUES (v_res);
  RETURN v_res;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. RPCs do gestor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_paga_em_cheque(p_documento text, p_marcar boolean, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario uuid := (SELECT app_current_user_id());
  v_atual boolean;
  v_retirados integer := 0;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Só o gestor marca ou desmarca "Paga em cheque".';
  END IF;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;
  IF p_marcar IS NULL THEN
    RAISE EXCEPTION 'Informe se é para marcar ou desmarcar.';
  END IF;
  IF length(trim(COALESCE(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreva o motivo (mínimo 3 letras).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.documento = p_documento) THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  SELECT m.marcado INTO v_atual
  FROM public.cheque_marcacoes m
  WHERE m.documento = p_documento
  ORDER BY m.criado_em DESC, m.id DESC
  LIMIT 1;

  IF COALESCE(v_atual, false) = p_marcar THEN
    RAISE EXCEPTION '%', CASE WHEN p_marcar
      THEN 'Este cliente já está marcado como "Paga em cheque".'
      ELSE 'Este cliente não está marcado como "Paga em cheque".' END;
  END IF;

  INSERT INTO public.cheque_marcacoes (documento, marcado, motivo, usuario_id)
  VALUES (p_documento, p_marcar, trim(p_motivo), v_usuario);

  IF p_marcar THEN
    v_retirados := public.retirar_clientes_cheque_da_carteira(p_documento);
  END IF;

  RETURN jsonb_build_object(
    'retirado_da_carteira', v_retirados > 0,
    -- Desmarcado mas ainda com cheque em carteira: continua fora.
    'segue_em_condicao', public.cliente_em_condicao_cheque(p_documento)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.marcar_paga_em_cheque(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_paga_em_cheque(text, boolean, text) TO authenticated;

-- Situacao de um cliente (selo da Ficha): qualquer usuario logado.
CREATE OR REPLACE FUNCTION public.condicao_cheque_cliente(p_documento text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'paga_em_cheque', x.paga_em_cheque,
    'cheques_qtd', x.cheques_qtd,
    'cheques_valor', x.cheques_valor,
    'cheque_venc_mais_antigo', x.cheque_venc_mais_antigo
  )
  FROM public.clientes_condicao_cheque(p_documento) x
  WHERE (SELECT app_current_user_id()) IS NOT NULL
$function$;

REVOKE ALL ON FUNCTION public.condicao_cheque_cliente(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condicao_cheque_cliente(text) TO authenticated;

-- Painel do gestor: clientes em condicao de cheque + sugestoes.
--   grupo 'cheque_conferir'  : cheque em maos vencido ha mais de p_dias_conferir
--   grupo 'cheque_carteira'  : cheque em maos dentro do prazo
--   grupo 'paga_em_cheque'   : marcado pelo gestor (sem cheque em maos)
--   grupo 'sugestao'         : nao esta em condicao, tem saldo e pagou em
--                              cheque no Ciclone nos ultimos p_meses_sugestao
-- Saldo em Vencido x A vencer (convencao do app), so do que NAO e cheque em
-- maos -- o cheque aparece a parte (cheques_valor).
CREATE OR REPLACE FUNCTION public.painel_cheques(
  p_dias_conferir integer DEFAULT 30,
  p_meses_sugestao integer DEFAULT 24
)
RETURNS TABLE (
  documento text,
  cliente text,
  codigo_cliente_erp text,
  loja text,
  grupo text,
  paga_em_cheque boolean,
  marcado_em timestamptz,
  marcado_por uuid,
  motivo text,
  cheques_qtd integer,
  cheques_valor numeric,
  cheque_venc_mais_antigo date,
  dias_cheque_vencido integer,
  vencido numeric,
  a_vencer numeric,
  ultima_baixa_cheque date,
  saiu_de uuid,
  saiu_em timestamptz,
  cobrador_atual uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Só o gestor vê o painel de cheques.';
  END IF;

  RETURN QUERY
  WITH cond AS (
    SELECT * FROM public.clientes_condicao_cheque(NULL)
  ),
  ult_marca AS (
    SELECT DISTINCT ON (m.documento) m.documento, m.criado_em, m.usuario_id, m.motivo
    FROM public.cheque_marcacoes m
    ORDER BY m.documento, m.criado_em DESC, m.id DESC
  ),
  saldos AS (
    SELECT b.documento,
      sum(CASE WHEN b.data_vencimento < v_hoje THEN s.saldo ELSE 0 END) AS vencido,
      sum(CASE WHEN b.data_vencimento >= v_hoje OR b.data_vencimento IS NULL THEN s.saldo ELSE 0 END) AS a_vencer,
      (array_agg(b.cliente ORDER BY b.id_parcela DESC))[1] AS cliente,
      (array_agg(b.nome_da_loja ORDER BY b.data_vencimento NULLS LAST, b.id_parcela))[1] AS loja,
      min(b.user_id::text)::uuid AS cobrador_atual
    FROM public."BANCO_DADOS" b
    CROSS JOIN LATERAL (
      SELECT COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0) AS saldo
    ) s
    WHERE b.documento IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
      AND s.saldo > 0.01
      AND b.tipo_titulo_erp IS DISTINCT FROM 2
      AND b.tipo_titulo_erp IS DISTINCT FROM 3
      AND b.tipo_titulo_erp IS DISTINCT FROM 5
    GROUP BY b.documento
  ),
  saida AS (
    SELECT DISTINCT ON (h.documento) h.documento, h.cobrador_anterior_id, h.assigned_at
    FROM public.atribuicoes_historico h
    WHERE h.motivo = 'condicao_cheque'
    ORDER BY h.documento, h.assigned_at DESC
  ),
  linhas AS (
    SELECT c.documento,
      CASE
        WHEN c.cheques_qtd > 0 AND c.cheque_venc_mais_antigo < v_hoje - p_dias_conferir THEN 'cheque_conferir'
        WHEN c.cheques_qtd > 0 THEN 'cheque_carteira'
        ELSE 'paga_em_cheque'
      END AS grupo,
      c.paga_em_cheque, c.cheques_qtd, c.cheques_valor, c.cheque_venc_mais_antigo
    FROM cond c
    UNION ALL
    SELECT s.documento, 'sugestao', false, 0, 0::numeric, NULL::date
    FROM saldos s
    JOIN public.clientes cl ON cl.documento = s.documento
    WHERE cl.ultima_baixa_cheque_erp >= (v_hoje - make_interval(months => p_meses_sugestao))::date
      AND NOT EXISTS (SELECT 1 FROM cond c WHERE c.documento = s.documento)
  )
  SELECT l.documento,
    COALESCE(cl.nome, s.cliente, l.documento),
    cl.codigo_cliente_erp,
    COALESCE(s.loja, (SELECT b.nome_da_loja FROM public."BANCO_DADOS" b WHERE b.documento = l.documento LIMIT 1)),
    l.grupo,
    l.paga_em_cheque,
    CASE WHEN l.paga_em_cheque THEN um.criado_em END,
    CASE WHEN l.paga_em_cheque THEN um.usuario_id END,
    CASE WHEN l.paga_em_cheque THEN um.motivo END,
    l.cheques_qtd,
    l.cheques_valor,
    l.cheque_venc_mais_antigo,
    CASE WHEN l.cheque_venc_mais_antigo < v_hoje THEN (v_hoje - l.cheque_venc_mais_antigo) END,
    COALESCE(s.vencido, 0),
    COALESCE(s.a_vencer, 0),
    cl.ultima_baixa_cheque_erp,
    sa.cobrador_anterior_id::uuid,
    sa.assigned_at,
    s.cobrador_atual
  FROM linhas l
  LEFT JOIN public.clientes cl ON cl.documento = l.documento
  LEFT JOIN saldos s ON s.documento = l.documento
  LEFT JOIN ult_marca um ON um.documento = l.documento
  LEFT JOIN saida sa ON sa.documento = l.documento
  ORDER BY l.grupo, COALESCE(s.vencido, 0) + l.cheques_valor DESC, l.documento;
END;
$function$;

REVOKE ALL ON FUNCTION public.painel_cheques(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_cheques(integer, integer) TO authenticated;
