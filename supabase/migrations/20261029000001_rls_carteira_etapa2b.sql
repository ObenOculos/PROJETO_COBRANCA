-- Etapa 2b da reorganização (RLS por carteira): cada cobrador passa a
-- ver/editar só os próprios clientes; gestor continua vendo tudo. RPCs
-- sensíveis (cancelamento, atribuição em lote, ajuste de recebimento) só
-- gestor, validado no servidor via app_current_user_type() (Etapa 2a) — não
-- mais confiando em p_usuario_id/p_gerente_id enviado pelo cliente.
--
-- Fora do escopo (ver docs/PROGRESSO.md): users, enderecos_historico e as 3
-- tabelas de histórico continuam na política ampla da 2a.

-- 0. Corrige um gatilho que ia quebrar com a política nova: ele insere em
-- clientes (agora gestor-only) mas não é SECURITY DEFINER, então rodaria com
-- o privilégio de quem inseriu a parcela em BANCO_DADOS (nem sempre gestor).
alter function public.inserir_cliente_automaticamente() security definer
  set search_path to 'public';

-- 1. BANCO_DADOS: leitura/atualização do dono ou gestor; inserir/apagar só
-- gestor (cadastro é import/admin).
drop policy if exists "authenticated_full_access" on public."BANCO_DADOS";

create policy "select_dono_ou_gestor" on public."BANCO_DADOS"
  for select to authenticated
  using (app_current_user_type() = 'manager' or user_id = app_current_user_id());

create policy "update_dono_ou_gestor" on public."BANCO_DADOS"
  for update to authenticated
  using (app_current_user_type() = 'manager' or user_id = app_current_user_id())
  with check (app_current_user_type() = 'manager' or user_id = app_current_user_id());

create policy "insert_gestor" on public."BANCO_DADOS"
  for insert to authenticated
  with check (app_current_user_type() = 'manager');

create policy "delete_gestor" on public."BANCO_DADOS"
  for delete to authenticated
  using (app_current_user_type() = 'manager');

-- 1b. O UPDATE acima libera o dono para registrar o próprio pagamento, mas
-- não deveria liberar ele a trocar o PRÓPRIO dono (reatribuição é ação de
-- gestor, item 3). Trava específica, independente de qual caminho tenta
-- mudar user_id (update direto, RPC não-SECURITY-DEFINER, etc.).
create or replace function public.protege_atribuicao_banco_dados()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.user_id is distinct from OLD.user_id
     and public.app_current_user_type() <> 'manager' then
    raise exception 'Apenas gestores podem reatribuir o cobrador de um cliente.';
  end if;
  return NEW;
end;
$$;

create trigger trg_protege_atribuicao
  before update on public."BANCO_DADOS"
  for each row
  execute function public.protege_atribuicao_banco_dados();

-- 2. scheduled_visits, sale_payments: dono ou gestor, para tudo (agendar/
-- reagendar/registrar pagamento da própria carteira).
drop policy if exists "authenticated_full_access" on public.scheduled_visits;
create policy "dono_ou_gestor" on public.scheduled_visits
  for all to authenticated
  using (app_current_user_type() = 'manager' or collector_id = app_current_user_id()::text)
  with check (app_current_user_type() = 'manager' or collector_id = app_current_user_id()::text);

drop policy if exists "authenticated_full_access" on public.sale_payments;
create policy "dono_ou_gestor" on public.sale_payments
  for all to authenticated
  using (app_current_user_type() = 'manager' or collector_id = app_current_user_id())
  with check (app_current_user_type() = 'manager' or collector_id = app_current_user_id());

-- 3. clientes: leitura do dono (via BANCO_DADOS.documento) ou gestor;
-- cadastro/edição/remoção só gestor (import/admin).
drop policy if exists "authenticated_full_access" on public.clientes;

create policy "select_dono_ou_gestor" on public.clientes
  for select to authenticated
  using (
    app_current_user_type() = 'manager'
    or exists (
      select 1 from public."BANCO_DADOS" b
      where b.documento = clientes.documento
        and b.user_id = app_current_user_id()
    )
  );

