-- "Cliente informa venda cancelada" (Resultado do Contato, 2026-11-10).
--
-- O cobrador marca qual(is) venda(s) o cliente diz que foi cancelada. As
-- parcelas EM ABERTO dessas vendas saem da carteira/fila dele na hora, com
-- situacao "Aguardando conferência"; as outras vendas do cliente continuam
-- com ele. O gestor confere: confirma o cancelamento (cancelar_vendas, com o
-- registro em vendas_canceladas) ou devolve as parcelas ao cobrador.
--
-- Por que conferencia e nao cancelamento direto: as vendas da Focco vem do
-- ERP Ciclone, e no sync diario o ERP vence -- uma venda cancelada so no app
-- voltaria no dia seguinte; e cancelar sem conferencia deixaria uma divida
-- "sumir" sem o financeiro saber.
--
-- vendas_conferencia e o registro da informacao (fato historico): so a
-- decisao (status/decidido_*) e preenchida depois, pela funcao do gestor.

CREATE TABLE public.vendas_conferencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento text NOT NULL,
  chave_venda bigint NOT NULL,
  -- Parcelas em aberto que sairam da carteira (as que voltam se devolver).
  parcelas bigint[] NOT NULL,
  valor_em_aberto numeric(12,2) NOT NULL,
  -- Dono da carteira na hora (para quem as parcelas voltam).
  cobrador_id uuid REFERENCES public.users(id),
  informado_por uuid NOT NULL REFERENCES public.users(id),
  informado_em timestamptz NOT NULL DEFAULT now(),
  observacao text NOT NULL CHECK (length(trim(observacao)) > 0),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmada', 'devolvida')),
  decidido_por uuid REFERENCES public.users(id),
  decidido_em timestamptz,
  decisao_motivo text,
  CHECK (status = 'pendente' OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL))
);

COMMENT ON TABLE public.vendas_conferencia IS
  'Venda que o cliente informou ter sido cancelada: aguarda o gestor confirmar o cancelamento ou devolver ao cobrador.';

CREATE INDEX vendas_conferencia_status_idx ON public.vendas_conferencia (status, informado_em);
CREATE INDEX vendas_conferencia_documento_idx ON public.vendas_conferencia (documento);

ALTER TABLE public.vendas_conferencia ENABLE ROW LEVEL SECURITY;

-- Le: gestor, quem informou ou o dono da carteira. Escrita so pelas funcoes.
CREATE POLICY select_envolvidos_ou_gestor ON public.vendas_conferencia
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR informado_por = (SELECT app_current_user_id())
    OR cobrador_id = (SELECT app_current_user_id())
  );

REVOKE ALL ON public.vendas_conferencia FROM anon, authenticated;
GRANT SELECT ON public.vendas_conferencia TO authenticated;

