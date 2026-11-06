-- Etapa 3b (2026-11-06): espelho das RENEGOCIACOES do ERP Ciclone e conferencia
-- "acordo do app x lancamento no Ciclone".
--
-- No Ciclone, o acordo e lancado pelo financeiro como uma BAIXA com forma de
-- pagamento 100 "RENEGOCIACAO": os titulos em atraso sao baixados (origens) e
-- a baixa gera titulos novos "RENEGOCIACAO A RECEBER" (gerados), com numero =
-- fnbfp_numeronovodocumento. Conferido em 2026-11-06 nas 319 baixas: 1 novo
-- documento e 1 cliente por baixa; gerados = (empresa, cliente, numero), e a
-- soma deles bate com o valor da forma 100 em todas.
--
-- Estas tabelas sao FATO DO ERP, so o sync escreve (service_role, que ignora
-- RLS); o app so le. Nada aqui altera valor de titulo ou de acordo: a
-- conferencia so diz se o acordo ja foi lancado e se bate. Ligar pagamento
-- do Ciclone ao acordo depende de respostas do financeiro (perguntas 11-13 em
-- docs/PROGRESSO.md).

CREATE TABLE IF NOT EXISTS public.ciclone_renegociacoes (
  baixa_uuid uuid PRIMARY KEY,                -- fn_crbaixa.fncrb_uuid
  novo_documento text NOT NULL,               -- numero dos titulos gerados
  documento text NOT NULL,                    -- CPF/CNPJ formatado, igual a BANCO_DADOS.documento
  data_baixa date NOT NULL,
  situacao text NOT NULL CHECK (situacao IN ('ativa', 'cancelada')),
  valor_renegociado numeric(14,2) NOT NULL,   -- parte da baixa paga com a forma RENEGOCIACAO
  valor_total_baixa numeric(14,2) NOT NULL,   -- todas as formas da baixa
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ciclone_renegociacoes_documento_idx
  ON public.ciclone_renegociacoes (documento);

COMMENT ON TABLE public.ciclone_renegociacoes IS
  'Espelho das baixas de RENEGOCIACAO (forma 100) do ERP Ciclone. Escrita so pelo sync_financeiro.py (service_role). Ver migration 20261106000002.';

CREATE TABLE IF NOT EXISTS public.ciclone_renegociacao_titulos (
  baixa_uuid uuid NOT NULL REFERENCES public.ciclone_renegociacoes (baixa_uuid),
  id_parcela bigint NOT NULL REFERENCES public."BANCO_DADOS" (id_parcela),
  papel text NOT NULL CHECK (papel IN ('origem', 'gerado')),
  -- origem: quanto do titulo foi baixado na renegociacao e com que encargos
  principal numeric(14,2),
  juros numeric(14,2),
  multa numeric(14,2),
  desconto numeric(14,2),
  -- gerado: a parcela nova
  parcela integer,
  data_vencimento date,
  valor numeric(14,2),
  PRIMARY KEY (baixa_uuid, id_parcela, papel)
);

CREATE INDEX IF NOT EXISTS ciclone_renegociacao_titulos_id_parcela_idx
  ON public.ciclone_renegociacao_titulos (id_parcela);

COMMENT ON TABLE public.ciclone_renegociacao_titulos IS
  'Titulos de cada renegociacao do Ciclone: origem (baixados) e gerado (parcelas novas). Escrita so pelo sync.';

-- RLS: app so le (TO authenticated, padrao desde a Etapa 2a/2b); sem policy de
-- escrita -> so service_role grava.
ALTER TABLE public.ciclone_renegociacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ciclone_renegociacao_titulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_select ON public.ciclone_renegociacoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.ciclone_renegociacao_titulos
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Conferencia: o acordo do app ja foi lancado no Ciclone? Bate?
-- ---------------------------------------------------------------------------
-- Casa o acordo com renegociacao ATIVA do mesmo cliente, feita no dia do
-- acordo ou depois, que baixou pelo menos um titulo do acordo. Resultado:
--   nao_lancado  -- nenhuma renegociacao encontrada (ou titulos fora do Ciclone)
--   lancado      -- uma renegociacao, mesmos titulos, mesma quantidade de
--                   parcelas, mesmos valores e vencimentos (tolerancia R$ 0,05)
--   divergente   -- achou, mas algo difere (lista em "divergencias")
-- Parcelas comparadas na ordem (vencimento, numero) dos dois lados.
CREATE OR REPLACE FUNCTION public.acordo_lancamento_ciclone(p_acordo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_acordo public.acordos%ROWTYPE;
  v_reneg_count integer;
  v_reneg public.ciclone_renegociacoes%ROWTYPE;
  v_divergencias text[] := ARRAY[]::text[];
  v_faltando integer;
  v_extras integer;
  v_n_app integer;
  v_n_erp integer;
  v_total_erp numeric;
  v_parcelas jsonb;
BEGIN
  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo não encontrado.';
  END IF;

  -- Titulos do acordo que vieram do Ciclone (outras lojas nao tem lancamento).
  IF NOT EXISTS (
    SELECT 1 FROM public.acordo_titulos at2
    JOIN public.ciclone_titulo_map m ON m.id_parcela = at2.collection_id
    WHERE at2.acordo_id = p_acordo_id
  ) THEN
    RETURN jsonb_build_object('status', 'fora_do_ciclone');
  END IF;

  WITH candidatas AS (
    SELECT DISTINCT r.baixa_uuid
    FROM public.ciclone_renegociacoes r
    JOIN public.ciclone_renegociacao_titulos rt
      ON rt.baixa_uuid = r.baixa_uuid AND rt.papel = 'origem'
    JOIN public.acordo_titulos at2
      ON at2.collection_id = rt.id_parcela AND at2.acordo_id = p_acordo_id
    WHERE r.situacao = 'ativa'
      AND r.documento = v_acordo.client_document
      AND r.data_baixa >= (v_acordo.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  )
  SELECT count(*) INTO v_reneg_count FROM candidatas;

  IF v_reneg_count = 0 THEN
    RETURN jsonb_build_object('status', 'nao_lancado');
  END IF;

  IF v_reneg_count > 1 THEN
    RETURN jsonb_build_object(
      'status', 'divergente',
      'divergencias', jsonb_build_array(
        format('Os títulos do acordo aparecem em %s renegociações diferentes no Ciclone.', v_reneg_count)
      )
    );
  END IF;

  SELECT r.* INTO v_reneg
  FROM public.ciclone_renegociacoes r
  JOIN public.ciclone_renegociacao_titulos rt
    ON rt.baixa_uuid = r.baixa_uuid AND rt.papel = 'origem'
  JOIN public.acordo_titulos at2
    ON at2.collection_id = rt.id_parcela AND at2.acordo_id = p_acordo_id
  WHERE r.situacao = 'ativa'
    AND r.documento = v_acordo.client_document
    AND r.data_baixa >= (v_acordo.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  LIMIT 1;

  -- Titulos: mesmos dos dois lados?
  SELECT count(*) INTO v_faltando
  FROM public.acordo_titulos at2
  WHERE at2.acordo_id = p_acordo_id
    AND NOT EXISTS (
      SELECT 1 FROM public.ciclone_renegociacao_titulos rt
      WHERE rt.baixa_uuid = v_reneg.baixa_uuid AND rt.papel = 'origem' AND rt.id_parcela = at2.collection_id
    );
  SELECT count(*) INTO v_extras
  FROM public.ciclone_renegociacao_titulos rt
  WHERE rt.baixa_uuid = v_reneg.baixa_uuid AND rt.papel = 'origem'
    AND NOT EXISTS (
      SELECT 1 FROM public.acordo_titulos at2
      WHERE at2.acordo_id = p_acordo_id AND at2.collection_id = rt.id_parcela
    );
  IF v_faltando > 0 THEN
    v_divergencias := v_divergencias || format('%s título(s) do acordo não foram baixados na renegociação do Ciclone.', v_faltando);
  END IF;
  IF v_extras > 0 THEN
    v_divergencias := v_divergencias || format('A renegociação do Ciclone baixou %s título(s) que não estão no acordo.', v_extras);
  END IF;

  -- Parcelas: quantidade, total, e uma a uma.
  SELECT count(*) INTO v_n_app FROM public.acordo_parcelas WHERE acordo_id = p_acordo_id;
  SELECT count(*), COALESCE(sum(valor), 0) INTO v_n_erp, v_total_erp
  FROM public.ciclone_renegociacao_titulos
  WHERE baixa_uuid = v_reneg.baixa_uuid AND papel = 'gerado';

  IF v_n_app <> v_n_erp THEN
    v_divergencias := v_divergencias || format('O acordo tem %s parcela(s) e o Ciclone gerou %s.', v_n_app, v_n_erp);
  END IF;
  IF abs(v_total_erp - v_acordo.valor_negociado) > 0.05 THEN
    v_divergencias := v_divergencias || format(
      'Total negociado no app R$ %s; total gerado no Ciclone R$ %s.',
      replace(to_char(v_acordo.valor_negociado, 'FM999999990.00'), '.', ','),
      replace(to_char(v_total_erp, 'FM999999990.00'), '.', ',')
    );
  END IF;

  WITH app AS (
    SELECT ap.numero, ap.valor_parcela, ap.data_vencimento,
           row_number() OVER (ORDER BY ap.data_vencimento, ap.numero) AS ordem
    FROM public.acordo_parcelas ap WHERE ap.acordo_id = p_acordo_id
  ), erp AS (
    SELECT rt.id_parcela, rt.parcela, rt.valor, rt.data_vencimento,
           COALESCE(b.valor_recebido, 0) AS recebido_erp,
           row_number() OVER (ORDER BY rt.data_vencimento, rt.parcela, rt.id_parcela) AS ordem
    FROM public.ciclone_renegociacao_titulos rt
    LEFT JOIN public."BANCO_DADOS" b ON b.id_parcela = rt.id_parcela
    WHERE rt.baixa_uuid = v_reneg.baixa_uuid AND rt.papel = 'gerado'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ordem', COALESCE(app.ordem, erp.ordem),
           'numero_app', app.numero,
           'valor_app', app.valor_parcela,
           'vencimento_app', app.data_vencimento,
           'id_parcela_erp', erp.id_parcela,
           'valor_erp', erp.valor,
           'vencimento_erp', erp.data_vencimento,
           'recebido_erp', erp.recebido_erp,
           'bate', app.ordem IS NOT NULL AND erp.ordem IS NOT NULL
                   AND abs(app.valor_parcela - erp.valor) <= 0.05
                   AND app.data_vencimento = erp.data_vencimento
         ) ORDER BY COALESCE(app.ordem, erp.ordem)), '[]'::jsonb)
    INTO v_parcelas
  FROM app FULL OUTER JOIN erp ON erp.ordem = app.ordem;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_parcelas) e WHERE NOT (e ->> 'bate')::boolean) THEN
    v_divergencias := v_divergencias || 'Há parcela com valor ou vencimento diferente do acordo.'::text;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN cardinality(v_divergencias) = 0 THEN 'lancado' ELSE 'divergente' END,
    'baixa_uuid', v_reneg.baixa_uuid,
    'novo_documento', v_reneg.novo_documento,
    'data_baixa', v_reneg.data_baixa,
    'divergencias', to_jsonb(v_divergencias),
    'parcelas', v_parcelas
  );
END;
$function$;

COMMENT ON FUNCTION public.acordo_lancamento_ciclone(uuid) IS
  'Confere se o acordo do app ja foi lancado no Ciclone (baixa de RENEGOCIACAO) e se bate: titulos, quantidade/valor/vencimento das parcelas. So leitura.';

GRANT EXECUTE ON FUNCTION public.acordo_lancamento_ciclone(uuid) TO authenticated;