create policy "insert_gestor" on public.clientes
  for insert to authenticated
  with check (app_current_user_type() = 'manager');

create policy "update_gestor" on public.clientes
  for update to authenticated
  using (app_current_user_type() = 'manager')
  with check (app_current_user_type() = 'manager');

create policy "delete_gestor" on public.clientes
  for delete to authenticated
  using (app_current_user_type() = 'manager');

-- 4. collection_attempts: dono (via BANCO_DADOS.id_parcela = collection_id)
-- ou gestor, para tudo.
drop policy if exists "authenticated_full_access" on public.collection_attempts;
create policy "dono_ou_gestor" on public.collection_attempts
  for all to authenticated
  using (
    app_current_user_type() = 'manager'
    or exists (
      select 1 from public."BANCO_DADOS" b
      where b.id_parcela::text = collection_attempts.collection_id
        and b.user_id = app_current_user_id()
    )
  )
  with check (
    app_current_user_type() = 'manager'
    or exists (
      select 1 from public."BANCO_DADOS" b
      where b.id_parcela::text = collection_attempts.collection_id
        and b.user_id = app_current_user_id()
    )
  );

-- 5. allowed_visit_dates, monthly_goals: configurados pelo gestor PARA o
-- cobrador -- cobrador só lê o próprio, escreve só gestor.
drop policy if exists "authenticated_full_access" on public.allowed_visit_dates;
create policy "select_dono_ou_gestor" on public.allowed_visit_dates
  for select to authenticated
  using (app_current_user_type() = 'manager' or collector_id = app_current_user_id());
create policy "escrita_gestor" on public.allowed_visit_dates
  for insert to authenticated
  with check (app_current_user_type() = 'manager');
create policy "update_gestor" on public.allowed_visit_dates
  for update to authenticated
  using (app_current_user_type() = 'manager')
  with check (app_current_user_type() = 'manager');
create policy "delete_gestor" on public.allowed_visit_dates
  for delete to authenticated
  using (app_current_user_type() = 'manager');

drop policy if exists "authenticated_full_access" on public.monthly_goals;
create policy "select_dono_ou_gestor" on public.monthly_goals
  for select to authenticated
  using (app_current_user_type() = 'manager' or user_id = app_current_user_id());
create policy "insert_gestor" on public.monthly_goals
  for insert to authenticated
  with check (app_current_user_type() = 'manager');
create policy "update_gestor" on public.monthly_goals
  for update to authenticated
  using (app_current_user_type() = 'manager')
  with check (app_current_user_type() = 'manager');
create policy "delete_gestor" on public.monthly_goals
  for delete to authenticated
  using (app_current_user_type() = 'manager');

-- 6. authorization_history: cobrador vê o que pediu ou o que processou;
-- pede pra si mesmo ou gestor pede por ele; só gestor processa (aprova/nega).
drop policy if exists "authenticated_full_access" on public.authorization_history;

create policy "select_dono_ou_gestor" on public.authorization_history
  for select to authenticated
  using (
    app_current_user_type() = 'manager'
    or collector_id = app_current_user_id()
    or processed_by_id = app_current_user_id()
  );

create policy "insert_dono_ou_gestor" on public.authorization_history
  for insert to authenticated
  with check (
    app_current_user_type() = 'manager'
    or collector_id = app_current_user_id()
  );

create policy "update_gestor" on public.authorization_history
  for update to authenticated
  using (app_current_user_type() = 'manager')
  with check (app_current_user_type() = 'manager');

