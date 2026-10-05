-- Cliente quitado sai do trabalho de campo: as visitas em aberto dele sao
-- CANCELADAS automaticamente (nao apagadas).
--
-- POR QUE NAO ZERAR user_id: a carteira do cobrador e user_id em BANCO_DADOS,
-- mas o Desempenho (getCollectorPerformance, CollectorPerformanceModal,
-- EnhancedPerformanceChart) tambem credita vendas pagas e valor recebido por
-- esse mesmo campo. Zerar user_id de quem quitou tiraria do cobrador justamente
-- o credito pelo que ele recuperou. O cliente quitado continua atribuido; quem o
-- tira da lista de trabalho e o front (hasOpenBalance em src/filters/clientStatus).
--
-- POR QUE CANCELAR E NAO APAGAR: a visita e evidencia do trabalho de cobranca e
-- alimenta metricas de periodos ja fechados (ver docs/PROGRESSO.md, item 3).
--
-- POR QUE NO BANCO: parcela vira paga por dois caminhos — process_payment (baixa
-- no app) e o upsert da planilha (DatabaseUpload). Um gatilho cobre os dois.

-- 1) Regra unica "o cliente ainda deve?" no banco. Espelha getClientPending /
--    hasOpenBalance do front: soma de (original - recebido - desconto) de todas
--    as parcelas nao canceladas do cliente, tolerancia de 1 centavo. Usa os
--    VALORES e nao a coluna status: em 2026-10-05 havia 13 parcelas "Pago" com
--    saldo e 27 "Pago Parcial" sem saldo.
CREATE OR REPLACE FUNCTION public.cliente_tem_saldo_aberto(p_documento text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(
      COALESCE(NULLIF(REPLACE(b.valor_original, ',', '.'), '')::numeric, 0)
      - COALESCE(NULLIF(REPLACE(b.valor_recebido, ',', '.'), '')::numeric, 0)
      - COALESCE(NULLIF(REPLACE(b.desconto, ',', '.'), '')::numeric, 0)
    ) > 0.01,
    -- Sem nenhuma parcela ativa: nao ha o que concluir; trata como "deve" para
    -- nunca cancelar visita de um documento que nao reconhecemos.
    true
  )
  FROM public."BANCO_DADOS" b
  WHERE b.documento = p_documento
    AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado';
$$;

COMMENT ON FUNCTION public.cliente_tem_saldo_aberto(text) IS
  'Regra unica: cliente deve se a soma de original-recebido-desconto das parcelas nao canceladas passa de 0,01. Espelho de hasOpenBalance (src/filters/clientStatus.ts).';

GRANT EXECUTE ON FUNCTION public.cliente_tem_saldo_aberto(text) TO anon, authenticated;

-- 2) Cancela as visitas em aberto dos documentos informados que estao quitados.
--    "Em aberto" = agendada ou cancelamento_solicitado. pending_sync fica de
--    fora: e um desfecho registrado pelo cobrador aguardando sincronizar.
--    Nada e sobrescrito: o motivo vai para cancellation_request_reason so se o
--    cobrador ainda nao tiver informado um; quem aprovou fica como sistema.
CREATE OR REPLACE FUNCTION public.cancelar_visitas_de_clientes_quitados(
  p_documentos text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.scheduled_visits v
  SET status                      = 'cancelada',
      cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
      cancellation_request_reason = COALESCE(
        NULLIF(trim(v.cancellation_request_reason), ''),
        'Cancelada automaticamente: cliente quitou todas as dívidas'
      ),
      cancellation_approved_by    = 'sistema (cliente quitado)',
      cancellation_approved_at    = now(),
      updated_at                  = now()
  WHERE v.status IN ('agendada', 'cancelamento_solicitado')
    AND v.client_document = ANY (p_documentos)
    AND NOT public.cliente_tem_saldo_aberto(v.client_document);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 3) Gatilho por COMANDO (nao por linha): uma importacao de planilha com
--    milhares de parcelas dispara uma chamada so, com os documentos distintos.
--    A checagem de saldo so roda para quem tem visita em aberto (filtro acima).
CREATE OR REPLACE FUNCTION public.trg_cancelar_visitas_de_quitados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cancelar_visitas_de_clientes_quitados(
    ARRAY(
      SELECT DISTINCT n.documento
      FROM novas n
      WHERE n.documento IS NOT NULL
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cancelar_visitas_de_quitados_upd ON public."BANCO_DADOS";
CREATE TRIGGER cancelar_visitas_de_quitados_upd
  AFTER UPDATE ON public."BANCO_DADOS"
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_cancelar_visitas_de_quitados();

-- O upsert da planilha pode cair no ramo INSERT; transicao de INSERT exige um
-- gatilho separado.
DROP TRIGGER IF EXISTS cancelar_visitas_de_quitados_ins ON public."BANCO_DADOS";
CREATE TRIGGER cancelar_visitas_de_quitados_ins
  AFTER INSERT ON public."BANCO_DADOS"
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_cancelar_visitas_de_quitados();

-- 4) Acerto do que ja existe (em 2026-10-05: 7 visitas de clientes quitados).
SELECT public.cancelar_visitas_de_clientes_quitados(
  ARRAY(
    SELECT DISTINCT client_document
    FROM public.scheduled_visits
    WHERE status IN ('agendada', 'cancelamento_solicitado')
      AND client_document IS NOT NULL
  )
);
