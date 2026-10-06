# Progresso e pendências

Registro vivo do que foi feito, por quê, e do que falta. Atualize ao concluir
uma etapa (mova o item para "Concluído", com data e commit).

## Prioridades em aberto

| # | Item | Gravidade | Esforço |
|---|------|-----------|---------|
| 1 | Segurança: RLS desligado + login em texto puro | **Crítica** | Grande, em etapas |
| 1b | Desempenho credita pela atribuição atual — Fase 2 (telas) | **Alta** | Médio |
| 1c | Regras de "pendente/pago" divergentes (desconto, coluna `status`) | Média | Pequeno/médio |
| 2 | Reagendamento atômico (RPC) | Média | Pequeno/médio |
| 3 | Trocar exclusão de visitas por cancelamento | Média | Pequeno |
| 4 | Modelagem de `scheduled_visits` | Baixa/média | Médio, incremental |
| 5 | Quebrar componentes gigantes | Baixa | Contínuo |
| 6 | `RouteMap` não detecta reagendadas | Baixa | Pequeno |
| 7 | Vulnerabilidades restantes (só dev) | Baixa | — |

### 1b. Desempenho por atribuição atual — ALTA

`getCollectorPerformance`, `CollectorPerformanceModal` e
`EnhancedPerformanceChart` creditam vendas pagas e valor recebido a quem tem
**hoje** o `user_id` do cliente. Toda reatribuição, remoção e liberação move o
histórico de recebimento junto. Medido em 2026-10-05: **368 de 1.062 pagamentos
(R$ 44 mil de R$ 150 mil) foram recebidos por um cobrador diferente do atual.**

**Modelo decidido com o usuário (2026-10-05):**
- Mérito do cobrador = o que ele registrou no app (`sale_payments`): é ele quem
  negocia; o pagamento é processado depois na loja.
- ERP = confirmação oficial, chega com atraso (quase todo dia) e **repete** os
  pagamentos do app. Visão separada; não soma no mérito (contaria duas vezes).
- Passado congelado: foto de hoje com o dono atual da carteira.

**Fase 1 — fundação (migration `20261005000002`, aplicada em 2026-10-06):**
- `atribuicoes_historico` registra toda mudança de carteira por gatilho, com
  `motivo` e usuário; `cobrador_novo_id` NULL = saiu da carteira. Append-only.
- `recebimentos_historico`: cada mudança de `valor_recebido`/`desconto` por
  parcela, com antes/depois, origem (`app` | `erp_ou_manual` | `foto_inicial`),
  `sale_payment_id` e dono da carteira no momento. Append-only.
- RPCs `remover_cobrador_em_lote` e `liberar_cliente_da_carteira` (front e
  fila offline já usam).
- `process_payment`: marca origem `app`, data de Brasília, e só atualiza
  `total_pending_value` de visitas em aberto (era o antigo item 1d).

**Fase 2 — telas (a fazer):**
- Função única no banco de desempenho por período: recebido = `sale_payments`
  do cobrador; carteira no período = `atribuicoes_historico`; quitações com o
  dono da carteira no momento = `recebimentos_historico`. Desconto quita (1c).
- Trocar `getCollectorPerformance`, `CollectorPerformanceModal`,
  `EnhancedPerformanceChart` e o progresso da meta no `CollectorDashboard`
  (hoje é o recebido de toda a vida da carteira, não do mês).
- Tela "Baixas do ERP" a partir de `recebimentos_historico`.
- A origem `erp_ou_manual` não distingue a planilha da edição manual na
  parcela. Para separar, a importação precisa passar por uma RPC.

### 1c. Regras de "pendente/pago" divergentes

- `getCollectorPerformance` e `CollectorDashboard` (`isPending`, `salesMap`)
  calculam saldo como `original - recebido`, **sem desconto**. Uma venda quitada
  com desconto continua "parcial/pendente" e derruba a conversão de quem negociou.
  A regra certa (desconto quita) está em `getClientPending`/`calculateSaleBalance`.
- A view `banco_dados_clientes_ativos` decide "em aberto" pela coluna `status`.
  O front e `cliente_tem_saldo_aberto` decidem pelos valores. Em 2026-10-05:
  13 parcelas `Pago` com saldo e 27 `Pago Parcial` sem saldo.

### 1. Segurança — CRÍTICO

Levantado em 2026-10-05 (permissões + leitura do código; nenhum acesso externo
foi testado).

