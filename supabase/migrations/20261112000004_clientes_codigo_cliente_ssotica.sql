-- Codigo do cliente na SSOtica ("Cliente ID") na tabela `clientes`.
--
-- PEDIDO (2026-11-12): na SSOtica ha clientes sem CPF; na planilha
-- CLIENTES_E_APELIDO cada um ganhou um CPF generico unico (000.000...) so
-- para controle -- 347 clientes do app. A conferencia das sumidas
-- (scripts/ssotica/sumidas_ssotica.py) acha o cliente na SSOtica pelo CPF e
-- nao achava esses. O Cliente ID abre a ficha direto
-- (/cadastro/cliente/<Cliente ID>/detalhe), sem depender de CPF.
--
-- Preenchido pelo scripts/ssotica/clientes_ssotica.py (a cada 14 dias, com a
-- exportacao "Exportar Clientes" da SSOtica): pelo CPF quando real; CPF
-- generico por nome + loja de cadastro, so com casamento unico.
--
-- TEXTO, como codigo_cliente_erp (Ciclone). DONO DO DADO: espelho da SSOtica,
-- o script sobrescreve; correcao e na SSOtica. NULL = sem correspondencia.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo_cliente_ssotica text;

COMMENT ON COLUMN public.clientes.codigo_cliente_ssotica IS 'Cliente ID da SSOtica (exportacao Cadastro > Clientes). Preenchido por scripts/ssotica/clientes_ssotica.py; espelho da SSOtica. NULL = sem correspondencia (cliente so do Ciclone ou CPF generico sem casamento unico).';

-- Um Cliente ID nao pode ficar em dois clientes do app.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_codigo_cliente_ssotica_uk
  ON public.clientes (codigo_cliente_ssotica)
  WHERE codigo_cliente_ssotica IS NOT NULL;
