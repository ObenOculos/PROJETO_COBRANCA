-- Etapa 7 da iniciativa de metas/vinculo gerente-cobrador/carteira
-- automatica (ver memoria estado-metas-vinculo-carteira): deteccao (e,
-- separadamente, execucao) da saida automatica de cliente da carteira
-- quando ultrapassa a faixa de atraso do PROPRIO cobrador
-- (collector_overdue_ranges). So o gatilho de "ultrapassou o teto" (regra
-- que o usuario descreveu) -- nao mexe em cliente abaixo do piso da faixa,
-- isso e outra decisao (atribuicao errada desde o inicio) que o pedido
-- original nao cobriu.
--
-- Decisoes de negocio fechadas com o usuario em 2026-11-03:
--   - granularidade por CLIENTE (documento), nao por venda;
--   - saida cai em fila do gestor (user_id = NULL), sem reatribuicao
--     automatica a outro cobrador;
--   - acordo ativo trava (ja existia, cliente_tem_acordo_ativo) e visita
--     agendada ativa tambem passa a travar (novo guard abaixo).
--
-- clientes_fora_da_faixa() e so leitura (dry-run) -- usada pela UI de
-- "clientes que sairiam" no painel do gestor (etapa 8) ANTES de qualquer
-- execucao real. executar_saida_carteira_fora_da_faixa() existe mas NAO
-- esta ligada a nenhum botao/cron -- ativar isso e decisao separada,
-- pendente de confirmacao explicita do usuario (ver conversa).

-- 1) Guard novo: visita agendada ATIVA (mesmos 2 status que process_payment
-- ja trata como "em aberto" em scheduled_visits).
CREATE OR REPLACE FUNCTION public.cliente_tem_visita_agendada_ativa(p_documento text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scheduled_visits v
    WHERE v.client_document = p_documento
      AND v.status IN ('agendada', 'cancelamento_solicitado')
  );
$$;

COMMENT ON FUNCTION public.cliente_tem_visita_agendada_ativa(text) IS
  'True quando o cliente tem visita agendada em aberto (mesmos status que process_payment trata como ativos). Trava a saida automatica de carteira por faixa, igual acordo ativo.';

REVOKE EXECUTE ON FUNCTION public.cliente_tem_visita_agendada_ativa(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cliente_tem_visita_agendada_ativa(text) TO authenticated;

-- 2) Deteccao (dry-run): quem ultrapassou o teto da propria faixa, e se
-- ha algo bloqueando a saida. Fonte unica para a UI de pre-visualizacao E
-- para a funcao de execucao abaixo -- nunca duas queries calculando a
-- mesma coisa.
CREATE OR REPLACE FUNCTION public.clientes_fora_da_faixa()
RETURNS TABLE (
  documento text,
  cliente text,
  collector_id uuid,
  collector_name text,
  atraso_atual integer,
  faixa_min integer,
  faixa_max integer,
  dias_excedidos integer,
  bloqueado_por text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    doc.documento,
    doc.cliente,
    doc.user_id AS collector_id,
    u.name AS collector_name,
    atraso.dias AS atraso_atual,
    faixa.min_dias AS faixa_min,
    faixa.max_dias AS faixa_max,
    atraso.dias - faixa.max_dias AS dias_excedidos,
    CASE
      WHEN public.cliente_tem_acordo_ativo(doc.documento) THEN 'acordo_ativo'
      WHEN public.cliente_tem_visita_agendada_ativa(doc.documento) THEN 'visita_agendada'
      ELSE NULL
    END AS bloqueado_por
  FROM (
    SELECT DISTINCT b.documento, b.cliente, b.user_id
    FROM public."BANCO_DADOS" b
    WHERE b.user_id IS NOT NULL
      AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
  ) doc
  JOIN public.users u ON u.id = doc.user_id
  JOIN public.collector_overdue_ranges faixa
    ON faixa.collector_id = doc.user_id AND faixa.vigente_ate IS NULL
  CROSS JOIN LATERAL (
    SELECT public.cliente_max_atraso_dias(doc.documento) AS dias
  ) atraso
  WHERE faixa.max_dias IS NOT NULL
    AND atraso.dias >= faixa.max_dias;
$$;

COMMENT ON FUNCTION public.clientes_fora_da_faixa() IS
  'Dry-run: clientes cujo atraso atual ultrapassou o teto da faixa do proprio cobrador. bloqueado_por explica por que um cliente elegivel ainda nao sairia (acordo_ativo/visita_agendada) -- NULL = sairia de fato se executar_saida_carteira_fora_da_faixa rodasse agora. So leitura, sem efeito colateral.';

REVOKE EXECUTE ON FUNCTION public.clientes_fora_da_faixa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clientes_fora_da_faixa() TO authenticated;

-- 3) Execucao real -- construida e testavel, mas NAO chamada por nenhum
-- cron nem botao ainda (ver comentario no topo). Reusa clientes_fora_da_faixa
-- pra decidir quem mexer (so bloqueado_por IS NULL) e o mesmo padrao de
-- auditoria das RPCs manuais (set_config + UPDATE, trigger historico_carteira_upd
-- grava em atribuicoes_historico automaticamente).
CREATE OR REPLACE FUNCTION public.executar_saida_carteira_fora_da_faixa()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- IS DISTINCT FROM, nao <>: anonimo (sem sessao) tem app_current_user_type()
  -- NULL, e "NULL <> 'manager'" avalia NULL (nao TRUE) -- um IF com
  -- condicao NULL nao executa o THEN, entao esse guard com <> deixava
  -- passar quem nao tem sessao nenhuma. IS DISTINCT FROM trata NULL como
  -- valor de verdade (NULL IS DISTINCT FROM 'manager' = true), fechando o
  -- buraco. Mesmo problema encontrado em varias RPCs preexistentes
  -- (atribuir_clientes_em_lote, remover_cobrador_em_lote, cancelar_vendas,
  -- cancelar_clientes, liberar_cliente_da_carteira,
  -- registrar_ajuste_recebimento, protege_atribuicao_banco_dados, e o
  -- padrao correspondente em criar_acordo/cancelar_acordo/
  -- registrar_pagamento_acordo) -- fora de escopo desta migration,
  -- reportado ao usuario separadamente.
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar a saida automatica de carteira.';
  END IF;

  PERFORM set_config('cobranca.motivo', 'fora_da_faixa', true);
  PERFORM set_config(
    'cobranca.usuario_id',
    COALESCE((SELECT app_current_user_id())::text, ''),
    true
  );

  UPDATE public."BANCO_DADOS" b
  SET user_id = NULL
  WHERE b.documento IN (
    SELECT f.documento FROM public.clientes_fora_da_faixa() f
    WHERE f.bloqueado_por IS NULL
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.executar_saida_carteira_fora_da_faixa() IS
  'Move pra fila do gestor (user_id = NULL) todo cliente elegivel de clientes_fora_da_faixa(). NAO esta ligada a cron nem UI -- ativacao e decisao separada. Auditoria automatica via trigger historico_carteira_upd (motivo fora_da_faixa).';

REVOKE EXECUTE ON FUNCTION public.executar_saida_carteira_fora_da_faixa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executar_saida_carteira_fora_da_faixa() TO authenticated;
