-- Historico de carteira e de recebimentos: leitura por perfil.
--
-- MOTIVO (2026-11-09): a aba "Historico" do Detalhes do Cliente passa a
-- existir para o cobrador tambem, mas a linha do tempo da carteira (quem teve
-- o cliente e quem transferiu) continua so do gestor. Ate aqui as duas tabelas
-- tinham SELECT liberado para qualquer usuario logado (policy
-- "authenticated_read_only", etapa 2a) -- o que escondia esses dados era so o
-- botao na tela.
--
-- Nova regra de leitura (escrita continua so pelos gatilhos SECURITY DEFINER,
-- sem policy de INSERT/UPDATE/DELETE):
--   atribuicoes_historico : gestor, ou registro em que o proprio usuario e o
--                           cobrador novo ou o anterior.
--   recebimentos_historico: gestor, ou baixa de parcela que hoje esta na
--                           carteira do usuario, ou baixa feita quando a
--                           parcela era da carteira dele.
--
-- Quem le hoje (conferido 2026-11-09): telas de gestor (Desempenho,
-- Resumo por Cobrador, relatorio de atribuicao, Historico do cliente),
-- cobrador_na_data_em_lote (INVOKER, so chamada pelo Desempenho do gestor) e
-- lojas_ultima_baixa_externa (DEFINER). Os gatilhos que gravam sao DEFINER e
-- nao dependem de SELECT.

DROP POLICY IF EXISTS "authenticated_read_only" ON public.atribuicoes_historico;
CREATE POLICY "gestor_ou_envolvido_le" ON public.atribuicoes_historico
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR cobrador_novo_id = (SELECT app_current_user_id())::text
    OR cobrador_anterior_id = (SELECT app_current_user_id())::text
  );

DROP POLICY IF EXISTS "authenticated_read_only" ON public.recebimentos_historico;
CREATE POLICY "gestor_ou_dono_da_parcela_le" ON public.recebimentos_historico
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR cobrador_carteira_id = (SELECT app_current_user_id())
    OR EXISTS (
      SELECT 1
      FROM public."BANCO_DADOS" b
      WHERE b.id_parcela = recebimentos_historico.id_parcela
        AND b.user_id = (SELECT app_current_user_id())
    )
  );