- **RLS desligado em 11 de 12 tabelas do `public`** (`BANCO_DADOS`, `clientes`,
  `users`, `scheduled_visits`, `sale_payments`, …). O papel `anon` tem
  SELECT/UPDATE em todas, e a chave `anon` está no bundle do front. Qualquer
  pessoa com a URL pode ler CPFs/dívidas e alterar parcelas/pagamentos via API.
  Exceção: `apelidos_temporario` (RLS ligado, sem policies).
- **Login próprio** (`src/contexts/AuthContext.tsx`):
  - compara senha com `.eq("password", password)` → senhas aparentemente em
    texto puro (não confirmado na tabela);
  - a cada login faz `select("*")` em **todos** os `users` (as senhas de todos
    vão ao navegador antes de serem limpas para o cache);
  - `console.log` do usuário encontrado, com a senha;
  - o perfil (gestor/cobrador) é só estado no navegador; o banco não impõe nada.
- **Direção proposta:** migrar para Supabase Auth (hash + sessão validada no
  servidor) e criar policies de RLS por perfil, em etapas sem derrubar o app:
  1. inventário de quais tabelas cada perfil lê/escreve;
  2. Supabase Auth em paralelo, vinculando `users.id` ao `auth.users`;
  3. policies tabela a tabela (começar por `users` e `sale_payments`);
  4. remover a coluna `password` e o login antigo.
- Efeito colateral bom: com RLS, cada cobrador baixa só os próprios dados
  (hoje todos baixam o histórico inteiro de visitas de todos).

### 2. Reagendamento atômico

`rescheduleVisit` (`CollectionContext.tsx` ~3900–4130) faz 3 escritas separadas
do navegador (marca a original como `reagendada` → insere a nova → grava
`rescheduled_to_id`), com reversão "best-effort". Se cair no meio, a cadeia
fica quebrada. Em 2026-10-02 havia **2.106 visitas `reagendada` sem
`rescheduled_to_id`** — a maioria provavelmente anterior à migration
`20260601000001_add_reschedule_link_ids` (não verificado).
**Fazer:** uma função SQL (RPC) transacional, no padrão de
`atribuir_clientes_em_lote`.

### 3. Exclusão de visitas

`deleteScheduledVisits` (`CollectionContext.tsx` ~488, usado pelo
`ClearVisitsModal`) e outros `.delete()` em `scheduled_visits` apagam as
linhas de verdade. A visita é evidência do trabalho de cobrança e alimenta o
Desempenho: apagar muda métricas de períodos já fechados.
**Fazer:** marcar como `cancelada` com motivo.

### 4. Modelagem de `scheduled_visits`

- O `status` mistura desfecho (`realizada`, `nao_encontrado`) com transporte
  offline (`pending_sync`) e workflow (`cancelamento_solicitado` substitui
  `agendada`).
- O histórico fica achatado em colunas (`cancellation_*`, `notes`): um 2º
  pedido de cancelamento apaga o 1º. Padrão desejado: tabela de eventos
  append-only, como `enderecos_historico`/`atribuicoes_historico`.
- Cópias do cliente na visita (`client_address`, `total_pending_value`,
  `overdue_count`) envelhecem; a UI usa como fallback silencioso. Definir:
  "retrato do momento do agendamento" (renomear) ou remover.
- `collector_id` é `text` sem FK para `users` (`scheduled_by_manager_id` é uuid
  com FK).
- Índice único `uniq_active_visit_per_client_date` só cobre `status='agendada'`.

### 5. Componentes gigantes

`VisitScheduler.tsx` (~5.4k linhas, ~60 `useState`), `CollectionContext.tsx`
(~4.3k), `VisitTracking.tsx` (~2.9k). É a causa raiz das regras duplicadas.
Extrair aos poucos, aproveitando quando já houver mudança no trecho.

### 6. RouteMap

`RouteMap.tsx` detecta reagendada procurando `"Reagendado"` em `notes`, mas o
reagendamento atual grava `"Visita reagendada de ..."`. Provavelmente nunca
casa. Usar `rescheduledFromId` / `rescheduleCount`. (O "atrasada" do RouteMap
é intencionalmente diferente — "o horário já passou" — e não usa
`isVisitOverdue`.)

### 7. Vulnerabilidades restantes

Produção: **0**. Restam ~28 só de ferramentas de dev: internas do `vercel`
CLI 62 (dependem do pacote) e `vite`/`esbuild` (exige migrar para Vite 8).
O override de `tar` em `package.json` ainda é necessário.

---

## Concluído