-- Cobrador (ou gestor, em nome do cobrador da carteira) informa a venda
-- cancelada. Registra o atendimento nas parcelas dessas vendas (resultado
-- sale_cancel_reported), grava a informacao e tira as parcelas em aberto da
-- carteira. Tudo numa transacao.
CREATE OR REPLACE FUNCTION public.informar_venda_cancelada(
  p_documento text,
  p_chaves bigint[],
  p_observacao text,
  p_tipo_contato text DEFAULT 'call',
  p_em_nome_de uuid DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_autor uuid := (SELECT app_current_user_id());
  v_tipo text := (SELECT app_current_user_type());
  v_resp uuid;
  v_hoje text := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
  v_count integer;
BEGIN
  IF v_autor IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;
  IF v_tipo IS NULL
     OR v_tipo NOT IN ('manager', 'internal_collector', 'third_party_collector', 'legal_collector', 'collector') THEN
    RAISE EXCEPTION 'Perfil sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_observacao), '') IS NULL THEN
    RAISE EXCEPTION 'Descreva o que o cliente informou sobre o cancelamento.';
  END IF;
  IF p_chaves IS NULL OR cardinality(p_chaves) = 0 THEN
    RAISE EXCEPTION 'Marque a venda que o cliente informou como cancelada.';
  END IF;
  IF p_tipo_contato NOT IN ('call', 'whatsapp', 'visit', 'email') THEN
    RAISE EXCEPTION 'Canal de contato inválido.';
  END IF;

  -- Responsavel do atendimento: quem registra, ou (so gestor) o cobrador
  -- escolhido -- mesma regra do registrar_contato.
  v_resp := v_autor;
  IF p_em_nome_de IS NOT NULL AND p_em_nome_de IS DISTINCT FROM v_autor THEN
    IF v_tipo IS DISTINCT FROM 'manager' THEN
      RAISE EXCEPTION 'Só o gestor pode registrar em nome de outro usuário.'
        USING ERRCODE = '42501';
    END IF;
    v_resp := p_em_nome_de;
  END IF;

  CREATE TEMP TABLE _alvo ON COMMIT DROP AS
  SELECT b.id_parcela,
         COALESCE(b.numero_titulo, b.venda_n, 0) AS chave,
         b.user_id,
         COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0) AS saldo
  FROM public."BANCO_DADOS" b
  WHERE b.documento = p_documento
    AND COALESCE(b.numero_titulo, b.venda_n, 0) = ANY (p_chaves)
    AND lower(trim(COALESCE(b.status, ''))) NOT IN ('cancelado', 'agrupado', 'renegociado')
    AND COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0) > 0.009;

  IF NOT EXISTS (SELECT 1 FROM _alvo) THEN
    RAISE EXCEPTION 'Essas vendas não têm parcela em aberto.';
  END IF;

  -- Cobrador so informa venda da propria carteira (todas as parcelas dele).
  IF v_tipo IS DISTINCT FROM 'manager'
     AND EXISTS (SELECT 1 FROM _alvo WHERE user_id IS DISTINCT FROM v_autor) THEN
    RAISE EXCEPTION 'Essa venda não está (inteira) na sua carteira.';
  END IF;
  IF v_resp IS DISTINCT FROM v_autor
     AND EXISTS (SELECT 1 FROM _alvo WHERE user_id IS DISTINCT FROM v_resp) THEN
    RAISE EXCEPTION 'Essa venda não está na carteira do cobrador escolhido.';
  END IF;

  IF EXISTS (SELECT 1 FROM _alvo a WHERE public.titulo_em_acordo_ativo(a.id_parcela)) THEN
    RAISE EXCEPTION 'Essa venda está em um acordo ativo: cancele o acordo antes de informar o cancelamento da venda.';
  END IF;

  -- 1. Atendimento registrado nas parcelas dessas vendas.
  INSERT INTO public.collection_attempts (
    collection_id, date, type, result, notes, collector_id, registrado_por_id
  )
  SELECT a.id_parcela::text, v_hoje, p_tipo_contato, 'sale_cancel_reported',
         trim(p_observacao), v_resp, v_autor
  FROM _alvo a;

  -- 2. Registro da informacao, uma linha por venda.
  INSERT INTO public.vendas_conferencia (
    documento, chave_venda, parcelas, valor_em_aberto, cobrador_id,
    informado_por, observacao
  )
  SELECT p_documento, a.chave, array_agg(a.id_parcela ORDER BY a.id_parcela),
         round(sum(a.saldo), 2), max(a.user_id::text)::uuid, v_autor, trim(p_observacao)
  FROM _alvo a
  GROUP BY a.chave;

  -- 3. Parcelas em aberto saem da carteira ate a conferencia.
  PERFORM set_config('cobranca.motivo', 'venda informada como cancelada (aguardando conferência)', true);
  PERFORM set_config('cobranca.usuario_id', v_autor::text, true);
  PERFORM set_config('cobranca.liberacao_autorizada', 'true', true);

  UPDATE public."BANCO_DADOS" b
  SET situacao = 'Aguardando conferência',
      user_id = NULL
  FROM _alvo a
  WHERE b.id_parcela = a.id_parcela;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('cobranca.liberacao_autorizada', '', true);
  RETURN v_count;
END;
$function$;

-- Gestor decide: 'confirmar' (cancela a venda pelo caminho de sempre) ou
-- 'devolver' (parcelas voltam a quem tinha a carteira).
CREATE OR REPLACE FUNCTION public.decidir_venda_cancelada(
  p_conferencia_id uuid,
  p_decisao text,
  p_motivo text
)
 RETURNS public.vendas_conferencia
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_autor uuid := (SELECT app_current_user_id());
  v_conf public.vendas_conferencia%ROWTYPE;
  v_tipo_cobrador text;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem conferir vendas canceladas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_decisao NOT IN ('confirmar', 'devolver') THEN
    RAISE EXCEPTION 'Decisão inválida.';
  END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da decisão.';
  END IF;

  SELECT * INTO v_conf FROM public.vendas_conferencia
  WHERE id = p_conferencia_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conferência não encontrada.';
  END IF;
  IF v_conf.status <> 'pendente' THEN
    RAISE EXCEPTION 'Esta venda já foi conferida (%).', v_conf.status;
  END IF;

  IF p_decisao = 'confirmar' THEN
    PERFORM public.cancelar_vendas(
      v_conf.documento,
      'Venda cancelada (informada no atendimento e conferida): ' || trim(p_motivo),
      v_autor,
      ARRAY[v_conf.chave_venda]
    );
  ELSE
    SELECT type INTO v_tipo_cobrador FROM public.users WHERE id = v_conf.cobrador_id;
    PERFORM set_config('cobranca.motivo', 'venda devolvida após conferência: ' || trim(p_motivo), true);
    PERFORM set_config('cobranca.usuario_id', v_autor::text, true);
    UPDATE public."BANCO_DADOS" b
    SET user_id = v_conf.cobrador_id,
        situacao = public.situacao_primaria_do_tipo(v_tipo_cobrador)
    WHERE b.id_parcela = ANY (v_conf.parcelas)
      AND b.user_id IS NULL
      AND b.situacao = 'Aguardando conferência';
  END IF;

  UPDATE public.vendas_conferencia
  SET status = CASE WHEN p_decisao = 'confirmar' THEN 'confirmada' ELSE 'devolvida' END,
      decidido_por = v_autor,
      decidido_em = now(),
      decisao_motivo = trim(p_motivo)
  WHERE id = p_conferencia_id
  RETURNING * INTO v_conf;

  RETURN v_conf;
END;
$function$;

REVOKE ALL ON FUNCTION public.informar_venda_cancelada(text, bigint[], text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_venda_cancelada(text, bigint[], text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decidir_venda_cancelada(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_venda_cancelada(uuid, text, text) TO authenticated, service_role;
