# Progresso e pendências

Registro vivo do que foi feito, por quê, e do que falta. Atualize ao concluir
uma etapa (mova o item para "Concluído", com data e commit).

## Prioridades em aberto

| # | Item | Gravidade | Esforço |
|---|------|-----------|---------|
| 1 | Segurança: RLS desligado + login em texto puro | **Crítica** | Grande, em etapas |
| 1b | Desempenho credita pela atribuição atual — Fase 2 (telas) | **Alta** | Médio |
| 1c | ~~Regras de "pendente/pago" divergentes (desconto, coluna `status`)~~ | Média | Pequeno/médio |
| 2 | Reagendamento atômico (RPC) | Média | Pequeno/médio |
| 3 | Trocar exclusão de visitas por cancelamento | Média | Pequeno |
| 4 | Modelagem de `scheduled_visits` | Baixa/média | Médio, incremental |
| 5 | Quebrar componentes gigantes | Baixa | Contínuo |
| 6 | `RouteMap` não detecta reagendadas | Baixa | Pequeno |
| 7 | Vulnerabilidades restantes (só dev) | Baixa | — |
| 8 | Escopo completo do gestor baixa `BANCO_DADOS` inteiro pro navegador | Média | Médio |
| 9 | Status "A Vencer" não existe hoje — avaliar relação com os demais | Baixa | A analisar |

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

- ~~`getCollectorPerformance` e `CollectorDashboard` (`isPending`, `salesMap`)
  calculavam saldo como `original - recebido`, **sem desconto**. Uma venda quitada
  com desconto continuava "parcial/pendente" e derrubava a conversão de quem
  negociou.~~ **Corrigido em 2026-10-27**: `getCollectorPerformance`
  (`CollectionContext.tsx`) e o `salesMap` de conversão do `CollectorDashboard`
  passaram a quitar por `recebido + desconto`, igual a
  `getClientPaymentStatus`/`calculateSaleBalance`. De caminho, os outros 3
  trechos do `CollectorDashboard` que calculavam "parcela pendente" só por
  `valor_original - valor_recebido` (filtro de atraso da lista, contadores
  "Críticos/Alerta" e o atraso máximo exibido na tabela) passaram a usar
  `hasInstallmentBalance` (`filters/clientStatus.ts`) em vez de duplicar a
  conta sem desconto.
- ~~A view `banco_dados_clientes_ativos` decide "em aberto" pela coluna
  `status`. O front e `cliente_tem_saldo_aberto` decidem pelos valores.~~
  **Corrigido em 2026-10-27** (migration `20261029000003`, junto do item 8): a
  view passou a usar `cliente_tem_saldo_aberto` (mesma função já usada para
  cancelar visita de quitado), em vez de uma segunda conta por `status`. Em
  2026-10-05 isso divergia em 13 parcelas `Pago` com saldo e 27 `Pago Parcial`
  sem saldo.

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

**Concluído (2026-10-27) — Etapa 1 (Auth), passo 1 de uma reorganização maior
do banco (auditoria completa feita nesta data, decisão: refatorar em etapas
com o sistema no ar, não reconstruir do zero):**
- Migration `20261027000001_users_auth_link.sql` aplicada: `users.auth_user_id`
  (FK para `auth.users`), `users.auth_email`, `password` deixou de ser
  `NOT NULL`.
- `scripts/migrate-users-to-auth.mjs` rodado com `--apply`: os 15 usuários
  criados no Supabase Auth (senha atual copiada, sem forçar reset — decidido
  com o usuário), e-mail sintético gerado (login não é e-mail — só 1 dos 15
  tinha "@"). Idempotente, testado (reexecução deu "0 pendentes").
- `AuthContext.tsx` reescrito: login via `supabase.auth.signInWithPassword`,
  sessão persistida pelo SDK (`persistSession`/`autoRefreshToken` religados em
  `lib/supabase.ts`). `performOfflineLogin`/cache de senha em `localStorage`
  removidos (já não funcionavam pra senha real — não era regressão).
  `users.password` parou de ser lida/escrita em `CollectionContext.tsx` e
  `UserManagement.tsx`; criar usuário na tela agora só cria o perfil, aviso na
  UI de que o acesso de login é provisionado separadamente (decidido: fica
  manual por enquanto — rodar o script pra cada novo usuário — até uma Edge
  Function existir).