-- 7. RPCs sensíveis SECURITY DEFINER: trava real, no servidor, não mais só
-- de tela. SECURITY DEFINER ignora RLS por natureza -- por isso a checagem
-- tem que estar no corpo da função.
create or replace function public.atribuir_clientes_em_lote(p_user_id text, p_documentos text[] DEFAULT '{}'::text[], p_clientes text[] DEFAULT '{}'::text[], p_situacao text DEFAULT NULL::text, p_gerente_id text DEFAULT NULL::text, p_manter_situacoes text[] DEFAULT '{}'::text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF public.app_current_user_type() <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  PERFORM set_config('cobranca.motivo', 'atribuicao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_gerente_id, ''), true);

  -- NULL = ANY(...) resulta em NULL (nao TRUE), entao situacao vazia cai no
  -- ELSE e recebe a confirmacao — que e o desejado.
  UPDATE public."BANCO_DADOS" b
  SET user_id  = p_user_id::uuid,
      situacao = CASE
        WHEN p_situacao IS NULL THEN b.situacao
        WHEN b.situacao = ANY (COALESCE(p_manter_situacoes, '{}')) THEN b.situacao
        ELSE p_situacao
      END
  WHERE b.documento = ANY (p_documentos)
     OR b.cliente   = ANY (p_clientes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

create or replace function public.cancelar_vendas(p_documento text, p_motivo text, p_usuario_id uuid, p_chaves bigint[] DEFAULT NULL::bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF public.app_current_user_type() <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  IF p_chaves IS NOT NULL AND cardinality(p_chaves) = 0 THEN
    RETURN 0;
  END IF;

  -- CTEs que modificam dados rodam todas, mesmo sem serem lidas depois.
  WITH alvo AS (
    SELECT
      b.id_parcela,
      COALESCE(b.numero_titulo, b.venda_n, 0) AS chave,
      COALESCE(public.texto_para_valor(b.valor_original), 0) AS original,
      COALESCE(public.texto_para_valor(b.valor_original), 0)
        - COALESCE(public.texto_para_valor(b.valor_recebido), 0)
        - COALESCE(public.texto_para_valor(b.desconto), 0) AS saldo
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
           round(GREATEST(sum(a.saldo), 0), 2), trim(p_motivo), p_usuario_id
    FROM alvo a
    GROUP BY a.chave
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

  RETURN v_count;
END;
$function$;

create or replace function public.cancelar_clientes(p_documentos text[], p_motivo text, p_usuario_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc   text;
  v_total integer := 0;
BEGIN
  IF public.app_current_user_type() <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  FOREACH v_doc IN ARRAY COALESCE(p_documentos, '{}') LOOP
    v_total := v_total + public.cancelar_vendas(v_doc, p_motivo, p_usuario_id, NULL);
  END LOOP;
  RETURN v_total;
END;
$function$;

create or replace function public.liberar_cliente_da_carteira(p_documento text, p_situacao text, p_usuario_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF public.app_current_user_type() <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  PERFORM set_config('cobranca.motivo', 'liberacao: ' || COALESCE(p_situacao, ''), true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET situacao = p_situacao,
      user_id  = NULL
  WHERE b.documento = p_documento;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

create or replace function public.remover_cobrador_em_lote(p_documentos text[] DEFAULT '{}'::text[], p_clientes text[] DEFAULT '{}'::text[], p_usuario_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF public.app_current_user_type() <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  PERFORM set_config('cobranca.motivo', 'remocao', true);
  PERFORM set_config('cobranca.usuario_id', COALESCE(p_usuario_id, ''), true);

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL
  WHERE (b.documento = ANY (p_documentos) OR b.cliente = ANY (p_clientes))
    AND b.user_id IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

create or replace function public.registrar_ajuste_recebimento(p_client_document text, p_client_name text, p_sale_number integer, p_diferenca numeric, p_motivo text, p_usuario_id uuid, p_pagamento_estornado uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_usuario_nome text;
  v_original     public.sale_payments%ROWTYPE;
  v_ja_estornado numeric;
  v_disponivel   numeric;
  v_estorno      numeric := 0;
  v_resto        numeric;
BEGIN
  IF public.app_current_user_type() <> 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da correção.';
  END IF;
  IF p_diferenca IS NULL OR abs(p_diferenca) < 0.01 THEN
    RETURN;
  END IF;

  SELECT name INTO v_usuario_nome FROM public.users WHERE id = p_usuario_id;

  -- Ajuste positivo: nao e recebimento do cobrador; fica com quem editou.
  IF p_diferenca > 0 THEN
    INSERT INTO public.sale_payments (
      sale_number, client_document, client_name, payment_amount, payment_date,
      payment_method, notes, collector_id, collector_name, motivo,
      registrado_por_id
    ) VALUES (
      p_sale_number, p_client_document, p_client_name, round(p_diferenca, 2),
      v_hoje, 'Ajuste Administrativo', 'Correção manual do valor recebido',
      p_usuario_id, v_usuario_nome, trim(p_motivo), p_usuario_id
    );
    RETURN;
  END IF;

  -- Estorno de um pagamento do app.
  IF p_pagamento_estornado IS NOT NULL THEN
    SELECT * INTO v_original
    FROM public.sale_payments
    WHERE id = p_pagamento_estornado
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pagamento a estornar não encontrado.';
    END IF;
    IF v_original.client_document IS DISTINCT FROM p_client_document THEN
      RAISE EXCEPTION 'O pagamento escolhido é de outro cliente.';
    END IF;
    IF v_original.payment_amount <= 0 OR v_original.estorno_de IS NOT NULL
       OR v_original.payment_method ~* '^(ajuste|estorno)' THEN
      RAISE EXCEPTION 'Só é possível estornar um pagamento registrado no app.';
    END IF;

    SELECT COALESCE(-SUM(payment_amount), 0) INTO v_ja_estornado
    FROM public.sale_payments
    WHERE estorno_de = v_original.id;

    v_disponivel := v_original.payment_amount - v_ja_estornado;
    v_estorno := LEAST(-p_diferenca, GREATEST(v_disponivel, 0));

    IF v_estorno >= 0.01 THEN
      INSERT INTO public.sale_payments (
        sale_number, client_document, client_name, payment_amount,
        payment_date, payment_method, notes, collector_id, collector_name,
        estorno_de, motivo, registrado_por_id
      ) VALUES (
        p_sale_number, p_client_document, p_client_name, -round(v_estorno, 2),
        v_hoje, 'Estorno',
        'Estorno do pagamento de ' || to_char(v_original.payment_date, 'DD/MM/YYYY')
          || COALESCE(' registrado por ' || v_usuario_nome, ''),
        v_original.collector_id, v_original.collector_name,
        v_original.id, trim(p_motivo), p_usuario_id
      );
    ELSE
      v_estorno := 0;
    END IF;
  END IF;

  -- O que nao coube no pagamento escolhido (ou correcao sem pagamento do app):
  -- ajuste administrativo de quem editou.
  v_resto := -p_diferenca - v_estorno;
  IF v_resto >= 0.01 THEN
    INSERT INTO public.sale_payments (
      sale_number, client_document, client_name, payment_amount, payment_date,
      payment_method, notes, collector_id, collector_name, motivo,
      registrado_por_id
    ) VALUES (
      p_sale_number, p_client_document, p_client_name, -round(v_resto, 2),
      v_hoje, 'Estorno/Ajuste Negativo', 'Correção manual do valor recebido',
      p_usuario_id, v_usuario_nome, trim(p_motivo), p_usuario_id
    );
  END IF;
END;
$function$;

-- 8. Funcoes legadas sem nenhuma chamada em src/ (substituidas por
-- atribuir_clientes_em_lote/remover_cobrador_em_lote). Nao sao SECURITY
-- DEFINER, ficariam bloqueadas pelo trigger do item 1b mesmo assim -- mas e
-- mais simples so fechar o EXECUTE, reduz superficie sem motivo pra manter.
revoke execute on function public.atribuir_cobrador(text, uuid) from authenticated;
revoke execute on function public.atribuir_cobrador_parcela(bigint, uuid) from authenticated;
revoke execute on function public.atribuir_multiplos_clientes(text[], uuid) from authenticated;
revoke execute on function public.remover_cobrador(text) from authenticated;
revoke execute on function public.transferir_clientes(uuid, uuid) from authenticated;
