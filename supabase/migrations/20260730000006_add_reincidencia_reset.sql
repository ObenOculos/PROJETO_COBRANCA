-- Marco de encerramento do ciclo de inadimplencia do cliente.
--
-- A reincidencia de reagendamentos passa a contar APENAS as remarcacoes
-- posteriores a esta data. Quando o cliente zera o saldo pendente, o ciclo
-- fecha e ele ganha ficha limpa; se voltar a dever meses depois, a contagem
-- comeca do zero.
--
-- Por que no CLIENTE e nao na divida: scheduled_visits nao referencia titulo
-- nem venda — a visita e ao cliente e cobre todo o saldo dele. Nao existe o
-- objeto "divida" para atrelar o ciclo. O marco correto e o cliente ficar sem
-- nada pendente.
--
-- Por que isso nao zera toda hora: em carne o cliente paga parcela a parcela e
-- so chega a zero ao fim do contrato. O reset e raro e significativo — se o
-- marco fosse "pagou uma parcela", a metrica se anularia toda semana.
--
-- Gravado pela aplicacao em updateScheduledVisitsAfterPayment, no momento em
-- que o recalculo do pendente do cliente da zero.
--
-- Historico: nao ha como reconstruir marcos passados (nao existe snapshot do
-- saldo ao longo do tempo). A regra vale a partir daqui; para o passado, o
-- filtro de periodo da aba Reincidentes e que limita a janela.

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS reincidencia_reset_at timestamptz;

COMMENT ON COLUMN public.clientes.reincidencia_reset_at IS
  'Data em que o cliente zerou o saldo pendente. Reagendamentos anteriores a ela nao contam para a reincidencia (src/config/rescheduleReasons.ts).';

-- Só os clientes COM marco sao lidos pela aplicacao; o indice parcial mantem a
-- leitura barata mesmo com a tabela inteira crescendo.
CREATE INDEX IF NOT EXISTS clientes_reincidencia_reset_idx
  ON public.clientes (documento)
  WHERE reincidencia_reset_at IS NOT NULL;