- **Testado em produção pelo usuário**: login de usuário ativo e inativo (modal
  de bloqueio ok) em pelo menos um perfil, logout, e um pagamento + agendamento
  de teste (ver limpeza abaixo). Tudo funcionou.
- Dados de teste limpos: o teste de pagamento/agendamento foi feito na cliente
  real Antônia Santana Menezes do Nascimento (824.272.323-00). Usando o
  antes/depois já registrado em `recebimentos_historico`, revertido: pagamento
  de teste (R$990) e seus 9 registros de histórico apagados; as 9 parcelas
  voltaram a `recebido=0`/sem data/status original (5 "Em atraso", 4 "A
  vencer", deduzido do `dias_em_atraso` já calculado pelo import); a visita
  nova de teste (23/11) apagada; a visita original (23/05 00:00) restaurada
  para "agendada", sem o vínculo de reagendamento. Nada do histórico real da
  cliente (desde abril/2026) foi tocado.
- **Achados do teste, registrados para depois (não investigados ainda):**
  - Reagendamento "parece lento" (observação do usuário, sem medição).
  - `scheduled_visits.reschedule_reason` grava a chave crua (ex.
    `pediu_outra_data`); a nota (`notes`) já mostra o rótulo certo ("Cliente
    pediu outra data"), então o problema é alguma tela exibindo o campo
    estruturado direto em vez do rótulo de `config/rescheduleReasons.ts`. O
    horário do reagendamento (14h) foi confirmado salvo certo no banco
    (`scheduled_time`) — o "ficou 00h" relatado era tela desatualizada ou a
    visita antiga (que corretamente continua em 00h).
- Fora do escopo desta etapa (continua pendente): as RPCs
  (`cancelar_vendas`, `process_payment`, etc.) continuam confiando em
  `p_usuario_id`/`p_collector_id` vindo do cliente sem checagem no servidor —
  só fica seguro de verdade na Etapa 2, com `auth.uid()`.

**Concluído (2026-10-27/28) — Etapa 2a (RLS/privilégios), passo 2 da
reorganização:**
- Achado novo nesta etapa: além das tabelas, **todas as ~30 funções RPC do
  banco tinham EXECUTE liberado para `anon`** (incluindo `cancelar_vendas`,
  `process_payment`, `atribuir_clientes_em_lote`) — dava pra cancelar venda ou
  atribuir cliente chamando a API REST direto, sem nunca logar.
- Migration `20261028000001_rls_privilegios_etapa2a.sql` aplicada:
  `app_current_user_id()`/`app_current_user_type()` (ponte `auth.uid()` →
  `users.id`, para a Etapa 2b), `resolve_auth_email(p_login)` (única coisa que
  `anon` ainda pode chamar — usada pelo login antes do `signInWithPassword`),
  `REVOKE` de todo o resto de `anon` (tabelas e funções), RLS ligado nas 13
  tabelas que faltavam, política única `authenticated_full_access` (logado
  continua vendo/fazendo tudo que já via/fazia — zero mudança de
  comportamento) e `authenticated_read_only` nas 3 tabelas de histórico
  (escrita só por trigger/RPC, como já era).
- **Verificado direto (curl, só com a chave `anon` pública)**: antes da
  migration, `GET /rest/v1/BANCO_DADOS` devolvia dados reais (CPF, nome) sem
  nenhuma credencial; depois, 401 "permission denied" em `BANCO_DADOS` e
  `users`, e `resolve_auth_email` continua funcionando (inclusive devolvendo
  `null` sem erro pra login inexistente, sem vazar informação).
- `AuthContext.tsx`: a resolução de login→e-mail passou a usar a RPC em vez
  de ler `users` direto (que pararia de funcionar pra `anon`); o perfil
  completo só é lido depois do `signInWithPassword` (já como `authenticated`).
- **Testado em produção pelo usuário**: login ativo/inativo de novo (ok) e
  reagendamento de uma visita atrasada real (cliente Ana Keyvila Barbosa,
  068.996.153-71) — confirma que a escrita autenticada não quebrou com RLS
  ligado. Teste limpo depois (visita nova apagada, visita original restaurada
  a "agendada" em 23/05/2026 19:07, como estava).
- **Segunda confirmação do mesmo bug de exibição** (primeira vez: cliente
  Antônia, Etapa 1): `scheduled_visits.reschedule_reason` grava a chave crua
  (`rota`); o texto de `notes` as vezes mostra o rótulo completo e as vezes a
  chave crua, dependendo de qual trecho do código gerou aquela linha —
  inconsistência real, ainda não investigada a fundo.
- Fora do escopo (fica para a **Etapa 2b**, planejamento próprio): RLS por
  perfil (cobrador só vê a própria carteira; hoje todo autenticado vê tudo,
  igual a antes) e as RPCs validando `auth.uid()` em vez de confiar no
  parâmetro enviado pelo cliente. `apelidos_temporario` (RLS ligado, zero
  policies, já sem uso) continua fora do radar.

**Concluído (2026-10-27/28/29) — Etapa 2b (RLS por carteira), passo 3 da
reorganização:**
- Migration `20261029000001_rls_carteira_etapa2b.sql`: cada cobrador passa a
  ver/editar só a própria carteira (`BANCO_DADOS`, `scheduled_visits`,
  `sale_payments`, `clientes`, `collection_attempts`, `allowed_visit_dates`,
  `monthly_goals`, `authorization_history`); gestor continua vendo tudo.
  Cadastro/config (criar cliente, datas permitidas, metas) passa a ser
  gestor-only. Trigger `trg_protege_atribuicao` impede um cobrador de
  reatribuir o próprio cliente por fora das RPCs. As 6 RPCs sensíveis
  (`atribuir_clientes_em_lote`, `cancelar_vendas`, `cancelar_clientes`,
  `liberar_cliente_da_carteira`, `remover_cobrador_em_lote`,
  `registrar_ajuste_recebimento`) passaram a exigir gestor checado no
  servidor (`app_current_user_type()`), não mais o parâmetro enviado pelo
  cliente. 5 funções legadas sem uso (`atribuir_cobrador` e variantes) sem
  `EXECUTE` para `authenticated`. De brinde: `inserir_cliente_automaticamente`
  (gatilho) virou `SECURITY DEFINER` (não era, ia quebrar a importação pra
  quem não é gestor).
- **Bug de desempenho real encontrado e corrigido em produção**
  (`20261029000002_fix_performance_rls_etapa2b.sql`): as policies chamavam
  `app_current_user_id()`/`app_current_user_type()` "soltas"; o Postgres
  reavaliava essas funções `SECURITY DEFINER` LINHA A LINHA (confirmado com
  `EXPLAIN ANALYZE`: 6,6s numa página de `BANCO_DADOS`, 127 mil linhas
  filtradas uma a uma). Causou "statement timeout" (57014) real pro cobrador
  de teste. Correção padrão do Postgres/Supabase: envolver em `(select ...)`
  — mesma consulta cai para ~0,1-1,6s. Lição para qualquer policy futura:
  **nunca chamar uma função direto numa condição de RLS, sempre `(select fn())`.**
- `src/lib/supabase.ts`: removido o "teste de conectividade" que lia `users`
  como `anon` ao carregar a página — desde a Etapa 2a isso sempre falha (401),
  é esperado, e não travava nada, só sujava o console.
- **Bug de cache encontrado durante o teste** (`CollectionContext.tsx`):
  `getClientGroups`/`getDashboardStats`/`getCollectorPerformance` gravavam no
  cache (`localStorage`/`sessionStorage`) o resultado mesmo quando chamadas
  ANTES dos dados carregarem — uma chamada antecipada (corrida comum logo
  após o login) grava um resultado vazio que fica preso até o cache ser
  limpo na mão. Sintoma: "Minha Carteira" aparecia vazia ("Nenhum cliente com
  vendas encontrado") mesmo com os dados certos já carregados em memória; só
  um logout (que limpa os caches) resolvia, e um F5 sozinho reintroduzia o
  problema. Corrigido nas três funções: nunca ler/gravar cache quando
  `collections` ainda está vazio.
- **Testado em produção pelo usuário** (perfil cobrador, Francisco): login,
  "Minha Carteira" mostrando só a própria carteira (confirmado também direto
  no banco: 800 clientes, 7.836 parcelas ativas, todas dele), sobrevive a F5
  repetido. Um resíduo de HMR do Vite (servidor de dev antigo ainda com o
  bundle pré-correção) mascarou o resultado por uma rodada de teste; resolvido
  reiniciando o servidor.
- **Testado em produção pelo usuário** (perfil gestor, Fábio): login, escopo
  completo carregando (os 40,6s do item 8, não um bloqueio), e a ação de
  gestor real — `remover_cobrador_em_lote` via `ClientAssignment` — funcionou
  ("✅ Remoção concluída: 1 clientes (9 parcelas) removidos do cobrador"),
  confirmando que a RPC gestor-only não travou o próprio gestor.
- Fora do escopo (continua pendente, ver Etapa 2a): `users`,
  `enderecos_historico`, as 3 tabelas de histórico; `process_payment` ainda
  não valida `p_collector_id` contra quem chamou (risco de mérito mal
  atribuído, não de acesso a dado de terceiro).

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

### 8. Escopo completo do gestor baixa a tabela inteira

Levantado em 2026-10-29, durante o teste da Etapa 2b. `CollectionContext`
tem dois escopos: "ativo" (view `banco_dados_clientes_ativos`, ~9-10 mil
linhas, exclui quem já quitou tudo) e "completo" (`BANCO_DADOS` inteiro,
127.977 linhas). A Cobranças exige um clique manual ("Consultar cobranças")
pra carregar o escopo ativo — de propósito, pra não pesar no login. Mas o
filtro "Pago" e as abas Desempenho/Lojas/Clientes/Relatório de Caixa
promovem automaticamente pro escopo COMPLETO (maior que o que o botão
manual carrega), baixando as 128 mil linhas inteiras (38 colunas cada) pro
navegador só para agregar (somar/contar) ou filtrar em JavaScript.

**Medido em 2026-10-29** (teste de gestor da Etapa 2b): carregar o escopo
completo levou **40,6s** (`Collections carregadas: 127977 (all) em 40643ms`).
Confirmado com `EXPLAIN ANALYZE` simulando a sessão do gestor que a RLS NÃO é
a causa — pra gestor a condição `app_current_user_type() = 'manager'` já
resolve a política (a checagem de dono nem chega a rodar, "InitPlan 2: never
executed"); o custo real é da paginação por `OFFSET` sobre 128 mil linhas
(cada página tardia precisa reordenar/re-escanear a tabela), que já existia
antes da Etapa 2b. **Essa causa raiz (paginação por OFFSET) continua sem
solução** — o passo 1 abaixo só evita que o filtro "Pago" precise do escopo
completo; não deixa o escopo completo em si mais rápido.

**Passo 1 — feito em 2026-10-27 (commit `365ae05`):** o filtro "Pago" da
Cobrança promovia pro escopo completo só porque a view
`banco_dados_clientes_ativos` exclui justamente os clientes quitados.
Migration `20261029000003` criou o complemento (`banco_dados_clientes_quitados`)
e `ensureSettledCollections` (`CollectionContext.tsx`) busca só esse recorte
e soma ao que já estava carregado, em vez de promover pra tabela inteira —
de caminho corrigiu o item 1c (a view agora usa `cliente_tem_saldo_aberto`,
por valor, não a coluna `status`).

**Passo 2 — feito em 2026-10-27, mesma sessão:** as duas views particionam
`BANCO_DADOS` **exatamente** (conferido no banco: 58.075 + 69.902 = 127.977
linhas; 5.571 + 9.296 = 14.867 clientes) — então "active" + "quitados" é
*idêntico* ao escopo "all", não uma aproximação. Com isso, Desempenho,
Lojas, Clientes e Relatório de Caixa (as 4 telas que ainda promoviam pra
tabela inteira) passaram a usar `ensureSettledCollections` também —
`ManagerDashboard.tsx` não chama mais `ensureAllCollections` em lugar
nenhum (a função fica no `CollectionContext` sem uso, como contingência).
Isso NÃO é uma aproximação de agregação por tela: `collections` continua
com as linhas de verdade, então nenhuma lógica de filtro (`FilterBar`,
`getFilteredCollections`) precisou ser reimplementada em SQL — o que seria
necessário para um `GROUP BY` por tela e é exatamente o tipo de duplicação
de regra que a skill `arquiteto-cobranca` pede pra evitar. Como o custo do
`OFFSET` cresce ~quadraticamente com o tamanho da tabela, dividir 128 mil
linhas em duas buscas de 58 e 70 mil cada corta esse custo quase pela
metade (58.075² + 69.902² ≈ 8,3 bi contra 127.977² ≈ 16,4 bi) de graça, sem
nenhum código novo de agregação.

**Regressão encontrada e corrigida em 2026-10-30 (migration
`20261030000001`, aplicada em produção via `db push` do usuário e
confirmada: contagem das views voltou a ~2s):** a migration
`20261029000003` (Passo 1/2 acima) trocou o `WHERE` das duas views da
coluna `status` para `cliente_tem_saldo_aberto(b.documento)` — uma função
chamada **uma vez por linha** de `BANCO_DADOS` (127.977 vezes), cada
chamada reagregando do zero as parcelas daquele documento. Confirmado no
banco (leitura, via Management API): a contagem da view sozinha estoura o
`statement_timeout` (2min), com o erro apontando pra essa função. Efeito em
produção, desde 2026-10-27: **todo login de gestor provavelmente cai pro
fallback de `BANCO_DADOS` inteiro** (`CollectionContext.tsx`, "Falha ao
consultar banco_dados_clientes_ativos"), e às vezes nem isso — a paginação
por `OFFSET` profunda no fallback também estourou o mesmo timeout num teste
(ver abaixo), piorando o item 8 em vez de resolver.
Correção: `saldo_por_documento` (view nova, `GROUP BY documento`) calcula o
saldo **uma vez por cliente**; as duas views passaram a dar `JOIN` nela em
vez de chamar a função por linha. Mesma regra de negócio, testado no banco
(leitura + transação com `ROLLBACK`, nada gravado em produção): 1,8s
(ativos) e 1,2s (quitados), batendo exatamente 58.075 + 69.902 = 127.977.
`cliente_tem_saldo_aberto(text)` continua existindo sem mudança (usada em
contextos de poucas linhas — cancelamento de visita, gatilho de importação
— onde o custo por chamada nunca foi o problema).

**Ainda em aberto:**
- **A causa raiz (paginação por `OFFSET`) não foi eliminada, só reduzida
  pela metade — e o teste de 2026-10-30 (ver acima) mostrou ela estourando o
  timeout de 2min em páginas profundas (`offset=60000`+) do `BANCO_DADOS`,
  mais grave do que os 40,6s medidos em 2026-10-29.** Pra zerar de vez, o
  caminho é paginação por keyset (seek: `id_parcela > última_id` em vez de
  `OFFSET`) na carga de qualquer escopo — não voltar a cogitar `GROUP BY`
  por tela, que exigiria duplicar a lógica do `FilterBar` em SQL. Com a
  regressão acima corrigida, o escopo ativo volta a ser rápido (~1,8s) e o
  fallback para a tabela inteira deixa de ser o caminho normal — mas se
  algum dia ele for acionado de novo (ex.: outra regressão, ou um gestor
  com conexão lenta/timeout mais curto), o `OFFSET` profundo continua
  podendo estourar.
- Modais de detalhe (cobrador/loja/cliente): hoje ainda leem tudo via
  `collections` em memória; poderiam virar fetch sob demanda filtrado
  (`WHERE user_id=X` etc.), só quando o gestor clica — ganho pequeno agora
  que o Passo 2 já evita a tabela inteira, fica pra se o keyset não bastar.

A mensagem de loading (`ManagerDashboard.tsx`) já diz o motivo da carga
("...para mostrar os clientes que já quitaram tudo", etc.) em vez do
genérico "Carregando histórico completo...".

### 9. Status "A Vencer"

Levantado pelo usuário em 2026-10-27, só para registro — **não analisar
ainda**. Hoje o sistema não tem um status "A Vencer"; falta mapear como ele
se relacionaria com os status/regras existentes (`status` da parcela,
`hasInstallmentBalance`/`hasOpenBalance` em `filters/clientStatus.ts`,
`isVisitOverdue` em `config/visitStatus.ts`) antes de decidir se é uma nova
categoria ou um recorte dos valores atuais.

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
- **Lista de visitas atrasadas na agenda** (`07343cb`, só front): o aviso que
  abria uma vez e só levava a um dia por vez virou lista de todas as atrasadas
  (busca, cidade, ordenação por atraso/cidade/nome) com Reagendar e "Ver no dia"
  em cada visita; o botão "Atrasadas N" no calendário reabre. Em 2026-10-06 o
  Francisco tinha 248 visitas atrasadas.

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