### 2026-10-06

- **Fase 1 do Desempenho por fato** (`59eae18`, migration `20261005000002`
  aplicada): históricos de carteira e de recebimentos, RPCs de remoção e
  liberação. Testado no app: remoção e "não encontrado" registram motivo e quem fez.
- **Aba Histórico no detalhe do cliente** (só gestor): linha do tempo de
  carteira e baixas a partir dos dois históricos.
- **Notificações refeitas** (`config/notificationRules.ts`, regras testadas com
  casos sintéticos). Antes:
  - `status !== "received"` (status inexistente) fazia parcela paga contar como
    pendente: o gestor via 54.757 "pagamentos em atraso" (corretos: 4.669
    clientes) e 24.888 "não atribuídas" (corretos: 1.975 clientes);
  - contava parcelas, não clientes;
  - "Visitas de Hoje" mostrava as de amanhã (`new Date("YYYY-MM-DD")`);
  - "Recebidos 24h" era "data de hoje até as 21h", com estornos;
  - Interno/Terceirizado/Jurídico recebiam aviso de visita;
  - dispensar silenciava aquele título para sempre (localStorage, sem usuário);
  - toda atualização de dados recriava tudo como não lido; contagem zerada não
    sumia.
  Agora: clientes da carteira ativa, regras únicas (`hasInstallmentBalance`,
  `isVisitOverdue`, `todayLocalStr`), visitas só para o Cobrador externo, id
  estável (chave + dia + valor) com lida/dispensada por usuário — volta quando o
  número muda ou vira o dia. "Valores altos" removida (limite de R$ 5 mil por
  parcela nunca disparava).
  - Pendência menor: o aviso de desconto que `GeneralPaymentModal` cria no
    aparelho do cobrador (destinado ao gestor) nunca chega a ninguém; o gestor
    já recebe o aviso gerado a partir de `sale_payments`. Remover ou levar para
    o banco.
- **Clique nas notificações** (`e5290ab`): cada uma leva à tela certa já
  filtrada (atraso, vencimento de hoje, sem cobrador, caixa, agendamento).
  Filtro "só em atraso" passou a considerar o desconto.
- **Modal da loja** (`7dc38de`): clientes paginados (20/página), filtros (busca,
  situação, cidade, só atraso, ordenação), valores compactos legíveis; paginação
  extraída para `components/common/Pagination`.
- **Datas de calendário em UTC** (antigo item 1e): 28 trocas para
  `todayLocalStr()` em 12 arquivos. As que mudavam dado gravado: data da visita
  realizada (online, offline e "registrar contato"), data do ajuste do gerente,
  data de recebimento na edição manual de parcela/pagamento, data sugerida no
  agendamento. As de tela: "hoje" e "mês atual" no painel do cobrador (depois
  das 21h os pagamentos/visitas de hoje deixavam de contar) e na visão geral.
  Nenhum `toISOString()` sobrou como data de calendário.
- **Estorno ligado ao pagamento** (antigo item 1g; migration
  `20261006000001`): ao reduzir o recebido de uma venda, quem edita escolhe o
  pagamento do app estornado; o estorno é registro novo com `estorno_de`,
  crédito do cobrador original, `motivo` obrigatório e `registrado_por_id`.
  Nunca passa do disponível do original (o excesso vira ajuste administrativo).
  Em 2026-10-06 havia 7 estornos antigos (R$ 1.859) sem vínculo — mantidos.
  - Junto: a edição **zerava o desconto** de todas as parcelas da venda e
    regravava a data de recebimento de parcelas sem mudança; agora mantém o
    desconto e só grava parcelas alteradas.
  - Interino até a Fase 2: ajuste administrativo feito por um cobrador (com
    autorização) ainda entra no recebido dele nas telas atuais, que somam todo
    `sale_payments` por `collector_id`. A Fase 2 conta só pagamentos do app e
    estornos ligados (`isAjusteOuEstorno` em `filters/sales`).
- **"Excluir venda/cliente" virou cancelar** (`d91ce40`, antigo item 1f;
  migration `20261006000002`, aplicada em 2026-10-06): o caso real é venda cancelada no ERP. As parcelas
  ficam com status `Cancelado` (já tratado em todo o app por `isCancelado`), o
  cancelamento vai para `vendas_canceladas` (append-only: motivo obrigatório,
  autor, valor em aberto no momento) e nada é apagado — antes saíam parcelas,
  pagamentos (mérito do cobrador), visitas e histórico de autorização. Cliente
  sem nenhuma parcela ativa tem as visitas em aberto canceladas. `deleteClient`
  (sem uso) removido.
  - A observar: se a planilha do ERP trouxer de volta uma parcela cancelada com
    outro status, a importação sobrescreve o `Cancelado` (é o ERP dizendo que a
    venda não foi cancelada). Reativar uma venda cancelada por engano ainda não
    tem tela.
