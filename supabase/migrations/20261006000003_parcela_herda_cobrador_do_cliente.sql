-- Parcela nova de cliente que ja tem cobrador herda esse cobrador.
--
-- PROBLEMA: em 2026-10-06 havia 10 parcelas sem cobrador (user_id NULL) em 6
-- clientes que ja eram de um cobrador (6 do Francisco, 4 do Luis). O cobrador
-- nao via essas parcelas — 9 delas em atraso —, mas a tela de Atribuicao
-- mostrava o cliente como dele com todas as vendas. Por isso o Francisco
-- aparecia com 932 vendas para o gerente e 931 no app dele (venda 1972 da
-- cliente 100.190.093-64 inteira sem cobrador).
--
-- A importacao em massa ja herdava o cobrador (DatabaseUpload, desde
-- 2026-06-15), mas so naquele caminho e decidindo no navegador. Agora a regra
-- vale no banco, para QUALQUER insercao (planilha, cadastro manual, outro
-- caminho que vier depois).
--
-- REGRA: parcela inserida sem cobrador, de um cliente (documento) cujas
-- parcelas pertencem a UM unico cobrador, recebe esse cobrador e a situacao
-- da parcela mais recente dele (para nao ficar escondida por uma situacao de
-- outro perfil — mesmo motivo do alinhamento feito na importacao). Cliente sem
-- cobrador, ou com mais de um, fica como veio: nao ha dono claro para herdar.
--
-- Historico: herdar NAO e mudanca de carteira (o cliente ja era do cobrador),
-- entao o gatilho historico_carteira_ins nao registra nada — mesmo criterio ja
-- usado para a heranca da importacao. A correcao das parcelas existentes (2)
-- e um UPDATE e fica registrada em atribuicoes_historico com motivo proprio.

-- ---------------------------------------------------------------------------
-- 1) Gatilho de heranca
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_parcela_herda_cobrador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_situacao  text;
BEGIN
  IF NEW.user_id IS NOT NULL OR NULLIF(trim(NEW.documento), '') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Um unico cobrador entre as parcelas do cliente; senao nao herda.
  SELECT min(b.user_id::text)::uuid
  INTO v_user_id
  FROM public."BANCO_DADOS" b
  WHERE b.documento = NEW.documento
    AND b.user_id IS NOT NULL
  HAVING count(DISTINCT b.user_id) = 1;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.situacao
  INTO v_situacao
  FROM public."BANCO_DADOS" b
  WHERE b.documento = NEW.documento
    AND b.user_id = v_user_id
  ORDER BY b.id_parcela DESC
  LIMIT 1;

  NEW.user_id  := v_user_id;
  NEW.situacao := COALESCE(v_situacao, NEW.situacao);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parcela_herda_cobrador ON public."BANCO_DADOS";
CREATE TRIGGER parcela_herda_cobrador
  BEFORE INSERT ON public."BANCO_DADOS"
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_parcela_herda_cobrador();

-- ---------------------------------------------------------------------------
-- 2) Correcao das parcelas que ja estao sem cobrador
-- ---------------------------------------------------------------------------
-- Mesma regra do gatilho. O historico_carteira_upd registra cada cliente
-- corrigido (anterior NULL -> cobrador) com o motivo abaixo.
DO $$
BEGIN
  PERFORM set_config('cobranca.motivo', 'heranca: parcela sem cobrador', true);

  WITH dono AS (
    SELECT b.documento, min(b.user_id::text)::uuid AS user_id
    FROM public."BANCO_DADOS" b
    WHERE b.user_id IS NOT NULL
      AND NULLIF(trim(b.documento), '') IS NOT NULL
    GROUP BY b.documento
    HAVING count(DISTINCT b.user_id) = 1
  )
  UPDATE public."BANCO_DADOS" b
  SET user_id = d.user_id
  FROM dono d
  WHERE b.documento = d.documento
    AND b.user_id IS NULL;

  PERFORM set_config('cobranca.motivo', '', true);
END;
$$;
