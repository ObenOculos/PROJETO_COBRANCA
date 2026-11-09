-- Distribuicao: quando os pagamentos de cada loja chegaram ao sistema.
--
-- MOTIVO (item 34, 2026-11-09): um cliente foi distribuido por um atraso que
-- ja nao existia -- a parcela foi paga na loja em 04/11, mas o pagamento so
-- entrou no sistema em 09/11 (importacao). A distribuicao decide com os dados
-- do momento; o gestor precisa ver, antes de simular, se os pagamentos de cada
-- loja estao atualizados.
--
-- Nao ha tabela de log de importacao. O melhor sinal disponivel e o
-- recebimentos_historico: toda baixa que chega de FORA do app (sync do
-- Ciclone, planilha/importacao -- origem <> 'app') fica registrada com a hora
-- em que entrou no sistema (registrado_em). A mais recente por loja = ultima
-- vez que pagamentos daquela loja foram atualizados. Loja sem nenhuma baixa
-- externa volta NULL.
--
-- So leitura, so gestor (mesmo guard das outras funcoes da distribuicao).

CREATE OR REPLACE FUNCTION public.lojas_ultima_baixa_externa()
 RETURNS TABLE(loja text, ultima_baixa timestamptz)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem ver a atualização das lojas.';
  END IF;

  RETURN QUERY
  SELECT l.nome_da_loja, u.ultima
  FROM (
    SELECT DISTINCT b.nome_da_loja
    FROM public."BANCO_DADOS" b
    WHERE b.nome_da_loja IS NOT NULL
  ) l
  LEFT JOIN (
    SELECT b.nome_da_loja, max(h.registrado_em) AS ultima
    FROM public.recebimentos_historico h
    JOIN public."BANCO_DADOS" b ON b.id_parcela = h.id_parcela
    WHERE h.origem IS DISTINCT FROM 'app'
    GROUP BY b.nome_da_loja
  ) u ON u.nome_da_loja = l.nome_da_loja
  ORDER BY l.nome_da_loja;
END;
$function$;

COMMENT ON FUNCTION public.lojas_ultima_baixa_externa() IS
  'Por loja: quando a ultima baixa vinda de fora do app (sync/importacao) entrou no sistema. Aviso de dados desatualizados na tela Distribuicao.';

REVOKE ALL ON FUNCTION public.lojas_ultima_baixa_externa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lojas_ultima_baixa_externa() TO authenticated, service_role;
