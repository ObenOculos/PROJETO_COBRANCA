-- Agendamento ativo segue o cliente quando ele sai da carteira do cobrador.
--
-- MOTIVO (2026-11-09): nenhum caminho que tira o cliente da carteira
-- (inativar cobrador, distribuicao, remover cobrador, liberar) mexia no
-- agendamento ativo. O agendamento ficava com quem nao tem mais o cliente
-- (RLS esconde dele), aparecia como atrasado no Acompanhamento e, como so
-- pode haver um agendamento ativo por cliente (uniq_active_visit_per_client),
-- bloqueava o novo cobrador de agendar ("ja tem um agendamento ativo").
-- Em producao havia 20 assim (16 de cobrador inativado, abril/2026; 4 de
-- clientes removidos de um externo) -- limpos no fim desta migration.
--
-- Regra (gatilho por comando em BANCO_DADOS, so quando user_id muda):
--   agendamento ativo cujo cobrador nao tem mais nenhuma parcela do cliente
--   -> se o cliente tem novo cobrador e o canal combina com o perfil dele
--      (presencial = Externo; ligacao/whatsapp = carteira), passa para ele;
--   -> senao, e cancelado ("cliente saiu da carteira do cobrador"), com os
--      mesmos campos de cancelamento do cancelamento automatico de quitados.
-- Fato historico nao muda: so mexe em status 'agendada'/'cancelamento_solicitado'.

CREATE OR REPLACE FUNCTION public.trg_agendamento_segue_carteira()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Caminho rapido: o sync do Ciclone atualiza parcelas o tempo todo sem
  -- mudar o cobrador.
  IF NOT EXISTS (
    SELECT 1
    FROM novas n
    JOIN antigas o ON o.id_parcela = n.id_parcela
    WHERE o.user_id IS DISTINCT FROM n.user_id
  ) THEN
    RETURN NULL;
  END IF;

  WITH docs AS (
    SELECT DISTINCT n.documento
    FROM novas n
    JOIN antigas o ON o.id_parcela = n.id_parcela
    WHERE n.documento IS NOT NULL
      AND o.user_id IS DISTINCT FROM n.user_id
  ),
  orfaos AS (
    -- Agendamento ativo cujo cobrador nao tem mais parcela do cliente; novo
    -- dono = quem tem mais parcelas do cliente agora.
    SELECT v.id, v.channel, v.status, dono.user_id AS novo_dono, u.type AS novo_tipo
    FROM public.scheduled_visits v
    JOIN docs d ON d.documento = v.client_document
    LEFT JOIN LATERAL (
      SELECT b.user_id
      FROM public."BANCO_DADOS" b
      WHERE b.documento = v.client_document
        AND b.user_id IS NOT NULL
      GROUP BY b.user_id
      ORDER BY count(*) DESC, b.user_id
      LIMIT 1
    ) dono ON true
    LEFT JOIN public.users u ON u.id = dono.user_id
    WHERE v.status IN ('agendada', 'cancelamento_solicitado')
      AND NOT EXISTS (
        SELECT 1
        FROM public."BANCO_DADOS" b
        WHERE b.documento = v.client_document
          AND b.user_id::text = v.collector_id
      )
  ),
  movidos AS (
    -- 1. Passa para o novo cobrador quando o canal e do perfil dele.
    UPDATE public.scheduled_visits v
    SET collector_id = o.novo_dono::text,
        updated_at   = now()
    FROM orfaos o
    WHERE v.id = o.id
      AND o.status = 'agendada'
      AND o.novo_dono IS NOT NULL
      AND (
        (o.channel = 'presencial' AND o.novo_tipo = 'collector')
        OR (o.channel IN ('ligacao', 'whatsapp')
            AND o.novo_tipo IN ('internal_collector', 'third_party_collector', 'legal_collector'))
      )
    RETURNING v.id
  )
  -- 2. O resto e cancelado.
  UPDATE public.scheduled_visits v
  SET status                      = 'cancelada',
      cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
      cancellation_request_reason = COALESCE(
        NULLIF(trim(v.cancellation_request_reason), ''),
        'Cancelada automaticamente: cliente saiu da carteira do cobrador'
      ),
      cancellation_approved_by    = 'sistema (saiu da carteira)',
      cancellation_approved_at    = now(),
      updated_at                  = now()
  FROM orfaos o
  WHERE v.id = o.id
    AND o.id NOT IN (SELECT id FROM movidos);

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.trg_agendamento_segue_carteira() IS
  'Cliente mudou de cobrador: agendamento ativo do cobrador antigo passa ao novo (canal compativel) ou e cancelado.';

REVOKE ALL ON FUNCTION public.trg_agendamento_segue_carteira() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agendamento_segue_carteira_upd ON public."BANCO_DADOS";
CREATE TRIGGER agendamento_segue_carteira_upd
  AFTER UPDATE ON public."BANCO_DADOS"
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_agendamento_segue_carteira();

-- Limpeza dos que ja estavam presos (autorizada pelo usuario em 2026-11-09):
-- agendamento ativo de quem nao tem mais nenhuma parcela do cliente. Mesma
-- regra -- e nenhum desses clientes tem cobrador hoje, entao todos cancelam.
UPDATE public.scheduled_visits v
SET status                      = 'cancelada',
    cancellation_request_date   = COALESCE(v.cancellation_request_date, now()),
    cancellation_request_reason = COALESCE(
      NULLIF(trim(v.cancellation_request_reason), ''),
      'Cancelada automaticamente: cliente saiu da carteira do cobrador'
    ),
    cancellation_approved_by    = 'sistema (saiu da carteira)',
    cancellation_approved_at    = now(),
    updated_at                  = now()
WHERE v.status IN ('agendada', 'cancelamento_solicitado')
  AND NOT EXISTS (
    SELECT 1
    FROM public."BANCO_DADOS" b
    WHERE b.documento = v.client_document
      AND b.user_id::text = v.collector_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public."BANCO_DADOS" b
    WHERE b.documento = v.client_document
      AND b.user_id IS NOT NULL
  );
