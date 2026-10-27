-- Item 1b / Fase 2 (docs/PROGRESSO.md): o ranking de Desempenho
-- (EnhancedPerformanceChart.tsx) credita titulos ao cobrador que tem HOJE o
-- user_id do cliente, mesmo quando o filtro de periodo olha pra um mes
-- passado. Reatribuir um cliente move junto os titulos que ja venceram sob
-- o cobrador anterior -- o mesmo problema ja corrigido pra "recebido"
-- (sale_payments, por data de pagamento) nao estava corrigido pra "carteira
-- do periodo" (contagem de titulos/clientes pagos x pendentes).
--
-- Versao simples decidida com o usuario (2026-10-27): dono = quem era dono
-- na DATA DE VENCIMENTO (ou lancamento, se so essa bateu no periodo) do
-- titulo -- nao o momento exato da quitacao (precisaria de
-- recebimentos_historico; adiado, ver PROGRESSO.md). O valor recebido em si
-- ja e correto hoje (sale_payments por data de pagamento); isto so corrige a
-- atribuicao de QUEM o titulo conta pra carteira do periodo.
--
-- Batch (nao um RPC por titulo): o front junta os pares unicos
-- (documento, data de referencia) de todos os titulos do periodo filtrado
-- numa chamada so. Testado no banco (leitura, sem gravar nada): ~280ms pra
-- 3000 pares (tamanho tipico de um mes inteiro de titulos e ~1800-2000
-- pares unicos) -- aceitavel pra uma tela que nao bloqueia login.
--
-- cobrador_anterior_id do primeiro evento POSTERIOR a data cobre o caso de um
-- titulo cuja data de referencia e anterior ao primeiro registro conhecido de
-- atribuicoes_historico (a tabela nao tem foto inicial, so comecou a
-- registrar toda mudanca a partir de 2026-05/2026-10); cair pro user_id
-- atual cobre quem nunca mudou de mao desde sempre (nenhum registro em
-- atribuicoes_historico pra esse documento).
CREATE OR REPLACE FUNCTION public.cobrador_na_data_em_lote(p_pares jsonb)
RETURNS TABLE (documento text, data date, cobrador_id text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p.documento,
    p.data,
    COALESCE(ult.cobrador_novo_id, prim.cobrador_anterior_id, atual.user_id::text)
  FROM jsonb_to_recordset(p_pares) AS p(documento text, data date)
  LEFT JOIN LATERAL (
    SELECT h.cobrador_novo_id
    FROM public.atribuicoes_historico h
    WHERE h.documento = p.documento
      AND h.assigned_at::date <= p.data
    ORDER BY h.assigned_at DESC, h.id DESC
    LIMIT 1
  ) ult ON true
  LEFT JOIN LATERAL (
    SELECT h.cobrador_anterior_id
    FROM public.atribuicoes_historico h
    WHERE h.documento = p.documento
      AND h.assigned_at::date > p.data
    ORDER BY h.assigned_at ASC, h.id ASC
    LIMIT 1
  ) prim ON ult.cobrador_novo_id IS NULL
  LEFT JOIN LATERAL (
    SELECT b.user_id
    FROM public."BANCO_DADOS" b
    WHERE b.documento = p.documento
    LIMIT 1
  ) atual ON ult.cobrador_novo_id IS NULL AND prim.cobrador_anterior_id IS NULL;
$$;

COMMENT ON FUNCTION public.cobrador_na_data_em_lote(jsonb) IS
  'Dado um lote de pares {documento, data}, devolve quem era o dono da carteira (atribuicoes_historico) naquela data -- cobrador_novo_id do ultimo evento ate a data, senao cobrador_anterior_id do primeiro evento depois dela, senao o user_id atual em BANCO_DADOS. Usado por EnhancedPerformanceChart.tsx para atribuir titulos de periodos passados ao cobrador que era dono na epoca, nao ao dono atual.';

GRANT EXECUTE ON FUNCTION public.cobrador_na_data_em_lote(jsonb) TO authenticated;
