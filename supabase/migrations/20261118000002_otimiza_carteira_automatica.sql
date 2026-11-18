-- Resumo por Cobrador (gestor) ficava lento ao trocar o filtro de periodo
-- (achado pelo usuario em 2026-11-18). Dois problemas, nesta migration:
--
-- 1) collection_attempts nao tinha indice em `date` -- toda consulta de
--    "Clientes acionados" filtra por esse intervalo, e a do gestor (sem
--    collector_id) fazia varredura sequencial na tabela inteira a cada
--    troca de filtro.
-- 2) "Entraram no periodo"/"Sairam no periodo"/"Saidas sem acao" (card
--    Carteira automatica) baixavam TODA linha de atribuicoes_historico do
--    intervalo pro navegador so pra contar e agrupar em JS -- useful so pro
--    numero, nunca pra lista (a lista detalhada so e usada no modal de UM
--    cobrador por vez, quando o gestor clica "saidas sem acao"). Pra
--    periodo largo ("Tudo"/"Mes") isso vira bastante trafego e processamento
--    no navegador, sem nenhum indice ajudar (o filtro ja usava
--    idx_atrib_assigned_at). Index novo em (motivo, assigned_at) ajuda o
--    recorte por motivo; a RPC carteira_movimentacao_periodo move a
--    contagem pro banco, devolvendo so um numero por cobrador.

-- ---------------------------------------------------------------------------
-- 1) Indices
-- ---------------------------------------------------------------------------

-- date lidera (bate o formato das duas consultas: com e sem collector_id);
-- collector_id como 2a coluna serve o caso do cobrador (Meu desempenho) sem
-- precisar de um indice separado.
CREATE INDEX IF NOT EXISTS idx_collection_attempts_date
  ON public.collection_attempts (date, collector_id);

-- motivo e bem seletivo (so "fora_da_faixa_sem_acao" entre todos os eventos
-- de atribuicoes_historico); liderando o indice, o banco acha direto em vez
-- de varrer todo o intervalo de assigned_at pra so depois filtrar motivo.
CREATE INDEX IF NOT EXISTS idx_atrib_motivo_assigned_at
  ON public.atribuicoes_historico (motivo, assigned_at);

-- ---------------------------------------------------------------------------
-- 2) RPC: entradas/saidas/saidas-sem-acao agregadas por cobrador
-- ---------------------------------------------------------------------------

-- Mesma logica que estava em CollectorsSummary.tsx (movCarteira): um evento
-- conta "entrou" pro cobrador_novo_id e "saiu" pro cobrador_anterior_id,
-- ignorando evento sem mudanca real (novo = anterior); cliente contado uma
-- vez por cobrador no periodo mesmo se saiu/entrou mais de uma vez
-- (count distinct documento, nao count(*)). "Saidas sem acao" e o mesmo
-- recorte de sairam, so com motivo = 'fora_da_faixa_sem_acao'.
CREATE OR REPLACE FUNCTION public.carteira_movimentacao_periodo(
  p_inicio date, p_fim date
)
RETURNS TABLE (
  cobrador_id uuid,
  entraram integer,
  sairam integer,
  saidas_sem_acao integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem ver a movimentação de carteira.';
  END IF;

  RETURN QUERY
  WITH periodo AS (
    SELECT h.documento, h.cobrador_novo_id, h.cobrador_anterior_id, h.motivo
    FROM public.atribuicoes_historico h
    -- Mesmo ajuste de fuso que o front fazia (Brasilia, sem horario de
    -- verao): o dia local comeca as 03:00 UTC.
    WHERE h.assigned_at >= (p_inicio::text || 'T00:00:00-03:00')::timestamptz
      AND h.assigned_at <= (p_fim::text || 'T23:59:59.999-03:00')::timestamptz
      AND h.cobrador_novo_id IS DISTINCT FROM h.cobrador_anterior_id
  ),
  entradas AS (
    SELECT cobrador_novo_id::uuid AS id, count(DISTINCT documento) AS n
    FROM periodo
    WHERE cobrador_novo_id IS NOT NULL
    GROUP BY cobrador_novo_id
  ),
  saidas AS (
    SELECT cobrador_anterior_id::uuid AS id, count(DISTINCT documento) AS n
    FROM periodo
    WHERE cobrador_anterior_id IS NOT NULL
    GROUP BY cobrador_anterior_id
  ),
  saidas_sa AS (
    SELECT cobrador_anterior_id::uuid AS id, count(DISTINCT documento) AS n
    FROM periodo
    WHERE cobrador_anterior_id IS NOT NULL
      AND motivo = 'fora_da_faixa_sem_acao'
    GROUP BY cobrador_anterior_id
  )
  SELECT
    coalesce(e.id, s.id, sa.id),
    coalesce(e.n, 0)::integer,
    coalesce(s.n, 0)::integer,
    coalesce(sa.n, 0)::integer
  FROM entradas e
  FULL OUTER JOIN saidas s ON s.id = e.id
  FULL OUTER JOIN saidas_sa sa ON sa.id = coalesce(e.id, s.id);
END;
$function$;

COMMENT ON FUNCTION public.carteira_movimentacao_periodo(date, date) IS
  'Entradas/saidas/saidas-sem-acao por cobrador no periodo, agregado no banco. Substitui o fetch de linha crua de atribuicoes_historico que o Resumo por Cobrador fazia (movCarteira/useSaidasSemAcao sem cobrador_id).';

REVOKE ALL ON FUNCTION public.carteira_movimentacao_periodo(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_movimentacao_periodo(date, date) TO authenticated;
