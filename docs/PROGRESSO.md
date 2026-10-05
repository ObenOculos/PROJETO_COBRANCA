# Progresso e pendências

Registro vivo do que foi feito, por quê, e do que falta. Atualize ao concluir
uma etapa (mova o item para "Concluído", com data e commit).

## Prioridades em aberto

| # | Item | Gravidade | Esforço |
|---|------|-----------|---------|
| 1 | Segurança: RLS desligado + login em texto puro | **Crítica** | Grande, em etapas |
| 1b | Desempenho credita pela atribuição atual, não por quem recebeu | **Alta** | Médio |
| 1c | Regras de "pendente/pago" divergentes (desconto, coluna `status`) | Média | Pequeno/médio |
| 1d | `process_payment` reescreve valor de visitas já fechadas | Média | Pequeno |
| 1e | Data de visita realizada gravada em UTC | Média | Pequeno |
| 2 | Reagendamento atômico (RPC) | Média | Pequeno/médio |
| 3 | Trocar exclusão de visitas por cancelamento | Média | Pequeno |
| 4 | Modelagem de `scheduled_visits` | Baixa/média | Médio, incremental |
| 5 | Quebrar componentes gigantes | Baixa | Contínuo |
| 6 | `RouteMap` não detecta reagendadas | Baixa | Pequeno |
| 7 | Vulnerabilidades restantes (só dev) | Baixa | — |

### 1b. Desempenho por atribuição atual — ALTA

`getCollectorPerformance`, `CollectorPerformanceModal` e
`EnhancedPerformanceChart` creditam vendas pagas e valor recebido a quem tem
**hoje** o `user_id` do cliente. Toda reatribuição (`atribuir_clientes_em_lote`),
remoção manual (`removeCollectorFromClients`) e liberação por "não encontrado"/SPC
(`updateVisitStatus`) move o histórico de recebimento junto: o cobrador antigo
perde e o novo herda. Medido em 2026-10-05: **368 de 1.062 pagamentos
(R$ 44 mil de R$ 150 mil) foram recebidos por um cobrador diferente do atual.**
Foi por isso que "cliente quitado" **não** zera `user_id` (ver Concluído).
**Fazer:** recebido/vendas pagas a partir do fato — `sale_payments.collector_id`
(quem recebeu) e `atribuicoes_historico` (quem tinha a carteira em cada período).
A importação de planilha não grava `sale_payments`; definir a quem creditar essas
baixas antes de migrar.

### 1c. Regras de "pendente/pago" divergentes

- `getCollectorPerformance` e `CollectorDashboard` (`isPending`, `salesMap`)
  calculam saldo como `original - recebido`, **sem desconto**. Uma venda quitada
  com desconto continua "parcial/pendente" e derruba a conversão de quem negociou.
  A regra certa (desconto quita) está em `getClientPending`/`calculateSaleBalance`.
- A view `banco_dados_clientes_ativos` decide "em aberto" pela coluna `status`.
  O front e `cliente_tem_saldo_aberto` decidem pelos valores. Em 2026-10-05:
  13 parcelas `Pago` com saldo e 27 `Pago Parcial` sem saldo.

### 1d. `process_payment` reescreve visitas fechadas

O fim da função faz `UPDATE scheduled_visits SET total_pending_value = ...`
em **todas** as visitas do cliente, inclusive `realizada`/`cancelada` antigas.
O valor "no momento da visita" é apagado. Restringir às visitas em aberto (ou
remover a cópia; ver item 4).

### 1e. Data de visita realizada em UTC

`updateVisitStatus` grava `data_visita_realizada` com
`new Date().toISOString().split("T")[0]`. Depois das 21h (Brasília), a visita
fica com a data do dia seguinte e cai no dia/mês errado no Desempenho.
`CollectorDashboard` (contador "hoje") faz o mesmo. Usar `todayLocalStr()`.

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
