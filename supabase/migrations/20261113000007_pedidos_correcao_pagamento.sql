-- Item 62, etapa 2 -- o cobrador pede correcao de um pagamento que ele
-- registrou; o gestor estorna (com um clique) ou recusa com resposta.
-- Substitui o token de autorizacao (authorization_history), que so era
-- conferido na tela e nem funcionava para o cobrador (a gravacao ja era so de
-- gestor).
--
-- O pedido e o fato do cobrador (nao se apaga nem se edita); a decisao do
-- gestor e gravada uma vez, pela RPC decidir_pedido_correcao (sem policy de
-- UPDATE/DELETE).

CREATE TABLE public.pedidos_correcao_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_payment_id uuid NOT NULL REFERENCES public.sale_payments(id),
  documento text NOT NULL,
  cliente text,
  valor numeric(14, 2) NOT NULL CHECK (valor > 0),
  motivo text NOT NULL CHECK (length(trim(motivo)) > 0),
  solicitado_por_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decisao text CHECK (decisao IN ('estornado', 'recusado')),
  estorno_id uuid REFERENCES public.sale_payments(id),
  resposta text,
  decidido_por_id uuid REFERENCES public.users(id),
  decidido_em timestamptz,
  CHECK ((decisao IS NULL) = (decidido_em IS NULL)),
  CHECK (decisao IS DISTINCT FROM 'estornado' OR estorno_id IS NOT NULL),
  CHECK (decisao IS DISTINCT FROM 'recusado'
         OR length(trim(coalesce(resposta, ''))) > 0)
);

COMMENT ON TABLE public.pedidos_correcao_pagamento IS
  'Pedido do cobrador para corrigir (estornar) um pagamento que registrou; o gestor decide uma vez (estornado/recusado).';

-- Um pedido em aberto por pagamento.
CREATE UNIQUE INDEX pedidos_correcao_pagamento_aberto_uidx
  ON public.pedidos_correcao_pagamento (sale_payment_id)
  WHERE decisao IS NULL;
CREATE INDEX pedidos_correcao_pagamento_documento_idx
  ON public.pedidos_correcao_pagamento (documento, created_at);

ALTER TABLE public.pedidos_correcao_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_gestor_ou_solicitante ON public.pedidos_correcao_pagamento
  FOR SELECT TO authenticated
  USING (
    (SELECT app_current_user_type()) = 'manager'
    OR solicitado_por_id = (SELECT app_current_user_id())
  );

-- Pede: so para pagamento do app que o proprio usuario registrou, do mesmo
-- cliente, ainda sem decisao.
CREATE POLICY insert_solicitante_do_pagamento ON public.pedidos_correcao_pagamento
  FOR INSERT TO authenticated
  WITH CHECK (
    solicitado_por_id = (SELECT app_current_user_id())
    AND decisao IS NULL AND decidido_em IS NULL AND estorno_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.sale_payments sp
      WHERE sp.id = pedidos_correcao_pagamento.sale_payment_id
        AND sp.collector_id = (SELECT app_current_user_id())
        AND sp.client_document = pedidos_correcao_pagamento.documento
        AND sp.payment_amount > 0
        AND sp.estorno_de IS NULL
    )
  );

GRANT SELECT, INSERT ON public.pedidos_correcao_pagamento TO authenticated;
REVOKE ALL ON public.pedidos_correcao_pagamento FROM anon;

-- Decisao do gestor. Aprovar = estornar_pagamento (valor do pedido ou o que o
-- gestor ajustar) e ligar o estorno ao pedido; recusar exige resposta.
CREATE OR REPLACE FUNCTION public.decidir_pedido_correcao(
  p_pedido uuid,
  p_aprovar boolean,
  p_valor numeric DEFAULT NULL,
  p_resposta text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido     public.pedidos_correcao_pagamento%ROWTYPE;
  v_solicitante text;
  v_resultado  jsonb;
BEGIN
  IF (SELECT app_current_user_type()) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Apenas gestores podem executar esta ação.';
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos_correcao_pagamento
  WHERE id = p_pedido
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_pedido.decisao IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido já foi decidido.';
  END IF;

  IF NOT p_aprovar THEN
    IF NULLIF(trim(p_resposta), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o motivo da recusa.';
    END IF;
    UPDATE public.pedidos_correcao_pagamento
    SET decisao = 'recusado', resposta = trim(p_resposta),
        decidido_por_id = (SELECT app_current_user_id()), decidido_em = now()
    WHERE id = p_pedido;
    RETURN jsonb_build_object('decisao', 'recusado');
  END IF;

  SELECT name INTO v_solicitante FROM public.users
  WHERE id = v_pedido.solicitado_por_id;

  v_resultado := public.estornar_pagamento(
    v_pedido.sale_payment_id,
    COALESCE(p_valor, v_pedido.valor),
    'Pedido de ' || COALESCE(v_solicitante, 'cobrador') || ': '
      || v_pedido.motivo
      || COALESCE(' — ' || NULLIF(trim(p_resposta), ''), '')
  );

  UPDATE public.pedidos_correcao_pagamento
  SET decisao = 'estornado',
      estorno_id = (v_resultado->>'estorno_id')::uuid,
      resposta = NULLIF(trim(p_resposta), ''),
      decidido_por_id = (SELECT app_current_user_id()), decidido_em = now()
  WHERE id = p_pedido;

  RETURN v_resultado || jsonb_build_object('decisao', 'estornado');
END;
$function$;

REVOKE ALL ON FUNCTION public.decidir_pedido_correcao(uuid, boolean, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_pedido_correcao(uuid, boolean, numeric, text) TO authenticated, service_role;
