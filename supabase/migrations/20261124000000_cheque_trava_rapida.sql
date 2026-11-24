-- Correção urgente (2026-11-24): "Aplicar distribuição" da carteira dava
-- erro 500 (tempo esgotado: o gestor tem statement_timeout de 8 s).
--
-- Causa: a trava do item 87 em protege_atribuicao_banco_dados (BEFORE UPDATE,
-- por linha) chama cliente_em_condicao_cheque a cada parcela que troca de
-- cobrador, e ela calculava clientes_condicao_cheque(documento) inteira
-- (FULL JOIN + agregação, sem aproveitar o índice por documento): ~43 ms por
-- parcela. Uma distribuição com algumas centenas de parcelas estourava os 8 s.
--
-- Agora: dois EXISTS diretos pelos índices que já existem
-- (banco_dados_cheque_em_maos_idx, cheque_marcacoes_documento_idx): ~2 ms.
-- MESMA regra de clientes_condicao_cheque (cheque em mãos com saldo, ou
-- última marcação "Paga em cheque" = marcado) -- conferido em produção em
-- 24/11 contra a função antiga: 0 diferenças. Se a regra mudar lá, mude
-- aqui também.

CREATE OR REPLACE FUNCTION public.cliente_em_condicao_cheque(p_documento text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(trim(p_documento), '') IS NOT NULL
     AND (
       EXISTS (
         SELECT 1
         FROM public."BANCO_DADOS" b
         WHERE b.documento = p_documento
           AND b.tipo_titulo_erp IN (2, 3, 5)
           AND lower(trim(COALESCE(b.status, ''))) <> 'cancelado'
           AND (COALESCE(b.valor_original, 0) - COALESCE(b.valor_recebido, 0) - COALESCE(b.desconto, 0)) > 0.01
       )
       OR COALESCE((
         SELECT m.marcado
         FROM public.cheque_marcacoes m
         WHERE m.documento = p_documento
         ORDER BY m.criado_em DESC, m.id DESC
         LIMIT 1
       ), false)
     )
$function$;