- **Parcela nova herda o cobrador do cliente** (migration `20261006000003`,
  aplicada em 2026-10-06): gatilho `parcela_herda_cobrador` (BEFORE INSERT) — parcela
  sem cobrador de cliente com um único cobrador recebe esse cobrador e a
  situação da parcela mais recente dele. Vale para qualquer caminho de
  inserção, não só a importação (que já herdava no navegador desde 2026-06-15).
  A migration também corrige 10 parcelas antigas sem cobrador (6 clientes: 6 do
  Francisco, 4 do Luís; 9 em atraso, invisíveis para o cobrador), registradas
  em `atribuicoes_historico` com motivo `heranca: parcela sem cobrador`. Era a
  causa do Francisco ter 932 vendas na Atribuição e 931 no app dele.
  - Cliente com mais de um cobrador não herda (sem dono claro); hoje não há
    nenhum.

### 2026-10-05

- **Cliente quitado sai da carteira de trabalho**
  - Regra única `hasOpenBalance` (`filters/clientStatus.ts`) e o espelho dela no
    banco, `cliente_tem_saldo_aberto`: saldo (original − recebido − desconto) das
    parcelas não canceladas > R$ 0,01.
  - O cliente quitado **continua com `user_id`**, porque o Desempenho credita
    o cobrador por ele (item 1b). Sai da lista do cobrador (`getFilteredCollections`
    sem filtro de status: Cobranças e Rota), da carteira do
    Interno/Terceirizado/Jurídico e dos candidatos do agendamento. Aparece se o
    cobrador filtrar "Pago". O recebido usado para a meta continua contando os
    quitados.
  - Gatilho em `BANCO_DADOS` (baixa no app e planilha) **cancela**, sem apagar,
    as visitas `agendada`/`cancelamento_solicitado` de quem quitou, com motivo
    e `cancellation_approved_by = 'sistema (cliente quitado)'`. Migration
    `20261005000001` aplicada via `db push` em 2026-10-05: gatilhos ativos,
    7 visitas canceladas, 0 restantes. Local/remoto 54/54.
  - Em 2026-10-05, 396 clientes atribuídos estavam quitados pela regra de
    valores (338 pela coluna `status`, ver item 1c).
- **`696956f` Busca de agendados e regra única de visita atrasada**
  - Busca no agendamento do cobrador em todas as datas (nome, apelido,
    documento, endereço); abre o dia/página e destaca o card.
  - Acompanhamento de Visitas: clicar no nome (gestor) abre o agendamento
    focado na visita (`initialVisitId` em `VisitScheduler`; nesse caso o aviso
    de atrasadas não é exibido).
  - `isVisitOverdue`, `visitOverdueDays`, `isVisitOpen`, `todayLocalStr` em
    `config/visitStatus.ts` substituíram 7 versões divergentes.
    Atrasada = sem desfecho (`agendada`, `cancelamento_solicitado`,
    `pending_sync`) + data local passada.
  - Corrigido: visitas de hoje como atrasadas após as 21h (UTC) e notificação
    do cobrador contando as de hoje como atrasadas o dia todo.
  - Mudança de comportamento: cancelamento solicitado vencido conta como
    atrasada também no Acompanhamento e na limpeza ("Apenas atrasadas").
- **`7e216d6` Paginação estável** — desempate pela PK em 8 cargas com
  `.range()` (incl. `sale_payments` e `atribuicoes_historico`), que podiam
  pular/duplicar registros.
- **`eed1ca3` Dependências** — `xlsx` 0.20.3 (CDN), `vercel` 62, removido
  `speed-insights` (github, não usado), override `tar ^7.5.22`.

### 2026-10-02

- `SUPABASE_ACCESS_TOKEN` no `.env` validado (Management API).
- Migrations `20260904000001` e `20260904000002` já estavam aplicadas à mão;
  registradas com `migration repair`. Local/remoto 53/53.

## A validar no app (ainda não testado em uso real)

- Upload de planilha e Importação de Cadastro com o `xlsx` 0.20.3.
- Contagens de atrasadas no Acompanhamento/Desempenho após a regra única.
